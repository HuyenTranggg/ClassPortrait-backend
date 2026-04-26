import {
  Controller,
  Get,
  Delete,
  Param,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { ClassesService } from './classes.service';
import type { Class, Student, ClassWithStudents } from '../common/types';
import { extractUserId } from '../common/utils/request-parser.util';

@ApiTags('classes')
@ApiBearerAuth('bearer')
@Controller('classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách tất cả các lớp' })
  @ApiResponse({ status: 200, description: 'Trả về danh sách các lớp' })
  async findAll(@Req() req: any): Promise<Array<Class & { studentCount: number }>> {
    const userId = extractUserId(req);
    return this.classesService.findAllWithStudentCount(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin chi tiết một lớp (bao gồm danh sách sinh viên)' })
  @ApiParam({ name: 'id', description: 'ID của lớp' })
  @ApiResponse({ status: 200, description: 'Trả về thông tin lớp kèm danh sách sinh viên' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy lớp' })
  async findOne(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any): Promise<ClassWithStudents> {
    const userId = extractUserId(req);
    return this.classesService.findOneWithStudents(id, userId);
  }

  @Get(':id/students')
  @ApiOperation({ summary: 'Lấy danh sách sinh viên của một lớp' })
  @ApiParam({ name: 'id', description: 'ID của lớp' })
  @ApiResponse({ status: 200, description: 'Trả về danh sách sinh viên' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy lớp' })
  async getStudents(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any): Promise<Student[]> {
    const userId = extractUserId(req);
    return this.classesService.getStudents(id, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa một lớp' })
  @ApiParam({ name: 'id', description: 'ID của lớp cần xóa' })
  @ApiResponse({ status: 200, description: 'Xóa thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy lớp' })
  remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any) {
    const userId = extractUserId(req);
    return this.classesService.remove(id, userId);
  }
}
