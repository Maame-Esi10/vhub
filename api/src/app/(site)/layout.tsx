import "./site.css";
import { SiteFooter, SiteHeader } from "./components";

/** Every website page: header, content, footer. The API routes never pass through here. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="vh-site">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
