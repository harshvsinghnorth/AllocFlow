import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, SQL } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module';
import type { Db } from '../database/connection';
import * as s from '../database/schema';
import type { AuthUser } from '../common/auth.types';
import { GLOBAL_SCOPE_ROLES } from '../common/auth.types';
import type { CompleteRaidDto, CreateRaidDto } from './dto';

/**
 * Warden raid scheduling and logging (FR12, extension phase).
 *
 * Raids are deliberately invisible to students: a surprise inspection that is
 * announced in advance defeats its own purpose. Only staff routes read this.
 */
@Injectable()
export class RaidsService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async list(actor: AuthUser, hostelIdParam?: number) {
    const filters: SQL[] = [];
    const hostelId = GLOBAL_SCOPE_ROLES.includes(actor.role)
      ? hostelIdParam
      : (actor.hostelId ?? undefined);
    if (hostelId) filters.push(eq(s.raids.hostelId, hostelId));

    return this.db
      .select({
        id: s.raids.id,
        floor: s.raids.floor,
        scheduledFor: s.raids.scheduledFor,
        purpose: s.raids.purpose,
        status: s.raids.status,
        findings: s.raids.findings,
        completedAt: s.raids.completedAt,
        createdAt: s.raids.createdAt,
        hostelId: s.raids.hostelId,
        hostelCode: s.hostels.code,
        conductedBy: s.raids.conductedBy,
        conductorName: s.users.name,
      })
      .from(s.raids)
      .innerJoin(s.hostels, eq(s.hostels.id, s.raids.hostelId))
      .innerJoin(s.users, eq(s.users.id, s.raids.conductedBy))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(s.raids.scheduledFor))
      .limit(100);
  }

  async create(dto: CreateRaidDto, actor: AuthUser) {
    if (!GLOBAL_SCOPE_ROLES.includes(actor.role) && actor.hostelId !== dto.hostelId) {
      throw new ForbiddenException('You can only schedule raids in your assigned hostel block.');
    }

    const [hostel] = await this.db
      .select({ floors: s.hostels.floors })
      .from(s.hostels)
      .where(eq(s.hostels.id, dto.hostelId))
      .limit(1);
    if (!hostel) throw new NotFoundException(`Hostel ${dto.hostelId} was not found.`);

    if (dto.floor != null && (dto.floor < 1 || dto.floor > hostel.floors)) {
      throw new BadRequestException(
        `Floor ${dto.floor} does not exist in this block (1-${hostel.floors}).`,
      );
    }

    const scheduledFor = new Date(dto.scheduledFor);
    if (Number.isNaN(scheduledFor.getTime())) {
      throw new BadRequestException('scheduledFor must be a valid date-time.');
    }

    const [created] = await this.db
      .insert(s.raids)
      .values({
        hostelId: dto.hostelId,
        floor: dto.floor ?? null,
        scheduledFor,
        purpose: dto.purpose,
        conductedBy: actor.id,
        status: 'SCHEDULED',
      })
      .returning();
    return created;
  }

  async complete(id: number, dto: CompleteRaidDto, actor: AuthUser) {
    const [raid] = await this.db.select().from(s.raids).where(eq(s.raids.id, id)).limit(1);
    if (!raid) throw new NotFoundException(`Raid ${id} was not found.`);

    if (!GLOBAL_SCOPE_ROLES.includes(actor.role) && raid.hostelId !== actor.hostelId) {
      throw new ForbiddenException('You can only update raids in your assigned hostel block.');
    }
    if (raid.status !== 'SCHEDULED') {
      throw new BadRequestException(`This raid is already ${raid.status.toLowerCase()}.`);
    }

    const [updated] = await this.db
      .update(s.raids)
      .set({
        status: dto.status,
        findings: dto.findings ?? null,
        completedAt: dto.status === 'COMPLETED' ? new Date() : null,
      })
      .where(eq(s.raids.id, id))
      .returning();
    return updated;
  }

  /** Upcoming raids for the warden dashboard. */
  async upcoming(actor: AuthUser) {
    const hostelId = actor.hostelId;
    return this.db
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
        hostelId
          ? and(eq(s.raids.status, 'SCHEDULED'), eq(s.raids.hostelId, hostelId))
          : eq(s.raids.status, 'SCHEDULED'),
      )
      .orderBy(asc(s.raids.scheduledFor))
      .limit(5);
  }
}
