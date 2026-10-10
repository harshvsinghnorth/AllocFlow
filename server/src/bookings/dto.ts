import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export class CreateBookingDto {
  @ApiProperty({ description: 'Room to allocate a bed in' })
  @IsInt()
  @Min(1)
  roomId!: number;

  @ApiPropertyOptional({
    description: 'Only for staff allocating on a student’s behalf.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  studentId?: number;
}
