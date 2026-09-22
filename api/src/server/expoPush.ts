import { env } from "./env";

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/** What Expo said about one message, reduced to the part worth acting on. */
export interface ExpoPushFailure {
  /**
   * Expo's own error code: DeviceNotRegistered, MessageTooBig,
   * MessageRateExceeded, MismatchSenderId, InvalidCredentials. Absent when
   * Expo rejected the request before it got as far as per-message tickets.
   */
  code: string | null;
  message: string;
}

export interface ExpoPushResult {
  /** Messages Expo accepted for delivery. Not a delivery confirmation. */
  accepted: number;
  failed: number;
  /** Deduplicated by code, so one broken credential is one line and not forty. */
  failures: ExpoPushFailure[];
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
/** Expo's push API accepts at most 100 messages per request. */
const EXPO_BATCH_SIZE = 100;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** One ticket from Expo's response. Narrowed by hand: the shape is small and stable. */
function readTicket(ticket: unknown): ExpoPushFailure | null {
  if (!ticket || typeof ticket !== "object") return null;
  const record = ticket as Record<string, unknown>;
  if (record.status !== "error") return null;

  const details = record.details as Record<string, unknown> | undefined;
  return {
    code: typeof details?.error === "string" ? details.error : null,
    message: typeof record.message === "string" ? record.message : "Expo rejected the notification.",
  };
}

/**
 * Dispatches a batch of Expo push notifications and REPORTS WHAT EXPO SAID.
 *
 * WHY THE RESULT EXISTS (owner-reported, 2026-09-22: the test push wrote its
 * in-app row, the app said it had been sent, and the phone never made a sound).
 *
 * This function used to fire the request and read nothing but the HTTP status.
 * That is the wrong thing to check, and it is wrong in the most misleading
 * possible direction: Expo answers 200 for a request it has ACCEPTED, then
 * reports what happened to each individual message in a ticket array in the
 * body. A push that cannot be delivered at all -- an Android FCM credential
 * that does not match the one compiled into the app, a token belonging to an
 * app that has since been reinstalled -- comes back as 200 with an error
 * ticket. So the one place the real reason is written was the one place nobody
 * looked, and "it says it sent and nothing arrives" was unanswerable from
 * inside VHub.
 *
 * The common codes and what each one means here:
 *
 *   - `DeviceNotRegistered` -- the token is dead. The app was uninstalled, or
 *     the data cleared. The token should be removed.
 *   - `MismatchSenderId` -- the FCM credential Expo holds is not the one the
 *     installed app was built with. The classic symptom is exactly this one:
 *     everything reports success and no notification ever arrives.
 *   - `InvalidCredentials` -- no usable FCM credential is uploaded at all.
 *   - `MessageTooBig` / `MessageRateExceeded` -- ours to fix, and neither has
 *     ever been seen here.
 *
 * STILL BEST-EFFORT, AND STILL NEVER THROWS. Push is a courtesy; the database
 * write that triggered it has already happened. What changed is only that the
 * failure is now RECORDED where it can be read, rather than discarded --
 * which is the same rule the swallowed email failures and the post-sign-in
 * auth errors are held to.
 */
export async function dispatchExpoPush(
  messages: readonly ExpoPushMessage[]
): Promise<ExpoPushResult> {
  const valid = messages.filter(
    (m) => m.to.startsWith("ExponentPushToken") || m.to.startsWith("ExpoPushToken")
  );
  const result: ExpoPushResult = { accepted: 0, failed: 0, failures: [] };
  if (valid.length === 0) return result;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (env.expoAccessToken) {
    headers.Authorization = `Bearer ${env.expoAccessToken}`;
  }

  const seen = new Set<string>();
  function record(failure: ExpoPushFailure) {
    result.failed += 1;
    const key = failure.code ?? failure.message;
    if (seen.has(key)) return;
    seen.add(key);
    result.failures.push(failure);
    console.error(`[expo-push] ${failure.code ?? "error"}: ${failure.message}`);
  }

  for (const batch of chunk(valid, EXPO_BATCH_SIZE)) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(
          batch.map((m) => ({ to: m.to, title: m.title, body: m.body, data: m.data, sound: "default" }))
        ),
      });

      if (!res.ok) {
        console.error("[expo-push] non-2xx response:", res.status);
        record({ code: null, message: `Expo's push service answered ${res.status}.` });
        continue;
      }

      /*
        A 200 carries `{ data: Ticket[] }` on success and `{ errors: [...] }`
        when the whole request was rejected. Parsing is wrapped because a
        malformed body must not become an exception on a best-effort path.
      */
      const payload = (await res.json()) as { data?: unknown; errors?: unknown };
      const tickets = Array.isArray(payload.data) ? payload.data : [];

      if (tickets.length === 0 && Array.isArray(payload.errors) && payload.errors.length > 0) {
        for (const err of payload.errors) {
          const asRecord = err as Record<string, unknown>;
          record({
            code: typeof asRecord?.code === "string" ? asRecord.code : null,
            message:
              typeof asRecord?.message === "string"
                ? asRecord.message
                : "Expo rejected the whole request.",
          });
        }
        continue;
      }

      for (const ticket of tickets) {
        const failure = readTicket(ticket);
        if (failure) record(failure);
        else result.accepted += 1;
      }
    } catch (err) {
      console.error("[expo-push] dispatch failed:", err instanceof Error ? err.message : err);
      record({
        code: null,
        message: err instanceof Error ? err.message : "The push service could not be reached.",
      });
    }
  }

  return result;
}
