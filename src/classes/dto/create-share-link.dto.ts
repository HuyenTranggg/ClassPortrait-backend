import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

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
}
