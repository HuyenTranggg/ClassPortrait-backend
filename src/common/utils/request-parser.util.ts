import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { SourceType } from '../../classes/import/entities/import-history.entity';

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


