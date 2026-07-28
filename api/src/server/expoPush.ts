import { env } from "./env";

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
/** Expo's push API accepts at most 100 messages per request. */
const EXPO_BATCH_SIZE = 100;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Dispatches a batch of Expo push notifications. Best-effort: push delivery
 * is a courtesy, not a source of truth (the underlying DB write already
 * happened by the time this runs), so failures are logged and swallowed
 * rather than thrown -- a down Expo push service must never fail the
 * request that triggered the notification (an accept/reject decision, a
 * V-Score recompute, a new-match scan).
 */
export async function dispatchExpoPush(messages: readonly ExpoPushMessage[]): Promise<void> {
  const valid = messages.filter((m) => m.to.startsWith("ExponentPushToken") || m.to.startsWith("ExpoPushToken"));
  if (valid.length === 0) return;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (env.expoAccessToken) {
    headers.Authorization = `Bearer ${env.expoAccessToken}`;
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
      }
    } catch (err) {
      console.error("[expo-push] dispatch failed:", err instanceof Error ? err.message : err);
    }
  }
}
