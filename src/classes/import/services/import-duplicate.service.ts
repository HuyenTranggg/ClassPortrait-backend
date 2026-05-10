import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassEntity } from '../../entities/class.entity';
import { StudentEntity } from '../../../students/entities/student.entity';
import { RawStudentData, ExamSessionGroup, ImportDuplicateInfo } from '../import.types';
import { ImportChangesSummary } from '../entities/import-history.entity';

@Injectable()
export class ImportDuplicateService {
  constructor(
    @InjectRepository(ClassEntity)
    private readonly classesRepository: Repository<ClassEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentsRepository: Repository<StudentEntity>,
  ) {}

  private toFormattedDateString(value: Date | string | null | undefined): string {
    if (!value) return '';

    let date: Date;
    if (value instanceof Date) {
      date = value;
    } else {
      const raw = value.trim();
      if (!raw) return '';
      date = new Date(raw);
    }

    if (Number.isNaN(date.getTime())) return '';

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
  }

  /**
   * Find duplicate exam session based on grouping criteria (3-tier priority)
   * Returns the existing class (lớp thi) if found, null otherwise.
   */
  async findDuplicateExamSession(
    group: ExamSessionGroup,
    userId: string,
  ): Promise<ClassEntity | null> {
    const { examInfo, isFallback } = group;
    const { semester, courseCode, classExamCode, examDate, examRoom, examTime, examShift } = examInfo;

    let query = this.classesRepository.createQueryBuilder('c')
      .where('c.user_id = :userId', { userId })
      .andWhere('c.semester = :semester', { semester })
      .andWhere('c.course_code = :courseCode', { courseCode });

    if (isFallback) {
      // Fallback: group by semester + course + is_fallback + check if any student has same classCode
      query
        .andWhere('c.is_fallback = :isFallback', { isFallback: true })
        .leftJoin('c.students', 's')
        .andWhere('s.class_code = :classCode', { classCode: group.students[0]?.classCode || '' })
        .groupBy('c.id')
        .having('COUNT(s.id) > 0');
    } else if (classExamCode) {
      // Priority 1: classExamCode + semester (course is also matched)
      query.andWhere('c.class_exam_code = :classExamCode', { classExamCode });
    } else {
      // Priority 2: examDate + examRoom + (examTime or examShift)
      if (!examDate || !examRoom) return null;

      const dateStr = `${examDate.getFullYear()}-${String(examDate.getMonth() + 1).padStart(2, '0')}-${String(examDate.getDate()).padStart(2, '0')}`;
      query
        .andWhere('c.exam_date = :dateStr', { dateStr })
        .andWhere('c.exam_room = :examRoom', { examRoom });

      if (examTime) {
        const parts = examTime.split(':');
        const timeVariations = [examTime];
        
        if (parts.length >= 2) {
          const h2 = parts[0].padStart(2, '0');
          const h1 = parseInt(parts[0], 10).toString();
          const m = parts[1].padStart(2, '0');
          const s = parts.length >= 3 ? parts[2].padStart(2, '0') : '00';
          
          timeVariations.push(`${h2}:${m}:${s}`);
          timeVariations.push(`${h2}:${m}`);
          timeVariations.push(`${h1}:${m}:${s}`);
          timeVariations.push(`${h1}:${m}`);
          
          // Tương thích ngược: File Excel cũ lưu giờ thi dưới dạng phân số của ngày (VD: 16h = 0.6666666666666666)
          const hours = parseInt(parts[0], 10);
          const minutes = parseInt(parts[1], 10);
          const seconds = parts.length >= 3 ? parseInt(parts[2], 10) : 0;
          const totalSeconds = hours * 3600 + minutes * 60 + seconds;
          const floatTime = totalSeconds / 86400; // 24 * 60 * 60
          timeVariations.push(floatTime.toString());
        }
        query.andWhere('c.exam_time IN (:...timeVariations)', { timeVariations: [...new Set(timeVariations)] });
      } else if (examShift) {
        const shiftVariations = [examShift];
        if (examShift.includes('.')) shiftVariations.push(examShift.replace('.', ','));
        else if (examShift.includes(',')) shiftVariations.push(examShift.replace(',', '.'));
        
        query.andWhere('c.exam_shift IN (:...shiftVariations)', { shiftVariations: [...new Set(shiftVariations)] });
      } else {
        // Neither examTime nor examShift? Should not happen if isFallback=false
        return null;
      }
    }

    const existing = await query.getOne();
    return existing ?? null;
  }

  /**
   * Check duplicates for all groups
   * Returns array of { group, existingClass }
   */
  async checkDuplicatesForGroups(
    groups: ExamSessionGroup[],
    userId: string,
  ): Promise<Array<{ group: ExamSessionGroup; existingClass: ClassEntity }>> {
    const duplicates: Array<{ group: ExamSessionGroup; existingClass: ClassEntity }> = [];

    for (const group of groups) {
      const existing = await this.findDuplicateExamSession(group, userId);
      if (existing) {
        // Load students to get studentCount and classCode
        existing.students = await this.studentsRepository.find({
          where: { classId: existing.id },
          order: { importOrder: 'ASC' }
        });
        duplicates.push({ group, existingClass: existing });
      }
    }

    return duplicates;
  }

  /**
   * Build duplicate info for API response
   */
  buildDuplicateInfo(
    existingClass: ClassEntity,
    group: ExamSessionGroup,
  ): ImportDuplicateInfo {
    return {
      classExamCode: existingClass.classExamCode ?? undefined,
      examDate: existingClass.examDate ?? undefined,
      examRoom: existingClass.examRoom ?? undefined,
      examTime: existingClass.examTime ?? undefined,
      examShift: existingClass.examShift ?? undefined,
      semester: existingClass.semester,
      courseCode: existingClass.courseCode,
      courseName: existingClass.courseName,
      existingClassId: existingClass.id,
      studentCount: existingClass.students?.length ?? 0,
      isFallback: existingClass.isFallback,
      classCode: existingClass.students?.[0]?.classCode,
    };
  }

  /**
   * Build summary of changes between existing class and new group
   */
  async buildImportChangesSummary(
    existingClass: ClassEntity,
    group: ExamSessionGroup,
  ): Promise<ImportChangesSummary> {
    const classFieldChanges: Array<{ field: string; oldValue?: string; newValue?: string }> = [];

    // Compare class fields
    const compareFields: Array<{ field: string; oldVal?: string; newVal?: string }> = [
      { field: 'classExamCode', oldVal: existingClass.classExamCode ?? '', newVal: group.examInfo.classExamCode ?? '' },
      { field: 'examDate', oldVal: this.toFormattedDateString(existingClass.examDate), newVal: this.toFormattedDateString(group.examInfo.examDate) },
      { field: 'examRoom', oldVal: existingClass.examRoom ?? '', newVal: group.examInfo.examRoom ?? '' },
      { field: 'examTime', oldVal: existingClass.examTime ?? '', newVal: group.examInfo.examTime ?? '' },
      { field: 'examShift', oldVal: existingClass.examShift ?? '', newVal: group.examInfo.examShift ?? '' },
      { field: 'semester', oldVal: existingClass.semester, newVal: group.examInfo.semester },
      { field: 'courseCode', oldVal: existingClass.courseCode, newVal: group.examInfo.courseCode },
      { field: 'courseName', oldVal: existingClass.courseName, newVal: group.examInfo.courseName },
      { field: 'department', oldVal: existingClass.department, newVal: group.examInfo.department },
      { field: 'instructor', oldVal: existingClass.instructor, newVal: group.examInfo.instructor },
      { field: 'isFallback', oldVal: String(existingClass.isFallback), newVal: String(group.isFallback) },
    ];

    for (const { field, oldVal, newVal } of compareFields) {
      if (oldVal !== newVal) {
        classFieldChanges.push({
          field,
          oldValue: oldVal || undefined,
          newValue: newVal || undefined,
        });
      }
    }

    // Compare students
    const existingStudents = await this.studentsRepository.find({
      where: { classId: existingClass.id },
    });
    const oldMap = new Map(
      existingStudents.map((s) => [s.mssv, { className: s.className, classCode: s.classCode }]),
    );
    const newMap = new Map(
      group.students.map((s) => [s.mssv, { className: s.className, classCode: s.classCode }]),
    );

    let added = 0;
    let removed = 0;
    let updated = 0;

    for (const [mssv, newData] of newMap.entries()) {
      if (!oldMap.has(mssv)) {
        added += 1;
      } else {
        const oldData = oldMap.get(mssv)!;
        if (oldData.classCode !== newData.classCode || oldData.className !== newData.className) {
          updated += 1;
        }
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
        renamed: updated,
      },
    };
  }
}
