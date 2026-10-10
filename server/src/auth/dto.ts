import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'student@allocflow.edu' })
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email!: string;

  @ApiProperty({ example: 'Password@123' })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters.' })
  password!: string;
}
