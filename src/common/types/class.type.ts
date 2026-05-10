// backend/src/common/types/class.type.ts

import { Student } from './student.type';

/**
 * Interface định nghĩa cấu trúc dữ liệu của một lớp thi (Exam Session)
 */
export interface Class {
  id: string; // UUID
  classExamCode?: string; // Mã lớp thi (có thể NULL)
  examDate?: Date; // Ngày thi
  examRoom?: string; // Phòng thi
  examTime?: string; // Giờ thi
  examShift?: string; // Kíp thi
  isFallback?: boolean; // TRUE nếu là fallback grouping
  semester: string; // Học kỳ
  courseCode: string; // Mã học phần
  courseName: string; // Tên học phần
  department: string; // Đơn vị giảng dạy
  instructor: string; // Giảng viên
  importOrder: number; // Thứ tự import
  createdAt: Date;
}

/**
 * Interface định nghĩa quan hệ giữa lớp thi và sinh viên
 */
export interface ClassStudent {
  classId: string;
  mssv: string;
}

/**
 * Interface mở rộng của Class khi cần trả về kèm danh sách sinh viên
 */
export interface ClassWithStudents extends Class {
  students: Student[];
}
