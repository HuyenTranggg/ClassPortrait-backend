// backend/src/classes/classes.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import axios from 'axios';
import * as XLSX from 'xlsx';
import csvParser from 'csv-parser';
import { Readable } from 'stream';
import { Class, Student, ClassWithStudents } from '../common/types';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassEntity } from '../entities/class.entity';
import { StudentEntity } from '../entities/student.entity';
import { ImportHistoryEntity, SourceType } from '../entities/import-history.entity';
import { signPhotoUrl } from '../common/utils/photo-signature.util';

type ImportMappingMode = 'auto' | 'manual';

type ImportClassOptions = {
  mssvColumn?: string;
  nameColumn?: string;
  startRow?: number;
  mappingMode?: ImportMappingMode;
};

type ParsedImportData = {
  rows: Array<Record<string, any> & { __rowNumber: number }>;
  headers: string[];
  sourceType: SourceType;
};

type ResolvedImportMapping = {
  mssvColumn: string;
  nameColumn: string;
  startRow: number;
};

type ImportClassResult = {
  success: boolean;
  classId: string;
  message: string;
  mappingModeUsed: ImportMappingMode;
  resolvedMapping: ResolvedImportMapping;
  stats: {
    totalRowsRead: number;
    skippedRows: number;
    importedRows: number;
  };
};

type ImportHistoryItem = {
  id: string;
  classId: string;
  classCode: string;
  courseCode?: string;
  courseName?: string;
  semester?: string;
  sourceType: SourceType;
  sourceName: string;
  totalCount: number;
  importedRows: number;
  skippedRows: number;
  mappingModeUsed?: ImportMappingMode;
  createdAt: Date;
};

type ImportHistoryListResult = {
  data: ImportHistoryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type PersistImportPayload = {
  userId: string;
  classInfo: {
    classCode: string;
    courseCode?: string;
    courseName?: string;
    semester?: string;
    department?: string;
    classType?: string;
    instructor?: string;
  };
  students: Student[];
  sourceType: SourceType;
  sourceName: string;
  mappingModeUsed: ImportMappingMode;
  resolvedMapping: ResolvedImportMapping;
  stats: {
    totalRowsRead: number;
    skippedRows: number;
    importedRows: number;
  };
};

@Injectable()
export class ClassesService {
  constructor(
    @InjectRepository(ClassEntity)
    private readonly classesRepository: Repository<ClassEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentsRepository: Repository<StudentEntity>,
    @InjectRepository(ImportHistoryEntity)
    private readonly importHistoryRepository: Repository<ImportHistoryEntity>,
  ) {}

  private buildStudentPhotoUrl(mssv: string, classId: string): string {
    const port = process.env.PORT ?? '3000';
    const configuredBaseUrl = process.env.BACKEND_BASE_URL?.trim();
    const baseUrl = configuredBaseUrl && configuredBaseUrl.length > 0 ? configuredBaseUrl : `http://localhost:${port}`;
    const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7;
    const signature = signPhotoUrl(mssv, classId, expiresAt);
    return `${baseUrl.replace(/\/$/, '')}/students/${encodeURIComponent(mssv)}/photo?classId=${encodeURIComponent(classId)}&exp=${expiresAt}&sig=${signature}`;
  }

  async getImportHistoryByUser(
    userId: string,
    options?: {
      page?: number;
      limit?: number;
      sourceType?: SourceType;
    },
  ): Promise<ImportHistoryListResult> {
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(100, Math.max(1, options?.limit ?? 20));

    const queryBuilder = this.importHistoryRepository
      .createQueryBuilder('history')
      .innerJoinAndSelect('history.classEntity', 'classEntity')
      .where('history.userId = :userId', { userId });

    if (options?.sourceType) {
      queryBuilder.andWhere('history.sourceType = :sourceType', {
        sourceType: options.sourceType,
      });
    }

    const [histories, total] = await queryBuilder
      .orderBy('history.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const data: ImportHistoryItem[] = histories.map((history) => {
      const mapping = history.columnMapping ?? {};
      const stats = mapping.stats ?? {};
      const importedRows = Number(stats.importedRows ?? history.totalCount);
      const skippedRows = Number(stats.skippedRows ?? Math.max(0, history.totalCount - importedRows));

      return {
        id: history.id,
        classId: history.classId,
        classCode: history.classEntity?.classCode ?? '',
        courseCode: history.classEntity?.courseCode ?? undefined,
        courseName: history.classEntity?.courseName ?? undefined,
        semester: history.classEntity?.semester ?? undefined,
        sourceType: history.sourceType,
        sourceName: history.sourceName,
        totalCount: history.totalCount,
        importedRows,
        skippedRows,
        mappingModeUsed: mapping.mappingModeUsed,
        createdAt: history.createdAt,
      };
    });

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  private normalizeForCompare(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  private cleanCellValue(value: unknown): string {
    return String(value ?? '').trim();
  }

  private isValidMssv(value: string): boolean {
    return /^[A-Za-z0-9._-]{4,30}$/.test(value);
  }

  private detectHeaderRow(rawRows: unknown[][]): number {
    const limit = Math.min(rawRows.length, 10);
    for (let index = 0; index < limit; index += 1) {
      const row = rawRows[index] ?? [];
      const nonEmptyCount = row.filter((cell) => this.cleanCellValue(cell).length > 0).length;
      if (nonEmptyCount >= 2) {
        return index;
      }
    }
    return 0;
  }

  private inferSourceType(fileExtension?: string): SourceType {
    switch ((fileExtension ?? '').toLowerCase()) {
      case 'xlsx':
      case 'xls':
        return SourceType.EXCEL;
      case 'csv':
        return SourceType.EXCEL;
      case 'json':
        return SourceType.EXCEL;
      default:
        return SourceType.EXCEL;
    }
  }

  private parseGoogleSheetLink(googleSheetUrl: string): { spreadsheetId: string; gid: string } {
    const normalizedUrl = googleSheetUrl.trim();
    if (!normalizedUrl) {
      throw new BadRequestException('URL Google Sheet không được để trống');
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(normalizedUrl);
    } catch {
      throw new BadRequestException('URL Google Sheet không hợp lệ');
    }

    if (parsedUrl.hostname !== 'docs.google.com') {
      throw new BadRequestException('Chỉ hỗ trợ URL thuộc domain docs.google.com');
    }

    const match = parsedUrl.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const spreadsheetId = match?.[1];
    if (!spreadsheetId) {
      throw new BadRequestException('Không tìm thấy spreadsheetId trong URL Google Sheet');
    }

    const gid = parsedUrl.searchParams.get('gid')?.trim() || '0';
    return { spreadsheetId, gid };
  }

  private buildGoogleSheetCsvExportUrl(spreadsheetId: string, gid: string): string {
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  }

  private async downloadGoogleSheetCsvBuffer(csvExportUrl: string): Promise<Buffer> {
    try {
      const response = await axios.get<ArrayBuffer>(csvExportUrl, {
        responseType: 'arraybuffer',
        timeout: 15000,
      });

      const contentType = String(response.headers['content-type'] ?? '').toLowerCase();
      if (contentType.includes('text/html')) {
        throw new BadRequestException(
          'Không thể truy cập Google Sheet dưới dạng CSV. Vui lòng chia sẻ sheet ở chế độ có thể xem bằng link.',
        );
      }

      return Buffer.from(response.data);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        'Không thể tải dữ liệu từ Google Sheet. Vui lòng kiểm tra link và quyền truy cập của sheet.',
      );
    }
  }

  private async persistImportedClass(payload: PersistImportPayload): Promise<ImportClassResult> {
    const classEntity = this.classesRepository.create({
      userId: payload.userId,
      classCode: payload.classInfo.classCode,
      courseCode: payload.classInfo.courseCode ?? null,
      courseName: payload.classInfo.courseName ?? null,
      semester: payload.classInfo.semester ?? null,
      department: payload.classInfo.department ?? null,
      classType: payload.classInfo.classType ?? null,
      instructor: payload.classInfo.instructor ?? null,
    });

    const savedClass = await this.classesRepository.save(classEntity);

    const studentEntities = payload.students.map((student, index) =>
      this.studentsRepository.create({
        classId: savedClass.id,
        mssv: student.mssv,
        importOrder: index,
        fullName: student.name ?? null,
      }),
    );

    if (studentEntities.length > 0) {
      await this.studentsRepository.save(studentEntities);
    }

    const history = this.importHistoryRepository.create({
      classId: savedClass.id,
      userId: payload.userId,
      sourceType: payload.sourceType,
      sourceName: payload.sourceName,
      totalCount: payload.students.length,
      columnMapping: {
        mappingModeUsed: payload.mappingModeUsed,
        resolvedMapping: payload.resolvedMapping,
        stats: payload.stats,
      },
    });

    await this.importHistoryRepository.save(history);

    return {
      success: true,
      classId: savedClass.id,
      message: `Đã import thành công lớp "${payload.classInfo.classCode}" với ${payload.students.length} sinh viên`,
      mappingModeUsed: payload.mappingModeUsed,
      resolvedMapping: payload.resolvedMapping,
      stats: payload.stats,
    };
  }

  private findHeaderKey(headers: string[], requestedHeader: string): string | undefined {
    const normalizedRequested = this.normalizeForCompare(requestedHeader);
    return headers.find((header) => this.normalizeForCompare(header) === normalizedRequested);
  }

  private findHeaderByAliases(headers: string[], aliases: string[]): string | undefined {
    for (const alias of aliases) {
      const normalizedAlias = this.normalizeForCompare(alias);
      const exact = headers.find((header) => this.normalizeForCompare(header) === normalizedAlias);
      if (exact) return exact;
    }

    for (const alias of aliases) {
      const normalizedAlias = this.normalizeForCompare(alias);
      const contains = headers.find((header) => this.normalizeForCompare(header).includes(normalizedAlias));
      if (contains) return contains;
    }

    return undefined;
  }

  private assertInvalidColumnMapping(message: string, status: 'bad-request' | 'unprocessable' = 'unprocessable'): never {
    const payload = {
      code: 'INVALID_COLUMN_MAPPING',
      message,
    };

    if (status === 'bad-request') {
      throw new BadRequestException(payload);
    }
    throw new UnprocessableEntityException(payload);
  }

  /**
   * Lấy tất cả các lớp (không bao gồm danh sách sinh viên)
   */
  async findAll(): Promise<Class[]> {
    const entities = await this.classesRepository.find({
      order: { createdAt: 'DESC' },
    });

    return entities.map<Class>((entity) => ({
      id: entity.id,
      classCode: entity.classCode,
      courseCode: entity.courseCode ?? undefined,
      courseName: entity.courseName ?? undefined,
      semester: entity.semester ?? undefined,
      department: entity.department ?? undefined,
      classType: entity.classType ?? undefined,
      instructor: entity.instructor ?? undefined,
      createdAt: entity.createdAt,
    }));
  }

  /**
   * Lấy tất cả các lớp kèm số lượng sinh viên
   */
  async findAllWithStudentCount(userId: string): Promise<Array<Class & { studentCount: number }>> {
    const rows = await this.classesRepository
      .createQueryBuilder('c')
      .leftJoin('c.students', 's')
      .where('c.userId = :userId', { userId })
      .select('c.id', 'id')
      .addSelect('c.classCode', 'classCode')
      .addSelect('c.courseCode', 'courseCode')
      .addSelect('c.courseName', 'courseName')
      .addSelect('c.semester', 'semester')
      .addSelect('c.department', 'department')
      .addSelect('c.classType', 'classType')
      .addSelect('c.instructor', 'instructor')
      .addSelect('c.createdAt', 'createdAt')
      .addSelect('COUNT(s.id)', 'studentCount')
      .groupBy('c.id')
      .orderBy('c.createdAt', 'DESC')
      .getRawMany<{
        id: string;
        classCode: string;
        courseCode: string | null;
        courseName: string | null;
        semester: string | null;
        department: string | null;
        classType: string | null;
        instructor: string | null;
        createdAt: Date;
        studentCount: string;
      }>();

    return rows.map((row) => ({
      id: row.id,
      classCode: row.classCode,
      courseCode: row.courseCode ?? undefined,
      courseName: row.courseName ?? undefined,
      semester: row.semester ?? undefined,
      department: row.department ?? undefined,
      classType: row.classType ?? undefined,
      instructor: row.instructor ?? undefined,
      createdAt: row.createdAt,
      studentCount: Number(row.studentCount),
    }));
  }

  /**
   * Lấy thông tin một lớp theo ID (không bao gồm danh sách sinh viên)
   */
  async findOne(id: string, userId: string): Promise<Class> {
    const entity = await this.classesRepository.findOne({ where: { id, userId } });

    if (!entity) {
      throw new NotFoundException(`Không tìm thấy lớp với ID ${id} thuộc về người dùng hiện tại`);
    }

    return {
      id: entity.id,
      classCode: entity.classCode,
      courseCode: entity.courseCode ?? undefined,
      courseName: entity.courseName ?? undefined,
      semester: entity.semester ?? undefined,
      department: entity.department ?? undefined,
      classType: entity.classType ?? undefined,
      instructor: entity.instructor ?? undefined,
      createdAt: entity.createdAt,
    };
  }

  /**
   * Lấy thông tin một lớp kèm danh sách sinh viên
   */
  async findOneWithStudents(id: string, userId: string): Promise<ClassWithStudents> {
    const classItem = await this.findOne(id, userId);
    const students = await this.getStudents(id, userId);
    return {
      ...classItem,
      students,
    };
  }

  /**
   * Lấy danh sách sinh viên của một lớp
   */
  async getStudents(classId: string, userId: string): Promise<Student[]> {
    await this.findOne(classId, userId);

    const entities = await this.studentsRepository.find({
      where: { classId },
      order: { importOrder: 'ASC' },
    });

    return entities.map<Student>((entity) => ({
      mssv: entity.mssv,
      name: entity.fullName ?? undefined,
      photoUrl: this.buildStudentPhotoUrl(entity.mssv, entity.classId),
      photoStatus: entity.photoStatus,
      importOrder: entity.importOrder,
    }));
  }

  /**
   * Xóa một lớp và tất cả quan hệ với sinh viên
   */
  async remove(id: string, userId: string): Promise<{ success: boolean; message: string }> {
    const classEntity = await this.classesRepository.findOne({ where: { id, userId } });
    if (!classEntity) {
      throw new NotFoundException(`Không tìm thấy lớp với ID ${id} thuộc về người dùng hiện tại`);
    }

    try {
      await this.classesRepository.remove(classEntity);
      return {
        success: true,
        message: `Đã xóa lớp thành công`,
      };
    } catch {
      throw new ForbiddenException('Không thể xóa lớp học');
    }
  }

  /**
   * Import lớp học từ file (Excel, CSV, hoặc JSON)
   */
  async importClass(
    file: Express.Multer.File,
    userId: string,
    options?: ImportClassOptions,
  ): Promise<ImportClassResult> {
    if (!file) {
      throw new BadRequestException('Không có file nào được upload');
    }

    const startRow = options?.startRow ?? 2;
    if (!Number.isInteger(startRow) || startRow < 1) {
      this.assertInvalidColumnMapping('startRow phải là số nguyên lớn hơn hoặc bằng 1', 'bad-request');
    }

    try {
      // Xử lý theo loại file
      const fileExtension = file.originalname.split('.').pop()?.toLowerCase();

      let parsedData: ParsedImportData;
      switch (fileExtension) {
        case 'xlsx':
        case 'xls':
          parsedData = await this.parseExcelFile(file.buffer);
          break;
        case 'csv':
          parsedData = await this.parseCsvFile(file.buffer);
          break;
        case 'json':
          parsedData = this.parseJsonFile(file.buffer);
          break;
        default:
          throw new BadRequestException('Định dạng file không được hỗ trợ. Vui lòng sử dụng .xlsx, .csv hoặc .json');
      }

      if (parsedData.rows.length === 0) {
        throw new BadRequestException('File không chứa dữ liệu');
      }

      // Trích xuất thông tin lớp và danh sách sinh viên
      const { classInfo, students, mappingModeUsed, resolvedMapping, stats } = this.extractClassData(
        parsedData.rows,
        parsedData.headers,
        {
          ...options,
          startRow,
        },
      );

      if (students.length === 0) {
        throw new BadRequestException('Không tìm thấy sinh viên nào trong file');
      }

      try {
        return await this.persistImportedClass({
          userId,
          classInfo,
          students,
          sourceType: this.inferSourceType(fileExtension),
          sourceName: file.originalname,
          mappingModeUsed,
          resolvedMapping,
          stats,
        });
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        if (error instanceof UnprocessableEntityException) {
          throw error;
        }
        throw new BadRequestException(`Lỗi khi xử lý file: ${error.message}`);
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      if (error instanceof UnprocessableEntityException) {
        throw error;
      }
      throw new BadRequestException(`Lỗi khi xử lý file: ${error.message}`);
    }
  }

  /**
   * Import lớp học từ URL Google Sheet
   */
  async importFromGoogleSheet(
    googleSheetUrl: string,
    userId: string,
    options?: ImportClassOptions,
  ): Promise<ImportClassResult> {
    const startRow = options?.startRow ?? 2;
    if (!Number.isInteger(startRow) || startRow < 1) {
      this.assertInvalidColumnMapping('startRow phải là số nguyên lớn hơn hoặc bằng 1', 'bad-request');
    }

    const { spreadsheetId, gid } = this.parseGoogleSheetLink(googleSheetUrl);
    const csvExportUrl = this.buildGoogleSheetCsvExportUrl(spreadsheetId, gid);
    const csvBuffer = await this.downloadGoogleSheetCsvBuffer(csvExportUrl);
    const parsedData = await this.parseCsvFile(csvBuffer);

    if (parsedData.rows.length === 0) {
      throw new BadRequestException('Google Sheet không chứa dữ liệu');
    }

    const { classInfo, students, mappingModeUsed, resolvedMapping, stats } = this.extractClassData(
      parsedData.rows,
      parsedData.headers,
      {
        ...options,
        startRow,
      },
    );

    if (students.length === 0) {
      throw new BadRequestException('Không tìm thấy sinh viên nào trong Google Sheet');
    }

    try {
      return await this.persistImportedClass({
        userId,
        classInfo,
        students,
        sourceType: SourceType.GOOGLE_SHEET,
        sourceName: googleSheetUrl,
        mappingModeUsed,
        resolvedMapping,
        stats,
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      if (error instanceof UnprocessableEntityException) {
        throw error;
      }
      throw new BadRequestException(`Lỗi khi import từ Google Sheet: ${error.message}`);
    }
  }

  /**
   * Xử lý file Excel
   */
  private async parseExcelFile(buffer: Buffer): Promise<ParsedImportData> {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException('File Excel không có sheet dữ liệu');
    }
    const worksheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      blankrows: false,
      defval: '',
    });

    const headerRowIndex = this.detectHeaderRow(matrix);
    const rawHeaders = matrix[headerRowIndex] ?? [];
    const headers = rawHeaders
      .map((cell, index) => this.cleanCellValue(cell) || `Column ${index + 1}`)
      .map((header) => header.trim());

    const rows: Array<Record<string, any> & { __rowNumber: number }> = [];
    for (let rowIndex = headerRowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
      const sourceRow = matrix[rowIndex] ?? [];
      const rowObject: Record<string, any> & { __rowNumber: number } = {
        __rowNumber: rowIndex + 1,
      };

      headers.forEach((header, cellIndex) => {
        rowObject[header] = sourceRow[cellIndex];
      });

      rows.push(rowObject);
    }

    return {
      rows,
      headers,
      sourceType: SourceType.EXCEL,
    };
  }

  /**
   * Xử lý file CSV
   */
  private async parseCsvFile(buffer: Buffer): Promise<ParsedImportData> {
    return new Promise((resolve, reject) => {
      const results: Array<Record<string, any> & { __rowNumber: number }> = [];
      const headersSet = new Set<string>();
      const stream = Readable.from(buffer);
      let dataRowIndex = 0;

      stream
        .pipe(csvParser())
        .on('data', (data) => {
          dataRowIndex += 1;
          const row: Record<string, any> & { __rowNumber: number } = {
            __rowNumber: dataRowIndex + 1,
          };

          Object.entries(data).forEach(([key, value]) => {
            const cleanedKey = this.cleanCellValue(key);
            headersSet.add(cleanedKey);
            row[cleanedKey] = value;
          });

          results.push(row);
        })
        .on('end', () =>
          resolve({
            rows: results,
            headers: Array.from(headersSet),
            sourceType: SourceType.EXCEL,
          }),
        )
        .on('error', (error) => reject(error));
    });
  }

  /**
   * Xử lý file JSON
   */
  private parseJsonFile(buffer: Buffer): ParsedImportData {
    const jsonString = buffer.toString('utf-8');
    const data = JSON.parse(jsonString);
    const list = Array.isArray(data) ? data : [data];
    const rows: Array<Record<string, any> & { __rowNumber: number }> = [];
    const headersSet = new Set<string>();

    list.forEach((item, index) => {
      const row: Record<string, any> & { __rowNumber: number } = {
        __rowNumber: index + 1,
      };

      if (item && typeof item === 'object') {
        Object.entries(item).forEach(([key, value]) => {
          const cleanedKey = this.cleanCellValue(key);
          headersSet.add(cleanedKey);
          row[cleanedKey] = value;
        });
      }

      rows.push(row);
    });

    return {
      rows,
      headers: Array.from(headersSet),
      sourceType: SourceType.EXCEL,
    };
  }

  /**
   * Trích xuất thông tin lớp và danh sách sinh viên từ dữ liệu
   */
  private extractClassData(
    rows: Array<Record<string, any> & { __rowNumber: number }>,
    headers: string[],
    options: ImportClassOptions,
  ): {
    classInfo: {
      classCode: string;
      courseCode?: string;
      courseName?: string;
      semester?: string;
      department?: string;
      classType?: string;
      instructor?: string;
    };
    students: Student[];
    mappingModeUsed: ImportMappingMode;
    resolvedMapping: ResolvedImportMapping;
    stats: {
      totalRowsRead: number;
      skippedRows: number;
      importedRows: number;
    };
  } {
    const startRow = options.startRow ?? 2;
    const filteredRows = rows.filter((row) => row.__rowNumber >= startRow);

    if (filteredRows.length === 0) {
      throw new BadRequestException('Không có dữ liệu tại hoặc sau dòng bắt đầu đã chọn');
    }

    const firstRow = filteredRows[0];

    // Tìm cột mã lớp (BẮT BUỘC)
    const classCodeKey = this.findHeaderByAliases(headers, ['mã lớp', 'ma lop', 'class code', 'mã lớp học']);

    // Tìm cột mã học phần (optional)
    const courseCodeKey = this.findHeaderByAliases(headers, ['mã học phần', 'ma hoc phan', 'course code', 'mã hp']);

    // Tìm cột tên học phần (optional)
    const courseNameKey = this.findHeaderByAliases(headers, [
      'tên học phần',
      'ten hoc phan',
      'course name',
      'tên hp',
      'môn học',
      'mon hoc',
    ]);

    // Tìm cột học kỳ (optional)
    const semesterKey = this.findHeaderByAliases(headers, ['học kỳ', 'hoc ky', 'semester', 'học kì', 'hoc ki']);

    // Tìm cột đơn vị giảng dạy (optional)
    const departmentKey = this.findHeaderByAliases(headers, [
      'đv giảng dạy',
      'đơn vị',
      'đơn vị giảng dạy',
      'don vi giang day',
      'department',
      'khoa',
      'viện',
    ]);

    // Tìm cột loại lớp (optional)
    const classTypeKey = this.findHeaderByAliases(headers, ['loại lớp', 'loai lop', 'class type', 'type', 'loại']);

    // Tìm cột giảng viên (optional)
    const instructorKey = this.findHeaderByAliases(headers, [
      'giảng viên',
      'giang vien',
      'gv giảng dạy',
      'instructor',
      'teacher',
      'giáo viên',
      'giao vien',
    ]);

    const requestedMode: ImportMappingMode = options.mappingMode === 'manual' ? 'manual' : 'auto';
    const hasManualMapping = Boolean(options.mssvColumn && options.nameColumn);

    let mappingModeUsed: ImportMappingMode;
    let mssvKey: string | undefined;
    let nameKey: string | undefined;

    if (requestedMode === 'manual' && hasManualMapping) {
      const resolvedMssv = this.findHeaderKey(headers, this.cleanCellValue(options.mssvColumn));
      const resolvedName = this.findHeaderKey(headers, this.cleanCellValue(options.nameColumn));

      if (!resolvedMssv) {
        this.assertInvalidColumnMapping('Cột MSSV không tồn tại trong file');
      }
      if (!resolvedName) {
        this.assertInvalidColumnMapping('Cột Họ và tên không tồn tại trong file');
      }

      if (this.normalizeForCompare(resolvedMssv) === this.normalizeForCompare(resolvedName)) {
        this.assertInvalidColumnMapping('Cột MSSV và cột Họ và tên không được trùng nhau');
      }

      mappingModeUsed = 'manual';
      mssvKey = resolvedMssv;
      nameKey = resolvedName;
    } else {
      mssvKey = this.findHeaderByAliases(headers, ['mssv', 'mã số sinh viên', 'ma so sinh vien', 'student id']);
      nameKey = this.findHeaderByAliases(headers, [
        'họ và tên',
        'họ tên',
        'ho va ten',
        'ho ten',
        'họ và tên sv',
        'họ và tên sinh viên',
        'name',
        'fullname',
        'full name',
      ]);

      if (!mssvKey || !nameKey) {
        this.assertInvalidColumnMapping('Không thể tự động nhận diện đầy đủ cột MSSV và Họ và tên');
      }

      if (this.normalizeForCompare(mssvKey) === this.normalizeForCompare(nameKey)) {
        this.assertInvalidColumnMapping('Cột MSSV và cột Họ và tên không được trùng nhau');
      }

      mappingModeUsed = 'auto';
    }

    // Lấy thông tin lớp (lấy từ dòng đầu tiên)
    const classCode = classCodeKey ? this.cleanCellValue(firstRow[classCodeKey]) : '';
    if (!classCode) {
      throw new BadRequestException(
        'Không tìm thấy cột Mã lớp trong file. Vui lòng đảm bảo có cột tên "Mã lớp", "ma lop" hoặc "class code"',
      );
    }

    const courseCode = courseCodeKey ? this.cleanCellValue(firstRow[courseCodeKey]) || undefined : undefined;
    const courseName = courseNameKey ? this.cleanCellValue(firstRow[courseNameKey]) || undefined : undefined;
    const semester = semesterKey ? this.cleanCellValue(firstRow[semesterKey]) || undefined : undefined;
    const department = departmentKey ? this.cleanCellValue(firstRow[departmentKey]) || undefined : undefined;
    const classType = classTypeKey ? this.cleanCellValue(firstRow[classTypeKey]) || undefined : undefined;
    const instructor = instructorKey ? this.cleanCellValue(firstRow[instructorKey]) || undefined : undefined;

    // Trích xuất danh sách sinh viên
    const seenMssv = new Set<string>();
    const students: Student[] = [];
    let skippedRows = 0;

    filteredRows.forEach((row) => {
      const mssv = this.cleanCellValue(row[mssvKey]);
      const name = this.cleanCellValue(row[nameKey]);

      if (!mssv && !name) {
        skippedRows += 1;
        return;
      }

      if (!mssv) {
        skippedRows += 1;
        return;
      }

      if (!this.isValidMssv(mssv)) {
        skippedRows += 1;
        return;
      }

      if (seenMssv.has(mssv)) {
        skippedRows += 1;
        return;
      }

      seenMssv.add(mssv);

      const student: Student = {
        mssv,
      };

      if (name) {
        student.name = name;
      }

      students.push(student);
    });

    const totalRowsRead = filteredRows.length;
    const importedRows = students.length;

    if (importedRows === 0) {
      throw new BadRequestException('Không tìm thấy sinh viên hợp lệ sau khi áp dụng mapping cột');
    }

    const resolvedMapping: ResolvedImportMapping = {
      mssvColumn: mssvKey,
      nameColumn: nameKey,
      startRow,
    };

    return {
      classInfo: {
        classCode,
        courseCode,
        courseName,
        semester,
        department,
        classType,
        instructor,
      },
      students,
      mappingModeUsed,
      resolvedMapping,
      stats: {
        totalRowsRead,
        skippedRows,
        importedRows,
      },
    };
  }
}
