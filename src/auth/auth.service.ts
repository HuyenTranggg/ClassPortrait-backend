import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { LoginDto } from './dto/login.dto';
import { UserEntity } from '../entities/user.entity';
import { Repository } from 'typeorm';

const HUST_AUTH_URL = 'https://api.toolhub.app/hust/KiemTraMatKhau';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  async login(dto: LoginDto): Promise<{ access_token: string }> {
    const { email, password } = dto;
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Tài khoản nội bộ (lưu trong .env, dùng để test khi không có tài khoản giảng viên)
    const matchedInternalAccount = this.findMatchedInternalAccount(normalizedEmail, password);
    if (matchedInternalAccount) {
      const userId = await this.upsertUser(normalizedEmail);
      const access_token = this.jwtService.sign({
        sub: userId,
        userId,
        email: normalizedEmail,
        role: matchedInternalAccount.role,
      });
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

    // 4. Lưu / cập nhật user và tạo JWT token
    const userId = await this.upsertUser(normalizedEmail);
    const access_token = this.jwtService.sign({ sub: userId, userId, email: normalizedEmail, role: 'lecturer' });
    return { access_token };
  }

  private findMatchedInternalAccount(normalizedEmail: string, password: string): {
    email: string;
    password: string;
    role: 'admin';
  } | null {
    const accounts = this.getInternalAccountsFromEnv();
    return accounts.find((account) => account.email === normalizedEmail && account.password === password) ?? null;
  }

  private getInternalAccountsFromEnv(): Array<{ email: string; password: string; role: 'admin' }> {
    const pairs = [
      {
        email: this.configService.get<string>('ADMIN_EMAIL') ?? '',
        password: this.configService.get<string>('ADMIN_PASSWORD') ?? '',
      },
      {
        email: this.configService.get<string>('ADMIN_EMAIL_2') ?? '',
        password: this.configService.get<string>('ADMIN_PASSWORD_2') ?? '',
      },
    ];

    const parsedFromList = this.parseAdminAccountsList(this.configService.get<string>('ADMIN_ACCOUNTS'));

    return [...pairs, ...parsedFromList]
      .map((item) => ({
        email: item.email.trim().toLowerCase(),
        password: item.password,
        role: 'admin' as const,
      }))
      .filter((item) => item.email.length > 0 && item.password.length > 0);
  }

  private parseAdminAccountsList(value?: string): Array<{ email: string; password: string }> {
    if (!value) return [];

    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .map((item) => {
        const [emailPart, ...passwordParts] = item.split(':');
        return {
          email: (emailPart ?? '').trim(),
          password: passwordParts.join(':').trim(),
        };
      })
      .filter((item) => item.email.length > 0 && item.password.length > 0);
  }

  private async upsertUser(email: string): Promise<string> {
    const normalizedEmail = email.trim().toLowerCase();
    let user = await this.usersRepository.findOne({ where: { email: normalizedEmail } });

    if (!user) {
      user = this.usersRepository.create({
        email: normalizedEmail,
        lastLoginAt: new Date(),
      });
    } else {
      user.lastLoginAt = new Date();
    }

    const saved = await this.usersRepository.save(user);
    return saved.id;
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
