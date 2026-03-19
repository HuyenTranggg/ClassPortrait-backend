// backend/src/classes/classes.service.ts

import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import csvParser from 'csv-parser';
import { Readable } from 'stream';
import { Class, Student, ClassWithStudents } from '../common/types';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassEntity } from '../entities/class.entity';
import { StudentEntity } from '../entities/student.entity';
import { ImportHistoryEntity, SourceType } from '../entities/import-history.entity';
import { signPhotoUrl } from '../common/utils/photo-signature.util';

@Injectable()
export class ClassesService {
  constructor(
    @InjectRepository(ClassEntity)
    private readonly classesRepository: Repository<ClassEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentsRepository: Repository<StudentEntity>,
    @InjectRepository(ImportHistoryEntity)
    private readonly importHistoryRepository: Repository<ImportHistoryEntity>,
  ) {}

  private buildStudentPhotoUrl(mssv: string, classId: string): string {
    const port = process.env.PORT ?? '3000';
    const configuredBaseUrl = process.env.BACKEND_BASE_URL?.trim();
    const baseUrl = configuredBaseUrl && configuredBaseUrl.length > 0 ? configuredBaseUrl : `http://localhost:${port}`;
    const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7;
    const signature = signPhotoUrl(mssv, classId, expiresAt);
    return `${baseUrl.replace(/\/$/, '')}/students/${encodeURIComponent(mssv)}/photo?classId=${encodeURIComponent(classId)}&exp=${expiresAt}&sig=${signature}`;
  }

  /**
   * Lấy tất cả các lớp (không bao gồm danh sách sinh viên)
   */
  async findAll(): Promise<Class[]> {
    const entities = await this.classesRepository.find({
      order: { createdAt: 'DESC' },
    });

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

  /**
   * Lấy tất cả các lớp kèm số lượng sinh viên
   */
  async findAllWithStudentCount(): Promise<Array<Class & { studentCount: number }>> {
    const rows = await this.classesRepository
      .createQueryBuilder('c')
      .leftJoin('c.students', 's')
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

  /**
   * Lấy thông tin một lớp theo ID (không bao gồm danh sách sinh viên)
   */
  async findOne(id: string): Promise<Class> {
    const entity = await this.classesRepository.findOne({ where: { id } });

    if (!entity) {
      throw new NotFoundException(`Không tìm thấy lớp với ID ${id}`);
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

  /**
   * Lấy thông tin một lớp kèm danh sách sinh viên
   */
  async findOneWithStudents(id: string): Promise<ClassWithStudents> {
    const classItem = await this.findOne(id);
    const students = await this.getStudents(id);
    return {
      ...classItem,
      students,
    };
  }

  /**
   * Lấy danh sách sinh viên của một lớp
   */
  async getStudents(classId: string): Promise<Student[]> {
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

  /**
   * Xóa một lớp và tất cả quan hệ với sinh viên
   */
  async remove(id: string, userId: string): Promise<{ success: boolean; message: string }> {
    const classEntity = await this.classesRepository.findOne({ where: { id, userId } });
    if (!classEntity) {
      throw new NotFoundException(`Không tìm thấy lớp với ID ${id} thuộc về người dùng hiện tại`);
    }

    try {
      await this.classesRepository.remove(classEntity);
      return {
        success: true,
        message: `Đã xóa lớp thành công`,
      };
    } catch {
      throw new ForbiddenException('Không thể xóa lớp học');
    }
  }

  /**
   * Import lớp học từ file (Excel, CSV, hoặc JSON)
   */
  async importClass(
    file: Express.Multer.File,
    userId: string,
  ): Promise<{ success: boolean; classId: string; message: string }> {
    if (!file) {
      throw new BadRequestException('Không có file nào được upload');
    }

    try {
      // Xử lý theo loại file
      const fileExtension = file.originalname.split('.').pop()?.toLowerCase();

      let data: any[];
      switch (fileExtension) {
        case 'xlsx':
        case 'xls':
          data = await this.parseExcelFile(file.buffer);
          break;
        case 'csv':
          data = await this.parseCsvFile(file.buffer);
          break;
        case 'json':
          data = this.parseJsonFile(file.buffer);
          break;
        default:
          throw new BadRequestException('Định dạng file không được hỗ trợ. Vui lòng sử dụng .xlsx, .csv hoặc .json');
      }

      if (data.length === 0) {
        throw new BadRequestException('File không chứa dữ liệu');
      }

      // Trích xuất thông tin lớp và danh sách sinh viên
      const { classInfo, students } = this.extractClassData(data);

      if (students.length === 0) {
        throw new BadRequestException('Không tìm thấy sinh viên nào trong file');
      }

      try {
        const classEntity = this.classesRepository.create({
          userId,
          classCode: classInfo.classCode,
          courseCode: classInfo.courseCode ?? null,
          courseName: classInfo.courseName ?? null,
          semester: classInfo.semester ?? null,
          department: classInfo.department ?? null,
          classType: classInfo.classType ?? null,
          instructor: classInfo.instructor ?? null,
        });

        const savedClass = await this.classesRepository.save(classEntity);

        const studentEntities = students.map((s, index) =>
          this.studentsRepository.create({
            classId: savedClass.id,
            mssv: s.mssv,
            importOrder: index,
            fullName: (s as any).name ?? null,
          }),
        );

        if (studentEntities.length > 0) {
          await this.studentsRepository.save(studentEntities);
        }

        const history = this.importHistoryRepository.create({
          classId: savedClass.id,
          userId,
          sourceType: SourceType.EXCEL,
          sourceName: file.originalname,
          totalCount: students.length,
          columnMapping: {},
        });

        await this.importHistoryRepository.save(history);

        return {
          success: true,
          classId: savedClass.id,
          message: `Đã import thành công lớp "${classInfo.classCode}" với ${students.length} sinh viên`,
        };
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new BadRequestException(`Lỗi khi xử lý file: ${error.message}`);
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Lỗi khi xử lý file: ${error.message}`);
    }
  }

  /**
   * Xử lý file Excel
   */
  private async parseExcelFile(buffer: Buffer): Promise<any[]> {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    return data;
  }

  /**
   * Xử lý file CSV
   */
  private async parseCsvFile(buffer: Buffer): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const results: any[] = [];
      const stream = Readable.from(buffer);

      stream
        .pipe(csvParser())
        .on('data', (data) => results.push(data))
        .on('end', () => resolve(results))
        .on('error', (error) => reject(error));
    });
  }

  /**
   * Xử lý file JSON
   */
  private parseJsonFile(buffer: Buffer): any[] {
    const jsonString = buffer.toString('utf-8');
    const data = JSON.parse(jsonString);
    return Array.isArray(data) ? data : [data];
  }

  /**
   * Trích xuất thông tin lớp và danh sách sinh viên từ dữ liệu
   */
  private extractClassData(data: any[]): {
    classInfo: {
      classCode: string;
      courseCode?: string;
      courseName?: string;
      semester?: string;
      department?: string;
      classType?: string;
      instructor?: string;
    };
    students: Student[];
  } {
    const firstRow = data[0];

    // Tìm cột mã lớp (BẮT BUỘC)
    const classCodeKey = Object.keys(firstRow).find((key) => {
      const lowerKey = key.toLowerCase().trim();
      return (
        lowerKey === 'mã lớp' ||
        lowerKey === 'ma lop' ||
        lowerKey === 'class code' ||
        lowerKey === 'mã lớp học' ||
        lowerKey.includes('mã lớp')
      );
    });

    // Tìm cột mã học phần (optional)
    const courseCodeKey = Object.keys(firstRow).find((key) => {
      const lowerKey = key.toLowerCase().trim();
      return (
        lowerKey === 'mã học phần' ||
        lowerKey === 'ma hoc phan' ||
        lowerKey === 'course code' ||
        lowerKey === 'mã hp' ||
        lowerKey.includes('mã học phần')
      );
    });

    // Tìm cột tên học phần (optional)
    const courseNameKey = Object.keys(firstRow).find((key) => {
      const lowerKey = key.toLowerCase().trim();
      return (
        lowerKey === 'tên học phần' ||
        lowerKey === 'ten hoc phan' ||
        lowerKey === 'course name' ||
        lowerKey === 'tên hp' ||
        lowerKey === 'môn học' ||
        lowerKey === 'mon hoc' ||
        lowerKey.includes('tên học phần') ||
        lowerKey.includes('tên môn')
      );
    });

    // Tìm cột học kỳ (optional)
    const semesterKey = Object.keys(firstRow).find((key) => {
      const lowerKey = key.toLowerCase().trim();
      return (
        lowerKey === 'học kỳ' ||
        lowerKey === 'hoc ky' ||
        lowerKey === 'semester' ||
        lowerKey === 'học kì' ||
        lowerKey === 'hoc ki' ||
        lowerKey.includes('học kỳ') ||
        lowerKey.includes('học kì')
      );
    });

    // Tìm cột đơn vị giảng dạy (optional)
    const departmentKey = Object.keys(firstRow).find((key) => {
      const lowerKey = key.toLowerCase().trim();
      return (
        lowerKey === 'đv giảng dạy' ||
        lowerKey === 'đơn vị' ||
        lowerKey === 'đơn vị giảng dạy' ||
        lowerKey === 'don vi giang day' ||
        lowerKey === 'department' ||
        lowerKey === 'khoa' ||
        lowerKey === 'viện' ||
        lowerKey.includes('đơn vị') ||
        lowerKey.includes('khoa')
      );
    });

    // Tìm cột loại lớp (optional)
    const classTypeKey = Object.keys(firstRow).find((key) => {
      const lowerKey = key.toLowerCase().trim();
      return (
        lowerKey === 'loại lớp' ||
        lowerKey === 'loai lop' ||
        lowerKey === 'class type' ||
        lowerKey === 'type' ||
        lowerKey === 'loại' ||
        lowerKey.includes('loại lớp') ||
        lowerKey.includes('loại')
      );
    });

    // Tìm cột giảng viên (optional)
    const instructorKey = Object.keys(firstRow).find((key) => {
      const lowerKey = key.toLowerCase().trim();
      return (
        lowerKey === 'giảng viên' ||
        lowerKey === 'giang vien' ||
        lowerKey === 'gv giảng dạy' ||
        lowerKey === 'instructor' ||
        lowerKey === 'teacher' ||
        lowerKey === 'giáo viên' ||
        lowerKey === 'giao vien' ||
        lowerKey.includes('giảng viên') ||
        lowerKey.includes('giáo viên')
      );
    });

    // Tìm cột MSSV
    const mssvKey = Object.keys(firstRow).find((key) => {
      const lowerKey = key.toLowerCase().trim();
      return lowerKey === 'mssv' || lowerKey === 'mã số sinh viên' || lowerKey.includes('mssv');
    });

    if (!mssvKey) {
      throw new BadRequestException(
        'Không tìm thấy cột MSSV trong file. Vui lòng đảm bảo có cột tên "MSSV", "mssv" hoặc "Mã số sinh viên"',
      );
    }

    // Tìm cột họ tên (optional)
    const nameKey = Object.keys(firstRow).find((key) => {
      const lowerKey = key.toLowerCase().trim();
      return (
        lowerKey === 'họ và tên' ||
        lowerKey === 'họ tên' ||
        lowerKey === 'ho va ten' ||
        lowerKey === 'ho ten' ||
        lowerKey === 'họ và tên sv' ||
        lowerKey === 'họ và tên sinh viên' ||
        lowerKey === 'name' ||
        lowerKey === 'fullname'
      );
    });

    // Lấy thông tin lớp (lấy từ dòng đầu tiên)
    const classCode = classCodeKey ? String(firstRow[classCodeKey] || '').trim() : '';
    if (!classCode) {
      throw new BadRequestException(
        'Không tìm thấy cột Mã lớp trong file. Vui lòng đảm bảo có cột tên "Mã lớp", "ma lop" hoặc "class code"',
      );
    }

    const courseCode = courseCodeKey ? String(firstRow[courseCodeKey] || '').trim() : undefined;
    const courseName = courseNameKey ? String(firstRow[courseNameKey] || '').trim() : undefined;
    const semester = semesterKey ? String(firstRow[semesterKey] || '').trim() : undefined;
    const department = departmentKey ? String(firstRow[departmentKey] || '').trim() : undefined;
    const classType = classTypeKey ? String(firstRow[classTypeKey] || '').trim() : undefined;
    const instructor = instructorKey ? String(firstRow[instructorKey] || '').trim() : undefined;

    // Trích xuất danh sách sinh viên
    const students = data
      .map((row) => {
        const mssv = String(row[mssvKey] || '').trim();
        if (!mssv) return null;

        const student: Student = { mssv };

        if (nameKey) {
          const name = String(row[nameKey] || '').trim();
          if (name) {
            student.name = name;
          }
        }

        return student;
      })
      .filter((student): student is Student => student !== null);

    return {
      classInfo: {
        classCode,
        courseCode,
        courseName,
        semester,
        department,
        classType,
        instructor,
      },
      students,
    };
  }
}
