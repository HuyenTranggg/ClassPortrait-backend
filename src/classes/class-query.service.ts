import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Class, ClassWithStudents, Student } from '../common/types';
import { signPhotoUrl } from '../common/utils/photo-signature.util';
import { ClassEntity } from './entities/class.entity';
import { StudentEntity } from '../students/entities/student.entity';

@Injectable()
export class ClassQueryService {
  constructor(
    @InjectRepository(ClassEntity)
    private readonly classesRepository: Repository<ClassEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentsRepository: Repository<StudentEntity>,
  ) {}

  private buildStudentPhotoUrl(mssv: string, classId: string): string {
    const port = process.env.PORT ?? '3000';
    const configuredBaseUrl = process.env.BACKEND_BASE_URL?.trim();
    const baseUrl = configuredBaseUrl && configuredBaseUrl.length > 0 ? configuredBaseUrl : `http://localhost:${port}`;
    const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7;
    const signature = signPhotoUrl(mssv, classId, expiresAt);
    return `${baseUrl.replace(/\/$/, '')}/students/${encodeURIComponent(mssv)}/photo?classId=${encodeURIComponent(classId)}&exp=${expiresAt}&sig=${signature}`;
  }

  async findAll(userId: string): Promise<Class[]> {
    const entities = await this.classesRepository.find({
      where: { userId },
      order: { createdAt: 'DESC', importOrder: 'ASC' },
    });

    return entities.map<Class>((entity) => ({
      id: entity.id,
      classExamCode: entity.classExamCode ?? undefined,
      examDate: entity.examDate ?? undefined,
      examRoom: entity.examRoom ?? undefined,
      examTime: entity.examTime ?? undefined,
      examShift: entity.examShift ?? undefined,
      semester: entity.semester,
      courseCode: entity.courseCode,
      courseName: entity.courseName,
      department: entity.department,
      instructor: entity.instructor,
      importOrder: entity.importOrder,
      createdAt: entity.createdAt,
    }));
  }

  async findAllWithStudentCount(userId: string): Promise<Array<Class & { studentCount: number; classCodes: string[] }>> {
    // Lấy tất cả lớp với số sinh viên
    const rows = await this.classesRepository
      .createQueryBuilder('c')
      .leftJoin('c.students', 's')
      .where('c.userId = :userId', { userId })
      .select('c.id', 'id')
      .addSelect('c.classExamCode', 'classExamCode')
      .addSelect('c.examDate', 'examDate')
      .addSelect('c.examRoom', 'examRoom')
      .addSelect('c.examTime', 'examTime')
      .addSelect('c.examShift', 'examShift')
      .addSelect('c.semester', 'semester')
      .addSelect('c.courseCode', 'courseCode')
      .addSelect('c.courseName', 'courseName')
      .addSelect('c.department', 'department')
      .addSelect('c.instructor', 'instructor')
      .addSelect('c.importOrder', 'importOrder')
      .addSelect('c.createdAt', 'createdAt')
      .addSelect('COUNT(s.id)', 'studentCount')
      .groupBy('c.id')
      .orderBy('c.createdAt', 'DESC')
      .addOrderBy('c.importOrder', 'ASC')
      .getRawMany<{
        id: string;
        classExamCode: string | null;
        examDate: Date | null;
        examRoom: string | null;
        examTime: string | null;
        examShift: string | null;
        semester: string;
        courseCode: string;
        courseName: string;
        department: string;
        instructor: string;
        importOrder: number;
        createdAt: Date;
        studentCount: string;
      }>();

    if (rows.length === 0) return [];

    // Lấy distinct classCodes của mỗi lớp
    const classIds = rows.map((r) => r.id);
    const codeRows = await this.studentsRepository
      .createQueryBuilder('s')
      .select('s.classId', 'classId')
      .addSelect('s.classCode', 'classCode')
      .where('s.classId IN (:...classIds)', { classIds })
      .distinct(true)
      .getRawMany<{ classId: string; classCode: string }>();

    const codeMap = new Map<string, Set<string>>();
    for (const { classId, classCode } of codeRows) {
      if (!codeMap.has(classId)) codeMap.set(classId, new Set());
      codeMap.get(classId)!.add(classCode);
    }

    return rows.map((row) => ({
      id: row.id,
      classExamCode: row.classExamCode ?? undefined,
      examDate: row.examDate ?? undefined,
      examRoom: row.examRoom ?? undefined,
      examTime: row.examTime ?? undefined,
      examShift: row.examShift ?? undefined,
      semester: row.semester,
      courseCode: row.courseCode,
      courseName: row.courseName,
      department: row.department,
      instructor: row.instructor,
      importOrder: row.importOrder,
      createdAt: row.createdAt,
      studentCount: Number(row.studentCount),
      classCodes: Array.from(codeMap.get(row.id) ?? []).sort(),
    }));
  }


  async findOne(id: string, userId: string): Promise<Class> {
    const entity = await this.classesRepository.findOne({ where: { id, userId } });
    if (!entity) {
      throw new NotFoundException(`Không tìm thấy lớp với ID ${id} thuộc về người dùng hiện tại`);
    }

    return {
      id: entity.id,
      classExamCode: entity.classExamCode ?? undefined,
      examDate: entity.examDate ?? undefined,
      examRoom: entity.examRoom ?? undefined,
      examTime: entity.examTime ?? undefined,
      examShift: entity.examShift ?? undefined,
      semester: entity.semester,
      courseCode: entity.courseCode,
      courseName: entity.courseName,
      department: entity.department,
      instructor: entity.instructor,
      importOrder: entity.importOrder,
      createdAt: entity.createdAt,
    };
  }

  async findOneWithStudents(id: string, userId: string): Promise<ClassWithStudents> {
    const classItem = await this.findOne(id, userId);
    const students = await this.getStudents(id, userId);
    return {
      ...classItem,
      students,
    };
  }

  async getStudents(classId: string, userId: string): Promise<Student[]> {
    await this.findOne(classId, userId);

    const entities = await this.studentsRepository.find({
      where: { classId },
      order: { importOrder: 'ASC' },
    });

    return entities.map<Student>((entity) => ({
      id: entity.id,
      mssv: entity.mssv,
      fullName: entity.fullName,
      photoStatus: entity.photoStatus,
      importOrder: entity.importOrder,
      classCode: entity.classCode,
      className: entity.className ?? undefined,
      gender: entity.gender ?? undefined,
      dob: entity.dob ?? undefined,
      email: entity.email ?? undefined,
      notes: entity.notes ?? undefined,
      photoUrl: this.buildStudentPhotoUrl(entity.mssv, entity.classId),
    }));
  }

  async remove(id: string, userId: string): Promise<{ success: boolean; message: string }> {
    const classEntity = await this.classesRepository.findOne({ where: { id, userId } });
    if (!classEntity) {
      throw new NotFoundException(`Không tìm thấy lớp với ID ${id} thuộc về người dùng hiện tại`);
    }

    try {
      await this.classesRepository.remove(classEntity);
      return {
        success: true,
        message: 'Da xoa lop thanh cong',
      };
    } catch {
      throw new ForbiddenException('Không thể xóa lớp học');
    }
  }
}
