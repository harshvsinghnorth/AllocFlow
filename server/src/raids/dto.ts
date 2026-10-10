import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateRaidDto {
  @ApiProperty() @IsInt() @Min(1) hostelId!: number;

  @ApiPropertyOptional({ description: 'Omit for a whole-block inspection' })
  @IsOptional() @IsInt() @Min(1)
  floor?: number;

  @ApiProperty({ example: '2026-09-12T21:00:00.000Z' })
  @IsISO8601({}, { message: 'scheduledFor must be an ISO date-time.' })
  scheduledFor!: string;

  @ApiProperty({ example: 'Routine discipline and cleanliness inspection' })
  @IsString() @MaxLength(160)
  purpose!: string;
}

export class CompleteRaidDto {
  @ApiProperty({ enum: ['COMPLETED', 'CANCELLED'] })
  @IsIn(['COMPLETED', 'CANCELLED'])
  status!: 'COMPLETED' | 'CANCELLED';

  @ApiPropertyOptional({ description: 'What the inspection found' })
  @IsOptional() @IsString() @MaxLength(2000)
  findings?: string;
}
