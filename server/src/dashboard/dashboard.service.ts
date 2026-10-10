import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, inArray, sql, SQL } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module';
import type { Db } from '../database/connection';
import * as s from '../database/schema';
import type { AuthUser } from '../common/auth.types';
import { GLOBAL_SCOPE_ROLES } from '../common/auth.types';

/**
 * Role-specific dashboard aggregates.
 *
 * Each role gets exactly the figures its screen renders, assembled by issuing
 * the independent queries concurrently. That keeps a dashboard to roughly one
 * round trip of latency rather than the sum of its parts — the practical way
 * to hold the 3-second budget of NFR1 on a page this dense.
 */
@Injectable()
export class DashboardService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async forUser(user: AuthUser) {
    switch (user.role) {
      case 'STUDENT':
        return this.studentDashboard(user);
      case 'SECURITY':
        return this.securityDashboard();
      case 'MESS_STAFF':
        return this.messDashboard(user);
      default:
        return this.staffDashboard(user);
    }
  }

  private async studentDashboard(user: AuthUser) {
    const [booking, openRequests, gatepass, unreadAlerts, latestAnnouncements, bills] =
      await Promise.all([
        this.db
          .select({
            id: s.bookings.id,
            bedIndex: s.bookings.bedIndex,
            bookingDate: s.bookings.bookingDate,
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
          .where(and(eq(s.bookings.studentId, user.id), eq(s.bookings.status, 'ACTIVE')))
          .limit(1),
        this.db
          .select({ status: s.requests.status, type: s.requests.type, value: count() })
          .from(s.requests)
          .where(
            and(
              eq(s.requests.studentId, user.id),
              inArray(s.requests.status, ['PENDING', 'IN_PROGRESS']),
            ),
          )
          .groupBy(s.requests.status, s.requests.type),
        this.db
          .select({
            id: s.gatepasses.id,
            reference: s.gatepasses.reference,
            status: s.gatepasses.status,
            fromTime: s.gatepasses.fromTime,
            toTime: s.gatepasses.toTime,
            reason: s.gatepasses.reason,
          })
          .from(s.gatepasses)
          .where(
            and(
              eq(s.gatepasses.studentId, user.id),
              inArray(s.gatepasses.status, ['PENDING', 'APPROVED', 'CHECKED_OUT']),
            ),
          )
          .orderBy(desc(s.gatepasses.createdAt))
          .limit(1),
        this.db
          .select({ value: count() })
          .from(s.notifications)
          .where(and(eq(s.notifications.userId, user.id), eq(s.notifications.isRead, false))),
        this.db
          .select({
            id: s.announcements.id,
            title: s.announcements.title,
            category: s.announcements.category,
            createdAt: s.announcements.createdAt,
          })
          .from(s.announcements)
          .where(
            user.hostelId
              ? sql`(${s.announcements.hostelId} is null or ${s.announcements.hostelId} = ${user.hostelId})`
              : sql`${s.announcements.hostelId} is null`,
          )
          .orderBy(desc(s.announcements.isPinned), desc(s.announcements.createdAt))
          .limit(4),
        user.currentRoomId
          ? this.db
              .select({
                period: s.electricityBills.period,
                amount: s.electricityBills.amount,
                isPaid: s.electricityBills.isPaid,
                dueDate: s.electricityBills.dueDate,
              })
              .from(s.electricityBills)
              .where(eq(s.electricityBills.roomId, user.currentRoomId))
              .orderBy(desc(s.electricityBills.period))
              .limit(3)
          : Promise.resolve([]),
      ]);

    const outstanding = bills
      .filter((b) => !b.isPaid)
      .reduce((a, b) => a + Number(b.amount), 0);

    return {
      role: 'STUDENT' as const,
      booking: booking[0] ?? null,
      openRequests: openRequests.reduce((a, r) => a + Number(r.value), 0),
      requestBreakdown: openRequests,
      activeGatepass: gatepass[0] ?? null,
      unreadAlerts: unreadAlerts[0]?.value ?? 0,
      announcements: latestAnnouncements,
      recentBills: bills,
      outstandingAmount: outstanding.toFixed(2),
    };
  }

  private async staffDashboard(user: AuthUser) {
    const scoped = !GLOBAL_SCOPE_ROLES.includes(user.role) && user.hostelId;
    const roomScope: SQL | undefined = scoped ? eq(s.rooms.hostelId, user.hostelId!) : undefined;
    const requestScope: SQL | undefined = scoped
      ? eq(s.requests.hostelId, user.hostelId!)
      : undefined;

    const [occupancy, requestCounts, pendingGatepasses, upcomingRaids, recentRequests, byHostel] =
      await Promise.all([
        this.db
          .select({
            totalRooms: sql<number>`count(*)::int`,
            totalBeds: sql<number>`coalesce(sum(${s.rooms.capacity}), 0)::int`,
            occupiedBeds: sql<number>`coalesce(sum(${s.rooms.occupiedBeds}), 0)::int`,
            fullRooms: sql<number>`count(*) filter (where ${s.rooms.occupiedBeds} >= ${s.rooms.capacity})::int`,
            blockedRooms: sql<number>`count(*) filter (where ${s.rooms.isBlocked} = true)::int`,
          })
          .from(s.rooms)
          .where(roomScope),
        this.db
          .select({ type: s.requests.type, status: s.requests.status, value: count() })
          .from(s.requests)
          .where(requestScope)
          .groupBy(s.requests.type, s.requests.status),
        this.db
          .select({ value: count() })
          .from(s.gatepasses)
          .innerJoin(s.students, eq(s.students.userId, s.gatepasses.studentId))
          .where(
            scoped
              ? and(eq(s.gatepasses.status, 'PENDING'), eq(s.students.hostelId, user.hostelId!))
              : eq(s.gatepasses.status, 'PENDING'),
          ),
        this.db
          .select({
            id: s.raids.id,
            floor: s.raids.floor,
            scheduledFor: s.raids.scheduledFor,
            purpose: s.raids.purpose,
            hostelCode: s.hostels.code,
          })
          .from(s.raids)
          .innerJoin(s.hostels, eq(s.hostels.id, s.raids.hostelId))
          .where(
            scoped
              ? and(eq(s.raids.status, 'SCHEDULED'), eq(s.raids.hostelId, user.hostelId!))
              : eq(s.raids.status, 'SCHEDULED'),
          )
          .orderBy(s.raids.scheduledFor)
          .limit(4),
        this.db
          .select({
            id: s.requests.id,
            type: s.requests.type,
            category: s.requests.category,
            status: s.requests.status,
            priority: s.requests.priority,
            createdAt: s.requests.createdAt,
            studentName: s.users.name,
            roomNumber: s.rooms.roomNumber,
            hostelCode: s.hostels.code,
          })
          .from(s.requests)
          .innerJoin(s.users, eq(s.users.id, s.requests.studentId))
          .leftJoin(s.rooms, eq(s.rooms.id, s.requests.roomId))
          .leftJoin(s.hostels, eq(s.hostels.id, s.requests.hostelId))
          .where(
            requestScope
              ? and(requestScope, inArray(s.requests.status, ['PENDING', 'IN_PROGRESS']))
              : inArray(s.requests.status, ['PENDING', 'IN_PROGRESS']),
          )
          .orderBy(desc(s.requests.createdAt))
          .limit(6),
        // Cross-block occupancy: the supervisor's campus-wide reporting view.
        this.db
          .select({
            hostelId: s.hostels.id,
            code: s.hostels.code,
            name: s.hostels.name,
            accentColor: s.hostels.accentColor,
            totalBeds: sql<number>`coalesce(sum(${s.rooms.capacity}), 0)::int`,
            occupiedBeds: sql<number>`coalesce(sum(${s.rooms.occupiedBeds}), 0)::int`,
          })
          .from(s.hostels)
          .leftJoin(s.rooms, eq(s.rooms.hostelId, s.hostels.id))
          .groupBy(s.hostels.id)
          .orderBy(s.hostels.code),
      ]);

    const occ = occupancy[0];
    const pendingRequests = requestCounts
      .filter((r) => r.status === 'PENDING' || r.status === 'IN_PROGRESS')
      .reduce((a, r) => a + Number(r.value), 0);

    return {
      role: user.role,
      occupancy: {
        ...occ,
        freeBeds: occ.totalBeds - occ.occupiedBeds,
        occupancyRate:
          occ.totalBeds > 0 ? Math.round((occ.occupiedBeds / occ.totalBeds) * 100) : 0,
      },
      requestCounts,
      pendingRequests,
      pendingGatepasses: pendingGatepasses[0]?.value ?? 0,
      upcomingRaids,
      recentRequests,
      byHostel: byHostel.map((h) => ({
        ...h,
        occupancyRate:
          h.totalBeds > 0 ? Math.round((h.occupiedBeds / h.totalBeds) * 100) : 0,
      })),
    };
  }

  private async securityDashboard() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [outNow, todayMovements, expected] = await Promise.all([
      this.db
        .select({
          id: s.gatepasses.id,
          reference: s.gatepasses.reference,
          checkedOutAt: s.gatepasses.checkedOutAt,
          toTime: s.gatepasses.toTime,
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
        .where(eq(s.gatepasses.status, 'CHECKED_OUT'))
        .orderBy(s.gatepasses.toTime)
        .limit(50),
      this.db
        .select({ value: count() })
        .from(s.gatepasses)
        .where(gte(s.gatepasses.checkedOutAt, startOfDay)),
      this.db
        .select({ value: count() })
        .from(s.gatepasses)
        .where(eq(s.gatepasses.status, 'APPROVED')),
    ]);

    const now = Date.now();
    return {
      role: 'SECURITY' as const,
      currentlyOut: outNow.map((g) => ({
        ...g,
        isOverdue: new Date(g.toTime).getTime() < now,
      })),
      currentlyOutCount: outNow.length,
      overdueCount: outNow.filter((g) => new Date(g.toTime).getTime() < now).length,
      checkedOutToday: todayMovements[0]?.value ?? 0,
      awaitingDeparture: expected[0]?.value ?? 0,
    };
  }

  private async messDashboard(user: AuthUser) {
    const scope = user.hostelId ? eq(s.messFeedback.hostelId, user.hostelId) : undefined;

    const [overall, byMeal, recent] = await Promise.all([
      this.db
        .select({
          averageRating: sql<string>`coalesce(round(avg(${s.messFeedback.rating}), 2), 0)`,
          responses: sql<number>`count(*)::int`,
        })
        .from(s.messFeedback)
        .where(scope),
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
          createdAt: s.messFeedback.createdAt,
          studentName: s.users.name,
        })
        .from(s.messFeedback)
        .innerJoin(s.users, eq(s.users.id, s.messFeedback.studentId))
        .where(scope ? and(scope, sql`${s.messFeedback.comment} is not null`) : sql`${s.messFeedback.comment} is not null`)
        .orderBy(desc(s.messFeedback.createdAt))
        .limit(8),
      ]);

    const mealOrder = s.MESS_MEALS as readonly string[];
    return {
      role: 'MESS_STAFF' as const,
      hostelId: user.hostelId ?? null,
      overall: overall[0],
      byMeal: byMeal.sort((a, b) => mealOrder.indexOf(a.meal) - mealOrder.indexOf(b.meal)),
      recentComments: recent,
    };
  }
}
