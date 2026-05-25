import { NextResponse } from "next/server";
import type { ApiResponse, PaginatedResponse } from "@/types/api";

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
