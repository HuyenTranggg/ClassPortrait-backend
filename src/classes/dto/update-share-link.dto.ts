import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsOptional } from 'class-validator';

/**
 * DTO dùng cho API cập nhật trạng thái/hạn dùng link chia sẻ.
 */
export class UpdateShareLinkDto {
  @ApiProperty({
    required: false,
    example: true,
    description: 'Bật/tắt link chia sẻ.',
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
  isActive?: boolean;

  @ApiProperty({
    required: false,
    example: '2026-04-30T23:59:59.000Z',
    description: 'Thời điểm hết hạn mới của link (ISO datetime).',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
