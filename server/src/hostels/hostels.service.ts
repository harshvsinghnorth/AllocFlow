import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module';
import type { Db } from '../database/connection';
import * as s from '../database/schema';
import { computeFloorStatus, computeRoomAvailability } from './availability';
import type { AuthUser } from '../common/auth.types';
import { eligibilityForViewer, hostelGenderLabel } from '../common/eligibility';

@Injectable()
export class HostelsService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  /**
   * Hostel selector payload: one row per block with live occupancy totals.
   *
   * The aggregate is a single grouped scan over `rooms` using the denormalised
   * `occupied_beds` counter, so this stays one round trip no matter how many
   * blocks or rooms exist — well inside the 3-second budget of NFR1.
   */
  async list(viewer: AuthUser) {
    const rows = await this.db
      .select({
        id: s.hostels.id,
        code: s.hostels.code,
        name: s.hostels.name,
        floors: s.hostels.floors,
        roomsPerFloor: s.hostels.roomsPerFloor,
        gender: s.hostels.gender,
        accentColor: s.hostels.accentColor,
        totalRooms: sql<number>`count(${s.rooms.id})::int`,
        totalBeds: sql<number>`coalesce(sum(${s.rooms.capacity}), 0)::int`,
        occupiedBeds: sql<number>`coalesce(sum(${s.rooms.occupiedBeds}), 0)::int`,
        availableRooms: sql<number>`
          count(*) filter (
            where ${s.rooms.isBlocked} = false
              and ${s.rooms.occupiedBeds} < ${s.rooms.capacity}
          )::int`,
      })
      .from(s.hostels)
      .leftJoin(s.rooms, eq(s.rooms.hostelId, s.hostels.id))
      .groupBy(s.hostels.id)
      .orderBy(asc(s.hostels.code));

    return rows.map((h) => ({
      ...h,
      freeBeds: h.totalBeds - h.occupiedBeds,
      occupancyRate: h.totalBeds > 0 ? Math.round((h.occupiedBeds / h.totalBeds) * 100) : 0,
      genderLabel: hostelGenderLabel(h.gender),
      // Whether the caller may book here. Availability and eligibility are kept
      // separate: a block can be wide open and still closed to this student.
      eligibility: eligibilityForViewer(viewer, h.gender, h.code),
    }));
  }

  async findOne(hostelId: number) {
    const [hostel] = await this.db
      .select()
      .from(s.hostels)
      .where(eq(s.hostels.id, hostelId))
      .limit(1);
    if (!hostel) throw new NotFoundException(`Hostel ${hostelId} was not found.`);
    return hostel;
  }

  /**
   * Everything the 3D scene needs to generate and colour a building:
   * the geometry drivers (floors, roomsPerFloor) plus a per-floor occupancy
   * roll-up. One grouped query serves the whole tower.
   */
  async getStructure(hostelId: number, viewer: AuthUser) {
    const hostel = await this.findOne(hostelId);

    const floorRows = await this.db
      .select({
        floor: s.rooms.floor,
        totalRooms: sql<number>`count(*)::int`,
        totalBeds: sql<number>`coalesce(sum(${s.rooms.capacity}), 0)::int`,
        occupiedBeds: sql<number>`coalesce(sum(${s.rooms.occupiedBeds}), 0)::int`,
        availableRooms: sql<number>`
          count(*) filter (
            where ${s.rooms.isBlocked} = false
              and ${s.rooms.occupiedBeds} < ${s.rooms.capacity}
          )::int`,
        blockedRooms: sql<number>`count(*) filter (where ${s.rooms.isBlocked} = true)::int`,
      })
      .from(s.rooms)
      .where(eq(s.rooms.hostelId, hostelId))
      .groupBy(s.rooms.floor)
      .orderBy(asc(s.rooms.floor));

    const floors = floorRows.map((f) => {
      const freeBeds = f.totalBeds - f.occupiedBeds;
      const { status, isLocked } = computeFloorStatus(f.availableRooms, freeBeds);
      return { ...f, freeBeds, status, isLocked };
    });

    const totals = floors.reduce(
      (acc, f) => ({
        totalRooms: acc.totalRooms + f.totalRooms,
        totalBeds: acc.totalBeds + f.totalBeds,
        occupiedBeds: acc.occupiedBeds + f.occupiedBeds,
        availableRooms: acc.availableRooms + f.availableRooms,
      }),
      { totalRooms: 0, totalBeds: 0, occupiedBeds: 0, availableRooms: 0 },
    );

    return {
      hostel: {
        id: hostel.id,
        code: hostel.code,
        name: hostel.name,
        floors: hostel.floors,
        roomsPerFloor: hostel.roomsPerFloor,
        gender: hostel.gender,
        genderLabel: hostelGenderLabel(hostel.gender),
        accentColor: hostel.accentColor,
      },
      eligibility: eligibilityForViewer(viewer, hostel.gender, hostel.code),
      totals: {
        ...totals,
        freeBeds: totals.totalBeds - totals.occupiedBeds,
        occupancyRate:
          totals.totalBeds > 0
            ? Math.round((totals.occupiedBeds / totals.totalBeds) * 100)
            : 0,
      },
      floors,
    };
  }

  /** Rooms on one floor, colour coded and flagged for selection locking. */
  async getFloorRooms(hostelId: number, floor: number) {
    await this.findOne(hostelId);

    const rows = await this.db
      .select({
        id: s.rooms.id,
        roomNumber: s.rooms.roomNumber,
        floor: s.rooms.floor,
        capacity: s.rooms.capacity,
        occupiedBeds: s.rooms.occupiedBeds,
        isBlocked: s.rooms.isBlocked,
        notes: s.rooms.notes,
      })
      .from(s.rooms)
      .where(and(eq(s.rooms.hostelId, hostelId), eq(s.rooms.floor, floor)))
      .orderBy(asc(s.rooms.roomNumber));

    if (rows.length === 0) {
      throw new NotFoundException(`Floor ${floor} does not exist in this hostel.`);
    }

    return rows.map((r) => ({
      ...r,
      occupancyLabel: r.capacity === 2 ? 'Double' : 'Triple',
      ...computeRoomAvailability(r.capacity, r.occupiedBeds, r.isBlocked),
    }));
  }

  /**
   * Bed-level detail for a single room.
   *
   * Occupant names are disclosed to staff and to the room's own residents;
   * to any other student a taken bed reads simply as "Occupied". A public
   * availability screen has no reason to expose who lives where.
   */
  async getRoomDetail(roomId: number, viewer: AuthUser) {
    const [room] = await this.db
      .select({
        id: s.rooms.id,
        roomNumber: s.rooms.roomNumber,
        floor: s.rooms.floor,
        capacity: s.rooms.capacity,
        occupiedBeds: s.rooms.occupiedBeds,
        isBlocked: s.rooms.isBlocked,
        notes: s.rooms.notes,
        hostelId: s.hostels.id,
        hostelCode: s.hostels.code,
        hostelName: s.hostels.name,
        hostelGender: s.hostels.gender,
      })
      .from(s.rooms)
      .innerJoin(s.hostels, eq(s.hostels.id, s.rooms.hostelId))
      .where(eq(s.rooms.id, roomId))
      .limit(1);

    if (!room) throw new NotFoundException(`Room ${roomId} was not found.`);

    const occupants = await this.db
      .select({
        bedIndex: s.bookings.bedIndex,
        studentId: s.bookings.studentId,
        name: s.users.name,
        rollNumber: s.students.rollNumber,
        course: s.students.course,
        year: s.students.year,
        bookingDate: s.bookings.bookingDate,
      })
      .from(s.bookings)
      .innerJoin(s.students, eq(s.students.userId, s.bookings.studentId))
      .innerJoin(s.users, eq(s.users.id, s.bookings.studentId))
      .where(and(eq(s.bookings.roomId, roomId), eq(s.bookings.status, 'ACTIVE')))
      .orderBy(asc(s.bookings.bedIndex));

    const isStaff = viewer.role !== 'STUDENT';
    const isResident = occupants.some((o) => o.studentId === viewer.id);
    const canSeeNames = isStaff || isResident;

    const byBed = new Map(occupants.map((o) => [o.bedIndex, o]));
    const beds = Array.from({ length: room.capacity }, (_, i) => {
      const bedIndex = i + 1;
      const occupant = byBed.get(bedIndex);
      if (!occupant) return { bedIndex, isOccupied: false, occupant: null };
      return {
        bedIndex,
        isOccupied: true,
        occupant: canSeeNames
          ? {
              studentId: occupant.studentId,
              name: occupant.name,
              rollNumber: occupant.rollNumber,
              course: occupant.course,
              year: occupant.year,
              bookingDate: occupant.bookingDate,
              isYou: occupant.studentId === viewer.id,
            }
          : null,
      };
    });

    return {
      ...room,
      occupancyLabel: room.capacity === 2 ? 'Double' : 'Triple',
      ...computeRoomAvailability(room.capacity, room.occupiedBeds, room.isBlocked),
      eligibility: eligibilityForViewer(viewer, room.hostelGender, room.hostelCode),
      beds,
    };
  }
}
