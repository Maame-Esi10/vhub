"use client";

import { useEffect, useState } from "react";

/**
 * THE REAL MARK, IMPORTED FROM THE EXPO APP'S assets/ RATHER THAN COPIED HERE.
 *
 * The `@/*` alias in api/tsconfig.json points at the repo root, and
 * `outputFileTracingRoot` in next.config.ts already tells Vercel's bundler to
 * treat that root as in-scope -- the same arrangement that lets this project
 * import the one copy of the scoring math instead of mirroring it. So the page
 * renders the SAME FILE every screen in the app renders. A copy under
 * api/public/ would have been the conventional answer and was rejected for the
 * usual reason: two copies of an asset are two things to keep in step, and the
 * one nobody looks at is the one that goes stale.
 *
 * Imported for its `.src` and drawn with a plain <img> rather than next/image
 * on purpose. next/image would route a fixed-size logo through Vercel's image
 * optimiser, which is metered on the free tier; the static import already
 * gives a content-hashed, immutably-cached URL, which is all this needs.
 */
import logo from "@/assets/logo.png";

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

/** Palette lifted from constants/theme.ts so the page is recognisably VHub. */
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
    // Reads the URL fragment, which is an external system and unavailable during
    // render -- this page is prerendered, so the location does not exist on the
    // server pass. Synchronising with something outside React is what an effect
    // is for, which is why this is suppressed rather than restructured.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
        {/* No disc behind it: the mark is coral on transparent and the app's own
            brand strip shows it plain on a light ground. Width and height are
            set so the card does not reflow when the image arrives. */}
        {/*
          A plain <img>, not next/image, and deliberately: this is one fixed-size
          logo on a prerendered page, and next/image would put it through
          Vercel's metered image optimiser for no benefit.

          There is no `@next/next/no-img-element` disable directive here on
          purpose. This project has no ESLint config of its own -- it is linted
          by the repository root's Expo config, which does not load Next's
          plugin -- so the directive was itself reported as an error ("Definition
          for rule ... was not found"). Put it back if Next's own lint config is
          ever added here.
        */}
        <img
          src={logo.src}
          alt="VHub"
          width={64}
          height={64}
          style={{ display: "block", margin: "0 auto 24px" }}
        />

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
              Thank you. You can close this page, open the VHub app and log in with your
              email and password.
            </p>
            <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
              VHub connects health volunteers with medical outreach organisations across
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
              VHub app and try registering again with the same email to get a fresh one.
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
