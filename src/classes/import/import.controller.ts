import {
  Controller,
  Post,
  Get,
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
import { ClassesService } from '../classes.service';
import { ImportClassDto } from './dto/import-class.dto';
import { ImportGoogleSheetDto } from './dto/import-google-sheet.dto';
import { extractUserId, parsePositiveInt, parseSourceType } from '../../common/utils/request-parser.util';

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
    @Req() req: any,
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
  async importFromGoogleSheet(@Body() body: ImportGoogleSheetDto, @Req() req: any) {
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
}
