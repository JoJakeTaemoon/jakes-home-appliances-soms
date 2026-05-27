/**
 * Shared API response envelope. Every JSON endpoint returns either
 * `{ success: true, data, pagination? }` or `{ success: false, error }`.
 */

export interface ApiErrorIssue {
  path: (string | number)[];
  message: string;
}

export interface ApiError {
  message: string;
  code?: string;
  issues?: ApiErrorIssue[];
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: PaginationMeta;
}
