import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import type { Request } from 'express';
import { ClassesService } from '../classes.service';
import { ImportClassDto } from './dto/import-class.dto';
import { ImportGoogleSheetDto } from './dto/import-google-sheet.dto';
import { extractUserId, parsePositiveInt, parseSourceType } from '../../common/utils/request-parser.util';

type AuthenticatedRequest = Request & {
  user?: {
    userId?: string;
    sub?: string;
  };
};

@ApiTags('class-import')
@ApiBearerAuth('bearer')
@Controller('classes')
export class ClassImportController {
  constructor(private readonly classesService: ClassesService) {}

  @Get('import-history')
  @ApiOperation({ summary: 'Lấy lịch sử import của người dùng hiện tại' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'sourceType', required: false, enum: ['excel', 'google_sheet', 'onedrive'] })
  @ApiResponse({ status: 200, description: 'Trả về danh sách lịch sử import có phân trang' })
  async getImportHistory(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sourceType') sourceType?: string,
  ) {
    const userId = extractUserId(req);
    return this.classesService.getImportHistoryByUser(userId, {
      page: parsePositiveInt(page, 1),
      limit: parsePositiveInt(limit, 20),
      sourceType: parseSourceType(sourceType),
    });
  }

  @Delete('import-history/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xóa 1 bản ghi import history (cascade xóa các lớp thi liên kết)' })
  @ApiResponse({ status: 200, description: 'Xóa thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy bản ghi' })
  async deleteImportHistory(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = extractUserId(req);
    await this.classesService.deleteImportHistory(id, userId);
    return { success: true, message: 'Đã xóa lịch sử import và các lớp thi liên kết.' };
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
  async importClass(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: ImportClassDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = extractUserId(req);
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
  async importFromGoogleSheet(@Body() body: ImportGoogleSheetDto, @Req() req: AuthenticatedRequest) {
    const userId = extractUserId(req);
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

  @Post('import/preview')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Preview import từ file Excel - không lưu DB' })
  @ApiBody({ description: 'Upload file để preview', type: ImportClassDto })
  @ApiResponse({ status: 200, description: 'Preview thành công, trả về danh sách lớp thi sẽ được tạo' })
  async previewImport(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: ImportClassDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = extractUserId(req);
    const mappingMode = body.mappingMode === 'manual' ? 'manual' : 'auto';
    const startRowValue =
      body.startRow !== undefined && body.startRow !== null && String(body.startRow).trim() !== ''
        ? Number(body.startRow)
        : undefined;

    return await this.classesService.previewImport(file, userId, {
      mssvColumn: body.mssvColumn,
      nameColumn: body.nameColumn,
      startRow: startRowValue,
      mappingMode,
    });
  }

  @Post('import-from-sheet/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview import từ Google Sheet - không lưu DB' })
  @ApiBody({ description: 'URL Google Sheet để preview', type: ImportGoogleSheetDto })
  @ApiResponse({ status: 200, description: 'Preview thành công, trả về danh sách lớp thi sẽ được tạo' })
  async previewImportFromGoogleSheet(@Body() body: ImportGoogleSheetDto, @Req() req: AuthenticatedRequest) {
    const userId = extractUserId(req);
    const mappingMode = body.mappingMode === 'manual' ? 'manual' : 'auto';
    const startRowValue =
      body.startRow !== undefined && body.startRow !== null && String(body.startRow).trim() !== ''
        ? Number(body.startRow)
        : undefined;

    return await this.classesService.previewImportFromGoogleSheet(body.googleSheetUrl, userId, {
      mssvColumn: body.mssvColumn,
      nameColumn: body.nameColumn,
      startRow: startRowValue,
      mappingMode,
    });
  }
}

