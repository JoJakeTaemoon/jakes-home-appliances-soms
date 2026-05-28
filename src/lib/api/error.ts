/**
 * Typed API errors. Route handlers throw these and a top-level helper
 * (`toErrorResponse`) maps them to the standardized error envelope.
 *
 * Status codes follow REST conventions:
 *   - 400 Bad Request — validation / malformed input
 *   - 401 Unauthorized — missing or invalid auth credentials
 *   - 403 Forbidden — authenticated but insufficient role / permission
 *   - 404 Not Found — entity doesn't exist (or actor cannot see it)
 *   - 409 Conflict — uniqueness violation, state mismatch
 *   - 423 Locked — account lockout
 *   - 429 Too Many Requests — rate limit
 *   - 500 Internal Server Error — unhandled
 */

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export class ValidationError extends ApiError {
  public readonly issues?: { path: (string | number)[]; message: string }[];

  constructor(
    message = "Validation failed",
    issues?: { path: (string | number)[]; message: string }[],
  ) {
    super(message, 400, "VALIDATION_ERROR");
    this.name = "ValidationError";
    this.issues = issues;
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Resource not found") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ConflictError extends ApiError {
  constructor(message = "Conflict") {
    super(message, 409, "CONFLICT");
    this.name = "ConflictError";
  }
}

export class LockedError extends ApiError {
  constructor(message = "Account is locked") {
    super(message, 423, "LOCKED");
    this.name = "LockedError";
  }
}

export class RateLimitError extends ApiError {
  constructor(message = "Too many requests") {
    super(message, 429, "RATE_LIMITED");
    this.name = "RateLimitError";
  }
}
