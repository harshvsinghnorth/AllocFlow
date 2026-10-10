import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  REQUEST_PRIORITIES,
  REQUEST_STATUSES,
  REQUEST_TYPES,
  type RequestPriority,
  type RequestStatus,
  type RequestType,
} from '../database/schema';

export class CreateRequestDto {
  @ApiProperty({ enum: REQUEST_TYPES })
  @IsIn(REQUEST_TYPES as unknown as string[])
  type!: RequestType;

  @ApiPropertyOptional({ example: 'Room cleaning' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;

  @ApiPropertyOptional({ description: 'Optional short note from the student' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ enum: REQUEST_PRIORITIES })
  @IsOptional()
  @IsIn(REQUEST_PRIORITIES as unknown as string[])
  priority?: RequestPriority;
}

export class UpdateRequestDto {
  @ApiProperty({ enum: REQUEST_STATUSES })
  @IsIn(REQUEST_STATUSES as unknown as string[])
  status!: RequestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolutionNote?: string;
}

export class ListRequestsQuery {
  @ApiPropertyOptional({ enum: REQUEST_STATUSES })
  @IsOptional()
  @IsIn(REQUEST_STATUSES as unknown as string[])
  status?: RequestStatus;

  @ApiPropertyOptional({ enum: REQUEST_TYPES })
  @IsOptional()
  @IsIn(REQUEST_TYPES as unknown as string[])
  type?: RequestType;

  @ApiPropertyOptional()
  @IsOptional()
  hostelId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  limit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  offset?: string;
}
