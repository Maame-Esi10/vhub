import "./site.css";
import { SiteFooter, SiteHeader } from "./components";
import { RevealObserver } from "./motion";

/**
 * Every website page: header, content, footer. The API routes never pass
 * through here.
 *
 * The inline script adds `js` to <html> before first paint. Only under that
 * class do sections start hidden and animate in, so a visitor whose JavaScript
 * fails sees every section, still and complete, rather than a blank page.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site">
      <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
      <RevealObserver />
    </div>
  );
}
