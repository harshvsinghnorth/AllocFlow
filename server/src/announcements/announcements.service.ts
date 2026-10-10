import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module';
import type { Db } from '../database/connection';
import * as s from '../database/schema';
import type { AuthUser } from '../common/auth.types';
import { GLOBAL_SCOPE_ROLES } from '../common/auth.types';
import type { CreateAnnouncementDto } from './dto';

/**
 * Central broadcast channel (SRS 3.2.4). An announcement is either campus-wide
 * (hostelId NULL) or scoped to a single block; students see the union of both,
 * pinned items first and newest first thereafter.
 */
@Injectable()
export class AnnouncementsService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async list(actor: AuthUser) {
    const visibility =
      actor.role === 'STUDENT' && actor.hostelId
        ? or(isNull(s.announcements.hostelId), eq(s.announcements.hostelId, actor.hostelId))
        : actor.role === 'STUDENT'
          ? isNull(s.announcements.hostelId)
          : undefined;

    const rows = await this.db
      .select({
        id: s.announcements.id,
        title: s.announcements.title,
        body: s.announcements.body,
        category: s.announcements.category,
        isPinned: s.announcements.isPinned,
        createdAt: s.announcements.createdAt,
        hostelId: s.announcements.hostelId,
        hostelCode: s.hostels.code,
        postedBy: s.announcements.postedBy,
        authorName: s.users.name,
        authorDesignation: s.staff.designation,
        readAt: s.announcementReads.readAt,
      })
      .from(s.announcements)
      .innerJoin(s.staff, eq(s.staff.userId, s.announcements.postedBy))
      .innerJoin(s.users, eq(s.users.id, s.announcements.postedBy))
      .leftJoin(s.hostels, eq(s.hostels.id, s.announcements.hostelId))
      .leftJoin(
        s.announcementReads,
        and(
          eq(s.announcementReads.announcementId, s.announcements.id),
          eq(s.announcementReads.studentId, actor.id),
        ),
      )
      .where(visibility)
      .orderBy(desc(s.announcements.isPinned), desc(s.announcements.createdAt))
      .limit(100);

    return rows.map((r) => ({ ...r, isRead: r.readAt !== null }));
  }

  async create(dto: CreateAnnouncementDto, actor: AuthUser) {
    // A warden broadcasts to their own block; only campus-wide roles may post
    // to every hostel at once.
    let hostelId: number | null;
    if (GLOBAL_SCOPE_ROLES.includes(actor.role)) {
      hostelId = dto.hostelId ?? null;
    } else {
      if (dto.hostelId && dto.hostelId !== actor.hostelId) {
        throw new ForbiddenException('You can only post announcements for your own hostel block.');
      }
      hostelId = actor.hostelId ?? null;
    }

    const [created] = await this.db
      .insert(s.announcements)
      .values({
        title: dto.title,
        body: dto.body,
        category: dto.category ?? 'GENERAL',
        isPinned: dto.isPinned ?? false,
        postedBy: actor.id,
        hostelId,
      })
      .returning();

    await this.fanOutToStudents(created.id, created.title, hostelId);
    return created;
  }

  async remove(id: number, actor: AuthUser) {
    const [existing] = await this.db
      .select()
      .from(s.announcements)
      .where(eq(s.announcements.id, id))
      .limit(1);
    if (!existing) throw new NotFoundException(`Announcement ${id} was not found.`);

    const isAuthor = existing.postedBy === actor.id;
    if (!isAuthor && !GLOBAL_SCOPE_ROLES.includes(actor.role)) {
      throw new ForbiddenException('You can only withdraw announcements that you posted.');
    }
    await this.db.delete(s.announcements).where(eq(s.announcements.id, id));
    return { id };
  }

  /** Records a read receipt; repeated calls are harmless. */
  async markRead(id: number, actor: AuthUser) {
    await this.db
      .insert(s.announcementReads)
      .values({ announcementId: id, studentId: actor.id })
      .onConflictDoNothing();
    return { id, isRead: true };
  }

  /**
   * Writes one in-app notification per recipient student.
   *
   * A single INSERT ... SELECT keeps this to one statement no matter how large
   * the cohort, instead of materialising thousands of rows in Node first.
   */
  private async fanOutToStudents(
    announcementId: number,
    title: string,
    hostelId: number | null,
  ): Promise<void> {
    await this.db.execute(sql`
      insert into notifications (user_id, title, body, link)
      select st.user_id, 'New announcement', ${title}, '/announcements'
      from students st
      ${hostelId === null ? sql`` : sql`where st.hostel_id = ${hostelId}`}
    `);
  }
}
