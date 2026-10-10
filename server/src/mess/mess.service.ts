import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module';
import type { Db } from '../database/connection';
import * as s from '../database/schema';
import type { AuthUser } from '../common/auth.types';
import { GLOBAL_SCOPE_ROLES } from '../common/auth.types';
import type { SubmitFeedbackDto, UpsertMenuDto } from './dto';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Mess menu display and student feedback (FR10, extension phase). */
@Injectable()
export class MessService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  /** The full week for one block, grouped by day and ordered by meal time. */
  async weeklyMenu(hostelId: number) {
    const rows = await this.db
      .select({
        id: s.messMenus.id,
        dayOfWeek: s.messMenus.dayOfWeek,
        meal: s.messMenus.meal,
        items: s.messMenus.items,
        servingTime: s.messMenus.servingTime,
        updatedAt: s.messMenus.updatedAt,
      })
      .from(s.messMenus)
      .where(eq(s.messMenus.hostelId, hostelId))
      .orderBy(asc(s.messMenus.dayOfWeek));

    const mealOrder = s.MESS_MEALS as readonly string[];
    return DAY_NAMES.map((name, day) => ({
      dayOfWeek: day,
      dayName: name,
      isToday: day === new Date().getDay(),
      meals: rows
        .filter((r) => r.dayOfWeek === day)
        .sort((a, b) => mealOrder.indexOf(a.meal) - mealOrder.indexOf(b.meal)),
    }));
  }

  async upsertMenu(dto: UpsertMenuDto, actor: AuthUser) {
    if (!GLOBAL_SCOPE_ROLES.includes(actor.role) && actor.hostelId !== dto.hostelId) {
      throw new ForbiddenException('You can only edit the menu for your assigned hostel block.');
    }

    // The (hostel, day, meal) unique index makes this a genuine upsert, so
    // editing a slot twice never leaves two conflicting rows behind.
    const [row] = await this.db
      .insert(s.messMenus)
      .values({
        hostelId: dto.hostelId,
        dayOfWeek: dto.dayOfWeek,
        meal: dto.meal,
        items: dto.items,
        servingTime: dto.servingTime ?? null,
        updatedBy: actor.id,
      })
      .onConflictDoUpdate({
        target: [s.messMenus.hostelId, s.messMenus.dayOfWeek, s.messMenus.meal],
        set: {
          items: dto.items,
          servingTime: dto.servingTime ?? null,
          updatedBy: actor.id,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  async submitFeedback(dto: SubmitFeedbackDto, actor: AuthUser) {
    if (!actor.hostelId) {
      throw new BadRequestException(
        'You need a hostel allocation before submitting mess feedback.',
      );
    }
    const [row] = await this.db
      .insert(s.messFeedback)
      .values({
        studentId: actor.id,
        hostelId: actor.hostelId,
        meal: dto.meal,
        servedOn: dto.servedOn,
        rating: dto.rating,
        comment: dto.comment ?? null,
      })
      .returning();
    return row;
  }

  /** Ratings roll-up plus the latest comments, for the mess staff dashboard. */
  async feedbackSummary(actor: AuthUser, hostelIdParam?: number) {
    const hostelId = GLOBAL_SCOPE_ROLES.includes(actor.role)
      ? hostelIdParam
      : (actor.hostelId ?? undefined);
    const scope = hostelId ? eq(s.messFeedback.hostelId, hostelId) : undefined;

    const [byMeal, recent, [overall]] = await Promise.all([
      this.db
        .select({
          meal: s.messFeedback.meal,
          averageRating: sql<string>`round(avg(${s.messFeedback.rating}), 2)`,
          responses: sql<number>`count(*)::int`,
        })
        .from(s.messFeedback)
        .where(scope)
        .groupBy(s.messFeedback.meal),
      this.db
        .select({
          id: s.messFeedback.id,
          meal: s.messFeedback.meal,
          rating: s.messFeedback.rating,
          comment: s.messFeedback.comment,
          servedOn: s.messFeedback.servedOn,
          createdAt: s.messFeedback.createdAt,
          studentName: s.users.name,
          hostelCode: s.hostels.code,
        })
        .from(s.messFeedback)
        .innerJoin(s.users, eq(s.users.id, s.messFeedback.studentId))
        .innerJoin(s.hostels, eq(s.hostels.id, s.messFeedback.hostelId))
        .where(scope ? and(scope, sql`${s.messFeedback.comment} is not null`) : sql`${s.messFeedback.comment} is not null`)
        .orderBy(desc(s.messFeedback.createdAt))
        .limit(20),
      this.db
        .select({
          averageRating: sql<string>`coalesce(round(avg(${s.messFeedback.rating}), 2), 0)`,
          responses: sql<number>`count(*)::int`,
        })
        .from(s.messFeedback)
        .where(scope),
    ]);

    const mealOrder = s.MESS_MEALS as readonly string[];
    return {
      overall,
      byMeal: byMeal.sort((a, b) => mealOrder.indexOf(a.meal) - mealOrder.indexOf(b.meal)),
      recentComments: recent,
    };
  }

  /** The signed-in student's own feedback history. */
  async myFeedback(actor: AuthUser) {
    return this.db
      .select()
      .from(s.messFeedback)
      .where(eq(s.messFeedback.studentId, actor.id))
      .orderBy(desc(s.messFeedback.createdAt))
      .limit(30);
  }
}
