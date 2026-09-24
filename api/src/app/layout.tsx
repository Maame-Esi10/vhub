import type { Metadata, Viewport } from "next";

/**
 * Root layout for the ONE page this API project serves (the landing page, which
 * doubles as where email-confirmation links land).
 *
 * Added 2026-09-01 alongside app/page.tsx. Everything else here is a route
 * handler under app/api/, which needs no layout -- this exists only because
 * the App Router requires a root layout before it will render any page at all.
 */

export const metadata: Metadata = {
  title: "VHub",
  description: "VHub - connecting health volunteers with medical outreach organisations across Ghana.",
  // Indexable since 2026-09-24, when the root became the landing page. It was
  // noindex while its only job was receiving email links. The auth tokens a
  // confirmation briefly carries are in the URL FRAGMENT, which a browser never
  // sends to any server, so no crawler can ever see them.
  robots: { index: true, follow: true },
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
