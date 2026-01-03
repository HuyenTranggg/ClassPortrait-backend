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
}
