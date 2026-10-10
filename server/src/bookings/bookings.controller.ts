import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto';
import { CurrentUser, Roles } from '../common/decorators';
import type { AuthUser } from '../common/auth.types';

@ApiTags('Bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  @Roles('STUDENT', 'WARDEN', 'SUPERVISOR', 'ADMIN')
  @ApiOperation({ summary: 'Book a bed (students for themselves, staff on behalf)' })
  create(@Body() dto: CreateBookingDto, @CurrentUser() user: AuthUser) {
    return this.bookings.create(dto, user);
  }

  @Get('me')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'The signed-in student’s active allocation' })
  mine(@CurrentUser() user: AuthUser) {
    return this.bookings.findActiveForStudent(user.id);
  }

  @Get('me/history')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Allocation history for the signed-in student' })
  myHistory(@CurrentUser() user: AuthUser) {
    return this.bookings.history(user.id);
  }

  @Get('unallocated')
  @Roles('WARDEN', 'SUPERVISOR', 'ADMIN')
  @ApiOperation({ summary: 'Students awaiting a room allocation' })
  unallocated(
    @CurrentUser() user: AuthUser,
    @Query('hostelId') hostelId?: string,
  ) {
    return this.bookings.listUnallocated(user, hostelId ? Number(hostelId) : undefined);
  }

  @Post(':id/vacate')
  @ApiOperation({ summary: 'Release a bed back into the availability pool' })
  vacate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.bookings.vacate(id, user);
  }
}
