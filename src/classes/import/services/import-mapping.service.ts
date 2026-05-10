import { BadRequestException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { RawStudentData, ResolvedImportMapping, ParsedImportData } from '../import.types';

@Injectable()
export class ImportMappingService {
  private static readonly MSSV_PATTERN = /^[MPTmpt0-9]{8,10}$/;

  private normalizeForCompare(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  private isValidMssv(value: string): boolean {
    return ImportMappingService.MSSV_PATTERN.test(value);
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

  /**
   * Find header by exact column name (for manual mapping)
   */
  findHeaderKey(headers: string[], columnName: string): string | undefined {
    const normalized = this.normalizeForCompare(columnName);
    return headers.find((header) => this.normalizeForCompare(header) === normalized);
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
   * Detect column mapping for all required and optional fields
   */
  detectColumnMapping(headers: string[]): ResolvedImportMapping {
    // Required fields
    const mssvKey = this.findHeaderByAliases(headers, ['mssv', 'mã số sinh viên', 'ma so sinh vien', 'student id']);
    const nameKey = this.findHeaderByAliases(headers, [
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

    // Optional fields for exam session grouping and student info
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
    const classTypeKey = this.findHeaderByAliases(headers, ['loại lớp', 'loai lop', 'class type', 'type', 'loại']);
    const classNameKey = this.findHeaderByAliases(headers, ['tên lớp', 'ten lop', 'class name']);
    const classExamCodeKey = this.findHeaderByAliases(headers, ['mã lớp thi', 'ma lop thi', 'class exam code', 'exam code']);
    const examDateKey = this.findHeaderByAliases(headers, ['ngày thi', 'ngay thi', 'exam date', 'date']);
    const examRoomKey = this.findHeaderByAliases(headers, ['phòng thi', 'phong thi', 'exam room', 'room']);
    const examTimeKey = this.findHeaderByAliases(headers, ['thời gian thi', 'thoi gian thi', 'exam time', 'time']);
    const examShiftKey = this.findHeaderByAliases(headers, ['kíp thi', 'kip thi', 'exam shift', 'shift']);
    const instructorKey = this.findHeaderByAliases(headers, [
      'giảng viên',
      'giang vien',
      'gv giảng dạy',
      'instructor',
      'teacher',
      'giáo viên',
      'giao vien',
    ]);
    const notesKey = this.findHeaderByAliases(headers, ['ghi chú', 'ghi chu', 'notes', 'note']);
    const genderKey = this.findHeaderByAliases(headers, ['giới tính', 'gioi tinh', 'gender']);
    const dobKey = this.findHeaderByAliases(headers, ['ngày sinh', 'ngay sinh', 'date of birth', 'dob']);
    const emailKey = this.findHeaderByAliases(headers, ['email', 'thư điện tử', 'thu dien tu']);

    return {
      mssvColumn: mssvKey,
      nameColumn: nameKey,
      startRow: 2, // default
      // Optional columns
      semesterColumn: semesterKey,
      departmentColumn: departmentKey,
      classCodeColumn: classCodeKey,
      courseCodeColumn: courseCodeKey,
      courseNameColumn: courseNameKey,
      classTypeColumn: classTypeKey,
      classNameColumn: classNameKey,
      classExamCodeColumn: classExamCodeKey,
      examDateColumn: examDateKey,
      examRoomColumn: examRoomKey,
      examTimeColumn: examTimeKey,
      examShiftColumn: examShiftKey,
      instructorColumn: instructorKey,
      notesColumn: notesKey,
      genderColumn: genderKey,
      dobColumn: dobKey,
      emailColumn: emailKey,
    };
  }

  /**
   * Extract raw student data from rows using mapping
   */
  extractRawStudentData(
    parsedData: ParsedImportData,
    mapping: ResolvedImportMapping,
  ): RawStudentData[] {
    const { rows } = parsedData;
    const rawStudents: RawStudentData[] = [];

    for (const row of rows) {
      const rowNumber = row.__rowNumber;

      const getValue = (column?: string): string => {
        if (!column) return '';
        const val = row[column];
        return val !== undefined && val !== null ? String(val).trim() : '';
      };

      const getOptionalValue = (column?: string): string | undefined => {
        if (!column) return undefined;
        const val = row[column];
        return val !== undefined && val !== null ? String(val).trim() : undefined;
      };

      const getDateValue = (column?: string): Date | undefined => {
        const val = getOptionalValue(column);
        if (!val) return undefined;
        const parsed = this.parseDate(val);
        if (!parsed) {
          throw new BadRequestException({
            code: 'INVALID_IMPORT_DATA',
            message: `Dữ liệu ngày không hợp lệ tại dòng ${rowNumber}${column ? ` (cột "${column}")` : ''}`,
            invalidRows: [{ rowNumber, reason: `Giá trị ngày "${val}" không hợp lệ` }],
          });
        }
        return parsed;
      };

      const mssv = getValue(mapping.mssvColumn);
      const fullName = getValue(mapping.nameColumn);

      // Skip row if missing required fields (but don't throw error yet - let caller handle)
      if (!mssv || !fullName) {
        continue;
      }

      const rawStudent: RawStudentData = {
        semester: getValue(mapping.semesterColumn) || '',
        department: getValue(mapping.departmentColumn) || '',
        classCode: getValue(mapping.classCodeColumn) || '',
        classType: getOptionalValue(mapping.classTypeColumn), // ignored but kept for completeness
        courseCode: getValue(mapping.courseCodeColumn) || '',
        courseName: getValue(mapping.courseNameColumn) || '',
        mssv,
        fullName,
        gender: getOptionalValue(mapping.genderColumn),
        dob: getDateValue(mapping.dobColumn),
        email: getOptionalValue(mapping.emailColumn),
        className: getOptionalValue(mapping.classNameColumn),
        classExamCode: getOptionalValue(mapping.classExamCodeColumn),
        notes: getOptionalValue(mapping.notesColumn),
        examDate: getDateValue(mapping.examDateColumn),
        examRoom: getOptionalValue(mapping.examRoomColumn),
        examTime: getOptionalValue(mapping.examTimeColumn),
        examShift: getOptionalValue(mapping.examShiftColumn),
        instructor: getValue(mapping.instructorColumn) || '',
        importOrder: rowNumber,
      };

      rawStudents.push(rawStudent);
    }

    return rawStudents;
  }

  /**
   * Validate raw student data and return any errors
   */
  validateRawStudentData(students: RawStudentData[]): Array<{ rowNumber: number; reason: string }> {
    const errors: Array<{ rowNumber: number; reason: string }> = [];
    const seenMssv = new Set<string>();

    for (const student of students) {
      // Required fields check
      if (!student.semester) {
        errors.push({
          rowNumber: student.importOrder,
          reason: 'Thiếu Học kỳ',
        });
        continue;
      }

      if (!student.department) {
        errors.push({
          rowNumber: student.importOrder,
          reason: 'Thiếu Đơn vị giảng dạy',
        });
        continue;
      }

      if (!student.classCode) {
        errors.push({
          rowNumber: student.importOrder,
          reason: 'Thiếu Mã lớp',
        });
        continue;
      }

      if (!student.courseCode) {
        errors.push({
          rowNumber: student.importOrder,
          reason: 'Thiếu Mã học phần',
        });
        continue;
      }

      if (!student.courseName) {
        errors.push({
          rowNumber: student.importOrder,
          reason: 'Thiếu Tên học phần',
        });
        continue;
      }

      if (!student.instructor) {
        errors.push({
          rowNumber: student.importOrder,
          reason: 'Thiếu Giảng viên',
        });
        continue;
      }

      if (!this.isValidMssv(student.mssv)) {
        errors.push({
          rowNumber: student.importOrder,
          reason: `MSSV "${student.mssv}" không đúng định dạng`,
        });
        continue;
      }

      if (seenMssv.has(student.mssv)) {
        errors.push({
          rowNumber: student.importOrder,
          reason: `MSSV "${student.mssv}" bị trùng trong file import`,
        });
        continue;
      }

      seenMssv.add(student.mssv);
    }

    return errors;
  }

  /**
   * Parse date from various formats: string (YYYY-MM-DD, DD/MM/YYYY), Excel serial number.
   * Trả về undefined nếu không parse được để tránh fallback sang ngày hiện tại gây sai lệch dữ liệu.
   */
  private parseDate(value: string): Date | undefined {
    const trimmed = value.trim();
    if (!trimmed) return undefined;

    // Try ISO format (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split('-').map(Number);
      return this.buildUtcDate(year, month, day);
    }

    // Try DD/MM/YYYY
    if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(trimmed)) {
      const [d, m, y] = trimmed.split(/[-\/]/).map(Number);
      const date = this.buildUtcDate(y, m, d);
      if (date) return date;
    }

    // Try Excel serial date (days since 1899-12-30, including fractional time)
    const serial = Number(trimmed);
    if (Number.isFinite(serial) && serial > 0 && serial < 2958465) {
      const wholeDays = Math.floor(serial);
      const dayFraction = serial - wholeDays;
      const ms = Math.round(dayFraction * 24 * 60 * 60 * 1000);
      const excelEpoch = Date.UTC(1899, 11, 30);
      const date = new Date(excelEpoch + wholeDays * 24 * 60 * 60 * 1000 + ms);
      if (!Number.isNaN(date.getTime())) return date;
    }

    // Try full datetime strings as final fallback (e.g. ISO with time component)
    const timestamp = Date.parse(trimmed);
    if (!Number.isNaN(timestamp)) {
      return new Date(timestamp);
    }

    return undefined;
  }

  private buildUtcDate(year: number, month: number, day: number): Date | undefined {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      return undefined;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return undefined;
    }

    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return undefined;
    }
    return date;
  }
}
