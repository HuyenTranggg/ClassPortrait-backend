import { Injectable } from '@nestjs/common';
import { RawStudentData, ExamSessionGroup } from '../import.types';

@Injectable()
export class ImportGroupingService {
  /**
   * Gom nhóm danh sách sinh viên (dữ liệu thô) thành các lớp thi (Exam Sessions).
   * Thứ tự ưu tiên xác định groupKey (từ cao xuống thấp):
   *   P1: Ngày thi + Phòng thi + Giờ/Kíp thi + Học kỳ  → danh tính vật lý chính xác nhất
   *   P2: Mã lớp thi (classExamCode) + Học kỳ           → định danh hành chính
   *   P3: Mã lớp học (classCode) + Học kỳ               → fallback theo lớp học
   *   P4: Mã học phần (courseCode) + Học kỳ             → fallback theo học phần
   *   P5: Toàn bộ file là 1 lớp thi duy nhất            → fallback cuối cùng
   * Đồng thời chuẩn hóa định dạng thời gian (giờ thi) từ Excel (decimal) sang dạng hh:mm:ss.
   *
   * @param rawStudents Danh sách dữ liệu sinh viên thô đã được trích xuất từ file.
   * @returns Danh sách các nhóm lớp thi (ExamSessionGroup) đã được gom nhóm và sắp xếp theo thứ tự xuất hiện trong file.
   */
  public groupIntoExamSessions(rawStudents: RawStudentData[]): ExamSessionGroup[] {
    const groups = new Map<string, ExamSessionGroup>();

    for (const student of rawStudents) {
      // Determine group key based on priority
      let groupKey: string;
      let isFallback = false;

      let { semester, classExamCode, examDate, examRoom, examTime, examShift, courseCode, courseName, instructor, department } = student;

      // Chuẩn hóa dữ liệu để tránh phân mảnh lớp thi
      if (examTime) {
        examTime = examTime.trim();
        // Chuẩn hóa '16h00' -> '16:00' và xóa khoảng trắng quanh dấu '-' để đồng nhất
        examTime = examTime.replace(/(\d)h(\d)/gi, '$1:$2').replace(/\s*-\s*/g, '-');
        const num = Number(examTime);
        if (!isNaN(num) && num >= 0 && num < 1) {
          let totalSeconds = Math.round(num * 24 * 60 * 60);
          const h = Math.floor(totalSeconds / 3600);
          totalSeconds %= 3600;
          const m = Math.floor(totalSeconds / 60);
          const s = totalSeconds % 60;
          examTime = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        } else {
          const timeParts = examTime.split(':');
          if (timeParts.length >= 2) {
            let hours = timeParts[0];
            let minutes = timeParts[1];
            let seconds = timeParts.length >= 3 ? timeParts[2] : '00';
            
            if (hours.length === 1) hours = `0${hours}`;
            if (minutes.length === 1) minutes = `0${minutes}`;
            if (seconds.length === 1) seconds = `0${seconds}`;
            
            examTime = `${hours}:${minutes}:${seconds}`;
          }
        }
        student.examTime = examTime;
      }

      if (examShift) {
        examShift = examShift.trim().replace(',', '.');
        student.examShift = examShift;
      }

      if (examDate && examRoom && (examTime || examShift)) {
        // Priority 1: Ngày thi + Phòng thi + Giờ/Kíp thi + Học kỳ
        // Đây là "danh tính vật lý" chính xác nhất của một lớp thi
        const timeKey = examTime?.trim() || examShift?.trim() || '';
        const dateKey = examDate.toISOString().split('T')[0];
        groupKey = `p1:${semester}:${dateKey}:${examRoom.trim()}:${timeKey}`;
      } else if (classExamCode && classExamCode.trim() !== '') {
        // Priority 2: Mã lớp thi + Học kỳ
        // Định danh hành chính do phòng đào tạo cấp
        groupKey = `p2:${semester}:${classExamCode.trim()}`;
        isFallback = true;
      } else if (student.classCode && student.classCode.trim() !== '') {
        // Priority 3: Mã lớp học + Học kỳ
        // Mỗi lớp học thường thi cùng phòng — dùng làm fallback
        groupKey = `p3:${semester}:${student.classCode.trim()}`;
        isFallback = true;
      } else if (courseCode && courseCode.trim() !== '') {
        // Priority 4: Mã học phần + Học kỳ
        // Fallback khi không có thông tin phòng/kíp/lớp
        groupKey = `p4:${semester}:${courseCode.trim()}`;
        isFallback = true;
      } else {
        // Priority 5: Toàn bộ file là 1 lớp thi duy nhất
        groupKey = `p5:${semester || 'unknown'}`;
        isFallback = true;
      }

      // If group doesn't exist, create it
      if (!groups.has(groupKey)) {
        const group: ExamSessionGroup = {
          groupKey,
          examInfo: {
            semester,
            courseCode: courseCode || '',
            courseName: courseName || '',
            instructor: instructor || '',
            department: department || '',
            classExamCode: classExamCode?.trim() || undefined,
            examDate: examDate ?? undefined,
            examRoom: examRoom?.trim() || undefined,
            examTime: examTime?.trim() || undefined,
            examShift: examShift?.trim() || undefined,
          },
          students: [],
          importOrder: student.importOrder,
          isFallback,
        };
        groups.set(groupKey, group);
      }

      // Add student to the group
      groups.get(groupKey)!.students.push(student);

      // Update importOrder to the earliest row number in the group
      if (student.importOrder < groups.get(groupKey)!.importOrder) {
        groups.get(groupKey)!.importOrder = student.importOrder;
      }
    }

    // Convert to array and sort by importOrder ascending (to preserve file order)
    return Array.from(groups.values()).sort((a, b) => a.importOrder - b.importOrder);
  }
}
