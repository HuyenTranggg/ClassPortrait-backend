import { createHmac } from 'crypto';

/**
 * Lấy secret dùng để ký URL ảnh.
 * Ưu tiên PHOTO_SIGN_SECRET, nếu không có thì dùng JWT_SECRET.
 * @returns Secret hợp lệ dùng cho thao tác ký/xác thực chữ ký.
 */
function getSecret(): string {
  const photoSecret = process.env.PHOTO_SIGN_SECRET?.trim();
  const jwtSecret = process.env.JWT_SECRET?.trim();
  const secret = photoSecret || jwtSecret;

  if (!secret) {
    throw new Error('PHOTO_SIGN_SECRET hoặc JWT_SECRET phải được cấu hình');
  }

  return secret;
}

/**
 * Tạo payload chuẩn để ký URL ảnh.
 * @param mssv Mã số sinh viên.
 * @param classId ID lớp học.
 * @param expiresAt Thời điểm hết hạn (timestamp ms).
 * @returns Chuỗi payload dùng cho HMAC.
 */
export function createPhotoSignaturePayload(mssv: string, classId: string, expiresAt: number): string {
  return `${mssv}:${classId}:${expiresAt}`;
}

/**
 * Sinh chữ ký HMAC cho URL ảnh sinh viên.
 * @param mssv Mã số sinh viên.
 * @param classId ID lớp học.
 * @param expiresAt Thời điểm hết hạn (timestamp ms).
 * @returns Chữ ký hex để gắn vào query param sig.
 */
export function signPhotoUrl(mssv: string, classId: string, expiresAt: number): string {
  const payload = createPhotoSignaturePayload(mssv, classId, expiresAt);
  return createHmac('sha256', getSecret()).update(payload).digest('hex');
}

/**
 * Xác thực chữ ký URL ảnh và kiểm tra thời hạn truy cập.
 * @param mssv Mã số sinh viên.
 * @param classId ID lớp học.
 * @param expiresAt Thời điểm hết hạn (timestamp ms).
 * @param signature Chữ ký được gửi từ client.
 * @returns true nếu chữ ký hợp lệ và chưa hết hạn, ngược lại false.
 */
export function verifyPhotoSignature(
  mssv: string,
  classId: string,
  expiresAt: number,
  signature: string,
): boolean {
  if (!signature) return false;
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  const expected = signPhotoUrl(mssv, classId, expiresAt);
  return expected === signature;
}
