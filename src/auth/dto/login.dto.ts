import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'giang.vien@hust.edu.vn', description: 'Email HUST (@hust.edu.vn)' })
  email: string;

  @ApiProperty({ example: '********', description: 'Mật khẩu HUST' })
  password: string;
}
