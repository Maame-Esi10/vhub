/**
 * The website's shared facts, in one place so every page says the same thing.
 *
 * EVERY CLAIM ON THE SITE MUST BE TRUE OF THE CODE, the same rule
 * constants/policy.ts lives under: no iPhone app, no invented user numbers,
 * no testimonials from people who do not exist.
 */

/**
 * Where every Download button points.
 *
 * A GitHub RELEASE on the public repository Maame-Esi10/vhub-releases (the
 * code repository stays private). `releases/latest/download/VHub.apk` always
 * resolves to the asset of that name on whichever release is labelled Latest,
 * so PUBLISHING A NEW VERSION NEEDS NO CHANGE HERE: create a new release, mark
 * it Latest, attach the APK named exactly `VHub.apk`. Rename the asset, or
 * leave a release unlabelled, and this link returns 404.
 *
 * WHY NOT GOOGLE DRIVE (tried first, 2026-09-24). Drive will not hand a
 * 121 MB file over directly: it shows "Google Drive has detected issues with
 * your download... too large to scan... Download anyway" in front of it, and
 * the documented `confirm=t` bypass worked for a script but not for a signed-in
 * browser, which is what the owner saw. GitHub serves the file itself with the
 * Android package content type, checked the same day. Chrome's own "Download
 * anyway?" prompt remains, as it does for every APK from outside the Play Store.
 */
export const ANDROID_DOWNLOAD_URL = "https://github.com/Maame-Esi10/vhub-releases/releases/latest/download/VHub.apk";

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
