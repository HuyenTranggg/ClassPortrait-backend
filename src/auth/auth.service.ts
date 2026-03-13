import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { LoginDto } from './dto/login.dto';

const HUST_AUTH_URL = 'https://api.toolhub.app/hust/KiemTraMatKhau';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<{ access_token: string }> {
    const { email, password } = dto;
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Tài khoản admin nội bộ (lưu trong .env, dùng để test khi không có tài khoản giảng viên)
    const adminEmail = (this.configService.get<string>('ADMIN_EMAIL') ?? '').trim().toLowerCase();
    const adminPassword = this.configService.get<string>('ADMIN_PASSWORD') ?? '';
    if (adminEmail && normalizedEmail === adminEmail && password === adminPassword) {
      const access_token = this.jwtService.sign({ sub: normalizedEmail, email: normalizedEmail, role: 'admin' });
      return { access_token };
    }

    // 2. Tài khoản giảng viên HUST: email phải kết thúc @hust.edu.vn
    if (!/@hust\.edu\.vn$/i.test(normalizedEmail)) {
      throw new UnauthorizedException('Email phải kết thúc bằng @hust.edu.vn');
    }

    // 3. Xác thực mật khẩu với API HUST
    const isValid = await this.verifyHustCredentials(normalizedEmail, password);
    if (!isValid) {
      throw new UnauthorizedException('Sai tài khoản hoặc mật khẩu HUST');
    }

    // 4. Tạo JWT token
    const access_token = this.jwtService.sign({ sub: normalizedEmail, email: normalizedEmail, role: 'lecturer' });
    return { access_token };
  }

  private async verifyHustCredentials(email: string, password: string): Promise<boolean> {
    try {
      const res = await axios.get(HUST_AUTH_URL, {
        params: { taikhoan: email, matkhau: password },
        timeout: 10000,
      });

      const data = res.data;
      if (typeof data === 'string') {
        return ['true', 'ok', '1', 'success', 'valid', 'yes'].includes(data.trim().toLowerCase());
      }
      if (typeof data === 'object' && data !== null) {
        const val = data.valid ?? data.ok ?? data.success ?? data.result ?? data.isValid;
        if (val !== undefined) return Boolean(val);
        // Kiểm tra tất cả giá trị
        return Object.values(data)
          .map((v) => String(v).toLowerCase())
          .some((v) => ['true', 'ok', '1', 'success'].includes(v));
      }
      return res.status >= 200 && res.status < 300;
    } catch {
      throw new UnauthorizedException('Không thể kết nối đến hệ thống xác thực HUST');
    }
  }
}
