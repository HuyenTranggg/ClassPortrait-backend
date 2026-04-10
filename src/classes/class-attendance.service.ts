import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceEntity, AttendanceStatus } from '../entities/attendance.entity';
import { ClassEntity } from '../entities/class.entity';
import { StudentEntity } from '../entities/student.entity';

export type AttendanceStudentView = {
  studentId: string;
  mssv: string;
  name?: string;
  status: AttendanceStatus;
  markedAt: Date | null;
};

export type ClassAttendanceView = {
  classId: string;
  students: AttendanceStudentView[];
  stats?: {
    total: number;
    present: number;
    absent: number;
  };
};

export type AttendanceMutationView = {
  classId: string;
  studentId: string;
  status: AttendanceStatus;
  markedAt: Date;
};

@Injectable()
export class ClassAttendanceService {
  constructor(
    @InjectRepository(ClassEntity)
    private readonly classesRepository: Repository<ClassEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentsRepository: Repository<StudentEntity>,
    @InjectRepository(AttendanceEntity)
    private readonly attendanceRepository: Repository<AttendanceEntity>,
  ) {}

  /**
   * Kiểm tra lớp có thuộc quyền quản lý của người dùng hiện tại hay không.
   * @param classId ID lớp cần kiểm tra quyền truy cập.
   * @param userId ID người dùng hiện tại.
   * @returns Không trả dữ liệu; ném lỗi nếu lớp không thuộc người dùng.
   */
  private async assertClassOwnership(classId: string, userId: string): Promise<void> {
    const isOwned = await this.classesRepository.exists({ where: { id: classId, userId } });
    if (!isOwned) {
      throw new NotFoundException('Khong tim thay lop thuoc ve nguoi dung hien tai');
    }
  }

  /**
   * Kiểm tra sinh viên có tồn tại trong lớp chỉ định hay không.
   * @param classId ID lớp học.
   * @param studentId ID sinh viên cần kiểm tra.
   * @returns Thực thể sinh viên nếu hợp lệ, ngược lại ném lỗi.
   */
  private async assertStudentInClass(classId: string, studentId: string): Promise<StudentEntity> {
    const student = await this.studentsRepository.findOne({ where: { id: studentId, classId } });
    if (!student) {
      throw new NotFoundException('Khong tim thay sinh vien trong lop nay');
    }
    return student;
  }

  /**
   * Lấy danh sách điểm danh của cả lớp, có thể kèm thống kê tổng quan.
   * @param classId ID lớp học cần lấy điểm danh.
   * @param userId ID người dùng hiện tại để kiểm tra quyền.
   * @param includeStats Cờ xác định có trả thêm thống kê hay không.
   * @returns Dữ liệu điểm danh theo từng sinh viên và thống kê (nếu bật).
   */
  async getClassAttendance(classId: string, userId: string, includeStats = true): Promise<ClassAttendanceView> {
    await this.assertClassOwnership(classId, userId);

    const students = await this.studentsRepository.find({
      where: { classId },
      order: { importOrder: 'ASC' },
    });

    const attendanceRows = await this.attendanceRepository.find({ where: { classId } });
    const attendanceMap = new Map(attendanceRows.map((row) => [row.studentId, row]));

    const resultStudents: AttendanceStudentView[] = students.map((student) => {
      const attendance = attendanceMap.get(student.id);
      return {
        studentId: student.id,
        mssv: student.mssv,
        name: student.fullName ?? undefined,
        status: attendance?.status ?? AttendanceStatus.ABSENT,
        markedAt: attendance?.markedAt ?? null,
      };
    });

    if (!includeStats) {
      return {
        classId,
        students: resultStudents,
      };
    }

    const present = resultStudents.filter((student) => student.status === AttendanceStatus.PRESENT).length;
    const total = resultStudents.length;

    return {
      classId,
      students: resultStudents,
      stats: {
        total,
        present,
        absent: total - present,
      },
    };
  }

  /**
   * Toggle trạng thái điểm danh của một sinh viên trong lớp.
   * @param classId ID lớp học.
   * @param studentId ID sinh viên cần toggle.
   * @param userId ID người dùng hiện tại.
   * @returns Trạng thái điểm danh mới sau khi toggle.
   */
  async toggleAttendance(classId: string, studentId: string, userId: string): Promise<AttendanceMutationView> {
    await this.assertClassOwnership(classId, userId);
    await this.assertStudentInClass(classId, studentId);

    const result = await this.attendanceRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(AttendanceEntity);
      const existing = await repository.findOne({ where: { classId, studentId } });

      if (!existing) {
        const created = repository.create({
          classId,
          studentId,
          status: AttendanceStatus.PRESENT,
          markedAt: new Date(),
        });
        return repository.save(created);
      }

      existing.status = existing.status === AttendanceStatus.PRESENT ? AttendanceStatus.ABSENT : AttendanceStatus.PRESENT;
      existing.markedAt = new Date();
      return repository.save(existing);
    });

    return {
      classId,
      studentId,
      status: result.status,
      markedAt: result.markedAt,
    };
  }

  /**
   * Đặt trạng thái điểm danh tường minh cho một sinh viên.
   * @param classId ID lớp học.
   * @param studentId ID sinh viên cần cập nhật.
   * @param userId ID người dùng hiện tại.
   * @param status Trạng thái điểm danh cần đặt.
   * @returns Trạng thái điểm danh sau khi cập nhật.
   */
  async setAttendance(
    classId: string,
    studentId: string,
    userId: string,
    status: AttendanceStatus,
  ): Promise<AttendanceMutationView> {
    await this.assertClassOwnership(classId, userId);
    await this.assertStudentInClass(classId, studentId);

    const result = await this.attendanceRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(AttendanceEntity);
      const existing = await repository.findOne({ where: { classId, studentId } });

      if (!existing) {
        const created = repository.create({
          classId,
          studentId,
          status,
          markedAt: new Date(),
        });
        return repository.save(created);
      }

      existing.status = status;
      existing.markedAt = new Date();
      return repository.save(existing);
    });

    return {
      classId,
      studentId,
      status: result.status,
      markedAt: result.markedAt,
    };
  }

  /**
   * Reset trạng thái điểm danh của toàn bộ sinh viên trong lớp.
   * @param classId ID lớp học cần reset.
   * @param userId ID người dùng hiện tại.
   * @param status Trạng thái reset mục tiêu (hỗ trợ absent).
   * @returns Kết quả thao tác reset gồm số lượng bản ghi đã cập nhật.
   */
  async resetAttendance(classId: string, userId: string, status: AttendanceStatus = AttendanceStatus.ABSENT) {
    if (status !== AttendanceStatus.ABSENT) {
      throw new ForbiddenException('Chi ho tro reset ve absent');
    }

    await this.assertClassOwnership(classId, userId);

    const students = await this.studentsRepository.find({ where: { classId }, select: { id: true } });
    if (students.length === 0) {
      return {
        classId,
        updatedCount: 0,
        status,
        markedAt: new Date(),
      };
    }

    const studentIds = students.map((student) => student.id);

    const result = await this.attendanceRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(AttendanceEntity);
      const now = new Date();

      const existingRows = await repository.find({ where: { classId } });
      const existingMap = new Map(existingRows.map((row) => [row.studentId, row]));

      const toSave: AttendanceEntity[] = studentIds.map((studentId) => {
        const row = existingMap.get(studentId) ?? repository.create({ classId, studentId });
        row.status = AttendanceStatus.ABSENT;
        row.markedAt = now;
        return row;
      });

      await repository.save(toSave);

      return {
        classId,
        updatedCount: toSave.length,
        status: AttendanceStatus.ABSENT,
        markedAt: now,
      };
    });

    return result;
  }
}
