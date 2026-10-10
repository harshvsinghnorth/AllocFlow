import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module';
import type { Db } from '../database/connection';
import * as s from '../database/schema';
import type { AuthUser } from '../common/auth.types';
import { GLOBAL_SCOPE_ROLES } from '../common/auth.types';
import { checkHostelEligibility } from '../common/eligibility';
import type { CreateBookingDto } from './dto';

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = '23505';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  /**
   * Allocates a bed to a student.
   *
   * Concurrency is handled at the database rather than in application logic.
   * Two students racing for the last bed both pass any read-then-write check,
   * so instead:
   *
   *   1. `occupied_beds` is incremented with a *conditional* UPDATE that only
   *      matches while the room is under capacity and unblocked. Postgres
   *      serialises the two updates on the row lock, so exactly one wins and
   *      the loser matches zero rows and is rejected.
   *   2. The chosen bed index is additionally protected by the partial unique
   *      index on ACTIVE bookings, which catches any residual race.
   *
   * Everything runs in one transaction, so a rejected booking leaves no trace.
   */
  async create(dto: CreateBookingDto, actor: AuthUser) {
    const studentId = await this.resolveTargetStudent(dto.studentId, actor);

    try {
      return await this.db.transaction(async (tx) => {
        const [student] = await tx
          .select({
            userId: s.students.userId,
            currentRoomId: s.students.currentRoomId,
            hostelId: s.students.hostelId,
            gender: s.students.gender,
            name: s.users.name,
          })
          .from(s.students)
          .innerJoin(s.users, eq(s.users.id, s.students.userId))
          .where(eq(s.students.userId, studentId))
          .limit(1);

        if (!student) throw new NotFoundException('Student record was not found.');

        // One active booking per student (also enforced by a partial unique index).
        const [existing] = await tx
          .select({ id: s.bookings.id, roomId: s.bookings.roomId })
          .from(s.bookings)
          .where(and(eq(s.bookings.studentId, studentId), eq(s.bookings.status, 'ACTIVE')))
          .limit(1);
        if (existing) {
          throw new ConflictException(
            'This student already holds an active room allocation. Vacate it before booking another.',
          );
        }

        const [room] = await tx
          .select({
            id: s.rooms.id,
            roomNumber: s.rooms.roomNumber,
            floor: s.rooms.floor,
            capacity: s.rooms.capacity,
            occupiedBeds: s.rooms.occupiedBeds,
            isBlocked: s.rooms.isBlocked,
            hostelId: s.rooms.hostelId,
            hostelCode: s.hostels.code,
            hostelGender: s.hostels.gender,
          })
          .from(s.rooms)
          .innerJoin(s.hostels, eq(s.hostels.id, s.rooms.hostelId))
          .where(eq(s.rooms.id, dto.roomId))
          .limit(1);

        if (!room) throw new NotFoundException(`Room ${dto.roomId} was not found.`);
        if (room.isBlocked) {
          throw new ConflictException(
            `Room ${room.roomNumber} is currently withdrawn from allocation.`,
          );
        }

        /*
         * Gender segregation. Checked here, inside the transaction, rather than
         * only in the UI: this is the one path that creates a booking, whether
         * the student booked it themselves or a warden allocated it at the desk,
         * so a client that ignores the greyed-out block still cannot get through.
         */
        const eligibility = checkHostelEligibility(
          student.gender,
          room.hostelGender,
          room.hostelCode,
        );
        if (!eligibility.allowed) {
          throw new ForbiddenException(eligibility.reason!);
        }

        /*
         * Atomic conditional increment. The WHERE clause re-asserts capacity at
         * write time, which is what actually prevents overbooking; the read
         * above only exists to produce a friendlier error message.
         */
        const claimed = await tx
          .update(s.rooms)
          .set({ occupiedBeds: sql`${s.rooms.occupiedBeds} + 1` })
          .where(
            and(
              eq(s.rooms.id, dto.roomId),
              eq(s.rooms.isBlocked, false),
              sql`${s.rooms.occupiedBeds} < ${s.rooms.capacity}`,
            ),
          )
          .returning({ occupiedBeds: s.rooms.occupiedBeds });

        if (claimed.length === 0) {
          throw new ConflictException(
            `Room ${room.roomNumber} was just filled. Please choose another room.`,
          );
        }

        // Lowest free bed index, so beds fill in a predictable order.
        const taken = await tx
          .select({ bedIndex: s.bookings.bedIndex })
          .from(s.bookings)
          .where(and(eq(s.bookings.roomId, dto.roomId), eq(s.bookings.status, 'ACTIVE')));
        const takenSet = new Set(taken.map((t) => t.bedIndex));

        let bedIndex = 0;
        for (let i = 1; i <= room.capacity; i++) {
          if (!takenSet.has(i)) {
            bedIndex = i;
            break;
          }
        }
        if (bedIndex === 0) {
          throw new ConflictException(
            `Room ${room.roomNumber} was just filled. Please choose another room.`,
          );
        }

        const [booking] = await tx
          .insert(s.bookings)
          .values({ studentId, roomId: dto.roomId, bedIndex, status: 'ACTIVE' })
          .returning();

        await tx
          .update(s.students)
          .set({ currentRoomId: dto.roomId, hostelId: room.hostelId })
          .where(eq(s.students.userId, studentId));

        await tx.insert(s.notifications).values({
          userId: studentId,
          title: 'Room allocated',
          body: `You have been allocated bed ${bedIndex} in room ${room.roomNumber}, ${room.hostelCode} (floor ${room.floor}).`,
          link: '/my-room',
        });

        return {
          ...booking,
          room: {
            id: room.id,
            roomNumber: room.roomNumber,
            floor: room.floor,
            capacity: room.capacity,
            hostelId: room.hostelId,
            hostelCode: room.hostelCode,
          },
        };
      });
    } catch (err) {
      const code = (err as { cause?: { code?: string }; code?: string }).code
        ?? (err as { cause?: { code?: string } }).cause?.code;
      if (code === UNIQUE_VIOLATION) {
        // Lost the race on the partial unique index — report it as contention.
        throw new ConflictException(
          'That bed was taken a moment ago. Please refresh and pick another.',
        );
      }
      throw err;
    }
  }

  /** Releases a bed and restores it to the availability pool. */
  async vacate(bookingId: number, actor: AuthUser) {
    return this.db.transaction(async (tx) => {
      const [booking] = await tx
        .select()
        .from(s.bookings)
        .where(eq(s.bookings.id, bookingId))
        .limit(1);

      if (!booking) throw new NotFoundException(`Booking ${bookingId} was not found.`);
      if (booking.status !== 'ACTIVE') {
        throw new BadRequestException('This booking is no longer active.');
      }

      const isOwner = actor.role === 'STUDENT' && booking.studentId === actor.id;
      const canManage = ['WARDEN', 'SUPERVISOR', 'ADMIN'].includes(actor.role);
      if (!isOwner && !canManage) {
        throw new ForbiddenException('You cannot vacate this booking.');
      }

      const [updated] = await tx
        .update(s.bookings)
        .set({ status: 'VACATED', vacatedAt: new Date() })
        .where(eq(s.bookings.id, bookingId))
        .returning();

      // greatest(...) keeps the counter within its CHECK constraint even if
      // it had drifted for any reason.
      await tx
        .update(s.rooms)
        .set({ occupiedBeds: sql`greatest(${s.rooms.occupiedBeds} - 1, 0)` })
        .where(eq(s.rooms.id, booking.roomId));

      await tx
        .update(s.students)
        .set({ currentRoomId: null })
        .where(eq(s.students.userId, booking.studentId));

      return updated;
    });
  }

  /** The caller's own allocation, with room and hostel context. */
  async findActiveForStudent(studentId: number) {
    const [row] = await this.db
      .select({
        id: s.bookings.id,
        bedIndex: s.bookings.bedIndex,
        bookingDate: s.bookings.bookingDate,
        status: s.bookings.status,
        roomId: s.rooms.id,
        roomNumber: s.rooms.roomNumber,
        floor: s.rooms.floor,
        capacity: s.rooms.capacity,
        occupiedBeds: s.rooms.occupiedBeds,
        hostelId: s.hostels.id,
        hostelCode: s.hostels.code,
        hostelName: s.hostels.name,
      })
      .from(s.bookings)
      .innerJoin(s.rooms, eq(s.rooms.id, s.bookings.roomId))
      .innerJoin(s.hostels, eq(s.hostels.id, s.rooms.hostelId))
      .where(and(eq(s.bookings.studentId, studentId), eq(s.bookings.status, 'ACTIVE')))
      .limit(1);
    return row ?? null;
  }

  /** Full allocation history for a student, newest first. */
  async history(studentId: number) {
    return this.db
      .select({
        id: s.bookings.id,
        bedIndex: s.bookings.bedIndex,
        bookingDate: s.bookings.bookingDate,
        vacatedAt: s.bookings.vacatedAt,
        status: s.bookings.status,
        roomNumber: s.rooms.roomNumber,
        floor: s.rooms.floor,
        hostelCode: s.hostels.code,
      })
      .from(s.bookings)
      .innerJoin(s.rooms, eq(s.rooms.id, s.bookings.roomId))
      .innerJoin(s.hostels, eq(s.hostels.id, s.rooms.hostelId))
      .where(eq(s.bookings.studentId, studentId))
      .orderBy(desc(s.bookings.bookingDate));
  }

  /**
   * A student may only book for themselves. Staff with allocation rights may
   * book on a student's behalf, which is how a warden allocates at the desk.
   */
  private async resolveTargetStudent(
    requestedStudentId: number | undefined,
    actor: AuthUser,
  ): Promise<number> {
    if (actor.role === 'STUDENT') {
      if (requestedStudentId && requestedStudentId !== actor.id) {
        throw new ForbiddenException('You can only book a room for yourself.');
      }
      return actor.id;
    }

    if (!['WARDEN', 'SUPERVISOR', 'ADMIN'].includes(actor.role)) {
      throw new ForbiddenException('Your role cannot allocate rooms.');
    }
    if (!requestedStudentId) {
      throw new BadRequestException('studentId is required when allocating on behalf of a student.');
    }
    return requestedStudentId;
  }

  /** Unallocated students, for the warden's manual allocation screen. */
  async listUnallocated(actor: AuthUser, hostelId?: number) {
    const scopeHostel = GLOBAL_SCOPE_ROLES.includes(actor.role)
      ? hostelId
      : (actor.hostelId ?? undefined);

    const rows = await this.db
      .select({
        studentId: s.students.userId,
        name: s.users.name,
        email: s.users.email,
        rollNumber: s.students.rollNumber,
        course: s.students.course,
        year: s.students.year,
        gender: s.students.gender,
        hostelId: s.students.hostelId,
        hostelCode: s.hostels.code,
      })
      .from(s.students)
      .innerJoin(s.users, eq(s.users.id, s.students.userId))
      .leftJoin(s.hostels, eq(s.hostels.id, s.students.hostelId))
      .where(
        scopeHostel
          ? and(sql`${s.students.currentRoomId} is null`, eq(s.students.hostelId, scopeHostel))
          : sql`${s.students.currentRoomId} is null`,
      )
      .orderBy(s.users.name)
      .limit(200);

    return rows;
  }
}
