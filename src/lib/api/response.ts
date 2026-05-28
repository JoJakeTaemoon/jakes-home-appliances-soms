import { NextResponse } from "next/server";
import type { ApiResponse, PaginatedResponse } from "@/types/api";
import { ApiError, ValidationError } from "@/lib/api/error";

export function successResponse<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
    },
    { status }
  );
}

export function errorResponse(
  message: string,
  status = 400,
  code?: string,
  issues?: { path: (string | number)[]; message: string }[],
): NextResponse<ApiResponse<never>> {
  return NextResponse.json(
    {
      success: false,
      error: {
        message,
        ...(code && { code }),
        ...(issues && issues.length > 0 && { issues }),
      },
    },
    { status }
  );
}

export function paginatedResponse<T>(
  data: T[],
  pagination: { page: number; limit: number; total: number }
): NextResponse<PaginatedResponse<T>> {
  const { page, limit, total } = pagination;
  const totalPages = Math.ceil(total / limit);

  return NextResponse.json(
    {
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    },
    { status: 200 }
  );
}

/**
 * Convert any thrown value into a standardized error response. Use inside a
 * try/catch at the top of every route handler so we never leak stack traces
 * or unexpected error shapes to the client.
 */
export function toErrorResponse(err: unknown): NextResponse<ApiResponse<never>> {
  if (err instanceof ValidationError) {
    return errorResponse(err.message, err.status, err.code, err.issues);
  }
  if (err instanceof ApiError) {
    return errorResponse(err.message, err.status, err.code);
  }
  // Zod errors arrive without our wrapper if a caller forgot to use parse().
  // Fall through and treat as 500 so the bug is visible.
  console.error("[API] Unhandled error:", err);
  return errorResponse("Internal server error", 500, "INTERNAL_ERROR");
}
