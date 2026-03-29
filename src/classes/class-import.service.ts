import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassEntity } from '../entities/class.entity';
import { ImportHistoryEntity, SourceType } from '../entities/import-history.entity';
import { StudentEntity } from '../entities/student.entity';
import { ImportDuplicateService } from './import/import-duplicate.service';
import { ImportHistoryService } from './import/import-history.service';
import { ImportMappingService } from './import/import-mapping.service';
import { ImportParserService } from './import/import-parser.service';
import { ImportClassOptions, ImportClassResult, PersistImportPayload } from './import/import.types';

@Injectable()
export class ClassImportService {
  constructor(
    @InjectRepository(ClassEntity)
    private readonly classesRepository: Repository<ClassEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentsRepository: Repository<StudentEntity>,
    private readonly importParserService: ImportParserService,
    private readonly importMappingService: ImportMappingService,
    private readonly importDuplicateService: ImportDuplicateService,
    private readonly importHistoryService: ImportHistoryService,
  ) {}

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

    await this.importHistoryService.save(this.importHistoryService.buildCreatedImportHistory(savedClass.id, payload));

    return {
      success: true,
      classId: savedClass.id,
      message: `Da import thanh cong lop "${payload.classInfo.classCode}" voi ${payload.students.length} sinh vien`,
      action: 'created',
      mappingModeUsed: payload.mappingModeUsed,
      resolvedMapping: payload.resolvedMapping,
      stats: payload.stats,
    };
  }

  private async updateExistingClassByImport(classId: string, payload: PersistImportPayload): Promise<ImportClassResult> {
    const existingClass = await this.classesRepository.findOne({ where: { id: classId, userId: payload.userId } });
    if (!existingClass) {
      throw new NotFoundException(`Không tìm thấy lớp với ID ${classId} thuộc về người dùng hiện tại`);
    }

    const changesSummary = await this.importDuplicateService.buildImportChanges(
      existingClass,
      payload.classInfo,
      payload.students,
    );

    await this.classesRepository.manager.transaction(async (manager) => {
      await manager.getRepository(ClassEntity).update(
        { id: classId, userId: payload.userId },
        {
          classCode: payload.classInfo.classCode,
          courseCode: payload.classInfo.courseCode ?? null,
          courseName: payload.classInfo.courseName ?? null,
          semester: payload.classInfo.semester ?? null,
          department: payload.classInfo.department ?? null,
          classType: payload.classInfo.classType ?? null,
          instructor: payload.classInfo.instructor ?? null,
        },
      );

      await manager.getRepository(StudentEntity).delete({ classId });

      const studentEntities = payload.students.map((student, index) =>
        manager.getRepository(StudentEntity).create({
          classId,
          mssv: student.mssv,
          importOrder: index,
          fullName: student.name ?? null,
        }),
      );

      if (studentEntities.length > 0) {
        await manager.getRepository(StudentEntity).save(studentEntities);
      }

      const history = manager
        .getRepository(ImportHistoryEntity)
        .create(this.importHistoryService.buildUpdatedImportHistory(classId, payload, changesSummary));
      await manager.getRepository(ImportHistoryEntity).save(history);
    });

    return {
      success: true,
      classId,
      message: `Da cap nhat lop hien co "${payload.classInfo.classCode}" voi ${payload.students.length} sinh vien`,
      action: 'updated',
      mappingModeUsed: payload.mappingModeUsed,
      resolvedMapping: payload.resolvedMapping,
      stats: payload.stats,
    };
  }

  private async persistWithDuplicateHandling(
    payload: PersistImportPayload,
    options?: ImportClassOptions,
  ): Promise<ImportClassResult> {
    const duplicateClass = await this.importDuplicateService.findDuplicateClassByIdentity(payload.userId, payload.classInfo);
    const duplicateAction = options?.duplicateAction ?? 'ask';

    if (!duplicateClass || duplicateAction === 'create_new') {
      return this.persistImportedClass({
        ...payload,
        duplicateDetected: Boolean(duplicateClass && duplicateAction === 'create_new'),
      });
    }

    if (options?.targetClassId && options.targetClassId !== duplicateClass.id) {
      throw new BadRequestException('targetClassId không khớp với lớp trùng được phát hiện');
    }

    if (duplicateAction === 'ask') {
      const payloadConflict = await this.importDuplicateService.buildDuplicateDecisionPayload(
        'CLASS_ALREADY_EXISTS',
        duplicateClass,
        payload.classInfo,
        payload.students,
      );
      throw new ConflictException(payloadConflict);
    }

    if (!options?.confirmUpdate) {
      const payloadConflict = await this.importDuplicateService.buildDuplicateDecisionPayload(
        'UPDATE_CONFIRM_REQUIRED',
        duplicateClass,
        payload.classInfo,
        payload.students,
      );
      throw new ConflictException(payloadConflict);
    }

    return this.updateExistingClassByImport(duplicateClass.id, payload);
  }

  async importClass(file: Express.Multer.File, userId: string, options?: ImportClassOptions): Promise<ImportClassResult> {
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

      const extracted = this.importMappingService.extractClassData(parsedData.rows, parsedData.headers, {
        ...options,
        startRow,
      });

      if (extracted.students.length === 0) {
        throw new BadRequestException('Không tìm thấy sinh viên nào trong file');
      }

      return await this.persistWithDuplicateHandling(
        {
          userId,
          classInfo: extracted.classInfo,
          students: extracted.students,
          sourceType,
          sourceName: file.originalname,
          mappingModeUsed: extracted.mappingModeUsed,
          resolvedMapping: extracted.resolvedMapping,
          stats: extracted.stats,
        },
        options,
      );
    } catch (error: any) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof UnprocessableEntityException
      ) {
        throw error;
      }
      throw new BadRequestException(`Lỗi khi xử lý file: ${error.message}`);
    }
  }

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

      const extracted = this.importMappingService.extractClassData(parsedData.rows, parsedData.headers, {
        ...options,
        startRow,
      });

      if (extracted.students.length === 0) {
        throw new BadRequestException('Không tìm thấy sinh viên nào trong Google Sheet');
      }

      return await this.persistWithDuplicateHandling(
        {
          userId,
          classInfo: extracted.classInfo,
          students: extracted.students,
          sourceType: SourceType.GOOGLE_SHEET,
          sourceName: googleSheetUrl,
          mappingModeUsed: extracted.mappingModeUsed,
          resolvedMapping: extracted.resolvedMapping,
          stats: extracted.stats,
        },
        options,
      );
    } catch (error: any) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof UnprocessableEntityException
      ) {
        throw error;
      }
      throw new BadRequestException(`Lỗi khi import từ Google Sheet: ${error.message}`);
    }
  }
}
