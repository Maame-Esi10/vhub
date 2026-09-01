import type { Metadata, Viewport } from "next";

/**
 * Root layout for the ONE page this API project serves.
 *
 * Added 2026-09-01 alongside app/page.tsx. Everything else here is a route
 * handler under app/api/, which needs no layout -- this exists only because
 * the App Router requires a root layout before it will render any page at all.
 */

export const metadata: Metadata = {
  title: "V-HUB",
  description: "V-HUB - connecting health volunteers with medical outreach organisations across Ghana.",
  // The page exists to be landed on from an email link, never to be found in a
  // search result, and it briefly carries auth tokens in its URL fragment.
  robots: { index: false, follow: false },
};

/** Almost every visitor arrives by tapping a link in a mail app on a phone. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
