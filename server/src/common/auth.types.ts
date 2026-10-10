import type { StudentGender, UserRole } from '../database/schema';

/**
 * The authenticated principal attached to every request.
 *
 * Profile context (hostel, room, subtype ids) is resolved once during token
 * validation so that authorisation checks and hostel scoping in the services
 * never need an extra round trip.
 */
export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  /** Set for STUDENT: their own user id, mirrored for readability at call sites. */
  studentId?: number;
  /** Set for every staff role: their own user id. */
  staffId?: number;
  /** Student's hostel, or a staff member's assigned block. Null for unscoped roles. */
  hostelId?: number | null;
  /** Student's currently allocated room, if any. */
  currentRoomId?: number | null;
  /** Set for STUDENT. Decides which blocks they may be allocated into. */
  gender?: StudentGender | null;
}

export interface JwtPayload {
  sub: number;
  email: string;
  role: UserRole;
}

/** Roles permitted to act on hostel operations on behalf of staff. */
export const STAFF_ROLES: UserRole[] = ['WARDEN', 'SUPERVISOR', 'SECURITY', 'MESS_STAFF', 'ADMIN'];

/** Roles that may approve/resolve student-submitted work items. */
export const APPROVER_ROLES: UserRole[] = ['WARDEN', 'ADMIN'];

/** Roles with read access across every hostel block. */
export const GLOBAL_SCOPE_ROLES: UserRole[] = ['SUPERVISOR', 'ADMIN'];
