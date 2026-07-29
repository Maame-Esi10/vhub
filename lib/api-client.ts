import type { Layer1MatchResult } from '@/lib/matching/layer1';
import { supabase } from '@/lib/supabase';
import type { VScoreBand, VScorePenaltyType } from '@/lib/vscore';
import type { ApplicationStatus } from '@/types/database';

/**
 * Typed fetch wrapper around the serverless API in `api/` (deployed on
 * Vercel). Screens never call this directly -- hooks in `hooks/` do, and
 * screens consume those hooks (CLAUDE.md conventions).
 *
 * Everything that needs a secret (Gemini, Resend, the Supabase service-role
 * key) or heavy compute lives behind these endpoints. This module holds NO
 * secrets: it forwards the caller's own Supabase access token, which the API
 * verifies with `auth.getUser()` before doing any work.
 */

const rawBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!rawBaseUrl) {
  throw new Error(
    'Missing EXPO_PUBLIC_API_BASE_URL environment variable (see .env.example).'
  );
}

/**
 * Normalised base URL -- trailing slashes stripped so `${API_BASE_URL}${path}`
 * never produces a double slash. `.env` holds the origin only
 * (`https://vhub-mu.vercel.app`); the `/api/...` prefix belongs to the paths
 * below, so the deployed routes resolve as e.g.
 * `https://vhub-mu.vercel.app/api/match`.
 */
export const API_BASE_URL = rawBaseUrl.replace(/\/+$/, '');

/** Endpoint paths, matching the route files under `api/src/app/api/`. */
export const API_ROUTES = {
  match: '/api/match',
  vscore: '/api/vscore',
  applicationStatus: '/api/application-status',
  notifications: '/api/notifications',
} as const;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Mirrors `ApiErrorBody` in api/src/server/httpErrors.ts. */
interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) return false;
  const { error } = value as { error?: unknown };
  if (typeof error !== 'object' || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return typeof code === 'string' && typeof message === 'string';
}

/**
 * Thrown for any non-2xx response, and for network failures (where `status`
 * is 0 and `code` is `network_error`). `message` is always safe to surface in
 * the UI -- the API never puts internals in it.
 */
export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** True when the session was missing, expired, or rejected -- the caller should re-authenticate. */
  get isAuthError(): boolean {
    return this.status === 401;
  }

  /** True when the request never reached the API at all (offline, DNS, TLS, timeout). */
  get isNetworkError(): boolean {
    return this.code === 'network_error';
  }
}

// ---------------------------------------------------------------------------
// Core request helper
// ---------------------------------------------------------------------------

/** Requests that take longer than this are aborted and surfaced as a network error. */
const REQUEST_TIMEOUT_MS = 20_000;

interface RequestOptions {
  /** Attach the signed-in user's Supabase access token. Default true -- every real endpoint requires it. */
  authenticated?: boolean;
  signal?: AbortSignal;
}

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) {
    throw new ApiClientError(401, 'unauthenticated', 'You are not signed in. Please sign in again.');
  }
  return token;
}

/**
 * POSTs JSON to `path` and returns the parsed response.
 *
 * Every endpoint in this API is POST-only except the cron route (which the
 * app never calls -- Vercel Cron invokes it directly with CRON_SECRET).
 */
async function apiPost<TResponse>(
  path: string,
  body: unknown,
  options: RequestOptions = {}
): Promise<TResponse> {
  const { authenticated = true, signal } = options;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authenticated) {
    headers.Authorization = `Bearer ${await getAccessToken()}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    // fetch only rejects when the request never completed -- offline, DNS
    // failure, TLS failure, or our own timeout above.
    throw new ApiClientError(
      0,
      'network_error',
      'Could not reach the server. Check your connection and try again.',
      err instanceof Error ? err.message : undefined
    );
  } finally {
    clearTimeout(timeout);
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (isApiErrorBody(payload)) {
      throw new ApiClientError(
        response.status,
        payload.error.code,
        payload.error.message,
        payload.error.details
      );
    }
    // Non-JSON failure -- e.g. a Vercel platform error page rather than one of
    // our own routes.
    throw new ApiClientError(
      response.status,
      'unexpected_response',
      `The server returned an unexpected ${response.status} response.`
    );
  }

  return payload as TResponse;
}

// ---------------------------------------------------------------------------
// /api/match
// ---------------------------------------------------------------------------

export interface ScoredApplicant {
  applicationId: string;
  volunteerId: string;
  matchScore: number;
  breakdown: Layer1MatchResult;
}

export interface ScoreApplicantsResponse {
  outreachId: string;
  results: ScoredApplicant[];
}

/**
 * Recomputes and persists `applications.match_score` for an outreach the
 * caller's organisation owns, returning the applicants sorted best-first.
 * Runs Layer 1 always, Layer 2 (Gemini) as a best-effort enrichment.
 *
 * Pass `volunteerIds` to rescore only some applications (e.g. one new
 * application) instead of all of them.
 */
export function scoreApplicants(
  outreachId: string,
  volunteerIds?: string[],
  options?: RequestOptions
): Promise<ScoreApplicantsResponse> {
  return apiPost<ScoreApplicantsResponse>(
    API_ROUTES.match,
    { mode: 'score_applicants', outreachId, volunteerIds },
    options
  );
}

export interface NotifyCandidatesResponse {
  outreachId: string;
  /** Volunteer ids that were pushed a "new high-match outreach" notification. */
  notified: string[];
}

/** Pushes a "new high-match outreach" notification to strong non-applicants (organisation only, open outreaches only). */
export function notifyCandidates(
  outreachId: string,
  options?: RequestOptions
): Promise<NotifyCandidatesResponse> {
  return apiPost<NotifyCandidatesResponse>(
    API_ROUTES.match,
    { mode: 'notify_candidates', outreachId },
    options
  );
}

// ---------------------------------------------------------------------------
// /api/vscore
// ---------------------------------------------------------------------------

export interface VScoreReviewResponse {
  volunteerId: string;
  oldScore: number;
  newScore: number;
  band: VScoreBand;
  eventOutcome: number;
}

export interface SubmitEventReviewInput {
  outreachId: string;
  volunteerId: string;
  attended: boolean;
  reliabilityScore?: number | null;
  clinicalScore?: number | null;
  notes?: string;
}

/** Files the organisation's post-event review and blends it into the volunteer's V-Score. */
export function submitEventReview(
  input: SubmitEventReviewInput,
  options?: RequestOptions
): Promise<VScoreReviewResponse> {
  return apiPost<VScoreReviewResponse>(API_ROUTES.vscore, { action: 'review', ...input }, options);
}

export interface VScorePenaltyResponse {
  volunteerId: string;
  oldScore: number;
  newScore: number;
  band: VScoreBand;
  /** The flat penalty applied, as a negative number. */
  penalty: number;
}

export interface ApplyVScorePenaltyInput {
  outreachId: string;
  volunteerId: string;
  applicationId: string;
  penaltyType: VScorePenaltyType;
}

/**
 * Applies a no-show / cancellation penalty. The owning organisation may apply
 * any type; a volunteer may only confirm their own cancellation penalty, and
 * only when it matches what the database already stamped.
 */
export function applyVScorePenalty(
  input: ApplyVScorePenaltyInput,
  options?: RequestOptions
): Promise<VScorePenaltyResponse> {
  return apiPost<VScorePenaltyResponse>(API_ROUTES.vscore, { action: 'penalty', ...input }, options);
}

// ---------------------------------------------------------------------------
// /api/application-status
// ---------------------------------------------------------------------------

interface ApplicationSummary {
  id: string;
  outreach_id: string;
  volunteer_id: string;
  status: string;
  match_score: number | null;
}

export interface ApplicationStatusResponse {
  application: ApplicationSummary;
  /** The waitlisted applicant auto-promoted into the freed slot, if any. */
  promoted: ApplicationSummary | null;
}

/**
 * Sets an application's status, sending the applicant the transactional email
 * + push and auto-promoting the best waitlisted applicant when an accepted
 * spot is cancelled. Idempotent, so it is safe to call after
 * `useCancelApplication` has already written `cancelled` directly.
 */
export function setApplicationStatus(
  applicationId: string,
  status: Extract<ApplicationStatus, 'accepted' | 'rejected' | 'waitlisted' | 'cancelled'>,
  options?: RequestOptions
): Promise<ApplicationStatusResponse> {
  return apiPost<ApplicationStatusResponse>(
    API_ROUTES.applicationStatus,
    { applicationId, status },
    options
  );
}

// ---------------------------------------------------------------------------
// /api/notifications
// ---------------------------------------------------------------------------

/** Registers this device's Expo push token against the signed-in user. */
export function registerPushToken(
  expoPushToken: string,
  options?: RequestOptions
): Promise<{ registered: boolean }> {
  return apiPost<{ registered: boolean }>(
    API_ROUTES.notifications,
    { action: 'register', expoPushToken },
    options
  );
}

/** Sends a push to the caller's own registered device(s). Manual QA only -- cannot target anyone else. */
export function sendTestPush(
  title: string,
  body: string,
  options?: RequestOptions
): Promise<{ dispatched: number }> {
  return apiPost<{ dispatched: number }>(
    API_ROUTES.notifications,
    { action: 'test-dispatch', title, body },
    options
  );
}

// ---------------------------------------------------------------------------
// Connectivity check
// ---------------------------------------------------------------------------

export type ApiReachability =
  | { reachable: true; authenticated: boolean; baseUrl: string }
  | { reachable: false; baseUrl: string; reason: string };

/**
 * Verifies the app can actually reach the deployed API, without needing a
 * signed-in session and without mutating anything.
 *
 * It deliberately sends an UNAUTHENTICATED request to /api/match. A healthy
 * deployment answers `401 { error: { code: "unauthenticated" } }` -- which
 * proves DNS, TLS, routing and the handler are all working, since only the
 * real route produces that body. A network failure means the base URL is
 * wrong or the device is offline; anything else means the URL resolved to
 * something that is not this API.
 */
export async function pingApi(): Promise<ApiReachability> {
  try {
    await apiPost(API_ROUTES.match, {}, { authenticated: false });
    // A 2xx here would mean the endpoint accepted an unauthenticated,
    // empty-bodied request -- it never should.
    return { reachable: false, baseUrl: API_BASE_URL, reason: 'API responded without requiring authentication.' };
  } catch (err) {
    if (!(err instanceof ApiClientError)) throw err;
    if (err.isNetworkError) {
      return { reachable: false, baseUrl: API_BASE_URL, reason: err.message };
    }
    if (err.code === 'unauthenticated') {
      return { reachable: true, authenticated: false, baseUrl: API_BASE_URL };
    }
    // Reached *something*, but not a response this API produces.
    return {
      reachable: false,
      baseUrl: API_BASE_URL,
      reason: `Unexpected ${err.status} response (${err.code}) -- check EXPO_PUBLIC_API_BASE_URL.`,
    };
  }
}
