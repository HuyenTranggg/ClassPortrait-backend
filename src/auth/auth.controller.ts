import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@ApiTags('Xác thực') // swagger tag
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập hệ thống (chỉ giảng viên HUST)' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Đăng nhập thành công, trả về JWT token', schema: { example: { access_token: 'eyJhbGciOiJIUzI1NiIsInR5...' } } })
  @ApiResponse({ status: 401, description: 'Sai tài khoản / mật khẩu hoặc email không đúng định dạng' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
