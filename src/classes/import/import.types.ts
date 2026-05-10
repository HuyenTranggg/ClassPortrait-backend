import { Student } from '../../common/types';
import { ImportAction, ImportChangesSummary, SourceType } from './entities/import-history.entity';

export type ImportMappingMode = 'auto' | 'manual';
export type DuplicateAction = 'ask' | 'create_new' | 'update_existing';
export type ImportRow = Record<string, unknown> & { __rowNumber: number };

export type ImportStats = {
  totalRowsRead: number;
  skippedRows: number;
  importedRows: number;
};

// Raw student data from Excel/CSV with all fields
export type RawStudentData = {
  semester: string;
  department: string;
  classCode: string; // Mã lớp học (lớp tín chỉ)
  classType?: string; // Loại lớp (bỏ qua)
  courseCode: string;
  courseName: string;
  mssv: string;
  fullName: string;
  gender?: string;
  dob?: Date;
  email?: string;
  className?: string; // Tên lớp quản lý
  classExamCode?: string; // Mã lớp thi
  notes?: string;
  examDate?: Date;
  examRoom?: string;
  examTime?: string;
  examShift?: string; // Kíp thi
  instructor: string;
  importOrder: number; // Thứ tự dòng trong file
};

// Grouped exam session
export type ExamSessionGroup = {
  groupKey: string; // Key for grouping (computed)
  examInfo: {
    semester: string;
    courseCode: string;
    courseName: string;
    instructor: string;
    department: string;
    classExamCode?: string;
    examDate?: Date;
    examRoom?: string;
    examTime?: string;
    examShift?: string;
  };
  students: RawStudentData[];
  importOrder: number; // Thứ tự nhóm trong file (min importOrder của students)
  isFallback: boolean; // TRUE nếu dùng fallback grouping (ưu tiên 3)
};

export type ImportDuplicateInfo = {
  classExamCode?: string;
  examDate?: Date;
  examRoom?: string;
  examTime?: string;
  examShift?: string;
  semester: string;
  courseCode: string;
  courseName: string;
  existingClassId: string;
  studentCount: number;
  isFallback: boolean;
  classCode?: string;
};

export type ImportDuplicateDecisionPayload = {
  code: 'CLASS_ALREADY_EXISTS' | 'UPDATE_CONFIRM_REQUIRED';
  message: string;
  duplicates: ImportDuplicateInfo[]; // Danh sách các lớp trùng
  totalStudents: number;
};

export type ClassImportInfo = {
  classCode: string;
  courseCode?: string;
  courseName?: string;
  semester?: string;
  department?: string;
  classType?: string;
  instructor?: string;
};

export type ImportClassOptions = {
  mssvColumn?: string;
  nameColumn?: string;
  startRow?: number;
  mappingMode?: ImportMappingMode;
  duplicateAction?: DuplicateAction;
  confirmUpdate?: boolean;
  targetClassId?: string;
  previewOnly?: boolean;
};

/** Preview result (không thực sự lưu vào DB) */
export type ImportPreviewExamSession = {
  groupKey: string;
  semester: string;
  courseCode: string;
  courseName: string;
  instructor: string;
  department: string;
  classExamCode?: string;
  examDate?: string;
  examRoom?: string;
  examTime?: string;
  examShift?: string;
  studentCount: number;
  importOrder: number;
  isFallback: boolean;
  classCode?: string;
};

export type ImportPreviewValidationError = {
  row: number;
  field: string;
  message: string;
};

export type ImportPreviewResult = {
  examSessions: ImportPreviewExamSession[];
  validationErrors: ImportPreviewValidationError[];
  stats: ImportStats;
  sourceName: string;
};

export type ParsedImportData = {
  rows: ImportRow[];
  headers: string[];
  sourceType: SourceType;
};

export type ResolvedImportMapping = {
  mssvColumn: string;
  nameColumn: string;
  startRow: number;
  // Các trường mới cho exam session
  semesterColumn?: string;
  departmentColumn?: string;
  classCodeColumn?: string;
  courseCodeColumn?: string;
  courseNameColumn?: string;
  classTypeColumn?: string;
  classNameColumn?: string;
  classExamCodeColumn?: string;
  examDateColumn?: string;
  examRoomColumn?: string;
  examTimeColumn?: string;
  examShiftColumn?: string;
  instructorColumn?: string;
  notesColumn?: string;
  genderColumn?: string;
  dobColumn?: string;
  emailColumn?: string;
};

export type ImportExtractedData = {
  classInfo: ClassImportInfo;
  students: Student[];
  mappingModeUsed: ImportMappingMode;
  resolvedMapping: ResolvedImportMapping;
  stats: {
    totalRowsRead: number;
    skippedRows: number;
    importedRows: number;
  };
};

export type ImportClassResult = {
  success: boolean;
  classIds: string[]; // Mảng UUID của các lớp thi đã tạo
  totalStudents: number;
  message: string;
  action: 'created' | 'updated';
  mappingModeUsed: ImportMappingMode;
  resolvedMapping: ResolvedImportMapping;
  stats: ImportStats;
  duplicates?: ImportDuplicateInfo[]; // Nếu có trùng
};

export type ImportColumnMapping = {
  mappingModeUsed: ImportMappingMode;
  resolvedMapping: ResolvedImportMapping;
  stats: ImportStats;
};

export type ClassSummary = {
  id: string;
  semester: string;
  courseCode: string;
  courseName: string;
  department: string;
  instructor: string;
  classExamCode?: string;
  examDate?: string;
  examRoom?: string;
  examTime?: string;
  examShift?: string;
  importOrder: number;
};

export type ImportHistoryItem = {
  id: string;
  userId: string;
  action: ImportAction;
  duplicateDetected: boolean;
  changesSummary: ImportChangesSummary | null;
  sourceType: SourceType;
  sourceName: string;
  totalCount: number;
  importedRows: number;
  skippedRows: number;
  mappingModeUsed: ImportMappingMode | null;
  classIds: string[];
  classes: ClassSummary[]; // Danh sách lớp thi đã import
  columnMapping?: Record<string, unknown>;
  createdAt: Date;
};

export type ImportHistoryListResult = {
  data: ImportHistoryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type ImportHistoryQueryOptions = {
  page?: number;
  limit?: number;
  sourceType?: SourceType;
};

export type PersistImportPayload = {
  userId: string;
  examSessions: ExamSessionGroup[]; // Đổi từ classInfo → examSessions
  sourceType: SourceType;
  sourceName: string;
  mappingModeUsed: ImportMappingMode;
  resolvedMapping: ResolvedImportMapping;
  stats: ImportStats;
  duplicateDetected?: boolean;
};
