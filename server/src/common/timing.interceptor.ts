import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request, Response } from 'express';

/**
 * Measures server-side handling time and surfaces it as an X-Response-Time
 * header. SRS NFR1 sets a 3-second budget for user actions, so anything past
 * a second is logged as a warning to make regressions visible in development.
 */
@Injectable()
export class TimingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Timing');
  private static readonly SLOW_MS = 1000;

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const started = process.hrtime.bigint();
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    return next.handle().pipe(
      tap(() => {
        const ms = Number(process.hrtime.bigint() - started) / 1e6;
        if (!res.headersSent) res.setHeader('X-Response-Time', `${ms.toFixed(1)}ms`);
        if (ms > TimingInterceptor.SLOW_MS) {
          this.logger.warn(`${req.method} ${req.url} took ${ms.toFixed(0)}ms`);
        }
      }),
    );
  }
}
