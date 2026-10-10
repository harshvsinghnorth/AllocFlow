import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ElectricityService } from './electricity.service';
import { CreateBillDto, ListBillsQuery, SetPaidDto } from './dto';
import { CurrentUser, Roles } from '../common/decorators';
import type { AuthUser } from '../common/auth.types';

@ApiTags('Electricity Billing')
@Controller('electricity')
export class ElectricityController {
  constructor(private readonly electricity: ElectricityService) {}

  @Get('me')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Bills for the student’s allocated room, with per-head share' })
  mine(@CurrentUser() user: AuthUser) {
    return this.electricity.forStudent(user);
  }

  @Get()
  @Roles('WARDEN', 'SUPERVISOR', 'ADMIN')
  @ApiOperation({ summary: 'Bills across a hostel block' })
  list(@Query() query: ListBillsQuery, @CurrentUser() user: AuthUser) {
    return this.electricity.list(query, user);
  }

  @Get('trend')
  @Roles('WARDEN', 'SUPERVISOR', 'ADMIN')
  @ApiOperation({ summary: 'Consumption and collection trend by period' })
  trend(@CurrentUser() user: AuthUser, @Query('hostelId') hostelId?: string) {
    return this.electricity.trend(user, hostelId);
  }

  @Post()
  @Roles('WARDEN', 'SUPERVISOR', 'ADMIN')
  @ApiOperation({ summary: 'Issue a bill for a room and period' })
  create(@Body() dto: CreateBillDto, @CurrentUser() user: AuthUser) {
    return this.electricity.create(dto, user);
  }

  @Patch(':id/paid')
  @Roles('WARDEN', 'SUPERVISOR', 'ADMIN')
  @ApiOperation({ summary: 'Record a bill as paid or unpaid' })
  setPaid(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetPaidDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.electricity.setPaid(id, dto.isPaid, user);
  }
}
