import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AttendanceStatus } from '../entities/attendance.entity';
import { ClassEntity } from '../entities/class.entity';
import { ShareLinkEntity } from '../entities/share-link.entity';
import { PhotoStatus, StudentEntity } from '../entities/student.entity';
import { AttendanceEntity } from '../entities/attendance.entity';

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
   * Chuẩn hóa tùy chọn truy vấn cho dashboard bảng lớp.
   * @param options Query options nhận từ controller.
   * @returns Bộ tùy chọn đã được gán giá trị mặc định hợp lệ.
   */
  private normalizeQueryOptions(options?: TeacherDashboardQueryOptions): Required<
    Pick<TeacherDashboardQueryOptions, 'expiringSoonDays' | 'page' | 'limit' | 'sortBy' | 'sortOrder'>
  > &
    Pick<TeacherDashboardQueryOptions, 'search' | 'attendanceStatus' | 'shareLinkStatus'> {
    return {
      expiringSoonDays: options?.expiringSoonDays ?? 3,
      page: options?.page ?? 1,
      limit: options?.limit ?? 20,
      search: options?.search?.trim() || undefined,
      attendanceStatus: options?.attendanceStatus,
      shareLinkStatus: options?.shareLinkStatus,
      sortBy: options?.sortBy ?? 'classCode',
      sortOrder: options?.sortOrder ?? 'asc',
    };
  }

  /**
   * So sánh 2 giá trị number có xử lý trường hợp null.
   * @param a Giá trị thứ nhất.
   * @param b Giá trị thứ hai.
   * @param order Hướng sắp xếp.
   * @returns Số âm/dương/0 phục vụ Array.sort.
   */
  private compareNullableNumber(a: number | null, b: number | null, order: DashboardSortOrder): number {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return order === 'asc' ? a - b : b - a;
  }

  /**
   * So sánh trạng thái link để hỗ trợ sort ổn định.
   * @param a Trạng thái link thứ nhất.
   * @param b Trạng thái link thứ hai.
   * @param order Hướng sắp xếp.
   * @returns Số âm/dương/0 phục vụ Array.sort.
   */
  private compareShareLinkStatus(
    a: TeacherDashboardClassItem['shareLink']['status'],
    b: TeacherDashboardClassItem['shareLink']['status'],
    order: DashboardSortOrder,
  ): number {
    const rank: Record<TeacherDashboardClassItem['shareLink']['status'], number> = {
      active: 1,
      inactive: 2,
      expired: 3,
      no_link: 4,
    };

    return order === 'asc' ? rank[a] - rank[b] : rank[b] - rank[a];
  }

  /**
   * Áp dụng filter cho danh sách lớp dashboard.
   * @param items Danh sách lớp gốc.
   * @param options Bộ tùy chọn filter/sort/pagination đã chuẩn hóa.
   * @returns Danh sách lớp sau khi filter.
   */
  private applyFilter(
    items: TeacherDashboardClassItem[],
    options: ReturnType<ClassDashboardService['normalizeQueryOptions']>,
  ): TeacherDashboardClassItem[] {
    return items.filter((item) => {
      if (options.search) {
        const keyword = options.search.toLowerCase();
        const className = (item.className ?? '').toLowerCase();
        if (!item.classCode.toLowerCase().includes(keyword) && !className.includes(keyword)) {
          return false;
        }
      }

      if (options.attendanceStatus && item.attendanceStatus !== options.attendanceStatus) {
        return false;
      }

      if (options.shareLinkStatus && item.shareLink.status !== options.shareLinkStatus) {
        return false;
      }

      return true;
    });
  }

  /**
   * Áp dụng sort cho danh sách lớp dashboard.
   * @param items Danh sách lớp đã filter.
   * @param options Bộ tùy chọn filter/sort/pagination đã chuẩn hóa.
   * @returns Danh sách lớp sau khi sort.
   */
  private applySort(
    items: TeacherDashboardClassItem[],
    options: ReturnType<ClassDashboardService['normalizeQueryOptions']>,
  ): TeacherDashboardClassItem[] {
    const cloned = [...items];

    cloned.sort((a, b) => {
      switch (options.sortBy) {
        case 'className':
          return options.sortOrder === 'asc'
            ? (a.className ?? '').localeCompare(b.className ?? '', 'vi')
            : (b.className ?? '').localeCompare(a.className ?? '', 'vi');
        case 'classCode':
          return options.sortOrder === 'asc'
            ? a.classCode.localeCompare(b.classCode, 'vi')
            : b.classCode.localeCompare(a.classCode, 'vi');
        case 'studentCount':
          return options.sortOrder === 'asc' ? a.studentCount - b.studentCount : b.studentCount - a.studentCount;
        case 'validPhotoRate':
          return options.sortOrder === 'asc' ? a.validPhotoRate - b.validPhotoRate : b.validPhotoRate - a.validPhotoRate;
        case 'presentRate':
          return this.compareNullableNumber(a.presentRate, b.presentRate, options.sortOrder);
        case 'absentCount':
          return this.compareNullableNumber(a.absentCount, b.absentCount, options.sortOrder);
        case 'shareLinkStatus':
          return this.compareShareLinkStatus(a.shareLink.status, b.shareLink.status, options.sortOrder);
        case 'remainingDays':
          return this.compareNullableNumber(a.shareLink.remainingDays, b.shareLink.remainingDays, options.sortOrder);
        default:
          return 0;
      }
    });

    return cloned;
  }

  /**
   * Áp dụng phân trang cho danh sách lớp dashboard.
   * @param items Danh sách lớp đã sort.
   * @param page Trang hiện tại (bắt đầu từ 1).
   * @param limit Số phần tử tối đa mỗi trang.
   * @returns Danh sách phần tử thuộc trang yêu cầu.
   */
  private applyPagination(items: TeacherDashboardClassItem[], page: number, limit: number): TeacherDashboardClassItem[] {
    const offset = (page - 1) * limit;
    return items.slice(offset, offset + limit);
  }

  /**
   * Lấy dữ liệu dashboard cho giáo viên, gồm summary tổng thể và bảng lớp có filter/sort/pagination.
   * @param userId ID giáo viên hiện tại.
   * @param queryOptions Bộ query options cho bảng lớp.
   * @returns Snapshot dashboard đã tổng hợp.
   */
  async getTeacherOverview(userId: string, queryOptions?: TeacherDashboardQueryOptions): Promise<TeacherDashboardOverview> {
    const options = this.normalizeQueryOptions(queryOptions);
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

    const filtered = this.applyFilter(allClasses, options);
    const sorted = this.applySort(filtered, options);
    const paged = this.applyPagination(sorted, options.page, options.limit);
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
