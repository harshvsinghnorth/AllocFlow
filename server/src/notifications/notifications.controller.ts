import { Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../common/decorators';
import type { AuthUser } from '../common/auth.types';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'The caller’s alert inbox with an unread count' })
  list(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.notifications.list(user.id, limit ? Math.min(Number(limit), 100) : 30);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark every alert as read' })
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark one alert as read' })
  markRead(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.notifications.markRead(id, user.id);
  }
}
