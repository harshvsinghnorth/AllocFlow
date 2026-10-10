import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module';
import type { Db } from '../database/connection';
import * as s from '../database/schema';

/** In-app alert inbox backing the bell menu (SRS 3.1). */
@Injectable()
export class NotificationsService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async list(userId: number, limit = 30) {
    const [items, [{ value: unread }]] = await Promise.all([
      this.db
        .select()
        .from(s.notifications)
        .where(eq(s.notifications.userId, userId))
        .orderBy(desc(s.notifications.createdAt))
        .limit(limit),
      this.db
        .select({ value: count() })
        .from(s.notifications)
        .where(and(eq(s.notifications.userId, userId), eq(s.notifications.isRead, false))),
    ]);
    return { items, unread };
  }

  /** Scoped by userId so one user can never mark another's alert read. */
  async markRead(id: number, userId: number) {
    await this.db
      .update(s.notifications)
      .set({ isRead: true })
      .where(and(eq(s.notifications.id, id), eq(s.notifications.userId, userId)));
    return { id, isRead: true };
  }

  async markAllRead(userId: number) {
    await this.db
      .update(s.notifications)
      .set({ isRead: true })
      .where(and(eq(s.notifications.userId, userId), eq(s.notifications.isRead, false)));
    return { ok: true };
  }
}
