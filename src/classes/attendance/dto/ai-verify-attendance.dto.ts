import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNumber, ArrayMinSize, ArrayMaxSize } from 'class-validator';

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
}
