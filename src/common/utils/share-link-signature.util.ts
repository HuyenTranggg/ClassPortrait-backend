import { createHmac, timingSafeEqual } from 'crypto';

const SHARE_LINK_MAX_EXPIRES_AT = 253402300799000;

/**
 * Lấy secret dùng cho chữ ký link chia sẻ.
 * Ưu tiên SHARE_LINK_SIGN_SECRET, nếu không có thì fallback JWT_SECRET.
 * @returns Secret hợp lệ để ký và xác thực link chia sẻ.
 */
function getShareLinkSecret(): string {
  const shareSecret = process.env.SHARE_LINK_SIGN_SECRET?.trim();
  const jwtSecret = process.env.JWT_SECRET?.trim();
  const secret = shareSecret || jwtSecret;

  if (!secret) {
    throw new Error('SHARE_LINK_SIGN_SECRET hoặc JWT_SECRET phải được cấu hình');
  }

  return secret;
}

/**
 * Tạo payload chuẩn hóa để ký link chia sẻ.
 * @param shareId ID bản ghi share link.
 * @param expiresAt Thời điểm hết hạn ở dạng unix timestamp milliseconds.
 * @returns Chuỗi payload chuẩn cho HMAC.
 */
export function createShareLinkSignaturePayload(shareId: string, expiresAt: number): string {
  return `v1:${shareId}:${expiresAt}`;
}

/**
 * Tạo chữ ký HMAC-SHA256 cho link chia sẻ.
 * @param shareId ID bản ghi share link.
 * @param expiresAt Thời điểm hết hạn ở dạng unix timestamp milliseconds.
 * @returns Chữ ký hex dài 64 ký tự.
 */
export function signShareLink(shareId: string, expiresAt: number): string {
  const payload = createShareLinkSignaturePayload(shareId, expiresAt);
  return createHmac('sha256', getShareLinkSecret()).update(payload).digest('hex');
}

/**
 * Xác thực chữ ký link chia sẻ.
 * @param shareId ID bản ghi share link.
 * @param expiresAt Thời điểm hết hạn ở dạng unix timestamp milliseconds.
 * @param signature Chữ ký truyền từ query param sig.
 * @returns true nếu chữ ký hợp lệ và chưa hết hạn.
 */
export function verifyShareLinkSignature(shareId: string, expiresAt: number, signature: string): boolean {
  if (!signature) return false;
  if (!Number.isFinite(expiresAt)) return false;
  if (expiresAt > SHARE_LINK_MAX_EXPIRES_AT) return false;
  if (Date.now() > expiresAt) return false;
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;

  const expected = signShareLink(shareId, expiresAt);
  const expectedBuffer = Buffer.from(expected, 'hex');
  const signatureBuffer = Buffer.from(signature.toLowerCase(), 'hex');

  if (expectedBuffer.length !== signatureBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, signatureBuffer);
}

/**
 * Trả về thời điểm hết hạn hiệu lực để nhúng ra URL chia sẻ.
 * @param expiresAt Giá trị expiresAt lưu trong DB.
 * @returns Unix timestamp milliseconds dùng cho query param exp.
 */
export function resolveShareLinkExpiresAt(expiresAt: Date | null): number {
  return expiresAt ? expiresAt.getTime() : SHARE_LINK_MAX_EXPIRES_AT;
}
