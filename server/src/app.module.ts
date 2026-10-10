import { Controller, Get, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { HostelsModule } from './hostels/hostels.module';
import { BookingsModule } from './bookings/bookings.module';
import { RequestsModule } from './requests/requests.module';
import { GatepassesModule } from './gatepasses/gatepasses.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { ElectricityModule } from './electricity/electricity.module';
import { MessModule } from './mess/mess.module';
import { RaidsModule } from './raids/raids.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DashboardModule } from './dashboard/dashboard.module';

import { JwtAuthGuard, RolesGuard } from './common/guards';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { TimingInterceptor } from './common/timing.interceptor';
import { Public } from './common/decorators';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  check() {
    return { status: 'ok', service: 'allocflow-api', timestamp: new Date().toISOString() };
  }
}

@Module({
  imports: [
    // 300 requests/minute per IP. Generous for normal use, but it stops a
    // runaway client or a scripted brute force against /auth/login.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    DatabaseModule,
    AuthModule,
    HostelsModule,
    BookingsModule,
    RequestsModule,
    GatepassesModule,
    AnnouncementsModule,
    ElectricityModule,
    MessModule,
    RaidsModule,
    NotificationsModule,
    DashboardModule,
  ],
  controllers: [HealthController],
  providers: [
    /*
     * Guard order is significant: throttling first, then authentication, then
     * role authorisation. Registering them globally makes protection the
     * default — a route is only reachable unauthenticated if it opts out with
     * @Public(), so a new endpoint cannot be exposed by forgetting a guard.
     */
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: TimingInterceptor },
  ],
})
export class AppModule {}
