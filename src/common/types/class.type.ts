// backend/src/common/types/class.type.ts

import { Student } from './student.type';

/**
 * Interface định nghĩa cấu trúc dữ liệu của một lớp học
 */
export interface Class {
  id: string; // UUID - ID duy nhất của lớp
  classCode: string; // Mã lớp (BẮT BUỘC) - VD: "123456"
  courseCode?: string; // Mã học phần - VD: "IT3280", "MI2020"
  courseName?: string; // Tên học phần - VD: "Mạng máy tính", "Giải tích 2"
  semester?: string; // Học kỳ - VD: "2024.1", "20241"
  department?: string; // Đơn vị giảng dạy - VD: "Viện CNTT", "Khoa Toán-Tin"
  classType?: string; // Loại lớp - VD: "LT", "BT", "TH", "LT+BT"
  instructor?: string; // Giảng viên giảng dạy - VD: "TS. Nguyễn Văn A"
  createdAt: Date; // Thời gian tạo lớp
}

/**
 * Interface định nghĩa quan hệ giữa lớp học và sinh viên
 * (Giống join table trong database, chuẩn bị cho many-to-many relationship)
 */
export interface ClassStudent {
  classId: string; // ID của lớp
  mssv: string; // MSSV của sinh viên
}

/**
 * Interface mở rộng của Class khi cần trả về kèm danh sách sinh viên
 * (Dùng cho response API)
 */
export interface ClassWithStudents extends Class {
  students: Student[]; // Danh sách sinh viên (populated từ quan hệ)
}
