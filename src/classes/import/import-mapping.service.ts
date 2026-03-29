import { BadRequestException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Student } from '../../common/types';
import { ClassImportInfo, ImportClassOptions, ImportExtractedData, ImportMappingMode } from './import.types';

@Injectable()
export class ImportMappingService {
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

  extractClassData(
    rows: Array<Record<string, any> & { __rowNumber: number }>,
    headers: string[],
    options: ImportClassOptions,
  ): ImportExtractedData {
    const startRow = options.startRow ?? 2;
    const filteredRows = rows.filter((row) => row.__rowNumber >= startRow);

    if (filteredRows.length === 0) {
      throw new BadRequestException('Không có dữ liệu tại hoặc sau dòng bắt đầu đã chọn');
    }

    const firstRow = filteredRows[0];

    const classCodeKey = this.findHeaderByAliases(headers, ['mã lớp', 'ma lop', 'class code', 'mã lớp học']);
    const courseCodeKey = this.findHeaderByAliases(headers, ['mã học phần', 'ma hoc phan', 'course code', 'mã hp']);
    const courseNameKey = this.findHeaderByAliases(headers, [
      'tên học phần',
      'ten hoc phan',
      'course name',
      'tên hp',
      'môn học',
      'mon hoc',
    ]);
    const semesterKey = this.findHeaderByAliases(headers, ['học kỳ', 'hoc ky', 'semester', 'học kì', 'hoc ki']);
    const departmentKey = this.findHeaderByAliases(headers, [
      'đv giảng dạy',
      'đơn vị',
      'đơn vị giảng dạy',
      'don vi giang day',
      'department',
      'khoa',
      'viện',
    ]);
    const classTypeKey = this.findHeaderByAliases(headers, ['loại lớp', 'loai lop', 'class type', 'type', 'loại']);
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

    const classCode = classCodeKey ? this.cleanCellValue(firstRow[classCodeKey]) : '';
    if (!classCode) {
      throw new BadRequestException(
        'Không tìm thấy cột Mã lớp trong file. Vui lòng đảm bảo có cột tên "Mã lớp", "ma lop" hoặc "class code"',
      );
    }

    const classInfo: ClassImportInfo = {
      classCode,
      courseCode: courseCodeKey ? this.cleanCellValue(firstRow[courseCodeKey]) || undefined : undefined,
      courseName: courseNameKey ? this.cleanCellValue(firstRow[courseNameKey]) || undefined : undefined,
      semester: semesterKey ? this.cleanCellValue(firstRow[semesterKey]) || undefined : undefined,
      department: departmentKey ? this.cleanCellValue(firstRow[departmentKey]) || undefined : undefined,
      classType: classTypeKey ? this.cleanCellValue(firstRow[classTypeKey]) || undefined : undefined,
      instructor: instructorKey ? this.cleanCellValue(firstRow[instructorKey]) || undefined : undefined,
    };

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

      if (!mssv || !this.isValidMssv(mssv) || seenMssv.has(mssv)) {
        skippedRows += 1;
        return;
      }

      seenMssv.add(mssv);

      const student: Student = { mssv };
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

    return {
      classInfo,
      students,
      mappingModeUsed,
      resolvedMapping: {
        mssvColumn: mssvKey,
        nameColumn: nameKey,
        startRow,
      },
      stats: {
        totalRowsRead,
        skippedRows,
        importedRows,
      },
    };
  }
}
