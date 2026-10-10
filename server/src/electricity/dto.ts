import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

export class CreateBillDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  roomId!: number;

  @ApiProperty({ example: '2026-09', description: 'Billing period as YYYY-MM' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'period must be in YYYY-MM format.' })
  period!: string;

  @ApiProperty({ example: 128.5 })
  @IsNumber()
  @Min(0)
  unitsConsumed!: number;

  @ApiProperty({ example: 8.5 })
  @IsNumber()
  @Min(0)
  ratePerUnit!: number;

  @ApiProperty({ example: '2026-10-10' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dueDate must be in YYYY-MM-DD format.' })
  dueDate!: string;
}

export class SetPaidDto {
  @ApiProperty()
  @IsBoolean()
  isPaid!: boolean;
}

export class ListBillsQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() hostelId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() period?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() unpaidOnly?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() limit?: string;
}
