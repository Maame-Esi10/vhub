import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Serves the V-HUB mark at a stable public URL, for EMAIL CLIENTS.
 *
 * WHY THIS IS A ROUTE AND NOT A FILE IN `api/public/`.
 *
 * An email cannot reference a bundled asset. Supabase's "Confirm signup"
 * template is HTML rendered inside somebody's mail client, so a logo in it has
 * to be an `<img src="https://...">` pointing at a URL anyone can fetch
 * without a session.
 *
 * The obvious way to get one is to drop a copy of logo.png into `api/public/`.
 * That is explicitly what CLAUDE.md says not to do: the landing page imports
 * the mark from the Expo app's `assets/` through the `@/*` alias precisely so
 * there is ONE copy, and `outputFileTracingRoot` exists to support that
 * arrangement. A second copy would be a second thing to regenerate whenever
 * `scripts/generate-icons.js` is re-run, and the failure would be silent - the
 * email would simply keep showing the old mark.
 *
 * Reading the shared file at request time keeps the single copy and still
 * yields a plain URL. The cost is one function invocation per email opened,
 * which is nothing at this scale, and Gmail proxies and caches the image
 * anyway so most opens never reach us at all.
 *
 * `force-static` lets Next prerender it at build time, so in practice this
 * runs once per deployment rather than once per request.
 */
export const dynamic = "force-static";

export async function GET() {
  // From api/src/app/logo.png/ up to the repo root, then into the Expo app's
  // assets. `outputFileTracingRoot` already includes that directory in the
  // deployment bundle, which is what makes this readable at runtime.
  const file = path.join(process.cwd(), "..", "assets", "logo.png");

  try {
    const bytes = await readFile(file);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/png",
        // Long-lived: the mark changes roughly never, and an email opened a
        // year from now should still render it.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    // A missing logo must never turn into a 500 that the error monitor pages
    // somebody about. The email simply renders without the image, which is
    // what a blocked remote image looks like anyway.
    return new Response(null, { status: 404 });
  }
}
