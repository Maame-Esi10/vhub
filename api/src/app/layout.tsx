import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import favicon from "@/assets/favicon.png";
import appIcon from "@/assets/icon.png";

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
  // THE TAB ICON (added 2026-09-24). The site declared none, so browsers fell
  // back to /favicon.ico, found nothing, and kept showing whatever icon they
  // had cached for the address. These are the app's own brand files, imported
  // from assets/ like the logo rather than copied, so there is still one copy
  // and scripts/generate-icons.js stays their only author: favicon.png (96px)
  // for the tab, icon.png (1024px) for a phone's home screen shortcut.
  icons: {
    icon: [{ url: favicon.src, type: "image/png", sizes: "96x96" }],
    shortcut: [{ url: favicon.src, type: "image/png" }],
    apple: [{ url: appIcon.src, sizes: "1024x1024" }],
  },
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
