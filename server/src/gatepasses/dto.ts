import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { GATEPASS_STATUSES, type GatepassStatus } from '../database/schema';

export class CreateGatepassDto {
  @ApiProperty({ example: 'Medical appointment at city hospital' })
  @IsString()
  @MinLength(4, { message: 'Give a short reason for the gatepass.' })
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({ example: 'City hospital' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  destination?: string;

  @ApiProperty({ example: '2026-09-10T09:00:00.000Z' })
  @IsISO8601({}, { message: 'fromTime must be an ISO date-time.' })
  fromTime!: string;

  @ApiProperty({ example: '2026-09-10T18:00:00.000Z' })
  @IsISO8601({}, { message: 'toTime must be an ISO date-time.' })
  toTime!: string;
}

export class DecideGatepassDto {
  @ApiProperty({ description: 'true approves the pass, false rejects it' })
  @IsBoolean()
  approve!: boolean;

  @ApiPropertyOptional({ description: 'Reason shown to the student' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ListGatepassQuery {
  @ApiPropertyOptional({ enum: GATEPASS_STATUSES })
  @IsOptional()
  @IsIn(GATEPASS_STATUSES as unknown as string[])
  status?: GatepassStatus;

  @ApiPropertyOptional()
  @IsOptional()
  hostelId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  limit?: string;
}
