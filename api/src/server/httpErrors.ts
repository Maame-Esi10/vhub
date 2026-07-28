import { ZodError } from "zod";

/** Typed error shape every endpoint returns on failure -- api-client.ts (mobile) parses this. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Throw this from anywhere in a route handler; `errorResponse()` turns it into the right HTTP response. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const Errors = {
  unauthenticated: (message = "Missing or invalid session token.") =>
    new ApiError(401, "unauthenticated", message),
  forbidden: (message = "You are not allowed to perform this action.") =>
    new ApiError(403, "forbidden", message),
  notFound: (message = "Resource not found.") => new ApiError(404, "not_found", message),
  conflict: (message: string, details?: unknown) => new ApiError(409, "conflict", message, details),
  badRequest: (message: string, details?: unknown) => new ApiError(400, "bad_request", message, details),
  internal: (message = "Something went wrong. Please try again.") =>
    new ApiError(500, "internal_error", message),
};

/**
 * Converts ANY thrown error into a typed JSON response. Never rethrows --
 * every route handler's catch block should end with `return errorResponse(err)`.
 * Unexpected errors are logged server-side (message/name only, never a raw
 * error object that might carry a secret in its context) and reported to the
 * caller as a generic 500 -- internals are never leaked to the client.
 */
export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    const body: ApiErrorBody = { error: { code: err.code, message: err.message, details: err.details } };
    return Response.json(body, { status: err.status });
  }

  if (err instanceof ZodError) {
    const body: ApiErrorBody = {
      error: {
        code: "validation_error",
        message: "Request body failed validation.",
        details: err.flatten(),
      },
    };
    return Response.json(body, { status: 400 });
  }

  console.error("[api] unhandled error:", err instanceof Error ? `${err.name}: ${err.message}` : err);
  const body: ApiErrorBody = {
    error: { code: "internal_error", message: "Something went wrong. Please try again." },
  };
  return Response.json(body, { status: 500 });
}
