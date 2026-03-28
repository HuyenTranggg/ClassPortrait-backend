import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'giang.vien@hust.edu.vn', description: 'Email HUST (@hust.edu.vn)' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: '********', description: 'Mật khẩu HUST' })
  @IsString()
  @MinLength(4)
  @MaxLength(255)
  password: string;
}
