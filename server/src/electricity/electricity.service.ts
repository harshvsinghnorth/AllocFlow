import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, sql, SQL } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module';
import type { Db } from '../database/connection';
import * as s from '../database/schema';
import type { AuthUser } from '../common/auth.types';
import { GLOBAL_SCOPE_ROLES } from '../common/auth.types';
import type { CreateBillDto, ListBillsQuery } from './dto';

/**
 * Electricity billing (FR8).
 *
 * Amounts are stored as NUMERIC and handled as strings end-to-end: binary
 * floating point cannot represent currency exactly, and a bill that is a
 * hundredth of a rupee out is a bill that will be disputed.
 */
@Injectable()
export class ElectricityService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  /** A student's own bills, resolved through their active allocation. */
  async forStudent(actor: AuthUser) {
    if (!actor.currentRoomId) return { room: null, bills: [], summary: this.emptySummary() };

    const [room] = await this.db
      .select({
        id: s.rooms.id,
        roomNumber: s.rooms.roomNumber,
        floor: s.rooms.floor,
        capacity: s.rooms.capacity,
        occupiedBeds: s.rooms.occupiedBeds,
        hostelCode: s.hostels.code,
        hostelName: s.hostels.name,
      })
      .from(s.rooms)
      .innerJoin(s.hostels, eq(s.hostels.id, s.rooms.hostelId))
      .where(eq(s.rooms.id, actor.currentRoomId))
      .limit(1);

    const bills = await this.db
      .select()
      .from(s.electricityBills)
      .where(eq(s.electricityBills.roomId, actor.currentRoomId))
      .orderBy(desc(s.electricityBills.period))
      .limit(24);

    /*
     * The bill is issued against the room; each resident's share is the room
     * total divided by the number of current occupants. Presenting the share
     * as well as the total is what makes the figure meaningful to a student.
     */
    const occupants = Math.max(1, room?.occupiedBeds ?? 1);
    const withShare = bills.map((b) => ({
      ...b,
      perHeadShare: (Number(b.amount) / occupants).toFixed(2),
    }));

    return { room, bills: withShare, summary: this.summarise(bills), occupants };
  }

  /** Staff view across a block, with per-period totals. */
  async list(query: ListBillsQuery, actor: AuthUser) {
    const filters: SQL[] = [];

    const hostelId = GLOBAL_SCOPE_ROLES.includes(actor.role)
      ? query.hostelId
        ? Number(query.hostelId)
        : undefined
      : (actor.hostelId ?? undefined);

    if (hostelId) filters.push(eq(s.rooms.hostelId, hostelId));
    if (query.period) filters.push(eq(s.electricityBills.period, query.period));
    if (query.unpaidOnly === 'true') filters.push(eq(s.electricityBills.isPaid, false));

    const where = filters.length ? and(...filters) : undefined;

    const items = await this.db
      .select({
        id: s.electricityBills.id,
        period: s.electricityBills.period,
        unitsConsumed: s.electricityBills.unitsConsumed,
        ratePerUnit: s.electricityBills.ratePerUnit,
        amount: s.electricityBills.amount,
        dueDate: s.electricityBills.dueDate,
        isPaid: s.electricityBills.isPaid,
        roomId: s.rooms.id,
        roomNumber: s.rooms.roomNumber,
        floor: s.rooms.floor,
        occupiedBeds: s.rooms.occupiedBeds,
        hostelCode: s.hostels.code,
      })
      .from(s.electricityBills)
      .innerJoin(s.rooms, eq(s.rooms.id, s.electricityBills.roomId))
      .innerJoin(s.hostels, eq(s.hostels.id, s.rooms.hostelId))
      .where(where)
      .orderBy(desc(s.electricityBills.period), asc(s.rooms.roomNumber))
      .limit(Math.min(Number(query.limit ?? 200), 500));

    return { items, summary: this.summarise(items) };
  }

  /** Consumption trend by period, for the dashboard chart. */
  async trend(actor: AuthUser, hostelIdParam?: string) {
    const hostelId = GLOBAL_SCOPE_ROLES.includes(actor.role)
      ? hostelIdParam
        ? Number(hostelIdParam)
        : undefined
      : (actor.hostelId ?? undefined);

    return this.db
      .select({
        period: s.electricityBills.period,
        totalUnits: sql<string>`sum(${s.electricityBills.unitsConsumed})`,
        totalAmount: sql<string>`sum(${s.electricityBills.amount})`,
        paidAmount: sql<string>`sum(${s.electricityBills.amount}) filter (where ${s.electricityBills.isPaid} = true)`,
        billedRooms: sql<number>`count(*)::int`,
      })
      .from(s.electricityBills)
      .innerJoin(s.rooms, eq(s.rooms.id, s.electricityBills.roomId))
      .where(hostelId ? eq(s.rooms.hostelId, hostelId) : undefined)
      .groupBy(s.electricityBills.period)
      .orderBy(asc(s.electricityBills.period));
  }

  async create(dto: CreateBillDto, actor: AuthUser) {
    const [room] = await this.db
      .select({ id: s.rooms.id, hostelId: s.rooms.hostelId, roomNumber: s.rooms.roomNumber })
      .from(s.rooms)
      .where(eq(s.rooms.id, dto.roomId))
      .limit(1);
    if (!room) throw new NotFoundException(`Room ${dto.roomId} was not found.`);

    if (!GLOBAL_SCOPE_ROLES.includes(actor.role) && room.hostelId !== actor.hostelId) {
      throw new ForbiddenException('You can only bill rooms in your assigned hostel block.');
    }

    const amount = (dto.unitsConsumed * dto.ratePerUnit).toFixed(2);

    try {
      const [created] = await this.db
        .insert(s.electricityBills)
        .values({
          roomId: dto.roomId,
          period: dto.period,
          unitsConsumed: dto.unitsConsumed.toFixed(2),
          ratePerUnit: dto.ratePerUnit.toFixed(2),
          amount,
          dueDate: dto.dueDate,
          generatedBy: actor.id,
        })
        .returning();
      return created;
    } catch (err) {
      const code = (err as { code?: string; cause?: { code?: string } }).code
        ?? (err as { cause?: { code?: string } }).cause?.code;
      if (code === '23505') {
        throw new ConflictException(
          `Room ${room.roomNumber} already has a bill for ${dto.period}.`,
        );
      }
      throw err;
    }
  }

  async setPaid(id: number, isPaid: boolean, actor: AuthUser) {
    const [bill] = await this.db
      .select({ id: s.electricityBills.id, hostelId: s.rooms.hostelId })
      .from(s.electricityBills)
      .innerJoin(s.rooms, eq(s.rooms.id, s.electricityBills.roomId))
      .where(eq(s.electricityBills.id, id))
      .limit(1);
    if (!bill) throw new NotFoundException(`Bill ${id} was not found.`);

    if (!GLOBAL_SCOPE_ROLES.includes(actor.role) && bill.hostelId !== actor.hostelId) {
      throw new ForbiddenException('You can only update bills for your assigned hostel block.');
    }

    const [updated] = await this.db
      .update(s.electricityBills)
      .set({ isPaid })
      .where(eq(s.electricityBills.id, id))
      .returning();
    return updated;
  }

  private summarise(bills: { amount: string; isPaid: boolean; unitsConsumed: string }[]) {
    const total = bills.reduce((a, b) => a + Number(b.amount), 0);
    const outstanding = bills
      .filter((b) => !b.isPaid)
      .reduce((a, b) => a + Number(b.amount), 0);
    const units = bills.reduce((a, b) => a + Number(b.unitsConsumed), 0);
    return {
      billCount: bills.length,
      totalAmount: total.toFixed(2),
      outstandingAmount: outstanding.toFixed(2),
      paidAmount: (total - outstanding).toFixed(2),
      totalUnits: units.toFixed(2),
    };
  }

  private emptySummary() {
    return {
      billCount: 0,
      totalAmount: '0.00',
      outstandingAmount: '0.00',
      paidAmount: '0.00',
      totalUnits: '0.00',
    };
  }
}
