import { createHmac } from 'crypto';

function getSecret(): string {
  const photoSecret = process.env.PHOTO_SIGN_SECRET?.trim();
  const jwtSecret = process.env.JWT_SECRET?.trim();
  const secret = photoSecret || jwtSecret;

  if (!secret) {
    throw new Error('PHOTO_SIGN_SECRET hoặc JWT_SECRET phải được cấu hình');
  }

  return secret;
}

export function createPhotoSignaturePayload(mssv: string, classId: string, expiresAt: number): string {
  return `${mssv}:${classId}:${expiresAt}`;
}

export function signPhotoUrl(mssv: string, classId: string, expiresAt: number): string {
  const payload = createPhotoSignaturePayload(mssv, classId, expiresAt);
  return createHmac('sha256', getSecret()).update(payload).digest('hex');
}

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
