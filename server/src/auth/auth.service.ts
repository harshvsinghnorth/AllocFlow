import {
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { DRIZZLE } from '../database/database.module';
import type { Db } from '../database/connection';
import * as s from '../database/schema';
import type { AuthUser, JwtPayload } from '../common/auth.types';
import type { LoginDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Resolves the full principal for a user id, joining in the STUDENT/STAFF
   * subtype so downstream authorisation has hostel and room scope available.
   * Returns null for unknown or deactivated accounts.
   */
  async resolveUser(userId: number): Promise<AuthUser | null> {
    const [row] = await this.db
      .select({
        id: s.users.id,
        email: s.users.email,
        name: s.users.name,
        role: s.users.role,
        isActive: s.users.isActive,
        studentHostelId: s.students.hostelId,
        currentRoomId: s.students.currentRoomId,
        studentGender: s.students.gender,
        studentUserId: s.students.userId,
        staffUserId: s.staff.userId,
        staffHostelId: s.staff.assignedHostelId,
      })
      .from(s.users)
      .leftJoin(s.students, eq(s.students.userId, s.users.id))
      .leftJoin(s.staff, eq(s.staff.userId, s.users.id))
      .where(eq(s.users.id, userId))
      .limit(1);

    if (!row || !row.isActive) return null;

    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role as AuthUser['role'],
      studentId: row.studentUserId ?? undefined,
      staffId: row.staffUserId ?? undefined,
      hostelId: row.studentUserId ? row.studentHostelId : row.staffHostelId,
      currentRoomId: row.currentRoomId ?? null,
      gender: (row.studentGender as AuthUser['gender']) ?? null,
    };
  }

  async login(dto: LoginDto): Promise<{ accessToken: string; user: AuthUser }> {
    const [account] = await this.db
      .select({
        id: s.users.id,
        passwordHash: s.users.passwordHash,
        isActive: s.users.isActive,
      })
      .from(s.users)
      .where(eq(s.users.email, dto.email.trim().toLowerCase()))
      .limit(1);

    /*
     * A wrong email and a wrong password must be indistinguishable, otherwise
     * the endpoint becomes an account-enumeration oracle. When no account
     * matches we still run a bcrypt comparison against a dummy hash so the
     * response time does not leak existence either.
     */
    const hash = account?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const ok = await bcrypt.compare(dto.password, hash);

    if (!account || !ok || !account.isActive) {
      throw new UnauthorizedException('Incorrect email or password.');
    }

    const user = await this.resolveUser(account.id);
    if (!user) throw new UnauthorizedException('Incorrect email or password.');

    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    return { accessToken: await this.jwt.signAsync(payload), user };
  }
}
