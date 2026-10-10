import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ANNOUNCEMENT_CATEGORIES, type AnnouncementCategory } from '../database/schema';

export class CreateAnnouncementDto {
  @ApiProperty({ example: 'Water supply maintenance on Sunday' })
  @IsString()
  @MinLength(4)
  @MaxLength(160)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(4)
  @MaxLength(4000)
  body!: string;

  @ApiPropertyOptional({ enum: ANNOUNCEMENT_CATEGORIES })
  @IsOptional()
  @IsIn(ANNOUNCEMENT_CATEGORIES as unknown as string[])
  category?: AnnouncementCategory;

  @ApiPropertyOptional({ description: 'Omit to broadcast campus-wide' })
  @IsOptional()
  @IsInt()
  hostelId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}
