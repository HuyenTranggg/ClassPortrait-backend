import { Student } from '../../common/types';
import { ImportAction, ImportChangesSummary, SourceType } from './entities/import-history.entity';

export type ImportMappingMode = 'auto' | 'manual';
export type DuplicateAction = 'ask' | 'create_new' | 'update_existing';

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
};

export type ParsedImportData = {
  rows: Array<Record<string, any> & { __rowNumber: number }>;
  headers: string[];
  sourceType: SourceType;
};

export type ResolvedImportMapping = {
  mssvColumn: string;
  nameColumn: string;
  startRow: number;
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
  classId: string;
  message: string;
  action: 'created' | 'updated';
  mappingModeUsed: ImportMappingMode;
  resolvedMapping: ResolvedImportMapping;
  stats: {
    totalRowsRead: number;
    skippedRows: number;
    importedRows: number;
  };
};

export type ImportDuplicateDecisionPayload = {
  code: 'CLASS_ALREADY_EXISTS' | 'UPDATE_CONFIRM_REQUIRED';
  message: string;
  duplicateClass: {
    id: string;
    classCode: string;
    courseCode?: string;
    courseName?: string;
    semester?: string;
    department?: string;
    classType?: string;
    instructor?: string;
    studentCount: number;
    createdAt: Date;
  };
  changes: ImportChangesSummary;
  nextActions: DuplicateAction[];
};

export type ImportHistoryItem = {
  id: string;
  classId: string;
  action: ImportAction;
  duplicateDetected: boolean;
  changesSummary: ImportChangesSummary | null;
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
  classInfo: ClassImportInfo;
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
  duplicateDetected?: boolean;
};
