import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNumber, ArrayMinSize, ArrayMaxSize, IsIn, IsOptional, Min, Max } from 'class-validator';

/**
 * DTO nhận face descriptor từ Frontend để xác thực danh tính sinh viên phía Backend.
 * Frontend serialize Float32Array thành number[] trước khi gửi.
 */
export class AiVerifyAttendanceDto {
  @ApiProperty({
    description: 'Face descriptor vector 128 chiều (Float32Array serialized thành number[])',
    type: [Number],
    minLength: 128,
    maxLength: 128,
    example: [0.123, -0.456, 0.789], // rút gọn
  })
  @IsArray()
  @IsNumber({}, { each: true })
  @ArrayMinSize(128)
  @ArrayMaxSize(128)
  descriptor: number[];

  @ApiProperty({
    description: 'NgÆ°á»¡ng khoáº£ng cÃ¡ch Euclidean dÃ¹ng Ä‘á»ƒ quyáº¿t Ä‘á»‹nh khá»›p máº·t',
    minimum: 0.3,
    maximum: 0.55,
    default: 0.4375,
    example: 0.4375,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.3)
  @Max(0.55)
  distanceThreshold?: number;

  @ApiProperty({
    description: 'Ngưỡng điểm tương đồng khuôn mặt do giám thị lựa chọn',
    enum: [60, 65, 70, 75, 80, 85, 90, 95],
    default: 85,
    example: 85,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @IsIn([60, 65, 70, 75, 80, 85, 90, 95])
  matchPercentage?: number;
}
