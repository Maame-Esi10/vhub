import logo from "@/assets/logo.png";
import { APP_NAME } from "@/constants/brand";
import { ANDROID_DOWNLOAD_URL, NAV_LINKS } from "./site";

/*
 * Shared pieces of the VHub website.
 *
 * NO DESIGN EXISTS FOR THE SITE in design-refs/, so it speaks the app's own
 * visual language: coral #FF6B6B and navy #12172B from constants/theme.ts,
 * white rounded cards, Inter. The illustrations below are drawn in HTML from
 * the app's real components (the feed card and its match pill, the V-Score
 * card's coral-to-navy track and knob, the check-in QR) rather than being
 * screenshots, so they stay sharp at every size and cannot go stale against a
 * screen that has since changed shape.
 *
 * Plain <a> rather than next/link throughout: the pages are static and small,
 * and a full navigation is what closes the mobile menu (a <details> element,
 * which needs no JavaScript at all).
 */

export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <a href="/" className={`vh-logo${inverted ? " vh-logo--inverted" : ""}`} aria-label={`${APP_NAME} home`}>
      <img src={logo.src} alt="" width={34} height={34} />
      <span>{APP_NAME}</span>
    </a>
  );
}

export function DownloadButton({ label = "Download for Android", variant = "primary" }: { label?: string; variant?: "primary" | "light" }) {
  return (
    <a className={`vh-btn vh-btn--${variant}`} href={ANDROID_DOWNLOAD_URL}>
      <AndroidIcon />
      {label}
    </a>
  );
}

export function SiteHeader() {
  return (
    <header className="vh-header">
      <div className="vh-header__inner">
        <Logo />
        <nav className="vh-nav" aria-label="Main">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
        <a className="vh-btn vh-btn--primary vh-btn--small vh-header__cta" href="/download">
          Get the app
        </a>
        <details className="vh-menu">
          <summary aria-label="Open menu">
            <span />
            <span />
            <span />
          </summary>
          <nav className="vh-menu__panel" aria-label="Mobile">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
            <a className="vh-btn vh-btn--primary" href="/download">
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
    <footer className="vh-footer">
      <div className="vh-footer__inner">
        <div className="vh-footer__brand">
          <Logo inverted />
          <p>Connecting health volunteers with medical outreach across Ghana.</p>
        </div>
        <div className="vh-footer__cols">
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
      <div className="vh-footer__base">
        <span>
          © {year} {APP_NAME}
        </span>
        <span>
          Built with <span className="vh-heart" aria-label="love">♥</span> by Melissa
        </span>
      </div>
    </footer>
  );
}

/** A page's opening band, for every page but the home page. */
export function PageHero({ eyebrow, title, lead }: { eyebrow: string; title: string; lead: string }) {
  return (
    <section className="vh-pagehero">
      <div className="vh-container">
        <p className="vh-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="vh-lead">{lead}</p>
      </div>
    </section>
  );
}

export function CtaBand({ title, body }: { title: string; body: string }) {
  return (
    <section className="vh-section">
      <div className="vh-container">
        <div className="vh-cta">
          <div>
            <h2>{title}</h2>
            <p>{body}</p>
          </div>
          <div className="vh-cta__actions">
            <DownloadButton variant="light" />
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Illustrations, drawn from the app's real components. The sample outreaches
// are illustrative and say so in their alt text.
// ---------------------------------------------------------------------------

const SAMPLE_FEED = [
  { org: "COMMUNITY HEALTH NETWORK", title: "Free eye screening", place: "Kumasi, Ashanti", date: "Sat 11 Oct", score: 94, tone: "coral" },
  { org: "STUDENTS FOR HEALTH", title: "Blood pressure & diabetes check", place: "Madina, Greater Accra", date: "Sat 18 Oct", score: 87, tone: "navy" },
  { org: "HOPE MEDICAL OUTREACH", title: "Maternal health day", place: "Tamale, Northern", date: "Sun 26 Oct", score: 72, tone: "sand" },
];

export function PhoneFeed() {
  return (
    <div className="vh-phone" role="img" aria-label="The VHub feed on a phone, showing sample outreaches ranked by match score">
      <div className="vh-phone__notch" />
      <div className="vh-phone__screen">
        <div className="vh-phone__top">
          <div>
            <small>Good morning</small>
            <strong>Outreaches for you</strong>
          </div>
          <span className="vh-phone__bell" />
        </div>
        <div className="vh-phone__chips">
          <span className="is-on">All</span>
          <span>Clinical</span>
          <span>Support</span>
        </div>
        {SAMPLE_FEED.map((item) => (
          <div key={item.title} className="vh-feedcard">
            <div className={`vh-feedcard__banner vh-feedcard__banner--${item.tone}`}>
              <span className="vh-pill">
                <i />
                {item.score}% MATCH
              </span>
            </div>
            <div className="vh-feedcard__body">
              <small>{item.org}</small>
              <strong>{item.title}</strong>
              <span>
                {item.place} · {item.date}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MatchIllustration() {
  const rows = [
    { label: "Skills", weight: 35, value: 1 },
    { label: "Category", weight: 20, value: 1 },
    { label: "Location", weight: 20, value: 0.5 },
    { label: "Availability", weight: 15, value: 1 },
    { label: "Experience", weight: 10, value: 0.6 },
  ];
  const total = Math.round(rows.reduce((sum, row) => sum + row.weight * row.value, 0));
  return (
    <div className="vh-illo" role="img" aria-label={`An example match score of ${total} percent, broken into its five parts`}>
      <div className="vh-illo__head">
        <span>Why this match</span>
        <strong>{total}%</strong>
      </div>
      {rows.map((row) => (
        <div key={row.label} className="vh-bar">
          <span>{row.label}</span>
          <div className="vh-bar__track">
            <div className="vh-bar__fill" style={{ width: `${row.value * 100}%` }} />
          </div>
          <em>{Math.round(row.weight * row.value)}</em>
        </div>
      ))}
    </div>
  );
}

export function VScoreIllustration() {
  const score = 82;
  return (
    <div className="vh-illo" role="img" aria-label={`An example V-Score of ${score}, in the Trusted band`}>
      <div className="vh-illo__head">
        <span>Your V-Score</span>
        <strong>{score}</strong>
      </div>
      <div className="vh-vscore__track">
        <div className="vh-vscore__knob" style={{ left: `calc(${score}% - 11px)` }} />
      </div>
      <div className="vh-vscore__bands">
        <span>At Risk</span>
        <span>Developing</span>
        <span>Active</span>
        <span className="is-on">Trusted</span>
        <span>Elite</span>
      </div>
    </div>
  );
}

export function CheckinIllustration() {
  // A fixed pattern that reads as a QR code; it encodes nothing.
  const cells = "1110111010110101101011101100101011010111011101001011101101011010111011010";
  return (
    <div className="vh-illo vh-illo--center" role="img" aria-label="A check-in QR code for an outreach day">
      <div className="vh-qr">
        {cells.split("").slice(0, 49).map((cell, index) => (
          <i key={index} className={cell === "1" ? "is-on" : undefined} />
        ))}
      </div>
      <p className="vh-illo__caption">Scan at the venue to check in for today</p>
    </div>
  );
}

export function RosterIllustration() {
  const people = [
    { name: "Nurse · Experienced", score: 96, v: 88, state: "Accepted" },
    { name: "Doctor · Intermediate", score: 91, v: 79, state: "Accepted" },
    { name: "Student · Beginner", score: 84, v: 70, state: "Accepted" },
    { name: "Midwife · Experienced", score: 80, v: 74, state: "Waitlisted" },
  ];
  return (
    <div className="vh-illo" role="img" aria-label="An organisation's applicants, ranked, with the top three accepted and the next waitlisted">
      <div className="vh-illo__head">
        <span>Applicants · 3 places</span>
        <strong className="vh-illo__action">Accept top 3</strong>
      </div>
      {people.map((person) => (
        <div key={person.name} className="vh-roster">
          <span className="vh-roster__avatar" />
          <div>
            <strong>{person.name}</strong>
            <small>
              {person.score}% match · V-Score {person.v}
            </small>
          </div>
          <em className={person.state === "Accepted" ? "is-ok" : "is-wait"}>{person.state}</em>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons: inline SVG, so the site needs no icon library.
// ---------------------------------------------------------------------------

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
};

export type IconName = keyof typeof Icons;

export function Feature({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  const Icon = Icons[icon];
  return (
    <article className="vh-feature">
      <span className="vh-feature__icon">
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
