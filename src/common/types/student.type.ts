// backend/src/common/types/student.type.ts

/**
 * Interface định nghĩa cấu trúc dữ liệu của một sinh viên
 */
export interface Student {
  mssv: string;
  name?: string;
  photoUrl?: string;
  photoStatus?: 'pending' | 'loaded' | 'not_found';
  importOrder?: number;
}
