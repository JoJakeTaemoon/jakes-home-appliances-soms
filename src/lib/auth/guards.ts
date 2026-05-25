import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAccessToken, type JwtPayload } from '@/lib/auth/jwt';
import { checkPermission } from '@/lib/permissions/check';
import { UnauthorizedError, ForbiddenError } from '@/lib/api/error';

/**
 * Augmented caller payload returned by `requireAuth`. Adds the freshly loaded
 * DB user fields so downstream handlers can avoid a second query.
 */
export interface AuthenticatedCaller extends JwtPayload {
  // The user's display name as currently recorded in the DB.
  name?: string;
}

export async function requireAuth(request: NextRequest): Promise<AuthenticatedCaller> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid Authorization header');
  }

  const token = authHeader.slice(7);
  if (!token) {
    throw new UnauthorizedError('Missing token');
  }

  let payload: JwtPayload;
  try {
    payload = await verifyAccessToken(token);
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }

  // Verify the user still exists and is active. A valid JWT alone is not
  // enough — a user deactivated mid-session must lose access immediately
  // instead of waiting for the token to expire (up to 120 min).
  const dbUser = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      isActive: true,
      name: true,
      permissionOverrides: true,
    },
  });
  if (!dbUser || !dbUser.isActive) {
    throw new UnauthorizedError('Account is inactive or missing');
  }

  return {
    ...payload,
    name: dbUser.name ?? undefined,
    permissionOverrides:
      (dbUser.permissionOverrides as Record<string, boolean> | null) ?? undefined,
  };
}

export async function requireRole(
  request: NextRequest,
  roles: string[],
): Promise<AuthenticatedCaller> {
  const payload = await requireAuth(request);

  if (!roles.includes(payload.role)) {
    throw new ForbiddenError('Insufficient role');
  }

  return payload;
}

export async function requirePermission(
  request: NextRequest,
  resource: string,
  action: string,
  projectId?: string,
): Promise<AuthenticatedCaller> {
  const payload = await requireAuth(request);

  const hasPermission = await checkPermission(
    payload.userId,
    resource,
    action,
    projectId,
  );

  if (!hasPermission) {
    throw new ForbiddenError('Insufficient permissions');
  }

  return payload;
}
