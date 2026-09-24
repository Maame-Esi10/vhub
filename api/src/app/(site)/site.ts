/**
 * The website's shared facts, in one place so every page says the same thing.
 *
 * EVERY CLAIM ON THE SITE MUST BE TRUE OF THE CODE, the same rule
 * constants/policy.ts lives under: no iPhone app, no invented user numbers,
 * no testimonials from people who do not exist.
 */

/**
 * Where every Download button points. THE ONE LINE TO CHANGE when a new
 * release APK is published.
 *
 * An EAS build link is not a permanent home: it belongs to one build and is
 * not meant to be shared publicly. Until the release APK has a stable address
 * (a shared Drive file or a GitHub release), this is the latest build.
 */
export const ANDROID_DOWNLOAD_URL =
  "https://expo.dev/artifacts/eas/-7GdLBl8CjxWZhGOmTAvDRoBbbT2HGFt1py_vFTArao.apk";

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/features", label: "Volunteers" },
  { href: "/organisations", label: "Organisations" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
] as const;
