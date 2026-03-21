import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO cho việc import lớp học từ URL Google Sheet
 */
export class ImportGoogleSheetDto {
  @ApiProperty({
    example:
      'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890/edit?gid=0#gid=0',
    description: 'URL Google Sheet (sheet cần ở trạng thái có thể truy cập bằng link)',
  })
  googleSheetUrl: string;

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
