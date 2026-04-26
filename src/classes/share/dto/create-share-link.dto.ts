import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

/**
 * DTO dùng cho API tạo link chia sẻ lớp.
 */
export class CreateShareLinkDto {
  @ApiProperty({
    required: false,
    example: 7,
    description: 'Số ngày hiệu lực của link chia sẻ. Nếu bỏ trống thì link không hết hạn.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  expiresInDays?: number;

  @ApiProperty({
    required: false,
    example: false,
    description: 'Yêu cầu người xem phải đăng nhập tài khoản HUST mới xem được sổ ảnh.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === null || value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
    return value;
  })
  @IsBoolean()
  requireLogin?: boolean;
}
