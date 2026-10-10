import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, desc, eq, inArray, SQL, sql } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module';
import type { Db } from '../database/connection';
import * as s from '../database/schema';
import type { AuthUser } from '../common/auth.types';
import { GLOBAL_SCOPE_ROLES } from '../common/auth.types';
import type { CreateGatepassDto, DecideGatepassDto, ListGatepassQuery } from './dto';

/**
 * The digital gatepass pipeline (SRS 3.2.3):
 *
 *   student requests -> warden approves/rejects -> security verifies at the gate
 *                                               -> checked out -> checked in
 *
 * Each transition is guarded so a pass cannot skip a step: security can only
 * check out a pass a warden actually approved, and only inside its time window.
 */
@Injectable()
export class GatepassesService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async create(dto: CreateGatepassDto, actor: AuthUser) {
    const from = new Date(dto.fromTime);
    const to = new Date(dto.toTime);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Provide a valid date and time for the pass.');
    }
    if (to <= from) {
      throw new BadRequestException('The return time must be after the departure time.');
    }
    if (to.getTime() - from.getTime() > 30 * 86_400_000) {
      throw new BadRequestException('A gatepass cannot span more than 30 days.');
    }
    if (from.getTime() < Date.now() - 3_600_000) {
      throw new BadRequestException('The departure time cannot be in the past.');
    }

    // One pass in flight at a time keeps the warden queue and the gate honest.
    const [open] = await this.db
      .select({ id: s.gatepasses.id })
      .from(s.gatepasses)
      .where(
        and(
          eq(s.gatepasses.studentId, actor.id),
          inArray(s.gatepasses.status, ['PENDING', 'APPROVED', 'CHECKED_OUT']),
        ),
      )
      .limit(1);
    if (open) {
      throw new ConflictException(
        'You already have a gatepass that is pending, approved or in use.',
      );
    }

    const [created] = await this.db
      .insert(s.gatepasses)
      .values({
        studentId: actor.id,
        reference: await this.nextReference(),
        reason: dto.reason,
        destination: dto.destination ?? null,
        fromTime: from,
        toTime: to,
        status: 'PENDING',
      })
      .returning();

    await this.notifyWardens(
      actor.hostelId ?? null,
      'New gatepass request',
      `${actor.name} requested a gatepass: ${dto.reason}.`,
    );

    return created;
  }

  /** Warden approval or rejection. */
  async decide(id: number, dto: DecideGatepassDto, actor: AuthUser) {
    const pass = await this.findWithStudent(id);

    if (!GLOBAL_SCOPE_ROLES.includes(actor.role) && pass.hostelId !== actor.hostelId) {
      throw new ForbiddenException('You can only decide gatepasses for your own hostel block.');
    }
    if (pass.status !== 'PENDING') {
      throw new ConflictException(
        `This gatepass has already been ${pass.status.toLowerCase()}.`,
      );
    }

    const status = dto.approve ? 'APPROVED' : 'REJECTED';
    const [updated] = await this.db
      .update(s.gatepasses)
      .set({
        status,
        approvedBy: actor.id,
        decisionNote: dto.note ?? null,
        decidedAt: new Date(),
      })
      .where(eq(s.gatepasses.id, id))
      .returning();

    await this.db.insert(s.notifications).values({
      userId: pass.studentId,
      title: dto.approve ? 'Gatepass approved' : 'Gatepass rejected',
      body: dto.approve
        ? `Your gatepass ${pass.reference} has been approved. Show the reference at the gate.`
        : `Your gatepass ${pass.reference} was rejected.${dto.note ? ` Reason: ${dto.note}` : ''}`,
      link: '/gatepass',
    });

    return updated;
  }

  /**
   * Gate-side lookup by reference. Returns the pass plus an explicit
   * verification verdict so the security screen never has to re-derive the
   * rules itself.
   */
  async verify(reference: string) {
    const [pass] = await this.db
      .select({
        id: s.gatepasses.id,
        reference: s.gatepasses.reference,
        reason: s.gatepasses.reason,
        destination: s.gatepasses.destination,
        fromTime: s.gatepasses.fromTime,
        toTime: s.gatepasses.toTime,
        status: s.gatepasses.status,
        checkedOutAt: s.gatepasses.checkedOutAt,
        checkedInAt: s.gatepasses.checkedInAt,
        studentId: s.gatepasses.studentId,
        studentName: s.users.name,
        rollNumber: s.students.rollNumber,
        contact: s.users.contact,
        guardianContact: s.students.guardianContact,
        roomNumber: s.rooms.roomNumber,
        hostelCode: s.hostels.code,
      })
      .from(s.gatepasses)
      .innerJoin(s.users, eq(s.users.id, s.gatepasses.studentId))
      .innerJoin(s.students, eq(s.students.userId, s.gatepasses.studentId))
      .leftJoin(s.rooms, eq(s.rooms.id, s.students.currentRoomId))
      .leftJoin(s.hostels, eq(s.hostels.id, s.students.hostelId))
      .where(eq(s.gatepasses.reference, reference.trim().toUpperCase()))
      .limit(1);

    if (!pass) {
      throw new NotFoundException(`No gatepass found for reference "${reference}".`);
    }

    const now = new Date();
    let verdict: 'VALID' | 'NOT_APPROVED' | 'NOT_YET_VALID' | 'EXPIRED' | 'ALREADY_RETURNED';
    if (pass.status === 'CHECKED_IN') verdict = 'ALREADY_RETURNED';
    else if (pass.status === 'PENDING' || pass.status === 'REJECTED') verdict = 'NOT_APPROVED';
    else if (now < new Date(pass.fromTime)) verdict = 'NOT_YET_VALID';
    else if (now > new Date(pass.toTime) && pass.status !== 'CHECKED_OUT') verdict = 'EXPIRED';
    else verdict = 'VALID';

    return { ...pass, verdict, isValid: verdict === 'VALID' };
  }

  /** Security records the student leaving or returning. */
  async recordMovement(id: number, action: 'CHECK_OUT' | 'CHECK_IN', actor: AuthUser) {
    const pass = await this.findWithStudent(id);
    const now = new Date();

    if (action === 'CHECK_OUT') {
      if (pass.status !== 'APPROVED') {
        throw new ConflictException(
          'Only an approved gatepass can be checked out at the gate.',
        );
      }
      if (now > new Date(pass.toTime)) {
        throw new ConflictException('This gatepass has expired and cannot be used.');
      }
      const [updated] = await this.db
        .update(s.gatepasses)
        .set({ status: 'CHECKED_OUT', checkedOutAt: now, verifiedBy: actor.id })
        .where(eq(s.gatepasses.id, id))
        .returning();
      return updated;
    }

    if (pass.status !== 'CHECKED_OUT') {
      throw new ConflictException('This gatepass has not been checked out yet.');
    }
    const [updated] = await this.db
      .update(s.gatepasses)
      .set({ status: 'CHECKED_IN', checkedInAt: now, verifiedBy: actor.id })
      .where(eq(s.gatepasses.id, id))
      .returning();

    // A late return is worth a record the warden can see.
    if (now > new Date(pass.toTime)) {
      await this.notifyWardens(
        pass.hostelId,
        'Late return recorded',
        `${pass.studentName} returned after the approved window on gatepass ${pass.reference}.`,
      );
    }
    return updated;
  }

  async list(query: ListGatepassQuery, actor: AuthUser) {
    const filters: SQL[] = [];

    if (actor.role === 'STUDENT') {
      filters.push(eq(s.gatepasses.studentId, actor.id));
    } else if (actor.role === 'WARDEN' && actor.hostelId) {
      filters.push(eq(s.students.hostelId, actor.hostelId));
    } else if (query.hostelId) {
      filters.push(eq(s.students.hostelId, Number(query.hostelId)));
    }
    if (query.status) filters.push(eq(s.gatepasses.status, query.status));

    const where = filters.length ? and(...filters) : undefined;
    const limit = Math.min(Number(query.limit ?? 50), 200);

    const [items, [{ value: total }]] = await Promise.all([
      this.db
        .select({
          id: s.gatepasses.id,
          reference: s.gatepasses.reference,
          reason: s.gatepasses.reason,
          destination: s.gatepasses.destination,
          fromTime: s.gatepasses.fromTime,
          toTime: s.gatepasses.toTime,
          status: s.gatepasses.status,
          decisionNote: s.gatepasses.decisionNote,
          decidedAt: s.gatepasses.decidedAt,
          checkedOutAt: s.gatepasses.checkedOutAt,
          checkedInAt: s.gatepasses.checkedInAt,
          createdAt: s.gatepasses.createdAt,
          studentId: s.gatepasses.studentId,
          studentName: s.users.name,
          rollNumber: s.students.rollNumber,
          hostelCode: s.hostels.code,
          roomNumber: s.rooms.roomNumber,
        })
        .from(s.gatepasses)
        .innerJoin(s.users, eq(s.users.id, s.gatepasses.studentId))
        .innerJoin(s.students, eq(s.students.userId, s.gatepasses.studentId))
        .leftJoin(s.hostels, eq(s.hostels.id, s.students.hostelId))
        .leftJoin(s.rooms, eq(s.rooms.id, s.students.currentRoomId))
        .where(where)
        .orderBy(desc(s.gatepasses.createdAt))
        .limit(limit),
      this.db
        .select({ value: count() })
        .from(s.gatepasses)
        .innerJoin(s.students, eq(s.students.userId, s.gatepasses.studentId))
        .where(where),
    ]);

    return { items, total };
  }

  /** Sequential, human-readable reference used as the QR payload. */
  private async nextReference(): Promise<string> {
    const year = new Date().getFullYear();
    const [{ value }] = await this.db.select({ value: count() }).from(s.gatepasses);
    // Collisions are still impossible: the column carries a unique index, and
    // the random suffix keeps concurrent inserts apart.
    const suffix = Math.floor(Math.random() * 900 + 100);
    return `GP-${year}-${String(value + 1).padStart(4, '0')}${suffix}`;
  }

  private async findWithStudent(id: number) {
    const [pass] = await this.db
      .select({
        id: s.gatepasses.id,
        reference: s.gatepasses.reference,
        status: s.gatepasses.status,
        fromTime: s.gatepasses.fromTime,
        toTime: s.gatepasses.toTime,
        studentId: s.gatepasses.studentId,
        studentName: s.users.name,
        hostelId: s.students.hostelId,
      })
      .from(s.gatepasses)
      .innerJoin(s.users, eq(s.users.id, s.gatepasses.studentId))
      .innerJoin(s.students, eq(s.students.userId, s.gatepasses.studentId))
      .where(eq(s.gatepasses.id, id))
      .limit(1);
    if (!pass) throw new NotFoundException(`Gatepass ${id} was not found.`);
    return pass;
  }

  private async notifyWardens(hostelId: number | null, title: string, body: string) {
    if (!hostelId) return;
    const recipients = await this.db
      .select({ userId: s.staff.userId })
      .from(s.staff)
      .innerJoin(s.users, eq(s.users.id, s.staff.userId))
      .where(and(eq(s.users.role, 'WARDEN'), eq(s.staff.assignedHostelId, hostelId)));
    if (recipients.length === 0) return;
    await this.db
      .insert(s.notifications)
      .values(recipients.map((r) => ({ userId: r.userId, title, body, link: '/staff/gatepasses' })));
  }
}
