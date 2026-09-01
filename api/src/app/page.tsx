"use client";

import { useEffect, useState } from "react";

/**
 * Where a confirmation link lands.
 *
 * WHY THIS PAGE EXISTS. Supabase sends every auth email's link to the
 * project's Site URL. That was still http://localhost:3000, so a new volunteer
 * clicking "confirm your email" landed on a browser connection error -- their
 * account WAS confirmed at that moment, but everything they could see said the
 * app was broken, and the natural response is to give up rather than to go
 * back and log in. Pointing Site URL at this deployment instead put them on a
 * bare 404, which is no better.
 *
 * This project has no website and is not buying a domain, so the Vercel
 * deployment that serves the API is the only address available to point at.
 * One static page at its root is the whole fix.
 *
 * IT CONFIRMS NOTHING ITSELF. By the time the browser gets here Supabase has
 * already verified the token and redirected; this page only reports what
 * happened. That is why it is safe for it to be a plain page with no session
 * and no Supabase client of its own.
 */

/** Palette lifted from constants/theme.ts so the page is recognisably V-HUB. */
const NAVY = "#12172B";
const CORAL = "#FF6B6B";
const TEXT = "#111827";
const MUTED = "#6B7280";

type Outcome = { ok: true } | { ok: false; message: string };

/**
 * Reads the outcome Supabase encoded in the URL.
 *
 * It arrives in one of two places depending on the flow: the query string
 * (?error=...) or the fragment (#error=...). The fragment is never sent to the
 * server, which is why this has to run in the browser.
 *
 * A FAILED LINK MUST NOT SAY "CONFIRMED". An expired or already-used link is
 * the single most likely non-success here -- Supabase's confirmation links are
 * one-shot and time-limited -- and telling someone their address is confirmed
 * when it is not sends them to a login that will refuse them, with no idea why.
 */
function readOutcome(): Outcome {
  if (typeof window === "undefined") return { ok: true };

  const query = new URLSearchParams(window.location.search);
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  const error = query.get("error") ?? fragment.get("error");
  if (!error) return { ok: true };

  const description =
    query.get("error_description") ?? fragment.get("error_description") ?? error;
  return { ok: false, message: description.replace(/\+/g, " ") };
}

export default function ConfirmationPage() {
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    setOutcome(readOutcome());

    // A SUCCESSFUL confirmation arrives with the new session's access and
    // refresh tokens in the fragment. Nothing here reads or needs them, but
    // leaving them in the address bar puts working credentials into browser
    // history and into anything the user might share a screenshot of. Clearing
    // the fragment costs nothing and is the same instinct as never storing a
    // signed document URL.
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        backgroundColor: "#F9FAFB",
        fontFamily:
          "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          backgroundColor: "#FFFFFF",
          borderRadius: 20,
          padding: 32,
          boxShadow: "0 12px 32px rgba(17, 24, 39, 0.08)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            margin: "0 auto 24px",
            backgroundColor: NAVY,
            color: "#FFFFFF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          V
        </div>

        {/* Nothing is asserted until the URL has been read in the browser --
            rendering "confirmed" first and correcting it a tick later would
            show the wrong answer to anyone on a slow phone. */}
        {outcome === null ? (
          <p style={{ color: MUTED, fontSize: 15, margin: 0 }}>Checking your link...</p>
        ) : outcome.ok ? (
          <>
            <h1 style={{ color: TEXT, fontSize: 22, margin: "0 0 12px", fontWeight: 700 }}>
              Your email is confirmed
            </h1>
            <p style={{ color: MUTED, fontSize: 15, lineHeight: 1.6, margin: "0 0 24px" }}>
              Thank you. You can close this page, open the V-HUB app and log in with your
              email and password.
            </p>
            <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
              V-HUB connects health volunteers with medical outreach organisations across
              Ghana.
            </p>
          </>
        ) : (
          <>
            <h1 style={{ color: TEXT, fontSize: 22, margin: "0 0 12px", fontWeight: 700 }}>
              This link did not work
            </h1>
            <p style={{ color: MUTED, fontSize: 15, lineHeight: 1.6, margin: "0 0 16px" }}>
              {outcome.message}
            </p>
            <p style={{ color: MUTED, fontSize: 15, lineHeight: 1.6, margin: 0 }}>
              Confirmation links can only be used once and expire after a while. Open the
              V-HUB app and try registering again with the same email to get a fresh one.
            </p>
            <div
              style={{
                height: 3,
                width: 48,
                backgroundColor: CORAL,
                borderRadius: 2,
                margin: "24px auto 0",
              }}
            />
          </>
        )}
      </div>
    </main>
  );
}
