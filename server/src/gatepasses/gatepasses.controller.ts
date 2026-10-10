import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GatepassesService } from './gatepasses.service';
import { CreateGatepassDto, DecideGatepassDto, ListGatepassQuery } from './dto';
import { CurrentUser, Roles } from '../common/decorators';
import type { AuthUser } from '../common/auth.types';

@ApiTags('Gatepass')
@Controller('gatepasses')
export class GatepassesController {
  constructor(private readonly gatepasses: GatepassesService) {}

  @Post()
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Request a gatepass for a time window' })
  create(@Body() dto: CreateGatepassDto, @CurrentUser() user: AuthUser) {
    return this.gatepasses.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List gatepasses, scoped to the caller’s role' })
  list(@Query() query: ListGatepassQuery, @CurrentUser() user: AuthUser) {
    return this.gatepasses.list(query, user);
  }

  @Get('verify/:reference')
  @Roles('SECURITY', 'WARDEN', 'ADMIN')
  @ApiOperation({ summary: 'Gate-side verification of a pass reference' })
  verify(@Param('reference') reference: string) {
    return this.gatepasses.verify(reference);
  }

  @Post(':id/decision')
  @Roles('WARDEN', 'ADMIN')
  @ApiOperation({ summary: 'Approve or reject a pending gatepass' })
  decide(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideGatepassDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.gatepasses.decide(id, dto, user);
  }

  @Post(':id/check-out')
  @Roles('SECURITY', 'ADMIN')
  @ApiOperation({ summary: 'Record the student leaving the hostel' })
  checkOut(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.gatepasses.recordMovement(id, 'CHECK_OUT', user);
  }

  @Post(':id/check-in')
  @Roles('SECURITY', 'ADMIN')
  @ApiOperation({ summary: 'Record the student returning to the hostel' })
  checkIn(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.gatepasses.recordMovement(id, 'CHECK_IN', user);
  }
}
