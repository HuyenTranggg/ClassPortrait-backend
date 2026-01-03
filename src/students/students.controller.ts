import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { StudentsService } from './students.service';

@ApiTags('students')
@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get(':mssv/photo')
  @ApiOperation({ summary: 'Lấy ảnh của sinh viên' })
  @ApiResponse({ status: 200, description: 'Trả về ảnh sinh viên' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy ảnh' })
  async getPhoto(@Param('mssv') mssv: string, @Res() res: Response) {
    const photoStream = await this.studentsService.getStudentPhoto(mssv);
    res.setHeader('Content-Type', 'image/jpeg');
    photoStream.pipe(res);
  }
}
