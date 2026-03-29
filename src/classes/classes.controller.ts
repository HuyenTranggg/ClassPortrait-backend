// backend/src/classes/classes.controller.ts

import {
  Controller,
  Body,
  Get,
  Post,
  Patch,
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

@ApiTags('classes')
@ApiBearerAuth('bearer')
@Controller('classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

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
  async createShareLink(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CreateShareLinkDto,
    @Req() req: any,
  ) {
    const userId = this.extractUserId(req);
    return this.classesService.createShareLink(id, userId, body.expiresInDays);
  }

  @Get(':id/share-link')
  @ApiOperation({ summary: 'Lấy link chia sẻ hiện tại của lớp' })
  @ApiParam({ name: 'id', description: 'ID của lớp' })
  @ApiResponse({ status: 200, description: 'Trả về link chia sẻ hiện tại (hoặc null nếu chưa có)' })
  async getShareLink(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any) {
    const userId = this.extractUserId(req);
    return this.classesService.getShareLink(id, userId);
  }

  @Patch(':id/share-link')
  @ApiOperation({ summary: 'Cập nhật trạng thái/hạn dùng link chia sẻ' })
  @ApiParam({ name: 'id', description: 'ID của lớp' })
  @ApiResponse({ status: 200, description: 'Cập nhật link chia sẻ thành công' })
  async updateShareLink(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateShareLinkDto,
    @Req() req: any,
  ) {
    const userId = this.extractUserId(req);
    return this.classesService.updateShareLink(id, userId, {
      isActive: body.isActive,
      expiresAt: body.expiresAt,
    });
  }

  @Delete(':id/share-link')
  @ApiOperation({ summary: 'Xóa hẳn link chia sẻ' })
  @ApiParam({ name: 'id', description: 'ID của lớp' })
  @ApiResponse({ status: 200, description: 'Xóa link thành công' })
  async revokeShareLink(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any) {
    const userId = this.extractUserId(req);
    return this.classesService.revokeShareLink(id, userId);
  }

  @Public()
  @Get('shared/:token')
  @ApiOperation({ summary: 'Xem sổ ảnh qua link chia sẻ công khai' })
  @ApiParam({ name: 'token', description: 'Token link chia sẻ' })
  @ApiResponse({ status: 200, description: 'Trả về dữ liệu lớp và danh sách sinh viên' })
  async getSharedClass(@Param('token') token: string) {
    return this.classesService.getSharedClassByToken(token);
  }
}
