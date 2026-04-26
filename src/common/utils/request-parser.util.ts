import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { SourceType } from '../../classes/import/entities/import-history.entity';
import {
  DashboardAttendanceStatusFilter,
  DashboardShareLinkStatusFilter,
  DashboardSortBy,
  DashboardSortOrder,
} from '../../classes/dashboard/dashboard.service';

/**
 * Trích xuất userId từ JWT payload đã được guard gắn vào request.
 * @param req Request hiện tại chứa req.user.
 * @returns userId dạng UUID hợp lệ.
 */
export function extractUserId(req: any): string {
  const candidate = req.user?.userId ?? req.user?.sub;
  const userId = typeof candidate === 'string' ? candidate.trim() : '';
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(userId)) {
    throw new UnauthorizedException('Token không chứa userId hợp lệ. Vui lòng đăng nhập lại.');
  }

  return userId;
}

/**
 * Parse string thành số nguyên dương hợp lệ.
 * @param input Giá trị query.
 * @param fallback Giá trị mặc định.
 * @returns Số nguyên dương.
 */
export function parsePositiveInt(input: string | undefined, fallback: number): number {
  if (input === undefined || input === null || input === '') {
    return fallback;
  }
  const value = Number(input);
  if (!Number.isInteger(value) || value <= 0) {
    throw new BadRequestException('Giá trị page/limit phải là số nguyên dương');
  }
  return value;
}

/**
 * Parse sourceType enum.
 * @param input Chuỗi truyền vào.
 * @returns SourceType hợp lệ hoặc undefined.
 */
export function parseSourceType(input?: string): SourceType | undefined {
  if (!input) return undefined;
  const normalized = input.trim().toLowerCase();
  if (normalized === SourceType.EXCEL) return SourceType.EXCEL;
  if (normalized === SourceType.GOOGLE_SHEET) return SourceType.GOOGLE_SHEET;
  if (normalized === SourceType.ONEDRIVE) return SourceType.ONEDRIVE;
  throw new BadRequestException('sourceType không hợp lệ. Giá trị hợp lệ: excel, google_sheet, onedrive');
}

/**
 * Chuyển đổi query string sang boolean theo quy ước true/false.
 * @param input Giá trị query nhận từ request.
 * @param fallback Giá trị mặc định khi input rỗng.
 * @returns Giá trị boolean sau khi parse.
 */
export function parseBoolean(input: string | undefined, fallback: boolean): boolean {
  if (input === undefined || input === null || input.trim() === '') {
    return fallback;
  }
  const normalized = input.trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  throw new BadRequestException('includeStats phải là true/false');
}

/**
 * Parse giá trị sortBy cho dashboard.
 * @param input Giá trị query sortBy.
 * @returns Trường sort hợp lệ.
 */
export function parseDashboardSortBy(input?: string): DashboardSortBy {
  const fallback: DashboardSortBy = 'classCode';
  if (!input || input.trim() === '') return fallback;

  const normalized = input.trim();
  const allowed: DashboardSortBy[] = [
    'className',
    'classCode',
    'studentCount',
    'validPhotoRate',
    'presentRate',
    'absentCount',
    'shareLinkStatus',
    'remainingDays',
  ];

  if (!allowed.includes(normalized as DashboardSortBy)) {
    throw new BadRequestException(`sortBy không hợp lệ. Giá trị hợp lệ: ${allowed.join(', ')}`);
  }

  return normalized as DashboardSortBy;
}

/**
 * Parse giá trị sortOrder cho dashboard.
 * @param input Giá trị query sortOrder.
 * @returns Hướng sort hợp lệ.
 */
export function parseDashboardSortOrder(input?: string): DashboardSortOrder {
  const fallback: DashboardSortOrder = 'asc';
  if (!input || input.trim() === '') return fallback;

  const normalized = input.trim().toLowerCase();
  if (normalized !== 'asc' && normalized !== 'desc') {
    throw new BadRequestException('sortOrder không hợp lệ. Giá trị hợp lệ: asc, desc');
  }

  return normalized as DashboardSortOrder;
}

/**
 * Parse filter trạng thái điểm danh cho dashboard.
 * @param input Giá trị query attendanceStatus.
 * @returns Trạng thái hợp lệ hoặc undefined nếu không lọc.
 */
export function parseDashboardAttendanceStatus(input?: string): DashboardAttendanceStatusFilter | undefined {
  if (!input || input.trim() === '') return undefined;
  const normalized = input.trim().toLowerCase();
  if (normalized !== 'available' && normalized !== 'no_data') {
    throw new BadRequestException('attendanceStatus không hợp lệ. Giá trị hợp lệ: available, no_data');
  }
  return normalized as DashboardAttendanceStatusFilter;
}

/**
 * Parse filter trạng thái link chia sẻ cho dashboard.
 * @param input Giá trị query shareLinkStatus.
 * @returns Trạng thái hợp lệ hoặc undefined nếu không lọc.
 */
export function parseDashboardShareLinkStatus(input?: string): DashboardShareLinkStatusFilter | undefined {
  if (!input || input.trim() === '') return undefined;
  const normalized = input.trim().toLowerCase();
  if (!['no_link', 'active', 'inactive', 'expired'].includes(normalized)) {
    throw new BadRequestException('shareLinkStatus không hợp lệ. Giá trị hợp lệ: no_link, active, inactive, expired');
  }
  return normalized as DashboardShareLinkStatusFilter;
}

/**
 * Parse chuỗi tìm kiếm cho dashboard.
 * @param input Giá trị query search.
 * @returns Chuỗi tìm kiếm đã trim hoặc undefined.
 */
export function parseDashboardSearch(input?: string): string | undefined {
  if (!input) return undefined;
  const normalized = input.trim();
  return normalized.length > 0 ? normalized : undefined;
}
