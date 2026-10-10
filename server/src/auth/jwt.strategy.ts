import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { loadEnv } from '../config/env';
import type { AuthUser, JwtPayload } from '../common/auth.types';
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly auth: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: loadEnv().JWT_SECRET,
    });
  }

  /**
   * Re-reads the user on every request rather than trusting the claims in the
   * token. A deactivated account or a changed room allocation therefore takes
   * effect immediately, instead of lingering until the token expires.
   */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.auth.resolveUser(payload.sub);
    if (!user) throw new UnauthorizedException('Your session is no longer valid.');
    return user;
  }
}
