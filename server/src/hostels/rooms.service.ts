import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module';
import type { Db } from '../database/connection';
import * as s from '../database/schema';
import type { AuthUser } from '../common/auth.types';
import { GLOBAL_SCOPE_ROLES } from '../common/auth.types';
import type { UpdateRoomDto } from './dto';

@Injectable()
export class RoomsService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  /**
   * Wardens may only administer rooms in the block they are assigned to;
   * supervisors and admins are scoped campus-wide.
   */
  assertCanAdminister(user: AuthUser, hostelId: number): void {
    if (GLOBAL_SCOPE_ROLES.includes(user.role)) return;
    if (user.hostelId !== hostelId) {
      throw new ForbiddenException('You can only manage rooms in your assigned hostel block.');
    }
  }

  async update(roomId: number, dto: UpdateRoomDto, user: AuthUser) {
    const [room] = await this.db
      .select()
      .from(s.rooms)
      .where(eq(s.rooms.id, roomId))
      .limit(1);
    if (!room) throw new NotFoundException(`Room ${roomId} was not found.`);

    this.assertCanAdminister(user, room.hostelId);

    if (dto.isBlocked === true && room.occupiedBeds > 0) {
      throw new BadRequestException(
        `Room ${room.roomNumber} still has ${room.occupiedBeds} resident(s). Vacate the room before blocking it.`,
      );
    }

    const [updated] = await this.db
      .update(s.rooms)
      .set({
        ...(dto.isBlocked !== undefined ? { isBlocked: dto.isBlocked } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      })
      .where(eq(s.rooms.id, roomId))
      .returning();

    return updated;
  }
}
