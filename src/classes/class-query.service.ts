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

  async findAll(): Promise<Class[]> {
    const entities = await this.classesRepository.find({ order: { createdAt: 'DESC' } });

    return entities.map<Class>((entity) => ({
      id: entity.id,
      classCode: entity.classCode,
      courseCode: entity.courseCode ?? undefined,
      courseName: entity.courseName ?? undefined,
      semester: entity.semester ?? undefined,
      department: entity.department ?? undefined,
      classType: entity.classType ?? undefined,
      instructor: entity.instructor ?? undefined,
      createdAt: entity.createdAt,
    }));
  }

  async findAllWithStudentCount(userId: string): Promise<Array<Class & { studentCount: number }>> {
    const rows = await this.classesRepository
      .createQueryBuilder('c')
      .leftJoin('c.students', 's')
      .where('c.userId = :userId', { userId })
      .select('c.id', 'id')
      .addSelect('c.classCode', 'classCode')
      .addSelect('c.courseCode', 'courseCode')
      .addSelect('c.courseName', 'courseName')
      .addSelect('c.semester', 'semester')
      .addSelect('c.department', 'department')
      .addSelect('c.classType', 'classType')
      .addSelect('c.instructor', 'instructor')
      .addSelect('c.createdAt', 'createdAt')
      .addSelect('COUNT(s.id)', 'studentCount')
      .groupBy('c.id')
      .orderBy('c.createdAt', 'DESC')
      .getRawMany<{
        id: string;
        classCode: string;
        courseCode: string | null;
        courseName: string | null;
        semester: string | null;
        department: string | null;
        classType: string | null;
        instructor: string | null;
        createdAt: Date;
        studentCount: string;
      }>();

    return rows.map((row) => ({
      id: row.id,
      classCode: row.classCode,
      courseCode: row.courseCode ?? undefined,
      courseName: row.courseName ?? undefined,
      semester: row.semester ?? undefined,
      department: row.department ?? undefined,
      classType: row.classType ?? undefined,
      instructor: row.instructor ?? undefined,
      createdAt: row.createdAt,
      studentCount: Number(row.studentCount),
    }));
  }

  async findOne(id: string, userId: string): Promise<Class> {
    const entity = await this.classesRepository.findOne({ where: { id, userId } });
    if (!entity) {
      throw new NotFoundException(`Không tìm thấy lớp với ID ${id} thuộc về người dùng hiện tại`);
    }

    return {
      id: entity.id,
      classCode: entity.classCode,
      courseCode: entity.courseCode ?? undefined,
      courseName: entity.courseName ?? undefined,
      semester: entity.semester ?? undefined,
      department: entity.department ?? undefined,
      classType: entity.classType ?? undefined,
      instructor: entity.instructor ?? undefined,
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
      mssv: entity.mssv,
      name: entity.fullName ?? undefined,
      photoUrl: this.buildStudentPhotoUrl(entity.mssv, entity.classId),
      photoStatus: entity.photoStatus,
      importOrder: entity.importOrder,
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
