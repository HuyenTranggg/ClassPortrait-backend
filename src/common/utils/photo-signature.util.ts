import { createHmac } from 'crypto';

function getSecret(): string {
  return process.env.JWT_SECRET ?? 'photo-secret-fallback';
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
