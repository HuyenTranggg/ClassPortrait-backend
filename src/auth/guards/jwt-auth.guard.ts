import { Injectable, UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  /**
   * Trích xuất bearer token từ Authorization header.
   * @param authHeader Giá trị header Authorization.
   * @returns Token nếu hợp lệ, ngược lại trả về null.
   */
  private extractBearerToken(authHeader?: string): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.slice(7);
  }

  /**
   * Xác thực JWT và trả payload.
   * @param token JWT cần xác thực.
   * @returns Payload đã giải mã từ token hợp lệ.
   */
  private verifyTokenOrThrow(token: string): any {
    const secret = this.configService.get<string>('JWT_SECRET')?.trim();
    if (!secret) {
      throw new UnauthorizedException('JWT secret chưa được cấu hình trên server.');
    }

    try {
      return this.jwtService.verify(token, { secret });
    } catch {
      throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn.');
    }
  }

  /**
   * Kiểm tra quyền truy cập cho request hiện tại.
   * @param context ExecutionContext của request.
   * @returns true nếu request được phép đi tiếp.
   */
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];
    const token = this.extractBearerToken(authHeader);

    // Bỏ qua bắt buộc auth cho route @Public(),
    // nhưng nếu có token thì vẫn verify và gắn user vào request.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      if (token) {
        request.user = this.verifyTokenOrThrow(token);
      }
      return true;
    }

    if (!token) {
      throw new UnauthorizedException('Thiếu token xác thực. Vui lòng đăng nhập.');
    }

    request.user = this.verifyTokenOrThrow(token);
    return true;
  }
}
