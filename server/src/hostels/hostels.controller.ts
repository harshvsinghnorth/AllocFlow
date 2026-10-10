import { Controller, Get, Param, ParseIntPipe, Patch, Body } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HostelsService } from './hostels.service';
import { RoomsService } from './rooms.service';
import { UpdateRoomDto } from './dto';
import { CurrentUser, Roles } from '../common/decorators';
import type { AuthUser } from '../common/auth.types';

@ApiTags('Hostels & Availability')
@Controller()
export class HostelsController {
  constructor(
    private readonly hostels: HostelsService,
    private readonly rooms: RoomsService,
  ) {}

  @Get('hostels')
  @ApiOperation({ summary: 'List every hostel block with live occupancy totals' })
  list(@CurrentUser() user: AuthUser) {
    return this.hostels.list(user);
  }

  @Get('hostels/:id/structure')
  @ApiOperation({
    summary: 'Geometry drivers and per-floor availability for the 3D model',
  })
  structure(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.hostels.getStructure(id, user);
  }

  @Get('hostels/:id/floors/:floor/rooms')
  @ApiOperation({ summary: 'Colour-coded rooms on one floor' })
  floorRooms(
    @Param('id', ParseIntPipe) id: number,
    @Param('floor', ParseIntPipe) floor: number,
  ) {
    return this.hostels.getFloorRooms(id, floor);
  }

  @Get('rooms/:roomId')
  @ApiOperation({ summary: 'Bed-level availability inside a room' })
  room(@Param('roomId', ParseIntPipe) roomId: number, @CurrentUser() user: AuthUser) {
    return this.hostels.getRoomDetail(roomId, user);
  }

  @Patch('rooms/:roomId')
  @Roles('WARDEN', 'SUPERVISOR', 'ADMIN')
  @ApiOperation({ summary: 'Block/unblock a room or update its notes' })
  updateRoom(
    @Param('roomId', ParseIntPipe) roomId: number,
    @Body() dto: UpdateRoomDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.rooms.update(roomId, dto, user);
  }
}
