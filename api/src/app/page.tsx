import { AuthLinkOutcome } from "./AuthLinkOutcome";
import { Landing } from "./Landing";

/**
 * The root address: the landing page, or the email-confirmation card when
 * Supabase sent the visitor here. See AuthLinkOutcome for how it decides.
 *
 * The landing page is a server component passed in as a prop, so its content
 * is in the prerendered HTML (fast on a slow connection, readable with
 * JavaScript off) and only the small decision above runs in the browser.
 */
export default function Home() {
  return <AuthLinkOutcome landing={<Landing />} />;
}
