import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SourceType } from './entities/import-history.entity';
import { ImportMappingService } from './services/import-mapping.service';
import { ImportParserService } from './services/import-parser.service';
import { ImportGroupingService } from './services/import-grouping.service';
import { ImportPersistenceService } from './services/import-persistence.service';
import {
  ImportClassOptions,
  ImportClassResult,
  ResolvedImportMapping,
  ImportPreviewResult,
  ImportPreviewExamSession,
  RawStudentData,
} from './import.types';

@Injectable()
export class ClassImportService {
  constructor(
    private readonly importParserService: ImportParserService,
    private readonly importMappingService: ImportMappingService,
    private readonly importGroupingService: ImportGroupingService,
    private readonly importPersistenceService: ImportPersistenceService,
  ) {}

  /**
   * Main import method
   */
  async importClass(
    file: Express.Multer.File,
    userId: string,
    options?: ImportClassOptions,
  ): Promise<ImportClassResult> {
    const startRow = options?.startRow ?? 2;
    if (!Number.isInteger(startRow) || startRow < 1) {
      throw new BadRequestException({
        code: 'INVALID_COLUMN_MAPPING',
        message: 'startRow phai la so nguyen lon hon hoac bang 1',
      });
    }

    try {
      const { parsedData, sourceType } = await this.importParserService.parseFile(file);
      if (parsedData.rows.length === 0) {
        throw new BadRequestException('File không chứa dữ liệu');
      }

      return await this.processImportData(parsedData, userId, sourceType, file.originalname, startRow, options);
    } catch (error: unknown) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof UnprocessableEntityException
      ) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`Lỗi khi xử lý file: ${message}`);
    }
  }

  /**
   * Import from Google Sheet
   */
  async importFromGoogleSheet(
    googleSheetUrl: string,
    userId: string,
    options?: ImportClassOptions,
  ): Promise<ImportClassResult> {
    const startRow = options?.startRow ?? 2;
    if (!Number.isInteger(startRow) || startRow < 1) {
      throw new BadRequestException({
        code: 'INVALID_COLUMN_MAPPING',
        message: 'startRow phai la so nguyen lon hon hoac bang 1',
      });
    }

    try {
      const parsedData = await this.importParserService.parseGoogleSheet(googleSheetUrl);
      if (parsedData.rows.length === 0) {
        throw new BadRequestException('Google Sheet không chứa dữ liệu');
      }

      return await this.processImportData(parsedData, userId, SourceType.GOOGLE_SHEET, googleSheetUrl, startRow, options);
    } catch (error: unknown) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof UnprocessableEntityException
      ) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`Lỗi khi import từ Google Sheet: ${message}`);
    }
  }

  /**
   * Preview import - parse + group, không lưu vào DB
   */
  async previewImport(
    file: Express.Multer.File,
    userId: string,
    options?: ImportClassOptions,
  ): Promise<ImportPreviewResult> {
    const startRow = options?.startRow ?? 2;

    const { parsedData } = await this.importParserService.parseFile(file);
    if (parsedData.rows.length === 0) {
      throw new BadRequestException('File không chứa dữ liệu');
    }

    return this.processPreviewData(parsedData, file.originalname, startRow, options);
  }

  /**
   * Preview import từ Google Sheet - không lưu vào DB
   */
  async previewImportFromGoogleSheet(
    googleSheetUrl: string,
    userId: string,
    options?: ImportClassOptions,
  ): Promise<ImportPreviewResult> {
    const startRow = options?.startRow ?? 2;

    const parsedData = await this.importParserService.parseGoogleSheet(googleSheetUrl);
    if (parsedData.rows.length === 0) {
      throw new BadRequestException('Google Sheet không chứa dữ liệu');
    }

    return this.processPreviewData(parsedData, googleSheetUrl, startRow, options);
  }

  // --- PRIVATE METHODS ---

  /**
   * Xử lý luồng dữ liệu import chính sau khi đã parse từ file hoặc Google Sheet.
   * Chịu trách nhiệm gọi các service để map cột, trích xuất dữ liệu, kiểm tra lỗi, gom nhóm và lưu trữ.
   * 
   * @param parsedData Dữ liệu thô đã được parse từ nguồn.
   * @param userId ID của người dùng đang thực hiện import.
   * @param sourceType Loại nguồn dữ liệu (Excel hoặc Google Sheet).
   * @param sourceName Tên file hoặc URL của Google Sheet.
   * @param startRow Dòng bắt đầu đọc dữ liệu thực tế.
   * @param options (Tùy chọn) Các tùy chọn khi import như chế độ mapping, cột mapping thủ công.
   * @returns Đối tượng ImportClassResult chứa kết quả của quá trình import.
   * @throws BadRequestException Khi không thể gom nhóm hoặc lưu trữ dữ liệu.
   */
  private async processImportData(
    parsedData: any,
    userId: string,
    sourceType: SourceType,
    sourceName: string,
    startRow: number,
    options?: ImportClassOptions,
  ): Promise<ImportClassResult> {
    const resolvedMapping = this.resolveMapping(parsedData, startRow, options);
    const { rawStudents, filteredRows } = this.extractAndValidateRawStudents(parsedData, resolvedMapping, startRow);

    const examSessions = this.importGroupingService.groupIntoExamSessions(rawStudents);
    if (examSessions.length === 0) {
      throw new BadRequestException('Không thể nhóm dữ liệu thành lớp thi nào');
    }

    return await this.importPersistenceService.persistImportedExamSessions(
      examSessions,
      {
        userId,
        examSessions,
        sourceType,
        sourceName,
        mappingModeUsed: options?.mappingMode === 'manual' ? 'manual' : 'auto',
        resolvedMapping,
        stats: {
          totalRowsRead: parsedData.rows.length,
          skippedRows: parsedData.rows.length - filteredRows.length + (filteredRows.length - rawStudents.length),
          importedRows: rawStudents.length,
        },
      },
      options?.duplicateAction,
    );
  }

  /**
   * Xử lý luồng xem trước (preview) dữ liệu trước khi import thực sự vào cơ sở dữ liệu.
   * Giúp người dùng nhìn thấy cấu trúc dữ liệu sẽ được tạo và các lỗi (nếu có).
   * 
   * @param parsedData Dữ liệu thô đã được parse từ nguồn.
   * @param sourceName Tên file hoặc URL của Google Sheet.
   * @param startRow Dòng bắt đầu đọc dữ liệu thực tế.
   * @param options (Tùy chọn) Các tùy chọn khi preview.
   * @returns Đối tượng ImportPreviewResult chứa danh sách các lớp thi và chi tiết lỗi dòng dữ liệu.
   */
  private processPreviewData(
    parsedData: any,
    sourceName: string,
    startRow: number,
    options?: ImportClassOptions,
  ): ImportPreviewResult {
    const resolvedMapping = this.resolveMapping(parsedData, startRow, options);

    const filteredRows = parsedData.rows.filter((row: any) => row.__rowNumber >= startRow);
    const filteredParsedData = { ...parsedData, rows: filteredRows };
    const rawStudents = this.importMappingService.extractRawStudentData(filteredParsedData, resolvedMapping);
    
    const validationRaw = this.importMappingService.validateRawStudentData(rawStudents);
    const validationErrors = validationRaw.map(e => ({
      row: e.rowNumber ?? 0,
      field: 'Dữ liệu',
      message: e.reason ?? '',
    }));

    const examSessions = rawStudents.length > 0 ? this.importGroupingService.groupIntoExamSessions(rawStudents) : [];

    const previewSessions: ImportPreviewExamSession[] = examSessions.map(g => ({
      groupKey: g.groupKey,
      semester: g.examInfo.semester,
      courseCode: g.examInfo.courseCode,
      courseName: g.examInfo.courseName,
      instructor: g.examInfo.instructor,
      department: g.examInfo.department,
      classExamCode: g.examInfo.classExamCode,
      examDate: g.examInfo.examDate ? `${String(g.examInfo.examDate.getDate()).padStart(2, '0')}/${String(g.examInfo.examDate.getMonth() + 1).padStart(2, '0')}/${g.examInfo.examDate.getFullYear()}` : undefined,
      examRoom: g.examInfo.examRoom,
      examTime: g.examInfo.examTime,
      examShift: g.examInfo.examShift,
      studentCount: g.students.length,
      importOrder: g.importOrder,
      isFallback: g.isFallback,
      classCode: g.students[0]?.classCode,
    }));

    return {
      examSessions: previewSessions,
      validationErrors,
      stats: {
        totalRowsRead: parsedData.rows.length,
        skippedRows: parsedData.rows.length - rawStudents.length,
        importedRows: rawStudents.length,
      },
      sourceName,
    };
  }

  /**
   * Phân giải logic ánh xạ cột (mapping) từ tự động hoặc thủ công do người dùng chỉ định.
   * 
   * @param parsedData Dữ liệu thô đã được parse từ nguồn (chứa danh sách headers).
   * @param startRow Dòng bắt đầu đọc dữ liệu thực tế.
   * @param options (Tùy chọn) Các tùy chọn chứa cấu hình cột mapping thủ công.
   * @returns Cấu hình mapping cuối cùng đã được xác nhận (ResolvedImportMapping).
   * @throws UnprocessableEntityException Nếu không thể nhận diện được các cột bắt buộc (MSSV, Họ tên).
   */
  private resolveMapping(parsedData: any, startRow: number, options?: ImportClassOptions): ResolvedImportMapping {
    let resolvedMapping: ResolvedImportMapping;
    if (options?.mappingMode === 'manual' && options?.mssvColumn && options?.nameColumn) {
      const mssvColumn = this.importMappingService.findHeaderKey(parsedData.headers, options.mssvColumn);
      const nameColumn = this.importMappingService.findHeaderKey(parsedData.headers, options.nameColumn);
      if (!mssvColumn || !nameColumn) {
        throw new UnprocessableEntityException('Không thể xác định cột MSSV và Họ và tên theo mapping thủ công');
      }
      resolvedMapping = { mssvColumn, nameColumn, startRow };
    } else {
      resolvedMapping = this.importMappingService.detectColumnMapping(parsedData.headers);
    }

    if (!resolvedMapping.mssvColumn || !resolvedMapping.nameColumn) {
      throw new UnprocessableEntityException('Không thể xác định cột MSSV và Họ và tên');
    }

    return resolvedMapping;
  }

  /**
   * Lọc, trích xuất và xác thực danh sách sinh viên từ dữ liệu parse được dựa trên cấu hình mapping.
   * 
   * @param parsedData Dữ liệu thô đã được parse từ nguồn.
   * @param resolvedMapping Cấu hình mapping cột đã được xác nhận.
   * @param startRow Dòng bắt đầu đọc dữ liệu thực tế.
   * @returns Đối tượng chứa danh sách sinh viên thô hợp lệ (`rawStudents`) và các dòng đã được lọc (`filteredRows`).
   * @throws BadRequestException Nếu file không có sinh viên hợp lệ hoặc chứa dữ liệu không đúng định dạng.
   */
  private extractAndValidateRawStudents(parsedData: any, resolvedMapping: ResolvedImportMapping, startRow: number): { rawStudents: RawStudentData[], filteredRows: any[] } {
    const filteredRows = parsedData.rows.filter((row: any) => row.__rowNumber >= startRow);
    const filteredParsedData = { ...parsedData, rows: filteredRows };
    
    const rawStudents = this.importMappingService.extractRawStudentData(filteredParsedData, resolvedMapping);

    if (rawStudents.length === 0) {
      throw new BadRequestException('Không tìm thấy sinh viên hợp lệ nào trong file');
    }

    const validationErrors = this.importMappingService.validateRawStudentData(rawStudents);
    if (validationErrors.length > 0) {
      throw new BadRequestException({
        code: 'INVALID_IMPORT_DATA',
        message: 'Dữ liệu không hợp lệ',
        invalidRows: validationErrors,
      });
    }

    return { rawStudents, filteredRows };
  }
}
