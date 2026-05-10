// backend/src/common/types/student.type.ts

/**
 * Interface định nghĩa cấu trúc dữ liệu của một sinh viên trong lớp thi
 */
export interface Student {
  id?: string;
  mssv: string;
  fullName: string;
  photoStatus: 'pending' | 'loaded' | 'not_found';
  importOrder: number;
  classCode: string; // Mã lớp học (lớp tín chỉ)
  className?: string; // Tên lớp quản lý
  gender?: string;
  dob?: Date;
  email?: string;
  notes?: string;
  photoUrl?: string;
}
