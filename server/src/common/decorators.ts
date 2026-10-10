import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { UserRole } from '../database/schema';
import type { AuthUser } from './auth.types';

export const IS_PUBLIC_KEY = 'allocflow:isPublic';
export const ROLES_KEY = 'allocflow:roles';

/** Opts a route out of the globally applied JWT guard (login, health, docs). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Restricts a route to the listed roles. Enforced by RolesGuard, which runs
 * globally — a route with no @Roles() is available to any authenticated user.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** Injects the authenticated principal resolved by JwtStrategy. */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest().user as AuthUser;
    return data ? user?.[data] : user;
  },
);
