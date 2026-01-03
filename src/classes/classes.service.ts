// backend/src/classes/classes.service.ts

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import csvParser from 'csv-parser';
import { Readable } from 'stream';
import { Class, Student, ClassStudent, ClassWithStudents } from '../common/types';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ClassesService {
  // Lưu trữ danh sách lớp (không chứa students)
  private classes: Class[] = [];
  
  // Lưu trữ danh sách sinh viên (unique by mssv)
  private students: Map<string, Student> = new Map();
  
  // Lưu trữ quan hệ giữa lớp và sinh viên (join table)
  private classStudents: ClassStudent[] = [];

  /**
   * Lấy tất cả các lớp (không bao gồm danh sách sinh viên)
   */
  findAll(): Class[] {
    return this.classes;
  }

  /**
   * Lấy tất cả các lớp kèm số lượng sinh viên
   */
  findAllWithStudentCount(): Array<Class & { studentCount: number }> {
    return this.classes.map((cls) => ({
      ...cls,
      studentCount: this.classStudents.filter((cs) => cs.classId === cls.id).length,
    }));
  }

  /**
   * Lấy thông tin một lớp theo ID (không bao gồm danh sách sinh viên)
   */
  findOne(id: string): Class {
    const classItem = this.classes.find((cls) => cls.id === id);
    if (!classItem) {
      throw new NotFoundException(`Không tìm thấy lớp với ID ${id}`);
    }
    return classItem;
  }

  /**
   * Lấy thông tin một lớp kèm danh sách sinh viên
   */
  findOneWithStudents(id: string): ClassWithStudents {
    const classItem = this.findOne(id);
    const students = this.getStudents(id);
    return {
      ...classItem,
      students,
    };
  }

  /**
   * Lấy danh sách sinh viên của một lớp
   */
  getStudents(classId: string): Student[] {
    // Tìm tất cả quan hệ của lớp này
    const relations = this.classStudents.filter((cs) => cs.classId === classId);
    
    // Lấy thông tin sinh viên từ map
    return relations
      .map((rel) => this.students.get(rel.mssv))
      .filter((student): student is Student => student !== undefined);
  }

  /**
   * Xóa một lớp và tất cả quan hệ với sinh viên
   */
  remove(id: string): { success: boolean; message: string } {
    const index = this.classes.findIndex((cls) => cls.id === id);
    if (index === -1) {
      throw new NotFoundException(`Không tìm thấy lớp với ID ${id}`);
    }
    
    // Xóa lớp
    this.classes.splice(index, 1);
    
    // Xóa tất cả quan hệ của lớp này
    this.classStudents = this.classStudents.filter((cs) => cs.classId !== id);
    
    return {
      success: true,
      message: `Đã xóa lớp thành công`,
    };
  }

  /**
   * Import lớp học từ file (Excel, CSV, hoặc JSON)
   */
  async importClass(file: Express.Multer.File): Promise<{ success: boolean; classId: string; message: string }> {
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

      // Tạo lớp mới (không chứa students)
      const newClass: Class = {
        id: uuidv4(),
        classCode: classInfo.classCode,
        courseCode: classInfo.courseCode,
        courseName: classInfo.courseName,
        semester: classInfo.semester,
        department: classInfo.department,
        classType: classInfo.classType,
        instructor: classInfo.instructor,
        createdAt: new Date(),
      };

      this.classes.push(newClass);

      // Lưu sinh viên vào map (nếu chưa có)
      students.forEach((student) => {
        if (!this.students.has(student.mssv)) {
          this.students.set(student.mssv, student);
        }
      });

      // Tạo quan hệ giữa lớp và sinh viên
      const now = new Date();
      students.forEach((student) => {
        this.classStudents.push({
          classId: newClass.id,
          mssv: student.mssv
        });
      });

      return {
        success: true,
        classId: newClass.id,
        message: `Đã import thành công lớp "${newClass.classCode}" với ${students.length} sinh viên`,
      };
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
