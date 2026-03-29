import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ClassEntity } from '../../entities/class.entity';
import { StudentEntity } from '../../entities/student.entity';
import { Student } from '../../common/types';
import { ImportChangesSummary } from '../../entities/import-history.entity';
import { ClassImportInfo, DuplicateAction, ImportDuplicateDecisionPayload } from './import.types';

@Injectable()
export class ImportDuplicateService {
  constructor(
    @InjectRepository(ClassEntity)
    private readonly classesRepository: Repository<ClassEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentsRepository: Repository<StudentEntity>,
  ) {}

  private cleanCellValue(value: unknown): string {
    return String(value ?? '').trim();
  }

  async findDuplicateClassByIdentity(userId: string, classInfo: ClassImportInfo): Promise<ClassEntity | null> {
    const classCode = this.cleanCellValue(classInfo.classCode);
    const semester = this.cleanCellValue(classInfo.semester);

    const whereClause = semester
      ? { userId, classCode, semester }
      : { userId, classCode, semester: IsNull() };

    const candidates = await this.classesRepository.find({
      where: whereClause,
      order: { createdAt: 'DESC' },
    });

    if (candidates.length === 0) return null;
    return candidates[0] ?? null;
  }

  async buildImportChanges(
    existingClass: ClassEntity,
    classInfo: ClassImportInfo,
    newStudents: Student[],
  ): Promise<ImportChangesSummary> {
    const classFieldChanges: Array<{ field: string; oldValue?: string; newValue?: string }> = [];
    const fields: Array<keyof ClassImportInfo> = [
      'classCode',
      'courseCode',
      'courseName',
      'semester',
      'department',
      'classType',
      'instructor',
    ];

    for (const field of fields) {
      const oldValue = this.cleanCellValue((existingClass as any)[field] ?? '');
      const newValue = this.cleanCellValue((classInfo as any)[field] ?? '');
      if (oldValue !== newValue) {
        classFieldChanges.push({
          field,
          oldValue: oldValue || undefined,
          newValue: newValue || undefined,
        });
      }
    }

    const existingStudents = await this.studentsRepository.find({ where: { classId: existingClass.id } });
    const oldMap = new Map(existingStudents.map((student) => [student.mssv, this.cleanCellValue(student.fullName ?? '')]));
    const newMap = new Map(newStudents.map((student) => [student.mssv, this.cleanCellValue(student.name ?? '')]));

    let added = 0;
    let removed = 0;
    let renamed = 0;

    for (const [mssv, newName] of newMap.entries()) {
      if (!oldMap.has(mssv)) {
        added += 1;
        continue;
      }
      if (oldMap.get(mssv) !== newName) {
        renamed += 1;
      }
    }

    for (const mssv of oldMap.keys()) {
      if (!newMap.has(mssv)) {
        removed += 1;
      }
    }

    return {
      classFieldChanges,
      studentChanges: {
        added,
        removed,
        renamed,
      },
    };
  }

  async buildDuplicateDecisionPayload(
    code: ImportDuplicateDecisionPayload['code'],
    duplicateClass: ClassEntity,
    classInfo: ClassImportInfo,
    students: Student[],
  ): Promise<ImportDuplicateDecisionPayload> {
    const changes = await this.buildImportChanges(duplicateClass, classInfo, students);
    const studentCount = await this.studentsRepository.count({ where: { classId: duplicateClass.id } });

    return {
      code,
      message:
        code === 'CLASS_ALREADY_EXISTS'
          ? 'Lớp đã tồn tại. Bạn muốn cập nhật lớp hiện có hay vẫn tạo lớp mới?'
          : 'Vui lòng xác nhận cập nhật lớp hiện có sau khi xem thay đổi.',
      duplicateClass: {
        id: duplicateClass.id,
        classCode: duplicateClass.classCode,
        courseCode: duplicateClass.courseCode ?? undefined,
        courseName: duplicateClass.courseName ?? undefined,
        semester: duplicateClass.semester ?? undefined,
        department: duplicateClass.department ?? undefined,
        classType: duplicateClass.classType ?? undefined,
        instructor: duplicateClass.instructor ?? undefined,
        studentCount,
        createdAt: duplicateClass.createdAt,
      },
      changes,
      nextActions: ['create_new', 'update_existing'] satisfies DuplicateAction[],
    };
  }
}
