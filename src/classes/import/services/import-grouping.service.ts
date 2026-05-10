import { Injectable } from '@nestjs/common';
import { RawStudentData, ExamSessionGroup } from '../import.types';

@Injectable()
export class ImportGroupingService {
  /**
   * Gom nhóm danh sách sinh viên (dữ liệu thô) thành các lớp thi (Exam Sessions) dựa trên 3 mức độ ưu tiên.
   * Đồng thời thực hiện chuẩn hóa định dạng thời gian (giờ thi) từ Excel (decimal) sang dạng hh:mm:ss.
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

      if (classExamCode && classExamCode.trim() !== '') {
        // Priority 1: classExamCode + semester
        groupKey = `examcode:${semester}:${classExamCode.trim()}`;
      } else if (examDate && examRoom && (examTime || examShift)) {
        // Priority 2: semester + examDate + examRoom + (examTime or examShift)
        const timeKey = examTime?.trim() || examShift?.trim() || '';
        groupKey = `datetime:${semester}:${examDate.toISOString().split('T')[0]}:${examRoom.trim()}:${timeKey}`;
      } else {
        // Priority 3 (Fallback): semester + classCode
        if (!student.classCode) {
          // Skip? Or throw? Should not happen if classCode is required
          continue;
        }
        groupKey = `fallback:${semester}:${student.classCode.trim()}`;
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
