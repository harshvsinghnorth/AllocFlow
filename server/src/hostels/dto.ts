import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateRoomDto {
  @ApiPropertyOptional({ description: 'Withdraw the room from allocation' })
  @IsOptional()
  @IsBoolean()
  isBlocked?: boolean;

  @ApiPropertyOptional({ description: 'Free-text maintenance note' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
