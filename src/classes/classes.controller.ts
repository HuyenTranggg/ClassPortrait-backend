// backend/src/classes/classes.controller.ts

import {
  Controller,
  Body,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  Req,
  UnauthorizedException,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiParam,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ClassesService } from './classes.service';
import type { Class, Student, ClassWithStudents } from '../common/types';
import { ImportClassDto } from './dto/import-class.dto';
import { ImportGoogleSheetDto } from './dto/import-google-sheet.dto';
import { SourceType } from '../entities/import-history.entity';
import { CreateShareLinkDto } from './dto/create-share-link.dto';
import { UpdateShareLinkDto } from './dto/update-share-link.dto';
import { Public } from '../auth/decorators/public.decorator';
import { SetAttendanceStatusDto } from './dto/set-attendance-status.dto';
import { ResetAttendanceDto } from './dto/reset-attendance.dto';
import {
  DashboardAttendanceStatusFilter,
  DashboardShareLinkStatusFilter,
  DashboardSortBy,
  DashboardSortOrder,
} from './class-dashboard.service';

@ApiTags('classes')
@ApiBearerAuth('bearer')
@Controller('classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  /**
   * Trích xuất userId từ JWT payload đã được guard gắn vào request.
   * @param req Request hiện tại chứa req.user.
   * @returns userId dạng UUID hợp lệ.
   */
  private extractUserId(req: any): string {
    const candidate = req.user?.userId ?? req.user?.sub;
    const userId = typeof candidate === 'string' ? candidate.trim() : '';
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(userId)) {
      throw new UnauthorizedException('Token không chứa userId hợp lệ. Vui lòng đăng nhập lại.');
    }

    return userId;
  }

  private parsePositiveInt(input: string | undefined, fallback: number): number {
    if (input === undefined || input === null || input === '') {
      return fallback;
    }
    const value = Number(input);
    if (!Number.isInteger(value) || value <= 0) {
      throw new BadRequestException('Giá trị page/limit phải là số nguyên dương');
    }
    return value;
  }

  private parseSourceType(input?: string): SourceType | undefined {
    if (!input) return undefined;
    const normalized = input.trim().toLowerCase();
    if (normalized === SourceType.EXCEL) return SourceType.EXCEL;
    if (normalized === SourceType.GOOGLE_SHEET) return SourceType.GOOGLE_SHEET;
    if (normalized === SourceType.ONEDRIVE) return SourceType.ONEDRIVE;
    throw new BadRequestException('sourceType không hợp lệ. Giá trị hợp lệ: excel, google_sheet, onedrive');
  }

  /**
   * Chuyển đổi query string sang boolean theo quy ước true/false.
   * @param input Giá trị query nhận từ request.
   * @param fallback Giá trị mặc định khi input rỗng.
   * @returns Giá trị boolean sau khi parse.
   */
  private parseBoolean(input: string | undefined, fallback: boolean): boolean {
    if (input === undefined || input === null || input.trim() === '') {
      return fallback;
    }
    const normalized = input.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
    throw new BadRequestException('includeStats phải là true/false');
  }

  /**
   * Parse giá trị sortBy cho dashboard.
   * @param input Giá trị query sortBy.
   * @returns Trường sort hợp lệ.
   */
  private parseDashboardSortBy(input?: string): DashboardSortBy {
    const fallback: DashboardSortBy = 'classCode';
    if (!input || input.trim() === '') return fallback;

    const normalized = input.trim();
    const allowed: DashboardSortBy[] = [
      'className',
      'classCode',
      'studentCount',
      'validPhotoRate',
      'presentRate',
      'absentCount',
      'shareLinkStatus',
      'remainingDays',
    ];

    if (!allowed.includes(normalized as DashboardSortBy)) {
      throw new BadRequestException(`sortBy không hợp lệ. Giá trị hợp lệ: ${allowed.join(', ')}`);
    }

    return normalized as DashboardSortBy;
  }

  /**
   * Parse giá trị sortOrder cho dashboard.
   * @param input Giá trị query sortOrder.
   * @returns Hướng sort hợp lệ.
   */
  private parseDashboardSortOrder(input?: string): DashboardSortOrder {
    const fallback: DashboardSortOrder = 'asc';
    if (!input || input.trim() === '') return fallback;

    const normalized = input.trim().toLowerCase();
    if (normalized !== 'asc' && normalized !== 'desc') {
      throw new BadRequestException('sortOrder không hợp lệ. Giá trị hợp lệ: asc, desc');
    }

    return normalized as DashboardSortOrder;
  }

  /**
   * Parse filter trạng thái điểm danh cho dashboard.
   * @param input Giá trị query attendanceStatus.
   * @returns Trạng thái hợp lệ hoặc undefined nếu không lọc.
   */
  private parseDashboardAttendanceStatus(input?: string): DashboardAttendanceStatusFilter | undefined {
    if (!input || input.trim() === '') return undefined;
    const normalized = input.trim().toLowerCase();
    if (normalized !== 'available' && normalized !== 'no_data') {
      throw new BadRequestException('attendanceStatus không hợp lệ. Giá trị hợp lệ: available, no_data');
    }
    return normalized as DashboardAttendanceStatusFilter;
  }

  /**
   * Parse filter trạng thái link chia sẻ cho dashboard.
   * @param input Giá trị query shareLinkStatus.
   * @returns Trạng thái hợp lệ hoặc undefined nếu không lọc.
   */
  private parseDashboardShareLinkStatus(input?: string): DashboardShareLinkStatusFilter | undefined {
    if (!input || input.trim() === '') return undefined;
    const normalized = input.trim().toLowerCase();
    if (!['no_link', 'active', 'inactive', 'expired'].includes(normalized)) {
      throw new BadRequestException('shareLinkStatus không hợp lệ. Giá trị hợp lệ: no_link, active, inactive, expired');
    }
    return normalized as DashboardShareLinkStatusFilter;
  }

  /**
   * Parse chuỗi tìm kiếm cho dashboard.
   * @param input Giá trị query search.
   * @returns Chuỗi tìm kiếm đã trim hoặc undefined.
   */
  private parseDashboardSearch(input?: string): string | undefined {
    if (!input) return undefined;
    const normalized = input.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách tất cả các lớp' })
  @ApiResponse({ status: 200, description: 'Trả về danh sách các lớp' })
  async findAll(@Req() req: any): Promise<Array<Class & { studentCount: number }>> {
    const userId = this.extractUserId(req);
    return this.classesService.findAllWithStudentCount(userId);
  }

  @Get('import-history')
  @ApiOperation({ summary: 'Lấy lịch sử import của người dùng hiện tại' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'sourceType', required: false, enum: ['excel', 'google_sheet', 'onedrive'] })
  @ApiResponse({ status: 200, description: 'Trả về danh sách lịch sử import có phân trang' })
  async getImportHistory(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sourceType') sourceType?: string,
  ) {
    const userId = this.extractUserId(req);
    return this.classesService.getImportHistoryByUser(userId, {
      page: this.parsePositiveInt(page, 1),
      limit: this.parsePositiveInt(limit, 20),
      sourceType: this.parseSourceType(sourceType),
    });
  }

  @Post('import')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Import lớp học mới từ file Excel, CSV hoặc JSON' })
  @ApiBody({
    description: 'Upload file chứa thông tin lớp và danh sách sinh viên',
    type: ImportClassDto,
  })
  @ApiResponse({ status: 201, description: 'Import thành công' })
  @ApiResponse({ status: 400, description: 'File không hợp lệ hoặc thiếu cột MSSV' })
  async importClass(@UploadedFile() file: Express.Multer.File, @Body() body: ImportClassDto, @Req() req: any) {
    const userId = this.extractUserId(req);
    const mappingMode = body.mappingMode === 'manual' ? 'manual' : 'auto';
    const startRowValue =
      body.startRow !== undefined && body.startRow !== null && String(body.startRow).trim() !== ''
        ? Number(body.startRow)
        : undefined;

    return await this.classesService.importClass(file, userId, {
      mssvColumn: body.mssvColumn,
      nameColumn: body.nameColumn,
      startRow: startRowValue,
      mappingMode,
      duplicateAction: body.duplicateAction,
      confirmUpdate: body.confirmUpdate,
      targetClassId: body.targetClassId,
    });
  }

  @Post('import-from-sheet')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Import lớp học mới từ URL Google Sheet' })
  @ApiBody({
    description: 'Dán URL Google Sheet chứa thông tin lớp và danh sách sinh viên',
    type: ImportGoogleSheetDto,
  })
  @ApiResponse({ status: 201, description: 'Import thành công' })
  @ApiResponse({ status: 400, description: 'URL Google Sheet không hợp lệ hoặc thiếu cột MSSV' })
  async importFromGoogleSheet(@Body() body: ImportGoogleSheetDto, @Req() req: any) {
    const userId = this.extractUserId(req);
    const mappingMode = body.mappingMode === 'manual' ? 'manual' : 'auto';
    const startRowValue =
      body.startRow !== undefined && body.startRow !== null && String(body.startRow).trim() !== ''
        ? Number(body.startRow)
        : undefined;

    return await this.classesService.importFromGoogleSheet(body.googleSheetUrl, userId, {
      mssvColumn: body.mssvColumn,
      nameColumn: body.nameColumn,
      startRow: startRowValue,
      mappingMode,
      duplicateAction: body.duplicateAction,
      confirmUpdate: body.confirmUpdate,
      targetClassId: body.targetClassId,
    });
  }

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
    const userId = this.extractUserId(req);
    return this.classesService.getTeacherDashboardOverview(userId, {
      expiringSoonDays: this.parsePositiveInt(expiringDays, 3),
      page: this.parsePositiveInt(page, 1),
      limit: this.parsePositiveInt(limit, 20),
      search: this.parseDashboardSearch(search),
      attendanceStatus: this.parseDashboardAttendanceStatus(attendanceStatus),
      shareLinkStatus: this.parseDashboardShareLinkStatus(shareLinkStatus),
      sortBy: this.parseDashboardSortBy(sortBy),
      sortOrder: this.parseDashboardSortOrder(sortOrder),
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin chi tiết một lớp (bao gồm danh sách sinh viên)' })
  @ApiParam({ name: 'id', description: 'ID của lớp' })
  @ApiResponse({ status: 200, description: 'Trả về thông tin lớp kèm danh sách sinh viên' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy lớp' })
  async findOne(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any): Promise<ClassWithStudents> {
    const userId = this.extractUserId(req);
    return this.classesService.findOneWithStudents(id, userId);
  }

  @Get(':id/students')
  @ApiOperation({ summary: 'Lấy danh sách sinh viên của một lớp' })
  @ApiParam({ name: 'id', description: 'ID của lớp' })
  @ApiResponse({ status: 200, description: 'Trả về danh sách sinh viên' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy lớp' })
  async getStudents(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any): Promise<Student[]> {
    const userId = this.extractUserId(req);
    return this.classesService.getStudents(id, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa một lớp' })
  @ApiParam({ name: 'id', description: 'ID của lớp cần xóa' })
  @ApiResponse({ status: 200, description: 'Xóa thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy lớp' })
  remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any) {
    const userId = this.extractUserId(req);
    return this.classesService.remove(id, userId);
  }

  @Post(':id/share-link')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Tạo link chia sẻ sổ ảnh cho lớp' })
  @ApiParam({ name: 'id', description: 'ID của lớp' })
  @ApiResponse({ status: 201, description: 'Tạo link chia sẻ thành công' })
  @ApiResponse({ status: 409, description: 'Lớp đã có link chia sẻ, cần dùng API cập nhật' })
  /**
   * Tạo link chia sẻ cho một lớp thuộc quyền sở hữu của người dùng hiện tại.
   * @param id ID lớp học.
   * @param body Dữ liệu tạo link (số ngày hết hạn, chế độ truy cập).
   * @param req Request chứa thông tin người dùng đã xác thực.
   * @returns Thông tin link chia sẻ vừa tạo.
   */
  async createShareLink(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CreateShareLinkDto,
    @Req() req: any,
  ) {
    const userId = this.extractUserId(req);
    return this.classesService.createShareLink(id, userId, body.expiresInDays, body.requireLogin);
  }

  @Get(':id/share-link')
  @ApiOperation({ summary: 'Lấy link chia sẻ hiện tại của lớp' })
  @ApiParam({ name: 'id', description: 'ID của lớp' })
  @ApiResponse({ status: 200, description: 'Trả về link chia sẻ hiện tại (hoặc null nếu chưa có)' })
  /**
   * Lấy link chia sẻ hiện có của lớp.
   * @param id ID lớp học.
   * @param req Request chứa thông tin người dùng đã xác thực.
   * @returns Dữ liệu link chia sẻ hoặc null nếu lớp chưa được chia sẻ.
   */
  async getShareLink(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any) {
    const userId = this.extractUserId(req);
    return this.classesService.getShareLink(id, userId);
  }

  @Patch(':id/share-link')
  @ApiOperation({ summary: 'Cập nhật trạng thái/hạn dùng link chia sẻ' })
  @ApiParam({ name: 'id', description: 'ID của lớp' })
  @ApiResponse({ status: 200, description: 'Cập nhật link chia sẻ thành công' })
  /**
   * Cập nhật trạng thái hoạt động, hạn dùng hoặc chế độ truy cập của link chia sẻ.
   * @param id ID lớp học.
   * @param body Dữ liệu cập nhật link (isActive, expiresAt, requireLogin).
   * @param req Request chứa thông tin người dùng đã xác thực.
   * @returns Thông tin link sau khi cập nhật.
   */
  async updateShareLink(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateShareLinkDto,
    @Req() req: any,
  ) {
    const userId = this.extractUserId(req);
    return this.classesService.updateShareLink(id, userId, {
      isActive: body.isActive,
      expiresAt: body.expiresAt,
      requireLogin: body.requireLogin,
    });
  }

  @Delete(':id/share-link')
  @ApiOperation({ summary: 'Xóa hẳn link chia sẻ' })
  @ApiParam({ name: 'id', description: 'ID của lớp' })
  @ApiResponse({ status: 200, description: 'Xóa link thành công' })
  /**
   * Thu hồi hoàn toàn link chia sẻ của lớp.
   * @param id ID lớp học.
   * @param req Request chứa thông tin người dùng đã xác thực.
   * @returns Kết quả thao tác thu hồi link.
   */
  async revokeShareLink(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any) {
    const userId = this.extractUserId(req);
    return this.classesService.revokeShareLink(id, userId);
  }

  @Public()
  @Get('shared/:id')
  @ApiOperation({ summary: 'Xem sổ ảnh qua link chia sẻ công khai' })
  @ApiParam({ name: 'id', description: 'ID của share link' })
  @ApiQuery({ name: 'exp', required: true, description: 'Unix timestamp milliseconds của thời điểm hết hạn' })
  @ApiQuery({ name: 'sig', required: true, description: 'Chữ ký HMAC-SHA256 của id + exp' })
  @ApiResponse({ status: 200, description: 'Trả về dữ liệu lớp và danh sách sinh viên' })
  /**
    * Trả về dữ liệu sổ ảnh cho người dùng truy cập bằng link đã ký.
   * Nếu link có requireLogin=true, cần đăng nhập trước (trả 401 nếu chưa).
   * @param id ID của share link.
   * @param exp Unix timestamp milliseconds biểu diễn thời điểm hết hạn.
   * @param sig Chữ ký HMAC đảm bảo id và exp không bị chỉnh sửa.
   * @param req Request hiện tại (có thể có JWT nếu người dùng đang đăng nhập).
   * @returns Thông tin lớp và danh sách sinh viên kèm URL ảnh đã ký.
   */
  async getSharedClass(
    @Param('id') id: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Req() req: any,
  ) {
    // JwtAuthGuard tự động populate req.user nếu route @Public() có Bearer token hợp lệ.
    // Không có token → req.user = undefined → viewerUserId = undefined.
    const viewerUserId: string | undefined = req.user?.userId ?? req.user?.sub ?? undefined;
    return this.classesService.getSharedClassBySignedLink(id, Number(exp), sig, viewerUserId);
  }

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
    const userId = this.extractUserId(req);
    return this.classesService.getClassAttendance(id, userId, this.parseBoolean(includeStats, true));
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
    const userId = this.extractUserId(req);
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
    const userId = this.extractUserId(req);
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
    const userId = this.extractUserId(req);
    return this.classesService.resetAttendance(id, userId, body.status);
  }
}
