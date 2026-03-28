// backend/src/classes/dto/import-class.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Min, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * DTO cho việc import lớp học từ file
 */
export class ImportClassDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'File Excel (.xlsx), CSV (.csv) hoặc JSON (.json) chứa danh sách sinh viên và thông tin lớp',
  })
  file: Express.Multer.File;

  @ApiProperty({
    required: false,
    example: 'MSSV',
    description: 'Tên cột MSSV khi người dùng chọn mapping thủ công',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  mssvColumn?: string;

  @ApiProperty({
    required: false,
    example: 'Họ và tên',
    description: 'Tên cột Họ và tên khi người dùng chọn mapping thủ công',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nameColumn?: string;

  @ApiProperty({
    required: false,
    example: 2,
    description: 'Dòng bắt đầu đọc dữ liệu (1-based), mặc định 2',
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null || value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  startRow?: number;

  @ApiProperty({
    required: false,
    enum: ['auto', 'manual'],
    example: 'manual',
    description: 'Chế độ mapping cột',
  })
  @IsOptional()
  @IsIn(['auto', 'manual'])
  mappingMode?: 'auto' | 'manual';

  @ApiProperty({
    required: false,
    enum: ['ask', 'create_new', 'update_existing'],
    example: 'ask',
    description: 'Cách xử lý khi phát hiện lớp đã tồn tại',
  })
  @IsOptional()
  @IsIn(['ask', 'create_new', 'update_existing'])
  duplicateAction?: 'ask' | 'create_new' | 'update_existing';

  @ApiProperty({
    required: false,
    example: false,
    description: 'Xác nhận cập nhật khi duplicateAction = update_existing',
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
  confirmUpdate?: boolean;

  @ApiProperty({
    required: false,
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'ID lớp mục tiêu cần update (tuỳ chọn, dùng để xác nhận đúng lớp)',
  })
  @IsOptional()
  @IsUUID('4')
  targetClassId?: string;
}
