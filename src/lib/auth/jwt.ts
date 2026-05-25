import { SignJWT, jwtVerify } from 'jose';

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  // Per-user permission overrides. Not encoded in the signed token (those are
  // re-loaded from the DB on each request via `loadPermissionOverrides`).
  // Kept here so test code can mock the augmented caller shape directly.
  permissionOverrides?: Record<string, boolean> | null;
  iat?: number;
  exp?: number;
}

function getRawSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.warn('JWT_SECRET is not set — using fallback for development');
    return new TextEncoder().encode('dev-fallback-secret-do-not-use-in-production');
  }
  return new TextEncoder().encode(secret);
}

async function getCryptoKey(): Promise<CryptoKey> {
  const raw = getRawSecret();
  return crypto.subtle.importKey(
    'raw',
    raw.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signAccessToken(payload: {
  userId: string;
  email: string;
  role: string;
}): Promise<string> {
  const key = await getCryptoKey();

  const token = await new SignJWT({
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('120m')
    .sign(key);

  return token;
}

export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  const key = await getCryptoKey();

  const { payload } = await jwtVerify(token, key);

  return {
    userId: payload.userId as string,
    email: payload.email as string,
    role: payload.role as string,
    iat: payload.iat,
    exp: payload.exp,
  };
}
