import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { StudentsService } from './students.service';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('students')
@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get(':mssv/photo')
  @Public()
  @ApiOperation({ summary: 'Lấy ảnh của sinh viên' })
  @ApiResponse({ status: 200, description: 'Trả về ảnh sinh viên' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy ảnh' })
  async getPhoto(
    @Param('mssv') mssv: string,
    @Query('classId') classId: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const userId = req.user?.userId ?? req.user?.sub;
    const expNumber = Number(exp);
    const { stream, contentType } = await this.studentsService.getStudentPhoto(mssv, classId, userId, expNumber, sig);
    res.setHeader('Content-Type', contentType);
    stream.pipe(res);
  }
}
