import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ClassesService } from '../classes.service';
import { ClassDashboardService } from './dashboard.service';
import { extractUserId } from '../../common/utils/request-parser.util';

@ApiTags('class-dashboard')
@ApiBearerAuth('bearer')
@Controller('classes')
export class ClassDashboardController {
  constructor(
    private readonly classesService: ClassesService,
    private readonly classDashboardService: ClassDashboardService,
  ) {}

  /**
   * Trả về danh sách học kỳ khả dụng của giảng viên (dùng cho dropdown bộ lọc).
   * @param req Request chứa thông tin user đã xác thực.
   * @returns Mảng chuỗi học kỳ.
   */
  @Get('dashboard/semesters')
  @ApiOperation({ summary: 'Lấy danh sách học kỳ của giảng viên (dùng cho bộ lọc)' })
  @ApiResponse({ status: 200, description: 'Trả về mảng học kỳ, sắp xếp giảm dần.' })
  async getAvailableSemesters(@Req() req: any) {
    const userId = extractUserId(req);
    return this.classDashboardService.getAvailableSemesters(userId);
  }

  /**
   * Trả về snapshot Exam Command Center cho giảng viên đang đăng nhập.
   * Hỗ trợ bộ lọc theo học kỳ và khoảng thời gian thi.
   * @param req Request chứa thông tin user đã xác thực.
   * @param semester Học kỳ cần lọc (ví dụ: '2024-2025-2').
   * @param startDate Ngày bắt đầu khoảng lọc (YYYY-MM-DD).
   * @param endDate Ngày kết thúc khoảng lọc (YYYY-MM-DD).
   * @param expiringSoonDays Ngưỡng cảnh báo link chia sẻ sắp hết hạn (ngày).
   * @returns Dữ liệu dashboard tổng hợp theo Exam Command Center.
   */
  @Get('dashboard/overview')
  @ApiOperation({ summary: 'Lấy dữ liệu Exam Command Center cho giảng viên hiện tại' })
  @ApiQuery({ name: 'startDate', required: false, example: '2025-05-13', description: 'Ngày bắt đầu lọc (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, example: '2025-05-13', description: 'Ngày kết thúc lọc (YYYY-MM-DD)' })
  @ApiQuery({ name: 'expiringSoonDays', required: false, example: 3, description: 'Ngưỡng cảnh báo link chia sẻ sắp hết hạn (ngày)' })
  @ApiResponse({ status: 200, description: 'Trả về snapshot dashboard: overview, photoHealth, allExams, logistics, attendance, shareLinks' })
  async getExamCommandCenter(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('expiringSoonDays') expiringSoonDays?: string,
  ) {
    const userId = extractUserId(req);
    const parsedExpiringSoonDays = expiringSoonDays ? parseInt(expiringSoonDays, 10) : undefined;

    return this.classesService.getExamCommandCenter(userId, {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      expiringSoonDays: parsedExpiringSoonDays && parsedExpiringSoonDays > 0 ? parsedExpiringSoonDays : undefined,
    });
  }
}
