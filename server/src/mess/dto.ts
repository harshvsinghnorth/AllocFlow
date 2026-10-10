import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { MESS_MEALS, type MessMeal } from '../database/schema';

export class UpsertMenuDto {
  @ApiProperty() @IsInt() @Min(1) hostelId!: number;

  @ApiProperty({ description: '0 = Sunday ... 6 = Saturday' })
  @IsInt() @Min(0) @Max(6)
  dayOfWeek!: number;

  @ApiProperty({ enum: MESS_MEALS })
  @IsIn(MESS_MEALS as unknown as string[])
  meal!: MessMeal;

  @ApiProperty({ example: 'Poha, boiled eggs, banana, tea/coffee' })
  @IsString() @MaxLength(600)
  items!: string;

  @ApiPropertyOptional({ example: '07:30 - 09:30' })
  @IsOptional() @IsString() @MaxLength(40)
  servingTime?: string;
}

export class SubmitFeedbackDto {
  @ApiProperty({ enum: MESS_MEALS })
  @IsIn(MESS_MEALS as unknown as string[])
  meal!: MessMeal;

  @ApiProperty({ example: '2026-09-07' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'servedOn must be in YYYY-MM-DD format.' })
  servedOn!: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt() @Min(1) @Max(5)
  rating!: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(600)
  comment?: string;
}
