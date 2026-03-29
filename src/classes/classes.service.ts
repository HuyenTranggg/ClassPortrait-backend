import {
  Injectable,
} from '@nestjs/common';
import { Class, Student, ClassWithStudents } from '../common/types';
import { SourceType } from '../entities/import-history.entity';
import {
  ImportClassOptions,
  ImportClassResult,
  ImportHistoryListResult,
} from './import/import.types';
import { ImportHistoryService } from './import/import-history.service';
import { ClassQueryService } from './class-query.service';
import { ClassImportService } from './class-import.service';

@Injectable()
export class ClassesService {
  constructor(
    private readonly classQueryService: ClassQueryService,
    private readonly classImportService: ClassImportService,
    private readonly importHistoryService: ImportHistoryService,
  ) {}

  async getImportHistoryByUser(
    userId: string,
    options?: {
      page?: number;
      limit?: number;
      sourceType?: SourceType;
    },
  ): Promise<ImportHistoryListResult> {
    return this.importHistoryService.getImportHistoryByUser(userId, options);
  }

  async findAll(): Promise<Class[]> {
    return this.classQueryService.findAll();
  }

  async findAllWithStudentCount(userId: string): Promise<Array<Class & { studentCount: number }>> {
    return this.classQueryService.findAllWithStudentCount(userId);
  }

  async findOne(id: string, userId: string): Promise<Class> {
    return this.classQueryService.findOne(id, userId);
  }

  async findOneWithStudents(id: string, userId: string): Promise<ClassWithStudents> {
    return this.classQueryService.findOneWithStudents(id, userId);
  }

  async getStudents(classId: string, userId: string): Promise<Student[]> {
    return this.classQueryService.getStudents(classId, userId);
  }

  async remove(id: string, userId: string): Promise<{ success: boolean; message: string }> {
    return this.classQueryService.remove(id, userId);
  }

  async importClass(
    file: Express.Multer.File,
    userId: string,
    options?: ImportClassOptions,
  ): Promise<ImportClassResult> {
    return this.classImportService.importClass(file, userId, options);
  }

  async importFromGoogleSheet(
    googleSheetUrl: string,
    userId: string,
    options?: ImportClassOptions,
  ): Promise<ImportClassResult> {
    return this.classImportService.importFromGoogleSheet(googleSheetUrl, userId, options);
  }
}
