/**
 * GET /api/auth/me
 *
 * Returns the current authenticated staff user. Uses the access token from
 * either the Authorization: Bearer header (client fetch calls) or the
 * accessToken cookie (server components / form submissions).
 */

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";

export async function GET(request: NextRequest) {
  try {
    const caller = await requireAuth(request);
    return successResponse({
      user: {
        id: caller.userId,
        username: caller.username,
        email: caller.email,
        phone: caller.phone,
        role: caller.role,
        mustChangePassword: caller.mustChangePassword,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
