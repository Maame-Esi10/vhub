import logo from "@/assets/logo.png";
import { APP_NAME } from "@/constants/brand";
import { DownloadQr, EcgLine, PeopleStack } from "./illustrations";
import { ANDROID_DOWNLOAD_URL, NAV_LINKS } from "./site";

/*
 * Shared pieces of the VHub website.
 *
 * NO DESIGN EXISTS FOR THE SITE in design-refs/, so it speaks the app's own
 * language (coral #FF6B6B, navy #12172B, the heart-and-V mark and its ECG
 * line) at a louder volume: a website has to stop somebody scrolling, which
 * the app never has to do.
 *
 * Plain <a> rather than next/link: the pages are static and small, and a full
 * navigation is what closes the phone menu (a <details> element, which needs
 * no JavaScript).
 */

export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <a href="/" className={`logo${inverted ? " logo--inverted" : ""}`} aria-label={`${APP_NAME} home`}>
      <img src={logo.src} alt="" width={36} height={36} />
      <span>{APP_NAME}</span>
    </a>
  );
}

export function DownloadButton({ label = "Download for Android", variant = "primary" }: { label?: string; variant?: "primary" | "light" | "dark" }) {
  return (
    <a className={`btn btn--${variant}`} href={ANDROID_DOWNLOAD_URL}>
      <AndroidIcon />
      {label}
    </a>
  );
}

export function SiteHeader() {
  return (
    <header className="header">
      <div className="header__inner">
        <Logo />
        <nav className="nav" aria-label="Main">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
        <a className="btn btn--primary btn--small header__cta" href="/download">
          Get the app
        </a>
        <details className="menu">
          <summary aria-label="Open menu">
            <span />
            <span />
            <span />
          </summary>
          <nav className="menu__panel" aria-label="Mobile">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
                <span aria-hidden="true">→</span>
              </a>
            ))}
            <a className="btn btn--primary" href="/download">
              Get the app
            </a>
          </nav>
        </details>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="footer">
      <EcgLine className="footer__ecg" />
      <div className="footer__inner">
        <div className="footer__brand">
          <Logo inverted />
          <p>Connecting health volunteers with medical outreach across Ghana.</p>
          <DownloadButton variant="light" label="Get the app" />
        </div>
        <div className="footer__cols">
          <div>
            <h4>Product</h4>
            <a href="/features">For volunteers</a>
            <a href="/organisations">For organisations</a>
            <a href="/download">Download</a>
          </div>
          <div>
            <h4>VHub</h4>
            <a href="/about">About</a>
            <a href="/faq">FAQ</a>
          </div>
          <div>
            <h4>Legal</h4>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </div>
        </div>
      </div>
      <div className="footer__base">
        <span>
          © {year} {APP_NAME}
        </span>
        <span>
          Built with <span className="heart" aria-label="love">♥</span> by Melissa
        </span>
      </div>
    </footer>
  );
}

/** Every page but the home page opens with this band. */
export function PageHero({
  eyebrow,
  title,
  lead,
  visual,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lead: string;
  visual?: React.ReactNode;
}) {
  return (
    <section className="pagehero">
      <div className="aurora" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="container pagehero__grid">
        <div className="pagehero__copy">
          <p className="eyebrow eyebrow--light">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="lead lead--light">{lead}</p>
        </div>
        {visual ? <div className="pagehero__visual">{visual}</div> : null}
      </div>
      <EcgLine className="pagehero__ecg" />
    </section>
  );
}

export function SectionHeading({ eyebrow, title, lead, center }: { eyebrow: string; title: React.ReactNode; lead?: string; center?: boolean }) {
  return (
    <div className={`heading reveal${center ? " heading--center" : ""}`}>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {lead ? <p className="lead">{lead}</p> : null}
    </div>
  );
}

/** The closing band on every page: the download, and a code to scan from a computer. */
export function CtaBand({ title, body }: { title: string; body: string }) {
  return (
    <section className="section">
      <div className="container">
        <div className="cta reveal">
          <div className="cta__glow" aria-hidden="true" />
          <div className="cta__copy">
            <PeopleStack size={40} />
            <h2>{title}</h2>
            <p>{body}</p>
            <div className="actions">
              <DownloadButton variant="light" />
              <a className="btn btn--ghost" href="/faq">
                Questions? Read the FAQ
              </a>
            </div>
          </div>
          <div className="cta__qr">
            <DownloadQr size={150} />
            <p>On a computer? Scan with your phone.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- icons

type IconProps = { size?: number };

function Svg({ size = 22, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const Icons = {
  target: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </Svg>
  ),
  bolt: (p: IconProps) => (
    <Svg {...p}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
    </Svg>
  ),
  calendar: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </Svg>
  ),
  bell: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </Svg>
  ),
  shield: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  ),
  lock: (p: IconProps) => (
    <Svg {...p}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Svg>
  ),
  pin: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 21s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </Svg>
  ),
  users: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.9.8 3.1 2.6 3.5 5.2" />
    </Svg>
  ),
  chart: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </Svg>
  ),
  star: (p: IconProps) => (
    <Svg {...p}>
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />
    </Svg>
  ),
  heart: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 20s-7.5-4.6-9.3-9.2C1.4 7.3 3.6 4 7 4c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.4 0 5.6 3.3 4.3 6.8C19.5 15.4 12 20 12 20z" />
    </Svg>
  ),
  check: (p: IconProps) => (
    <Svg {...p}>
      <path d="m5 12 5 5 9-10" />
    </Svg>
  ),
  search: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Svg>
  ),
  qr: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3M21 14v7h-4M14 18v3" />
    </Svg>
  ),
};

export type IconName = keyof typeof Icons;

export function Feature({ icon, title, body, tone = "coral", delay = 0 }: { icon: IconName; title: string; body: string; tone?: "coral" | "navy" | "teal" | "violet" | "amber"; delay?: number }) {
  const Icon = Icons[icon];
  return (
    <article className={`feature feature--${tone} reveal`} style={{ transitionDelay: `${delay}s` }}>
      <span className="feature__icon">
        <Icon />
      </span>
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}

function AndroidIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.6 9.48 19.44 6.3a.5.5 0 0 0-.87-.5l-1.87 3.23A11.4 11.4 0 0 0 12 8a11.4 11.4 0 0 0-4.7 1.03L5.43 5.8a.5.5 0 0 0-.87.5L6.4 9.48A10.8 10.8 0 0 0 1 18h22a10.8 10.8 0 0 0-5.4-8.52ZM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z" />
    </svg>
  );
}
