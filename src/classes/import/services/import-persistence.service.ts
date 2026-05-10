import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ClassEntity } from '../../entities/class.entity';
import { StudentEntity } from '../../../students/entities/student.entity';
import { ImportDuplicateService } from './import-duplicate.service';
import { ImportHistoryService } from './import-history.service';
import { DuplicateAction, ExamSessionGroup, ImportClassResult, PersistImportPayload } from '../import.types';
import { ImportAction } from '../entities/import-history.entity';

@Injectable()
export class ImportPersistenceService {
  constructor(
    @InjectRepository(ClassEntity)
    private readonly classesRepository: Repository<ClassEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentsRepository: Repository<StudentEntity>,
    private readonly importDuplicateService: ImportDuplicateService,
    private readonly importHistoryService: ImportHistoryService,
  ) {}

  /**
   * Tạo một bản ghi lớp thi (Exam Session) mới từ dữ liệu nhóm đã được phân loại.
   * 
   * @param group Đối tượng chứa thông tin nhóm (ExamSessionGroup) bao gồm thông tin lớp thi và danh sách sinh viên.
   * @param userId ID của người dùng thực hiện thao tác import.
   * @param manager (Tùy chọn) EntityManager để thực thi trong cùng một transaction.
   * @returns Entity của lớp thi vừa được tạo và lưu vào database.
   */
  public async createExamSessionFromGroup(
    group: ExamSessionGroup,
    userId: string,
    manager?: EntityManager,
  ): Promise<ClassEntity> {
    const classRepo = manager ? manager.getRepository(ClassEntity) : this.classesRepository;
    const classEntity = classRepo.create({
      userId,
      classExamCode: group.examInfo.classExamCode ?? null,
      examDate: group.examInfo.examDate ?? null,
      examRoom: group.examInfo.examRoom ?? null,
      examTime: group.examInfo.examTime ?? null,
      examShift: group.examInfo.examShift ?? null,
      isFallback: group.isFallback,
      semester: group.examInfo.semester,
      courseCode: group.examInfo.courseCode,
      courseName: group.examInfo.courseName,
      department: group.examInfo.department,
      instructor: group.examInfo.instructor,
      importOrder: group.importOrder,
    });

    return await classRepo.save(classEntity);
  }

  /**
   * Tạo các bản ghi sinh viên cho một lớp thi (Exam Session) cụ thể.
   * 
   * @param group Đối tượng chứa thông tin nhóm (ExamSessionGroup) bao gồm danh sách sinh viên.
   * @param classId ID của lớp thi mà các sinh viên này thuộc về.
   * @param manager (Tùy chọn) EntityManager để thực thi trong cùng một transaction.
   * @returns Promise void báo hiệu hoàn tất quá trình lưu trữ.
   */
  public async createStudentsForGroup(
    group: ExamSessionGroup,
    classId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const studentRepo = manager ? manager.getRepository(StudentEntity) : this.studentsRepository;
    const studentEntities = group.students.map((student) =>
      studentRepo.create({
        classId,
        mssv: student.mssv,
        importOrder: student.importOrder,
        fullName: student.fullName,
        classCode: student.classCode,
        className: student.className ?? null,
        gender: student.gender ?? null,
        dob: student.dob ?? null,
        email: student.email ?? null,
        notes: student.notes ?? null,
      }),
    );

    if (studentEntities.length > 0) {
      await studentRepo.save(studentEntities);
    }
  }

  /**
   * Cập nhật thông tin của một lớp thi đã tồn tại và ghi đè danh sách sinh viên.
   * Hành động này sẽ xóa toàn bộ sinh viên cũ của lớp và thêm danh sách sinh viên mới từ nhóm.
   * 
   * @param existingClass Bản ghi lớp thi hiện tại đang có trong cơ sở dữ liệu.
   * @param group Đối tượng chứa thông tin nhóm (ExamSessionGroup) mới sẽ dùng để cập nhật.
   * @param userId ID của người dùng thực hiện cập nhật.
   * @param externalManager (Tùy chọn) EntityManager từ bên ngoài truyền vào để giữ tính toàn vẹn của transaction.
   * @returns Promise void báo hiệu hoàn tất quá trình cập nhật.
   */
  public async updateExamSessionFromGroup(
    existingClass: ClassEntity,
    group: ExamSessionGroup,
    userId: string,
    externalManager?: EntityManager,
  ): Promise<void> {
    const runUpdate = async (manager: EntityManager) => {
      // Update class fields
      await manager.getRepository(ClassEntity).update(
        { id: existingClass.id, userId },
        {
          classExamCode: group.examInfo.classExamCode ?? null,
          examDate: group.examInfo.examDate ?? null,
          examRoom: group.examInfo.examRoom ?? null,
          examTime: group.examInfo.examTime ?? null,
          examShift: group.examInfo.examShift ?? null,
          isFallback: group.isFallback,
          semester: group.examInfo.semester,
          courseCode: group.examInfo.courseCode,
          courseName: group.examInfo.courseName,
          department: group.examInfo.department,
          instructor: group.examInfo.instructor,
          importOrder: group.importOrder,
        },
      );

      // Delete old students
      await manager.getRepository(StudentEntity).delete({ classId: existingClass.id });

      // Create new students
      const studentEntities = group.students.map((student) =>
        manager.getRepository(StudentEntity).create({
          classId: existingClass.id,
          mssv: student.mssv,
          importOrder: student.importOrder,
          fullName: student.fullName,
          classCode: student.classCode,
          className: student.className ?? null,
          gender: student.gender ?? null,
          dob: student.dob ?? null,
          email: student.email ?? null,
          notes: student.notes ?? null,
        }),
      );

      if (studentEntities.length > 0) {
        await manager.getRepository(StudentEntity).save(studentEntities);
      }
    };

    if (externalManager) {
      await runUpdate(externalManager);
    } else {
      await this.classesRepository.manager.transaction(runUpdate);
    }
  }

  /**
   * Lưu trữ danh sách các nhóm lớp thi vào cơ sở dữ liệu, đồng thời xử lý các trường hợp trùng lặp.
   * Nếu có trùng lặp và chưa có hành động xử lý (duplicateAction), hàm sẽ ném ra lỗi ConflictException để yêu cầu người dùng xác nhận.
   * 
   * @param groups Mảng các nhóm lớp thi (ExamSessionGroup) cần lưu trữ.
   * @param payload Dữ liệu payload chứa các thông tin meta (userId, sourceType, sourceName, mapping, stats...) để lưu lịch sử.
   * @param duplicateAction (Tùy chọn) Hành động xử lý khi trùng lặp ('create_new' hoặc 'update_existing').
   * @returns Đối tượng ImportClassResult chứa thông tin kết quả import (số lượng lớp, sinh viên, trạng thái).
   * @throws ConflictException Ném lỗi khi phát hiện trùng lặp mà chưa chỉ định `duplicateAction`, chứa thông tin chi tiết về các lớp trùng để FE hiển thị.
   */
  public async persistImportedExamSessions(
    groups: ExamSessionGroup[],
    payload: PersistImportPayload,
    duplicateAction?: DuplicateAction,
  ): Promise<ImportClassResult> {
    const userId = payload.userId;
    const totalStudents = groups.reduce((sum, g) => sum + g.students.length, 0);

    // Check for duplicates
    const duplicates = await this.importDuplicateService.checkDuplicatesForGroups(groups, userId);

    const hasDuplicates = duplicates.length > 0;
    const classIds: string[] = [];
    const classOrders: Array<{ classId: string; importOrder: number }> = [];

    await this.classesRepository.manager.transaction(async (manager) => {
      if (hasDuplicates) {
        if (duplicateAction === 'create_new') {
          // Create new for all groups (ignore duplicates)
          for (const group of groups) {
            const newClass = await this.createExamSessionFromGroup(group, userId, manager);
            await this.createStudentsForGroup(group, newClass.id, manager);
            classIds.push(newClass.id);
            classOrders.push({ classId: newClass.id, importOrder: group.importOrder });
          }
        } else if (duplicateAction === 'update_existing') {
          // For each group, either update existing or create new
          const duplicateMap = new Map<string, ClassEntity>();
          duplicates.forEach(({ group, existingClass }) => {
            duplicateMap.set(group.groupKey, existingClass);
          });

          for (const group of groups) {
            const existing = duplicateMap.get(group.groupKey);
            if (existing) {
              await this.updateExamSessionFromGroup(existing, group, userId, manager);
              classIds.push(existing.id);
              classOrders.push({ classId: existing.id, importOrder: group.importOrder });
            } else {
              const newClass = await this.createExamSessionFromGroup(group, userId, manager);
              await this.createStudentsForGroup(group, newClass.id, manager);
              classIds.push(newClass.id);
              classOrders.push({ classId: newClass.id, importOrder: group.importOrder });
            }
          }
        } else {
          // Ask action - throw conflict with duplicate info
          const duplicateInfos = await Promise.all(duplicates.map(async ({ group, existingClass }) => {
            const info = this.importDuplicateService.buildDuplicateInfo(existingClass, group);
            const diff = await this.importDuplicateService.buildImportChangesSummary(existingClass, group);
            return { ...info, diff };
          }));

          throw new ConflictException({
            code: 'CLASS_ALREADY_EXISTS',
            message: 'Phát hiện lớp thi trùng. Bạn muốn tạo mới hay cập nhật?',
            duplicates: duplicateInfos,
            totalStudents,
          });
        }
      } else {
        // No duplicates, create all new
        for (const group of groups) {
          const newClass = await this.createExamSessionFromGroup(group, userId, manager);
          await this.createStudentsForGroup(group, newClass.id, manager);
          classIds.push(newClass.id);
          classOrders.push({ classId: newClass.id, importOrder: group.importOrder });
        }
      }

      const isUpdateAction = hasDuplicates && duplicateAction === 'update_existing';
      const actionEnum = isUpdateAction ? ImportAction.UPDATED : ImportAction.CREATED;
      
      let aggregatedChangesSummary: import('../entities/import-history.entity').ImportChangesSummary | null = null;
      if (isUpdateAction) {
        const tempSummary: import('../entities/import-history.entity').ImportChangesSummary = {
          classFieldChanges: [],
          studentChanges: { added: 0, removed: 0, renamed: 0 }
        };
        for (const { group, existingClass } of duplicates) {
          const summary = await this.importDuplicateService.buildImportChangesSummary(existingClass, group);
          tempSummary.classFieldChanges.push(...summary.classFieldChanges);
          tempSummary.studentChanges.added += summary.studentChanges.added;
          tempSummary.studentChanges.removed += summary.studentChanges.removed;
          tempSummary.studentChanges.renamed += summary.studentChanges.renamed;
        }
        aggregatedChangesSummary = tempSummary;
      }

      // Create import history (after all classes created)
      const historyPayload = this.importHistoryService.buildCreatedImportHistory(
        classIds,
        {
          userId: payload.userId,
          sourceType: payload.sourceType,
          sourceName: payload.sourceName,
          totalCount: totalStudents,
          mappingModeUsed: payload.mappingModeUsed!,
          resolvedMapping: payload.resolvedMapping!,
          stats: payload.stats!,
          action: actionEnum,
          duplicateDetected: hasDuplicates,
          changesSummary: aggregatedChangesSummary,
        },
      );
      await this.importHistoryService.saveWithClasses(historyPayload, classIds, classOrders, manager);
    });

    const action = hasDuplicates && duplicateAction === 'update_existing' ? 'updated' : 'created';

    return {
      success: true,
      classIds,
      totalStudents,
      message: `Đã ${action === 'created' ? 'import' : 'cập nhật'} ${classIds.length} lớp thi với ${totalStudents} sinh viên`,
      action,
      mappingModeUsed: payload.mappingModeUsed!,
      resolvedMapping: payload.resolvedMapping!,
      stats: payload.stats!,
      duplicates: hasDuplicates && duplicateAction !== 'create_new' ? duplicates.map(d => this.importDuplicateService.buildDuplicateInfo(d.existingClass, d.group)) : undefined,
    };
  }
}
