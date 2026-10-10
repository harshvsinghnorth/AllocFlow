import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MessService } from './mess.service';
import { SubmitFeedbackDto, UpsertMenuDto } from './dto';
import { CurrentUser, Roles } from '../common/decorators';
import type { AuthUser } from '../common/auth.types';

@ApiTags('Mess (extension)')
@Controller('mess')
export class MessController {
  constructor(private readonly mess: MessService) {}

  @Get('menu/:hostelId')
  @ApiOperation({ summary: 'Weekly mess menu for a hostel block' })
  menu(@Param('hostelId', ParseIntPipe) hostelId: number) {
    return this.mess.weeklyMenu(hostelId);
  }

  @Put('menu')
  @Roles('MESS_STAFF', 'WARDEN', 'ADMIN')
  @ApiOperation({ summary: 'Create or replace one menu slot' })
  upsert(@Body() dto: UpsertMenuDto, @CurrentUser() user: AuthUser) {
    return this.mess.upsertMenu(dto, user);
  }

  @Post('feedback')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Rate a meal and leave an optional comment' })
  submit(@Body() dto: SubmitFeedbackDto, @CurrentUser() user: AuthUser) {
    return this.mess.submitFeedback(dto, user);
  }

  @Get('feedback/me')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'The student’s own feedback history' })
  mine(@CurrentUser() user: AuthUser) {
    return this.mess.myFeedback(user);
  }

  @Get('feedback/summary')
  @Roles('MESS_STAFF', 'WARDEN', 'SUPERVISOR', 'ADMIN')
  @ApiOperation({ summary: 'Average ratings by meal plus recent comments' })
  summary(@CurrentUser() user: AuthUser, @Query('hostelId') hostelId?: string) {
    return this.mess.feedbackSummary(user, hostelId ? Number(hostelId) : undefined);
  }
}
