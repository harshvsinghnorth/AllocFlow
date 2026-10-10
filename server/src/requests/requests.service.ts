import {
  BadRequestException,
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
import type { CreateRequestDto, ListRequestsQuery, UpdateRequestDto } from './dto';

/**
 * Housekeeping and Repair/Complaint tickets.
 *
 * Both are the REQUEST entity of the SRS E-R diagram, distinguished by `type`.
 * Keeping them in one table means one status workflow, one staff queue and one
 * set of indexes, rather than two near-identical pipelines.
 */
@Injectable()
export class RequestsService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  /**
   * Raises a ticket for the signed-in student.
   *
   * Hostel and room are taken from the student's own allocation rather than
   * from the request body — that is what makes the "Notify" button a single
   * tap, and it stops a student filing against someone else's room.
   */
  async create(dto: CreateRequestDto, actor: AuthUser) {
    const [student] = await this.db
      .select({
        userId: s.students.userId,
        currentRoomId: s.students.currentRoomId,
        hostelId: s.students.hostelId,
        roomNumber: s.rooms.roomNumber,
        hostelCode: s.hostels.code,
      })
      .from(s.students)
      .leftJoin(s.rooms, eq(s.rooms.id, s.students.currentRoomId))
      .leftJoin(s.hostels, eq(s.hostels.id, s.students.hostelId))
      .where(eq(s.students.userId, actor.id))
      .limit(1);

    if (!student) throw new NotFoundException('Student record was not found.');
    if (!student.currentRoomId) {
      throw new BadRequestException(
        'You need an allocated room before raising a request. Book a room first.',
      );
    }

    // Guard against a double tap on the Notify button creating duplicate work.
    const [duplicate] = await this.db
      .select({ id: s.requests.id })
      .from(s.requests)
      .where(
        and(
          eq(s.requests.studentId, actor.id),
          eq(s.requests.type, dto.type),
          inArray(s.requests.status, ['PENDING', 'IN_PROGRESS']),
          sql`${s.requests.createdAt} > now() - interval '10 minutes'`,
        ),
      )
      .limit(1);
    if (duplicate) {
      throw new BadRequestException(
        'A similar request from you is already open. Hostel staff have been notified.',
      );
    }

    const [created] = await this.db
      .insert(s.requests)
      .values({
        studentId: actor.id,
        roomId: student.currentRoomId,
        hostelId: student.hostelId,
        type: dto.type,
        category: dto.category ?? null,
        note: dto.note ?? null,
        priority: dto.priority ?? 'NORMAL',
        status: 'PENDING',
      })
      .returning();

    // Notify the wardens of that block, per FR6 ("notify instantly").
    await this.notifyBlockStaff(
      student.hostelId,
      dto.type === 'HOUSEKEEPING' ? 'New housekeeping request' : 'New repair complaint',
      `${actor.name} raised a ${dto.type.toLowerCase()} request for room ${student.roomNumber ?? ''} (${student.hostelCode ?? ''}).`,
      '/staff/requests',
    );

    return created;
  }

  /** Scoped, filtered ticket list serving both the student and staff views. */
  async list(query: ListRequestsQuery, actor: AuthUser) {
    const filters: SQL[] = [];

    if (actor.role === 'STUDENT') {
      filters.push(eq(s.requests.studentId, actor.id));
    } else if (!GLOBAL_SCOPE_ROLES.includes(actor.role)) {
      // Wardens and mess staff see only their assigned block.
      if (!actor.hostelId) return { items: [], total: 0 };
      filters.push(eq(s.requests.hostelId, actor.hostelId));
    } else if (query.hostelId) {
      filters.push(eq(s.requests.hostelId, Number(query.hostelId)));
    }

    if (query.status) filters.push(eq(s.requests.status, query.status));
    if (query.type) filters.push(eq(s.requests.type, query.type));

    const where = filters.length ? and(...filters) : undefined;
    const limit = Math.min(Number(query.limit ?? 50), 200);
    const offset = Number(query.offset ?? 0);

    const [items, [{ value: total }]] = await Promise.all([
      this.db
        .select({
          id: s.requests.id,
          type: s.requests.type,
          category: s.requests.category,
          note: s.requests.note,
          status: s.requests.status,
          priority: s.requests.priority,
          createdAt: s.requests.createdAt,
          updatedAt: s.requests.updatedAt,
          resolvedAt: s.requests.resolvedAt,
          resolutionNote: s.requests.resolutionNote,
          studentId: s.requests.studentId,
          studentName: s.users.name,
          rollNumber: s.students.rollNumber,
          roomNumber: s.rooms.roomNumber,
          floor: s.rooms.floor,
          hostelCode: s.hostels.code,
          handledBy: s.requests.handledBy,
        })
        .from(s.requests)
        .innerJoin(s.users, eq(s.users.id, s.requests.studentId))
        .innerJoin(s.students, eq(s.students.userId, s.requests.studentId))
        .leftJoin(s.rooms, eq(s.rooms.id, s.requests.roomId))
        .leftJoin(s.hostels, eq(s.hostels.id, s.requests.hostelId))
        .where(where)
        .orderBy(desc(s.requests.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ value: count() }).from(s.requests).where(where),
    ]);

    return { items, total };
  }

  /** Staff transition of a ticket through the status workflow. */
  async update(id: number, dto: UpdateRequestDto, actor: AuthUser) {
    const [request] = await this.db
      .select()
      .from(s.requests)
      .where(eq(s.requests.id, id))
      .limit(1);
    if (!request) throw new NotFoundException(`Request ${id} was not found.`);

    if (!GLOBAL_SCOPE_ROLES.includes(actor.role) && request.hostelId !== actor.hostelId) {
      throw new ForbiddenException('You can only handle requests from your assigned hostel block.');
    }

    const isResolution = dto.status === 'RESOLVED' || dto.status === 'REJECTED';

    const [updated] = await this.db
      .update(s.requests)
      .set({
        status: dto.status,
        resolutionNote: dto.resolutionNote ?? request.resolutionNote,
        handledBy: actor.id,
        updatedAt: new Date(),
        resolvedAt: isResolution ? new Date() : null,
      })
      .where(eq(s.requests.id, id))
      .returning();

    await this.db.insert(s.notifications).values({
      userId: request.studentId,
      title: `Request ${dto.status.toLowerCase().replace('_', ' ')}`,
      body:
        dto.status === 'RESOLVED'
          ? `Your ${request.type.toLowerCase()} request has been resolved.${dto.resolutionNote ? ` ${dto.resolutionNote}` : ''}`
          : `Your ${request.type.toLowerCase()} request is now ${dto.status.toLowerCase().replace('_', ' ')}.`,
      link: '/requests',
    });

    return updated;
  }

  /** Counts by status for the staff dashboard tiles. */
  async summary(actor: AuthUser) {
    const scope =
      GLOBAL_SCOPE_ROLES.includes(actor.role) || !actor.hostelId
        ? undefined
        : eq(s.requests.hostelId, actor.hostelId);

    const rows = await this.db
      .select({
        type: s.requests.type,
        status: s.requests.status,
        value: count(),
      })
      .from(s.requests)
      .where(scope)
      .groupBy(s.requests.type, s.requests.status);

    return rows;
  }

  /** Fans a notification out to every warden of a block (plus campus admins). */
  private async notifyBlockStaff(
    hostelId: number | null,
    title: string,
    body: string,
    link: string,
  ) {
    if (!hostelId) return;
    const recipients = await this.db
      .select({ userId: s.staff.userId })
      .from(s.staff)
      .innerJoin(s.users, eq(s.users.id, s.staff.userId))
      .where(
        and(
          inArray(s.users.role, ['WARDEN', 'ADMIN']),
          sql`(${s.staff.assignedHostelId} = ${hostelId} or ${s.staff.assignedHostelId} is null)`,
        ),
      );

    if (recipients.length === 0) return;
    await this.db
      .insert(s.notifications)
      .values(recipients.map((r) => ({ userId: r.userId, title, body, link })));
  }
}
