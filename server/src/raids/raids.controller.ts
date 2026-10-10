import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RaidsService } from './raids.service';
import { CompleteRaidDto, CreateRaidDto } from './dto';
import { CurrentUser, Roles } from '../common/decorators';
import type { AuthUser } from '../common/auth.types';

/** Staff-only: students must never see a scheduled inspection. */
@ApiTags('Warden Raids (extension)')
@Controller('raids')
@Roles('WARDEN', 'SUPERVISOR', 'ADMIN')
export class RaidsController {
  constructor(private readonly raids: RaidsService) {}

  @Get()
  @ApiOperation({ summary: 'Scheduled and completed inspections' })
  list(@CurrentUser() user: AuthUser, @Query('hostelId') hostelId?: string) {
    return this.raids.list(user, hostelId ? Number(hostelId) : undefined);
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'Next few scheduled inspections' })
  upcoming(@CurrentUser() user: AuthUser) {
    return this.raids.upcoming(user);
  }

  @Post()
  @ApiOperation({ summary: 'Schedule a room inspection' })
  create(@Body() dto: CreateRaidDto, @CurrentUser() user: AuthUser) {
    return this.raids.create(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Log findings or cancel a scheduled inspection' })
  complete(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompleteRaidDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.raids.complete(id, dto, user);
  }
}
