import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto';
import { CurrentUser, Roles } from '../common/decorators';
import type { AuthUser } from '../common/auth.types';

@ApiTags('Announcements')
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  @ApiOperation({ summary: 'Announcements visible to the caller, newest first' })
  list(@CurrentUser() user: AuthUser) {
    return this.announcements.list(user);
  }

  @Post()
  @Roles('WARDEN', 'SUPERVISOR', 'ADMIN', 'MESS_STAFF')
  @ApiOperation({ summary: 'Broadcast a notice' })
  create(@Body() dto: CreateAnnouncementDto, @CurrentUser() user: AuthUser) {
    return this.announcements.create(dto, user);
  }

  @Post(':id/read')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Mark an announcement as read' })
  markRead(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.announcements.markRead(id, user);
  }

  @Delete(':id')
  @Roles('WARDEN', 'SUPERVISOR', 'ADMIN', 'MESS_STAFF')
  @ApiOperation({ summary: 'Withdraw an announcement' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.announcements.remove(id, user);
  }
}
