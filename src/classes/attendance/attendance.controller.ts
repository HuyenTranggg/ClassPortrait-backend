import {
  Controller,
  Get,
  Patch,
  Put,
  Post,
  Param,
  Body,
  Query,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ClassesService } from '../classes.service';
import { SetAttendanceStatusDto } from './dto/set-attendance-status.dto';
import { ResetAttendanceDto } from './dto/reset-attendance.dto';
import { extractUserId, parseBoolean } from '../../common/utils/request-parser.util';

@ApiTags('class-attendance')
@ApiBearerAuth('bearer')
@Controller('classes')
export class ClassAttendanceController {
  constructor(private readonly classesService: ClassesService) {}

  @Get(':id/attendance')
  @ApiOperation({ summary: 'Lấy trạng thái điểm danh của cả lớp' })
  @ApiParam({ name: 'id', description: 'ID của lớp' })
  @ApiQuery({ name: 'includeStats', required: false, description: 'Có trả thống kê hay không', example: true })
  /**
   * Lấy dữ liệu điểm danh toàn lớp cho người dùng sở hữu lớp.
   * @param id ID lớp học.
   * @param req Request hiện tại chứa thông tin người dùng đã xác thực.
   * @param includeStats Query xác định có trả thống kê hay không.
   * @returns Danh sách điểm danh sinh viên của lớp và thống kê (nếu bật).
   */
  async getClassAttendance(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: any,
    @Query('includeStats') includeStats?: string,
  ) {
    const userId = extractUserId(req);
    return this.classesService.getClassAttendance(id, userId, parseBoolean(includeStats, true));
  }

  @Patch(':id/attendance/students/:studentId/toggle')
  @ApiOperation({ summary: 'Toggle điểm danh cho một sinh viên trong lớp' })
  @ApiParam({ name: 'id', description: 'ID của lớp' })
  @ApiParam({ name: 'studentId', description: 'ID của sinh viên' })
  /**
   * Đảo trạng thái điểm danh của một sinh viên trong lớp.
   * @param id ID lớp học.
   * @param studentId ID sinh viên.
   * @param req Request hiện tại chứa thông tin người dùng đã xác thực.
   * @returns Trạng thái điểm danh mới của sinh viên sau khi toggle.
   */
  async toggleAttendance(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Req() req: any,
  ) {
    const userId = extractUserId(req);
    return this.classesService.toggleAttendance(id, studentId, userId);
  }

  @Put(':id/attendance/students/:studentId')
  @ApiOperation({ summary: 'Đặt trạng thái điểm danh tường minh cho sinh viên' })
  @ApiParam({ name: 'id', description: 'ID của lớp' })
  @ApiParam({ name: 'studentId', description: 'ID của sinh viên' })
  /**
   * Cập nhật trạng thái điểm danh tường minh cho một sinh viên.
   * @param id ID lớp học.
   * @param studentId ID sinh viên.
   * @param req Request hiện tại chứa thông tin người dùng đã xác thực.
   * @param body Payload chứa trạng thái điểm danh cần đặt.
   * @returns Trạng thái điểm danh của sinh viên sau khi cập nhật.
   */
  async setAttendance(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Req() req: any,
    @Body() body: SetAttendanceStatusDto,
  ) {
    const userId = extractUserId(req);
    return this.classesService.setAttendance(id, studentId, userId, body.status);
  }

  @Post(':id/attendance/reset')
  @ApiOperation({ summary: 'Reset trạng thái điểm danh toàn bộ lớp' })
  @ApiParam({ name: 'id', description: 'ID của lớp' })
  /**
   * Reset điểm danh của toàn bộ sinh viên trong lớp về trạng thái chỉ định.
   * @param id ID lớp học.
   * @param req Request hiện tại chứa thông tin người dùng đã xác thực.
   * @param body Payload reset điểm danh toàn lớp.
   * @returns Kết quả reset gồm số lượng sinh viên đã cập nhật.
   */
  async resetAttendance(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any, @Body() body: ResetAttendanceDto) {
    const userId = extractUserId(req);
    return this.classesService.resetAttendance(id, userId, body.status);
  }
}
