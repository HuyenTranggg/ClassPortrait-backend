import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ClassesService } from '../classes.service';
import {
  extractUserId,
  parsePositiveInt,
  parseDashboardSearch,
  parseDashboardAttendanceStatus,
  parseDashboardShareLinkStatus,
  parseDashboardSortBy,
  parseDashboardSortOrder,
} from '../../common/utils/request-parser.util';

@ApiTags('class-dashboard')
@ApiBearerAuth('bearer')
@Controller('classes')
export class ClassDashboardController {
  constructor(private readonly classesService: ClassesService) {}

  @Get('dashboard/overview')
  @ApiOperation({ summary: 'Lấy dữ liệu dashboard tổng hợp cho giáo viên hiện tại' })
  @ApiQuery({ name: 'expiringDays', required: false, example: 3, description: 'Ngưỡng số ngày cho link sắp hết hạn' })
  @ApiQuery({ name: 'page', required: false, example: 1, description: 'Số trang của bảng lớp' })
  @ApiQuery({ name: 'limit', required: false, example: 20, description: 'Số lớp tối đa trên mỗi trang' })
  @ApiQuery({ name: 'search', required: false, example: 'IT', description: 'Tìm theo classCode hoặc className (contains)' })
  @ApiQuery({ name: 'attendanceStatus', required: false, enum: ['available', 'no_data'] })
  @ApiQuery({ name: 'shareLinkStatus', required: false, enum: ['no_link', 'active', 'inactive', 'expired'] })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: [
      'className',
      'classCode',
      'studentCount',
      'validPhotoRate',
      'presentRate',
      'absentCount',
      'shareLinkStatus',
      'remainingDays',
    ],
  })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: 'Trả về dữ liệu dashboard gồm tổng quan và tiến độ từng lớp' })
  /**
   * Trả dữ liệu dashboard cho giáo viên đã đăng nhập.
   * @param req Request hiện tại chứa thông tin người dùng đã xác thực.
   * @param expiringDays Số ngày để cảnh báo link sắp hết hạn.
   * @returns Dữ liệu tổng quan và bảng tiến độ theo lớp.
   */
  async getTeacherDashboardOverview(
    @Req() req: any,
    @Query('expiringDays') expiringDays?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('attendanceStatus') attendanceStatus?: string,
    @Query('shareLinkStatus') shareLinkStatus?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const userId = extractUserId(req);
    return this.classesService.getTeacherDashboardOverview(userId, {
      expiringSoonDays: parsePositiveInt(expiringDays, 3),
      page: parsePositiveInt(page, 1),
      limit: parsePositiveInt(limit, 20),
      search: parseDashboardSearch(search),
      attendanceStatus: parseDashboardAttendanceStatus(attendanceStatus),
      shareLinkStatus: parseDashboardShareLinkStatus(shareLinkStatus),
      sortBy: parseDashboardSortBy(sortBy),
      sortOrder: parseDashboardSortOrder(sortOrder),
    });
  }
}
