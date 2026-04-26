import {
  TeacherDashboardClassItem,
  TeacherDashboardQueryOptions,
  DashboardSortOrder,
} from '../dashboard.service';

/**
 * Chuẩn hóa tùy chọn truy vấn cho dashboard bảng lớp.
 * @param options Query options nhận từ controller.
 * @returns Bộ tùy chọn đã được gán giá trị mặc định hợp lệ.
 */
export function normalizeQueryOptions(
  options?: TeacherDashboardQueryOptions,
): Required<Pick<TeacherDashboardQueryOptions, 'expiringSoonDays' | 'page' | 'limit' | 'sortBy' | 'sortOrder'>> &
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
export function compareNullableNumber(a: number | null, b: number | null, order: DashboardSortOrder): number {
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
export function compareShareLinkStatus(
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
export function applyFilter(
  items: TeacherDashboardClassItem[],
  options: ReturnType<typeof normalizeQueryOptions>,
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
export function applySort(
  items: TeacherDashboardClassItem[],
  options: ReturnType<typeof normalizeQueryOptions>,
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
        return compareNullableNumber(a.presentRate, b.presentRate, options.sortOrder);
      case 'absentCount':
        return compareNullableNumber(a.absentCount, b.absentCount, options.sortOrder);
      case 'shareLinkStatus':
        return compareShareLinkStatus(a.shareLink.status, b.shareLink.status, options.sortOrder);
      case 'remainingDays':
        return compareNullableNumber(a.shareLink.remainingDays, b.shareLink.remainingDays, options.sortOrder);
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
export function applyPagination(items: TeacherDashboardClassItem[], page: number, limit: number): TeacherDashboardClassItem[] {
  const offset = (page - 1) * limit;
  return items.slice(offset, offset + limit);
}
