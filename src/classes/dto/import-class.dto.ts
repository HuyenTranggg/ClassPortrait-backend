// backend/src/classes/dto/import-class.dto.ts

import { ApiProperty } from '@nestjs/swagger';

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
  mssvColumn?: string;

  @ApiProperty({
    required: false,
    example: 'Họ và tên',
    description: 'Tên cột Họ và tên khi người dùng chọn mapping thủ công',
  })
  nameColumn?: string;

  @ApiProperty({
    required: false,
    example: 2,
    description: 'Dòng bắt đầu đọc dữ liệu (1-based), mặc định 2',
  })
  startRow?: number;

  @ApiProperty({
    required: false,
    enum: ['auto', 'manual'],
    example: 'manual',
    description: 'Chế độ mapping cột',
  })
  mappingMode?: 'auto' | 'manual';
}
