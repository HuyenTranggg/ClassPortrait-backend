import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AttendanceStatus } from '../attendance/entities/attendance.entity';
import { ClassEntity } from '../entities/class.entity';
import { ShareLinkEntity } from '../share/entities/share-link.entity';
import { PhotoStatus, StudentEntity } from '../../students/entities/student.entity';
import { AttendanceEntity } from '../attendance/entities/attendance.entity';

// ─────────────────────────────────────────────
// FILTER OPTIONS
// ─────────────────────────────────────────────

export interface DashboardFilterOptions {
  semester?: string;
  startDate?: string; // 'YYYY-MM-DD'
  endDate?: string;   // 'YYYY-MM-DD'
  upcomingDays?: number;
  expiringSoonDays?: number;
}

// ─────────────────────────────────────────────
// RETURN TYPES
// ─────────────────────────────────────────────

/** Tổng quan nhanh toàn hệ thống */
export type DashboardOverviewSummary = {
  totalClasses: number;
  totalStudents: number;
  totalDistinctCourses: number;
  totalDistinctRooms: number;
  totalDistinctShifts: number;
  classesWithExamToday: number;
  classesWithExamThisWeek: number;
};

/** Tình trạng ảnh sinh viên toàn hệ thống */
export type DashboardPhotoHealth = {
  validPhotoRate: number;
  loadedCount: number;
  pendingCount: number;
  notFoundCount: number;
  classesWithIncompletePhoto: number;
};

/** Một lớp sắp thi, dùng cho Timeline */
export type UpcomingExamItem = {
  classId: string;
  courseCode: string;
  courseName: string;
  examDate: string;
  examRoom: string | null;
  examTime: string | null;
  examShift: string | null;
  studentCount: number;
  validPhotoRate: number;
  presentCount: number | null;
  absentCount: number | null;
  attendanceRate: number | null;
};

/** Thống kê theo phòng thi */
export type RoomStat = {
  examRoom: string;
  classCount: number;
  studentCount: number;
};

/** Thống kê theo ca/giờ thi */
export type ShiftStat = {
  examShift: string;
  examTime: string | null;
  classCount: number;
  studentCount: number;
};

/** Thống kê theo học phần */
export type CourseStat = {
  courseCode: string;
  courseName: string;
  classCount: number;
  studentCount: number;
};

/** Thống kê logistics hậu cần thi cử */
export type DashboardLogistics = {
  byRoom: RoomStat[];
  byShift: ShiftStat[];
  byCourse: CourseStat[];
};

/**
 * Thống kê tổng quan điểm danh.
 * - classesWithAttendance: số lớp đã điểm danh (có ít nhất 1 bản ghi attendance)
 * - classesWithoutAttendance: số lớp chưa điểm danh
 * - totalStudents: tổng sinh viên trong tất cả lớp thuộc bộ lọc
 * - totalNotMarked: tổng sinh viên thuộc các lớp CHƯA điểm danh
 * - totalPresent: tổng lượt có mặt (trong các lớp đã điểm danh)
 * - totalAbsent: tổng lượt vắng mặt (trong các lớp đã điểm danh)
 * - globalPresentRate: tỷ lệ có mặt toàn kỳ (trong các lớp đã điểm danh)
 */
export type DashboardAttendance = {
  classesWithAttendance: number;
  classesWithoutAttendance: number;
  totalStudents: number;
  totalNotMarked: number;
  totalPresent: number;
  totalAbsent: number;
  globalPresentRate: number | null;
};

/**
 * Thống kê link chia sẻ.
 * - activeCount: link đang hoạt động (is_active=true, chưa hết hạn)
 * - publicActiveCount: link hoạt động không yêu cầu đăng nhập
 * - privateActiveCount: link hoạt động yêu cầu đăng nhập
 * - expiringSoon24hCount: link sẽ hết hạn trong 24h tới
 * - expiredOrInactiveCount: link đã hết hạn hoặc đã tắt
 * - expiredCount: link đã hết hạn
 * - inactiveCount: link đã tắt thủ công
 */
export type DashboardShareLinks = {
  totalLinks: number;
  activeCount: number;
  publicActiveCount: number;
  privateActiveCount: number;
  expiringSoon24hCount: number;
  expiredCount: number;
  inactiveCount: number;
  expiredOrInactiveCount: number;
};

/** Response DTO tổng hợp trả về cho Frontend */
export type ExamCommandCenterResponse = {
  overview: DashboardOverviewSummary;
  photoHealth: DashboardPhotoHealth;
  allExams: UpcomingExamItem[];
  logistics: DashboardLogistics;
  attendance: DashboardAttendance;
  shareLinks: DashboardShareLinks;
  generatedAt: string;
};

// ─────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────

@Injectable()
export class ClassDashboardService {
  constructor(
    @InjectRepository(ClassEntity)
    private readonly classesRepository: Repository<ClassEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentsRepository: Repository<StudentEntity>,
    @InjectRepository(AttendanceEntity)
    private readonly attendanceRepository: Repository<AttendanceEntity>,
    @InjectRepository(ShareLinkEntity)
    private readonly shareLinksRepository: Repository<ShareLinkEntity>,
  ) {}

  /**
   * Tính tỷ lệ phần trăm, làm tròn 2 chữ số thập phân.
   * @param value Giá trị đạt được.
   * @param total Tổng mẫu số.
   * @returns Tỷ lệ phần trăm trong khoảng 0–100.
   */
  private toPercent(value: number, total: number): number {
    if (total <= 0) return 0;
    return Math.round((value / total) * 10000) / 100;
  }

  /**
   * Lấy ngày đầu và cuối của tuần hiện tại (Thứ 2 → Chủ nhật).
   * @param now Thời điểm hiện tại (ms).
   * @returns Object chứa startOfWeek và endOfWeek.
   */
  private getWeekBoundaries(now: number): { startOfWeek: Date; endOfWeek: Date } {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const dayOfWeek = today.getDay(); // 0=CN, 1=T2...
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() + diffToMonday);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    return { startOfWeek, endOfWeek };
  }

  /**
   * Lấy danh sách học kỳ khả dụng của user (dùng cho dropdown bộ lọc).
   * @param userId ID giảng viên hiện tại.
   * @returns Mảng chuỗi học kỳ, đã sắp xếp giảm dần.
   */
  async getAvailableSemesters(userId: string): Promise<string[]> {
    const rows = await this.classesRepository
      .createQueryBuilder('cls')
      .select('DISTINCT cls.semester', 'semester')
      .where('cls.userId = :userId', { userId })
      .orderBy('cls.semester', 'DESC')
      .getRawMany<{ semester: string }>();
    return rows.map((r) => r.semester);
  }

  /**
   * Lấy toàn bộ dữ liệu dashboard Exam Command Center cho giảng viên.
   * Hỗ trợ lọc theo học kỳ và khoảng thời gian thi (examDate).
   * @param userId ID giảng viên hiện tại.
   * @param options Các tùy chọn lọc và hiển thị.
   * @returns Snapshot dashboard tổng hợp theo thiết kế Exam Command Center.
   */
  async getExamCommandCenter(
    userId: string,
    options: DashboardFilterOptions = {},
  ): Promise<ExamCommandCenterResponse> {
    const {
      semester,
      startDate,
      endDate,
      expiringSoonDays = 3,
    } = options;

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    const { startOfWeek, endOfWeek } = this.getWeekBoundaries(now);
    const expiringThreshold = new Date(now + expiringSoonDays * dayMs);
    const expiring24hThreshold = new Date(now + dayMs);

    // ── 1. Lấy tất cả lớp của user để làm All Exams (chỉ lọc theo semester nếu có) ──
    const allExamsQb = this.classesRepository
      .createQueryBuilder('cls')
      .select([
        'cls.id',
        'cls.courseCode',
        'cls.courseName',
        'cls.semester',
        'cls.examDate',
        'cls.examRoom',
        'cls.examTime',
        'cls.examShift',
      ])
      .where('cls.userId = :userId', { userId })
      .orderBy('cls.examDate', 'ASC');

    const allExamsRows = await allExamsQb.getMany();

    if (allExamsRows.length === 0) {
      return this.buildEmptyResponse();
    }

    const allExamsIds = allExamsRows.map((c) => c.id);

    const summaryRows = allExamsRows.filter(cls => {
      if (!cls.examDate) return false;
      
      const examDateStr = cls.examDate instanceof Date 
        ? cls.examDate.toISOString().split('T')[0]
        : String(cls.examDate).split(' ')[0];

      if (startDate && examDateStr < startDate) return false;
      if (endDate && examDateStr > endDate) return false;
      return true;
    });

    const summaryIds = summaryRows.map(c => c.id);

    // ── 2. Aggregate sinh viên theo lớp (cho toàn bộ lớp để support allExams) ──
    const studentAggRows = await this.studentsRepository
      .createQueryBuilder('student')
      .select('student.classId', 'classId')
      .addSelect('COUNT(student.id)', 'total')
      .addSelect(
        `SUM(CASE WHEN student.photoStatus = :loaded THEN 1 ELSE 0 END)`,
        'loaded',
      )
      .addSelect(
        `SUM(CASE WHEN student.photoStatus = :pending THEN 1 ELSE 0 END)`,
        'pending',
      )
      .addSelect(
        `SUM(CASE WHEN student.photoStatus = :notFound THEN 1 ELSE 0 END)`,
        'notFound',
      )
      .where('student.classId IN (:...classIds)', { classIds: allExamsIds })
      .setParameters({
        loaded: PhotoStatus.LOADED,
        pending: PhotoStatus.PENDING,
        notFound: PhotoStatus.NOT_FOUND,
      })
      .groupBy('student.classId')
      .getRawMany<{
        classId: string;
        total: string;
        loaded: string;
        pending: string;
        notFound: string;
      }>();

    // ── 2b. Tính tổng sinh viên duy nhất (theo summaryIds) ───
    let totalUniqueStudents = 0;
    if (summaryIds.length > 0) {
      const totalUniqueStudentsRow = await this.studentsRepository
        .createQueryBuilder('student')
        .select('COUNT(DISTINCT student.mssv)', 'count')
        .where('student.classId IN (:...classIds)', { classIds: summaryIds })
        .getRawOne<{ count: string }>();
      totalUniqueStudents = Number(totalUniqueStudentsRow?.count ?? 0);
    }

    // ── 3. Aggregate điểm danh theo lớp (cho toàn bộ để support allExams) ──
    const attendanceAggRows = await this.attendanceRepository
      .createQueryBuilder('att')
      .select('att.classId', 'classId')
      .addSelect('COUNT(att.id)', 'totalRows')
      .addSelect(
        `SUM(CASE WHEN att.status = :present THEN 1 ELSE 0 END)`,
        'presentCount',
      )
      .where('att.classId IN (:...classIds)', { classIds: allExamsIds })
      .setParameter('present', AttendanceStatus.PRESENT)
      .groupBy('att.classId')
      .getRawMany<{ classId: string; totalRows: string; presentCount: string }>();

    // ── 4. Share links (theo summaryIds) ──────────────────────────────────
    const shareLinks = summaryIds.length > 0 ? await this.shareLinksRepository.find({
      where: { classId: In(summaryIds) },
      select: { id: true, classId: true, isActive: true, expiresAt: true, requireLogin: true },
    }) : [];

    // ── 5. Build lookup maps ───────────────────────────────────────────
    const studentMap = new Map(
      studentAggRows.map((r) => [
        r.classId,
        {
          total: Number(r.total ?? 0),
          loaded: Number(r.loaded ?? 0),
          pending: Number(r.pending ?? 0),
          notFound: Number(r.notFound ?? 0),
        },
      ]),
    );

    const attendanceMap = new Map(
      attendanceAggRows.map((r) => [
        r.classId,
        {
          totalRows: Number(r.totalRows ?? 0),
          presentCount: Number(r.presentCount ?? 0),
        },
      ]),
    );

    // ── 6. Tổng hợp dữ liệu Summary (từ summaryRows) ──────────────────
    let totalStudents = 0;
    let totalLoaded = 0;
    let totalPending = 0;
    let totalNotFound = 0;
    let classesWithIncompletePhoto = 0;
    let classesWithExamToday = 0;
    let classesWithExamThisWeek = 0;

    const roomMap = new Map<string, { classCount: number; studentCount: number }>();
    const shiftMap = new Map<string, { examTime: string | null; classCount: number; studentCount: number }>();
    const courseMap = new Map<string, { courseName: string; classCount: number; studentCount: number }>();

    let globalPresent = 0;
    let globalAbsent = 0;
    let classesWithAttendance = 0;
    let totalStudentsInUnmarkedClasses = 0;

    for (const cls of summaryRows) {
      const studentAgg = studentMap.get(cls.id) ?? { total: 0, loaded: 0, pending: 0, notFound: 0 };
      const attAgg = attendanceMap.get(cls.id) ?? { totalRows: 0, presentCount: 0 };

      totalStudents += studentAgg.total;
      totalLoaded += studentAgg.loaded;
      totalPending += studentAgg.pending;
      totalNotFound += studentAgg.notFound;

      if (studentAgg.total > 0 && studentAgg.loaded < studentAgg.total) {
        classesWithIncompletePhoto++;
      }

      if (cls.examDate) {
        const d = new Date(cls.examDate);
        if (d >= today && d <= todayEnd) classesWithExamToday++;
        if (d >= startOfWeek && d <= endOfWeek) classesWithExamThisWeek++;
      }

      if (cls.examRoom) {
        const existing = roomMap.get(cls.examRoom) ?? { classCount: 0, studentCount: 0 };
        roomMap.set(cls.examRoom, {
          classCount: existing.classCount + 1,
          studentCount: existing.studentCount + studentAgg.total,
        });
      }

      const shiftKey = cls.examShift ?? cls.examTime ?? 'Chưa xác định';
      const existingShift = shiftMap.get(shiftKey) ?? { examTime: cls.examTime, classCount: 0, studentCount: 0 };
      shiftMap.set(shiftKey, {
        examTime: existingShift.examTime,
        classCount: existingShift.classCount + 1,
        studentCount: existingShift.studentCount + studentAgg.total,
      });

      const existingCourse = courseMap.get(cls.courseCode) ?? { courseName: cls.courseName, classCount: 0, studentCount: 0 };
      courseMap.set(cls.courseCode, {
        courseName: cls.courseName,
        classCount: existingCourse.classCount + 1,
        studentCount: existingCourse.studentCount + studentAgg.total,
      });

      if (attAgg.totalRows > 0) {
        classesWithAttendance++;
        globalPresent += attAgg.presentCount;
        // Số vắng mặt = Tổng thí sinh trong lớp - Số thí sinh có mặt
        const absentCount = Math.max(studentAgg.total - attAgg.presentCount, 0);
        globalAbsent += absentCount;
      } else {
        totalStudentsInUnmarkedClasses += studentAgg.total;
      }
    }

    // ── 6b. Tổng hợp All Exams list (từ allExamsRows) ─────────────────
    const allExams: UpcomingExamItem[] = [];
    for (const cls of allExamsRows) {
      if (cls.examDate) {
        const studentAgg = studentMap.get(cls.id) ?? { total: 0, loaded: 0, pending: 0, notFound: 0 };
        const attAgg = attendanceMap.get(cls.id) ?? { totalRows: 0, presentCount: 0 };

        const examDateObj = new Date(cls.examDate);
        const presentCount = attAgg.totalRows > 0 ? attAgg.presentCount : null;
        const absentCount = attAgg.totalRows > 0
          ? Math.max(studentAgg.total - attAgg.presentCount, 0)
          : null;
        const attendanceRate = attAgg.totalRows > 0
          ? this.toPercent(attAgg.presentCount, studentAgg.total)
          : null;

        allExams.push({
          classId: cls.id,
          courseCode: cls.courseCode,
          courseName: cls.courseName,
          examDate: examDateObj.toISOString().split('T')[0],
          examRoom: cls.examRoom,
          examTime: cls.examTime,
          examShift: cls.examShift,
          studentCount: studentAgg.total,
          validPhotoRate: this.toPercent(studentAgg.loaded, studentAgg.total),
          presentCount,
          absentCount,
          attendanceRate,
        });
      }
    }

    // ── 7. Share links summary ─────────────────────────────────────────
    let activeCount = 0;
    let publicActiveCount = 0;
    let privateActiveCount = 0;
    let expiringSoon24hCount = 0;
    let expiredCount = 0;
    let inactiveCount = 0;

    for (const link of shareLinks) {
      const isExpired = Boolean(link.expiresAt && new Date(link.expiresAt).getTime() <= now);

      if (isExpired) {
        expiredCount++;
      } else if (link.isActive) {
        activeCount++;
        if (link.requireLogin) {
          privateActiveCount++;
        } else {
          publicActiveCount++;
        }
        // Kiểm tra sắp hết hạn trong 24h
        if (link.expiresAt && new Date(link.expiresAt) <= expiring24hThreshold) {
          expiringSoon24hCount++;
        }
      } else {
        inactiveCount++;
      }
    }

    // ── 8. Distinct counters ───────────────────────────────────────────
    const totalDistinctCourses = courseMap.size;
    const totalDistinctRooms = roomMap.size;
    const totalDistinctShifts = shiftMap.size;
    const classesWithoutAttendance = summaryRows.length - classesWithAttendance;
    const totalAttendanceRows = globalPresent + globalAbsent;
    const globalPresentRate = totalAttendanceRows > 0
      ? this.toPercent(globalPresent, totalAttendanceRows)
      : null;

    return {
      overview: {
        totalClasses: summaryRows.length,
        totalStudents: totalUniqueStudents,
        totalDistinctCourses,
        totalDistinctRooms,
        totalDistinctShifts,
        classesWithExamToday,
        classesWithExamThisWeek,
      },
      photoHealth: {
        validPhotoRate: this.toPercent(totalLoaded, totalStudents),
        loadedCount: totalLoaded,
        pendingCount: totalPending,
        notFoundCount: totalNotFound,
        classesWithIncompletePhoto,
      },
      allExams,
      logistics: {
        byRoom: [...roomMap.entries()]
          .map(([examRoom, stat]) => ({ examRoom, ...stat }))
          .sort((a, b) => b.studentCount - a.studentCount),
        byShift: [...shiftMap.entries()]
          .map(([examShift, stat]) => ({ examShift, ...stat }))
          .sort((a, b) => b.studentCount - a.studentCount),
        byCourse: [...courseMap.entries()]
          .map(([courseCode, stat]) => ({ courseCode, ...stat }))
          .sort((a, b) => b.studentCount - a.studentCount),
      },
      attendance: {
        classesWithAttendance,
        classesWithoutAttendance,
        totalStudents: totalUniqueStudents,
        totalNotMarked: totalStudentsInUnmarkedClasses,
        totalPresent: globalPresent,
        totalAbsent: globalAbsent,
        globalPresentRate,
      },
      shareLinks: {
        totalLinks: shareLinks.length,
        activeCount,
        publicActiveCount,
        privateActiveCount,
        expiringSoon24hCount,
        expiredCount,
        inactiveCount,
        expiredOrInactiveCount: expiredCount + inactiveCount,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Trả về cấu trúc rỗng khi giảng viên chưa có lớp nào.
   * @returns ExamCommandCenterResponse rỗng.
   */
  private buildEmptyResponse(): ExamCommandCenterResponse {
    return {
      overview: {
        totalClasses: 0,
        totalStudents: 0,
        totalDistinctCourses: 0,
        totalDistinctRooms: 0,
        totalDistinctShifts: 0,
        classesWithExamToday: 0,
        classesWithExamThisWeek: 0,
      },
      photoHealth: {
        validPhotoRate: 0,
        loadedCount: 0,
        pendingCount: 0,
        notFoundCount: 0,
        classesWithIncompletePhoto: 0,
      },
      allExams: [],
      logistics: { byRoom: [], byShift: [], byCourse: [] },
      attendance: {
        classesWithAttendance: 0,
        classesWithoutAttendance: 0,
        totalStudents: 0,
        totalNotMarked: 0,
        totalPresent: 0,
        totalAbsent: 0,
        globalPresentRate: null,
      },
      shareLinks: {
        totalLinks: 0,
        activeCount: 0,
        publicActiveCount: 0,
        privateActiveCount: 0,
        expiringSoon24hCount: 0,
        expiredCount: 0,
        inactiveCount: 0,
        expiredOrInactiveCount: 0,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
