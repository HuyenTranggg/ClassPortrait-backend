import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AttendanceStatus } from '../attendance/entities/attendance.entity';
import { ClassEntity } from '../entities/class.entity';
import { ShareLinkEntity } from '../share/entities/share-link.entity';
import { PhotoStatus, StudentEntity } from '../../students/entities/student.entity';
import { AttendanceEntity } from '../attendance/entities/attendance.entity';
import { applyFilter, applyPagination, applySort, normalizeQueryOptions } from './utils/dashboard.util';

export type DashboardAttendanceStatusFilter = 'no_data' | 'available';
export type DashboardShareLinkStatusFilter = 'no_link' | 'active' | 'inactive' | 'expired';
export type DashboardSortBy =
  | 'className'
  | 'classCode'
  | 'studentCount'
  | 'validPhotoRate'
  | 'presentRate'
  | 'absentCount'
  | 'shareLinkStatus'
  | 'remainingDays';
export type DashboardSortOrder = 'asc' | 'desc';

export type TeacherDashboardQueryOptions = {
  expiringSoonDays?: number;
  page?: number;
  limit?: number;
  search?: string;
  attendanceStatus?: DashboardAttendanceStatusFilter;
  shareLinkStatus?: DashboardShareLinkStatusFilter;
  sortBy?: DashboardSortBy;
  sortOrder?: DashboardSortOrder;
};

export type TeacherDashboardClassItem = {
  classId: string;
  className?: string;
  classCode: string;
  studentCount: number;
  validPhotoRate: number;
  presentRate: number | null;
  absentCount: number | null;
  attendanceStatus: 'no_data' | 'available';
  shareLink: {
    status: 'no_link' | 'active' | 'inactive' | 'expired';
    isActive: boolean;
    isExpired: boolean;
    requireLogin: boolean;
    expiresAt: Date | null;
    remainingDays: number | null;
  };
};

export type TeacherDashboardOverview = {
  summary: {
    classCount: number;
    studentCount: number;
    validPhotoRate: number;
    expiringSoonLinkCount: number;
    activeLinkCount: number;
    inactiveLinkCount: number;
    expiredLinkCount: number;
  };
  classes: TeacherDashboardClassItem[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
  filters: {
    expiringSoonDays: number;
    search?: string;
    attendanceStatus?: DashboardAttendanceStatusFilter;
    shareLinkStatus?: DashboardShareLinkStatusFilter;
    sortBy: DashboardSortBy;
    sortOrder: DashboardSortOrder;
  };
  generatedAt: string;
};

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
   * Chuẩn hóa tỷ lệ phần trăm về 2 chữ số thập phân.
   * @param value Giá trị đạt được.
   * @param total Tổng mẫu số.
   * @returns Tỷ lệ phần trăm trong khoảng 0..100.
   */
  private toPercent(value: number, total: number): number {
    if (total <= 0) return 0;
    return Math.round((value / total) * 10000) / 100;
  }

  /**
   * Lấy dữ liệu dashboard cho giáo viên, gồm summary tổng thể và bảng lớp có filter/sort/pagination.
   * @param userId ID giáo viên hiện tại.
   * @param queryOptions Bộ query options cho bảng lớp.
   * @returns Snapshot dashboard đã tổng hợp.
   */
  async getTeacherOverview(userId: string, queryOptions?: TeacherDashboardQueryOptions): Promise<TeacherDashboardOverview> {
    const options = normalizeQueryOptions(queryOptions);
    const dayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const expiringThreshold = now + options.expiringSoonDays * dayMs;

    const classRows = await this.classesRepository.find({
      where: { userId },
      select: { id: true, classCode: true, courseName: true, createdAt: true },
      order: { createdAt: 'DESC' },
    });

    if (classRows.length === 0) {
      return {
        summary: {
          classCount: 0,
          studentCount: 0,
          validPhotoRate: 0,
          expiringSoonLinkCount: 0,
          activeLinkCount: 0,
          inactiveLinkCount: 0,
          expiredLinkCount: 0,
        },
        classes: [],
        pagination: {
          page: options.page,
          limit: options.limit,
          totalItems: 0,
          totalPages: 0,
        },
        filters: {
          expiringSoonDays: options.expiringSoonDays,
          search: options.search,
          attendanceStatus: options.attendanceStatus,
          shareLinkStatus: options.shareLinkStatus,
          sortBy: options.sortBy,
          sortOrder: options.sortOrder,
        },
        generatedAt: new Date().toISOString(),
      };
    }

    const classIds = classRows.map((item) => item.id);

    const studentAggRows = await this.studentsRepository
      .createQueryBuilder('student')
      .select('student.classId', 'classId')
      .addSelect('COUNT(student.id)', 'totalStudents')
      .addSelect(
        'SUM(CASE WHEN student.photoStatus = :loadedStatus THEN 1 ELSE 0 END)',
        'loadedStudents',
      )
      .where('student.classId IN (:...classIds)', { classIds })
      .setParameter('loadedStatus', PhotoStatus.LOADED)
      .groupBy('student.classId')
      .getRawMany<{ classId: string; totalStudents: string; loadedStudents: string }>();

    const attendanceAggRows = await this.attendanceRepository
      .createQueryBuilder('attendance')
      .select('attendance.classId', 'classId')
      .addSelect('COUNT(attendance.id)', 'attendanceRows')
      .addSelect(
        'SUM(CASE WHEN attendance.status = :presentStatus THEN 1 ELSE 0 END)',
        'presentStudents',
      )
      .where('attendance.classId IN (:...classIds)', { classIds })
      .setParameter('presentStatus', AttendanceStatus.PRESENT)
      .groupBy('attendance.classId')
      .getRawMany<{ classId: string; attendanceRows: string; presentStudents: string }>();

    const shareLinks = await this.shareLinksRepository.find({
      where: { classId: In(classIds) },
      select: {
        id: true,
        classId: true,
        isActive: true,
        expiresAt: true,
      },
    });

    const studentAggMap = new Map(
      studentAggRows.map((row) => [
        row.classId,
        {
          totalStudents: Number(row.totalStudents ?? 0),
          loadedStudents: Number(row.loadedStudents ?? 0),
        },
      ]),
    );

    const attendanceAggMap = new Map(
      attendanceAggRows.map((row) => [
        row.classId,
        {
          attendanceRows: Number(row.attendanceRows ?? 0),
          presentStudents: Number(row.presentStudents ?? 0),
        },
      ]),
    );

    const shareLinkMap = new Map(shareLinks.map((item) => [item.classId, item]));

    let totalStudents = 0;
    let totalLoadedStudents = 0;
    let expiringSoonLinkCount = 0;
    let activeLinkCount = 0;
    let inactiveLinkCount = 0;
    let expiredLinkCount = 0;

    const allClasses: TeacherDashboardClassItem[] = classRows.map((item) => {
      const studentAgg = studentAggMap.get(item.id) ?? { totalStudents: 0, loadedStudents: 0 };
      const attendanceAgg = attendanceAggMap.get(item.id) ?? { attendanceRows: 0, presentStudents: 0 };
      const shareLink = shareLinkMap.get(item.id);

      totalStudents += studentAgg.totalStudents;
      totalLoadedStudents += studentAgg.loadedStudents;

      const hasAttendanceData = attendanceAgg.attendanceRows > 0;
      const presentRate = hasAttendanceData
        ? this.toPercent(attendanceAgg.presentStudents, studentAgg.totalStudents)
        : null;
      const absentCount = hasAttendanceData ? Math.max(studentAgg.totalStudents - attendanceAgg.presentStudents, 0) : null;

      let status: 'no_link' | 'active' | 'inactive' | 'expired' = 'no_link';
      let isActive = false;
      let isExpired = false;
      let expiresAt: Date | null = null;
      let remainingDays: number | null = null;

      if (shareLink) {
        isActive = shareLink.isActive;
        expiresAt = shareLink.expiresAt;
        isExpired = Boolean(expiresAt && expiresAt.getTime() <= now);

        if (isExpired) {
          status = 'expired';
          expiredLinkCount += 1;
        } else if (isActive) {
          status = 'active';
          activeLinkCount += 1;
        } else {
          status = 'inactive';
          inactiveLinkCount += 1;
        }

        if (expiresAt) {
          remainingDays = Math.ceil((expiresAt.getTime() - now) / dayMs);
        }

        if (
          isActive &&
          expiresAt &&
          expiresAt.getTime() > now &&
          expiresAt.getTime() <= expiringThreshold
        ) {
          expiringSoonLinkCount += 1;
        }
      }

      return {
        classId: item.id,
        className: item.courseName ?? undefined,
        classCode: item.classCode,
        studentCount: studentAgg.totalStudents,
        validPhotoRate: this.toPercent(studentAgg.loadedStudents, studentAgg.totalStudents),
        presentRate,
        absentCount,
        attendanceStatus: hasAttendanceData ? 'available' : 'no_data',
        shareLink: {
          status,
          isActive,
          isExpired,
          requireLogin: shareLink?.requireLogin ?? false,
          expiresAt,
          remainingDays,
        },
      };
    });

    const filtered = applyFilter(allClasses, options);
    const sorted = applySort(filtered, options);
    const paged = applyPagination(sorted, options.page, options.limit);
    const totalItems = sorted.length;
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / options.limit);

    return {
      summary: {
        classCount: classRows.length,
        studentCount: totalStudents,
        validPhotoRate: this.toPercent(totalLoadedStudents, totalStudents),
        expiringSoonLinkCount,
        activeLinkCount,
        inactiveLinkCount,
        expiredLinkCount,
      },
      classes: paged,
      pagination: {
        page: options.page,
        limit: options.limit,
        totalItems,
        totalPages,
      },
      filters: {
        expiringSoonDays: options.expiringSoonDays,
        search: options.search,
        attendanceStatus: options.attendanceStatus,
        shareLinkStatus: options.shareLinkStatus,
        sortBy: options.sortBy,
        sortOrder: options.sortOrder,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
