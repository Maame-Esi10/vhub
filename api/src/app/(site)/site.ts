/**
 * The website's shared facts, in one place so every page says the same thing.
 *
 * EVERY CLAIM ON THE SITE MUST BE TRUE OF THE CODE, the same rule
 * constants/policy.ts lives under: no iPhone app, no invented user numbers,
 * no testimonials from people who do not exist.
 */

/**
 * Where every Download button points. THE ONE LINE TO CHANGE when a new
 * release APK is published: replace the id with the new Drive file's.
 *
 * The release APK (VHub-1.0.0.apk, 121 MB) lives on Google Drive, shared as
 * "anyone with the link". This is Drive's DIRECT download address, not the
 * share link: the share link opens Drive's preview page, and a file this size
 * then shows "too large to scan for viruses" before it will download at all.
 * `confirm=t` answers that page in advance, so the button starts the download.
 * Checked 2026-09-24: it returns the file itself (application/octet-stream).
 *
 * If Google ever changes that behaviour, the fallback is
 * https://drive.google.com/uc?export=download&id=<id>, which shows the warning
 * page first; the Download page already tells people to tap Download anyway.
 */
export const ANDROID_DOWNLOAD_URL =
  "https://drive.usercontent.google.com/download?id=1icfnBSn41KuWiwdqox_oAoN2Qlu_gPAy&export=download&confirm=t";

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/features", label: "Volunteers" },
  { href: "/organisations", label: "Organisations" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
] as const;

/** The release on the Download page. Keep in step with app.json's version. */
export const APP_VERSION = "1.0.0";
export const APK_SIZE = "121 MB";
