import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequestsService } from './requests.service';
import { CreateRequestDto, ListRequestsQuery, UpdateRequestDto } from './dto';
import { CurrentUser, Roles } from '../common/decorators';
import type { AuthUser } from '../common/auth.types';

@ApiTags('Housekeeping & Repair Requests')
@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Post()
  @Roles('STUDENT')
  @ApiOperation({
    summary: 'Raise a housekeeping or repair request (room details auto-filled)',
  })
  create(@Body() dto: CreateRequestDto, @CurrentUser() user: AuthUser) {
    return this.requests.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List requests, scoped to the caller’s role and block' })
  list(@Query() query: ListRequestsQuery, @CurrentUser() user: AuthUser) {
    return this.requests.list(query, user);
  }

  @Get('summary')
  @Roles('WARDEN', 'SUPERVISOR', 'ADMIN')
  @ApiOperation({ summary: 'Counts by type and status for dashboard tiles' })
  summary(@CurrentUser() user: AuthUser) {
    return this.requests.summary(user);
  }

  @Patch(':id')
  @Roles('WARDEN', 'SUPERVISOR', 'ADMIN')
  @ApiOperation({ summary: 'Move a request through its status workflow' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.requests.update(id, dto, user);
  }
}
