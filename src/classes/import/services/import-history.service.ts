import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { ImportHistoryEntity, ImportAction, ImportChangesSummary, SourceType } from '../entities/import-history.entity';
import { ImportHistoryClassEntity } from '../entities/import-history-class.entity';
import { ClassEntity } from '../../entities/class.entity';
import {
  ImportHistoryItem,
  ImportHistoryListResult,
  ImportHistoryQueryOptions,
  ImportStats,
  ImportMappingMode,
  ResolvedImportMapping,
} from '../import.types';

@Injectable()
export class ImportHistoryService {
  constructor(
    @InjectRepository(ImportHistoryEntity)
    private readonly importHistoryRepository: Repository<ImportHistoryEntity>,
    @InjectRepository(ImportHistoryClassEntity)
    private readonly importHistoryClassRepository: Repository<ImportHistoryClassEntity>,
    @InjectRepository(ClassEntity)
    private readonly classesRepository: Repository<ClassEntity>,
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

  private formatDateOnly(value: Date | string | null | undefined): string | undefined {
    if (!value) return undefined;

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return undefined;
      return value.toISOString().split('T')[0];
    }

    const raw = value.trim();
    if (!raw) return undefined;

    // PostgreSQL DATE thường trả về YYYY-MM-DD dưới dạng string
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return raw;
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed.toISOString().split('T')[0];
  }

  async getImportHistoryByUser(userId: string, options?: ImportHistoryQueryOptions): Promise<ImportHistoryListResult> {
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(100, Math.max(1, options?.limit ?? 20));

    const queryBuilder = this.importHistoryRepository
      .createQueryBuilder('history')
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

    // Fetch associated classes for each history via import_history_classes
    const historiesWithClasses = await Promise.all(
      histories.map(async (history) => {
        if (!history.classIds || history.classIds.length === 0) {
          return { ...history, classes: [] };
        }
        const classes = await this.classesRepository.findByIds(history.classIds);
        // Sort classes by importOrder to maintain file order
        const sortedClasses = classes.sort((a, b) => a.importOrder - b.importOrder);
        return {
          ...history,
          classes: sortedClasses.map((c) => ({
            id: c.id,
            semester: c.semester,
            courseCode: c.courseCode,
            courseName: c.courseName,
            department: c.department,
            instructor: c.instructor,
            classExamCode: c.classExamCode ?? undefined,
            examDate: this.formatDateOnly(c.examDate),
            examRoom: c.examRoom ?? undefined,
            examTime: c.examTime ?? undefined,
            examShift: c.examShift ?? undefined,
            importOrder: c.importOrder,
          })),
        };
      }),
    );

    const data: ImportHistoryItem[] = historiesWithClasses.map((history) => {
      const mapping = history.columnMapping ?? {};
      const { importedRows, skippedRows } = this.extractStatsFromMapping(history.columnMapping);
      const mappingModeUsed = (mapping as any)?.mappingModeUsed ?? null;

      return {
        id: history.id,
        userId: history.userId,
        action: history.action,
        duplicateDetected: history.duplicateDetected,
        changesSummary: this.normalizeChangesSummary(history.changesSummary),
        sourceType: history.sourceType,
        sourceName: history.sourceName,
        totalCount: history.totalCount,
        importedRows,
        skippedRows,
        mappingModeUsed,
        classIds: history.classIds ?? [],
        classes: history.classes,
        columnMapping: mapping,
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

  /**
   * Build import history entity (partial) for creation
   */
  buildCreatedImportHistory(
    classIds: string[],
    payload: {
      userId: string;
      sourceType: SourceType;
      sourceName: string;
      totalCount: number;
      mappingModeUsed: ImportMappingMode;
      resolvedMapping: ResolvedImportMapping;
      stats: ImportStats;
      action?: ImportAction;
      duplicateDetected?: boolean;
      changesSummary?: ImportChangesSummary | null;
    },
  ): Partial<ImportHistoryEntity> {
    return {
      userId: payload.userId,
      action: payload.action ?? ImportAction.CREATED,
      duplicateDetected: payload.duplicateDetected ?? false,
      sourceType: payload.sourceType,
      sourceName: payload.sourceName,
      totalCount: payload.totalCount,
      classIds,
      columnMapping: {
        mappingModeUsed: payload.mappingModeUsed,
        resolvedMapping: payload.resolvedMapping,
        stats: payload.stats,
      },
      changesSummary: payload.changesSummary ?? null,
    };
  }

  /**
   * Save import history and create junction records
   */
  async saveWithClasses(
    payload: Partial<ImportHistoryEntity>,
    classIds: string[],
    classOrders: Array<{ classId: string; importOrder: number }>,
    manager?: EntityManager,
  ): Promise<void> {
    const historyRepo = manager ? manager.getRepository(ImportHistoryEntity) : this.importHistoryRepository;
    const historyClassRepo = manager ? manager.getRepository(ImportHistoryClassEntity) : this.importHistoryClassRepository;

    // Create import history
    const history = historyRepo.create({
      ...payload,
      classIds,
      createdAt: new Date(),
    });
    const savedHistory = await historyRepo.save(history);

    // Create junction records
    const junctionRecords = classOrders.map((co) =>
      historyClassRepo.create({
        importHistoryId: savedHistory.id,
        classId: co.classId,
        importOrderInFile: co.importOrder,
      }),
    );

    await historyClassRepo.save(junctionRecords);
  }

  /**
   * Simple save (for updates)
   */
  async save(payload: Partial<ImportHistoryEntity>): Promise<void> {
    await this.importHistoryRepository.save(payload);
  }

  async delete(id: string, userId: string): Promise<void> {
    const history = await this.importHistoryRepository.findOne({
      where: { id, userId },
    });

    if (!history) {
      throw new NotFoundException('Không tìm thấy lịch sử import');
    }

    // Cascade: xóa tất cả ClassEntity liên kết (cùng cascade xóa students của chúng)
    if (history.classIds && history.classIds.length > 0) {
      await this.classesRepository.delete(history.classIds);
    }

    // Xóa history (cascade FK sẽ tự xóa import_history_classes)
    await this.importHistoryRepository.remove(history);
  }

  /**
   * Lấy stats từ columnMapping (importedRows, skippedRows)
   */
  extractStatsFromMapping(columnMapping: Record<string, unknown> | null): { importedRows: number; skippedRows: number } {
    const stats = (columnMapping as any)?.stats;
    return {
      importedRows: Number(stats?.importedRows ?? 0),
      skippedRows: Number(stats?.skippedRows ?? 0),
    };
  }
}
