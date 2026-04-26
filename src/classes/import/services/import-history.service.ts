import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ImportAction, ImportChangesSummary, ImportHistoryEntity, SourceType } from '../entities/import-history.entity';
import {
  ImportHistoryItem,
  ImportHistoryListResult,
  ImportHistoryQueryOptions,
  PersistImportPayload,
} from '../import.types';

@Injectable()
export class ImportHistoryService {
  constructor(
    @InjectRepository(ImportHistoryEntity)
    private readonly importHistoryRepository: Repository<ImportHistoryEntity>,
  ) {}

  private normalizeChangesSummary(value: ImportChangesSummary | null | undefined): ImportChangesSummary | null {
    if (!value) return null;

    const classFieldChanges = Array.isArray(value.classFieldChanges)
      ? value.classFieldChanges.map((item) => ({
          field: String(item?.field ?? ''),
          oldValue: item?.oldValue ? String(item.oldValue) : undefined,
          newValue: item?.newValue ? String(item.newValue) : undefined,
        }))
      : [];

    const studentChanges = {
      added: Number(value.studentChanges?.added ?? 0),
      removed: Number(value.studentChanges?.removed ?? 0),
      renamed: Number(value.studentChanges?.renamed ?? 0),
    };

    return {
      classFieldChanges,
      studentChanges,
    };
  }

  async getImportHistoryByUser(userId: string, options?: ImportHistoryQueryOptions): Promise<ImportHistoryListResult> {
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
        action: history.action,
        duplicateDetected: history.duplicateDetected,
        changesSummary: this.normalizeChangesSummary(history.changesSummary),
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

  buildCreatedImportHistory(classId: string, payload: PersistImportPayload): Partial<ImportHistoryEntity> {
    return {
      classId,
      userId: payload.userId,
      action: ImportAction.CREATED,
      duplicateDetected: payload.duplicateDetected ?? false,
      sourceType: payload.sourceType,
      sourceName: payload.sourceName,
      totalCount: payload.students.length,
      columnMapping: {
        mappingModeUsed: payload.mappingModeUsed,
        resolvedMapping: payload.resolvedMapping,
        stats: payload.stats,
      },
      changesSummary: null,
    };
  }

  buildUpdatedImportHistory(
    classId: string,
    payload: PersistImportPayload,
    changesSummary: ImportChangesSummary,
  ): Partial<ImportHistoryEntity> {
    return {
      classId,
      userId: payload.userId,
      action: ImportAction.UPDATED,
      duplicateDetected: true,
      sourceType: payload.sourceType,
      sourceName: payload.sourceName,
      totalCount: payload.students.length,
      columnMapping: {
        mappingModeUsed: payload.mappingModeUsed,
        resolvedMapping: payload.resolvedMapping,
        stats: payload.stats,
        updateMode: 'updated_existing',
      },
      changesSummary,
    };
  }

  async save(payload: Partial<ImportHistoryEntity>): Promise<void> {
    const entity = this.importHistoryRepository.create(payload);
    await this.importHistoryRepository.save(entity);
  }
}
