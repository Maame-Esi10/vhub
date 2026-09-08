import { ZodError } from "zod";
import { callerOf, observeError } from "./errorMonitor";

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
  /**
   * Extra response headers this failure needs. Only 429 uses it today, for
   * `Retry-After` -- a rate-limit refusal that does not say when to come back
   * leaves a well-behaved client guessing, and guessing usually means
   * retrying immediately.
   */
  readonly headers?: Readonly<Record<string, string>>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
    headers?: Readonly<Record<string, string>>
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers;
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
  /**
   * Too many requests. `retryAfterSeconds` becomes the `Retry-After` header,
   * and the message names the wait in words because it is shown to a person.
   */
  tooManyRequests: (message: string, retryAfterSeconds: number) =>
    new ApiError(429, "rate_limited", message, { retryAfterSeconds }, {
      "Retry-After": String(Math.max(1, Math.ceil(retryAfterSeconds))),
    }),
  internal: (message = "Something went wrong. Please try again.") =>
    new ApiError(500, "internal_error", message),
};

/**
 * Converts ANY thrown error into a typed JSON response. Never rethrows --
 * every route handler's catch block should end with `return errorResponse(err, req)`.
 * Unexpected errors are logged server-side (message/name only, never a raw
 * error object that might carry a secret in its context) and reported to the
 * caller as a generic 500 -- internals are never leaked to the client.
 *
 * IT IS ALSO THE ONE PLACE ERROR MONITORING HANGS OFF. Every route already
 * funnels its failures through here, so observing them here means a route added
 * later is monitored without anybody remembering to add anything -- the same
 * argument that put the rate limiter inside `authenticate()`. Pass `req` so the
 * record can name the route and the caller; without it the failure is still
 * recorded, just less usefully.
 */
export function errorResponse(err: unknown, req?: Request): Response {
  if (err instanceof ApiError) {
    const body: ApiErrorBody = { error: { code: err.code, message: err.message, details: err.details } };
    // Deliberately observed for EVERY status, not only the ones that alert:
    // the structured log line is what makes "how often is this 403 happening?"
    // answerable. Only 5xx produces a notification -- see lib/errorMonitor.ts.
    record(req, err.status, err.code, err.message);
    return Response.json(body, { status: err.status, headers: err.headers });
  }

  if (err instanceof ZodError) {
    const body: ApiErrorBody = {
      error: {
        code: "validation_error",
        message: "Request body failed validation.",
        details: err.flatten(),
      },
    };
    // The flattened detail is NOT recorded. It echoes the request body back,
    // which on these endpoints can carry a dispute statement or a rejection
    // reason -- somebody's words, in a log they never agreed to be in.
    record(req, 400, "validation_error", "Request body failed validation.");
    return Response.json(body, { status: 400 });
  }

  record(
    req,
    500,
    "internal_error",
    err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  );
  const body: ApiErrorBody = {
    error: { code: "internal_error", message: "Something went wrong. Please try again." },
  };
  return Response.json(body, { status: 500 });
}

/**
 * The route this request was for, as a path.
 *
 * Query string stripped: it is not part of which endpoint failed, and on
 * `/api/document-url` and friends it can carry an id. An unparsable URL falls
 * back to a constant rather than throwing, because the failure being recorded
 * matters more than the label on it.
 */
function routeOf(req: Request | undefined): string {
  if (!req) return "<unknown route>";
  try {
    return new URL(req.url).pathname;
  } catch {
    return "<unknown route>";
  }
}

function record(req: Request | undefined, status: number, code: string, message: string): void {
  const userId = req ? callerOf(req) : undefined;
  observeError({
    route: routeOf(req),
    status,
    code,
    message,
    ...(userId ? { userId } : {}),
  });
}
