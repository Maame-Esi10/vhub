import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

/**
 * Root layout for the VHub website (the pages under `(site)/`) and for the
 * email-confirmation card that shares its root address.
 *
 * Everything else in this project is a route handler under app/api/, which
 * needs no layout; the App Router still demands this one before any page will
 * render.
 *
 * Inter comes through next/font, which is part of Next itself (no new
 * dependency): the font files are fetched once at build time and served from
 * this deployment, so a visitor's phone never makes a request to Google.
 */
const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://vhub-mu.vercel.app"),
  title: {
    default: "VHub | Health volunteers and medical outreach in Ghana",
    template: "%s | VHub",
  },
  description:
    "VHub connects nurses, doctors, midwives, pharmacists, health students and first aiders with the organisations running medical outreach across Ghana.",
  // Indexable since 2026-09-24, when the root became the website. It was
  // noindex while its only job was receiving email links. The auth tokens a
  // confirmation briefly carries are in the URL FRAGMENT, which a browser never
  // sends to any server, so no crawler can ever see them.
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#12172B",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className} style={{ margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
