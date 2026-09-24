import { APP_INTRO, APP_TAGLINE_LINES } from "@/constants/brand";
import { AuthLinkOutcome } from "./AuthLinkOutcome";
import {
  CheckinIllustration,
  CtaBand,
  DownloadButton,
  Feature,
  MatchIllustration,
  PhoneFeed,
  RosterIllustration,
  VScoreIllustration,
} from "./components";

/**
 * The home page, which shares its address with the email-confirmation card:
 * Supabase sends every confirmation link to this root. AuthLinkOutcome shows
 * the card only when the URL carries Supabase's auth parameters.
 */
export default function HomePage() {
  return <AuthLinkOutcome landing={<Home />} />;
}

const ROLES = ["Nurses", "Doctors", "Midwives", "Pharmacists", "Health students", "First aiders"];

function Home() {
  return (
    <>
      <section className="vh-hero">
        <div className="vh-container vh-hero__grid">
          <div className="vh-hero__copy">
            <p className="vh-badge">
              <span />
              Medical outreach, across all 16 regions of Ghana
            </p>
            <h1>
              {APP_TAGLINE_LINES.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </h1>
            <p className="vh-lead vh-lead--light">{APP_INTRO}</p>
            <div className="vh-actions">
              <DownloadButton />
              <a className="vh-btn vh-btn--ghost" href="/organisations">
                For organisations
              </a>
            </div>
            <p className="vh-hero__note">Free for volunteers and organisations. Available now on Android.</p>
          </div>
          <div className="vh-hero__visual">
            <PhoneFeed />
          </div>
        </div>
      </section>

      <section className="vh-roles" aria-label="Who VHub is for">
        <div className="vh-container">
          <p>Built for the people who make outreach happen</p>
          <ul>
            {ROLES.map((role) => (
              <li key={role}>{role}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="vh-section">
        <div className="vh-container">
          <div className="vh-heading">
            <p className="vh-eyebrow">Why VHub</p>
            <h2>Outreach organising, without the group chats</h2>
            <p className="vh-lead">
              Volunteers find events that fit them. Organisers fill their places with the right
              people. Everyone knows where they stand.
            </p>
          </div>
          <div className="vh-features">
            <Feature icon="target" title="Matched, not scrolled" body="Your feed is ranked on your skills, category, location, availability and experience, so the outreaches that need you come first." />
            <Feature icon="bolt" title="Join in a tap" body="Support roles are open to everyone with Quick Join. Clinical roles take a short professional application." />
            <Feature icon="shield" title="Verified on both sides" body="Organisations are checked before they can publish, and clinical roles need a reviewed credential." />
            <Feature icon="bell" title="Nothing slips" body="Reminders before the day, instant updates on your applications, and your waitlist place as it moves." />
          </div>
        </div>
      </section>

      <section className="vh-section vh-section--tint">
        <div className="vh-container vh-split">
          <div className="vh-split__copy">
            <p className="vh-eyebrow">Smart matching</p>
            <h2>See exactly why an outreach suits you</h2>
            <p>
              Every match score is made of five parts you can see: skills, category, location,
              availability and experience. No black box, and no guessing why one event sits above
              another.
            </p>
            <a className="vh-link" href="/features">
              How matching works →
            </a>
          </div>
          <MatchIllustration />
        </div>
      </section>

      <section className="vh-section">
        <div className="vh-container vh-split vh-split--reverse">
          <div className="vh-split__copy">
            <p className="vh-eyebrow">V-Score</p>
            <h2>A reputation that follows your work</h2>
            <p>
              Your V-Score is built from the reviews organisations give after each event. Everyone
              starts at 70. Turn up and do good work, and it shows.
            </p>
            <a className="vh-link" href="/faq">
              How the V-Score works →
            </a>
          </div>
          <VScoreIllustration />
        </div>
      </section>

      <section className="vh-section vh-section--tint">
        <div className="vh-container vh-split">
          <div className="vh-split__copy">
            <p className="vh-eyebrow">On the day</p>
            <h2>Check in with one scan</h2>
            <p>
              Scan the outreach&apos;s code at the venue and you are checked in for that day. Your
              location is compared with the venue once, and only the result is kept.
            </p>
          </div>
          <CheckinIllustration />
        </div>
      </section>

      <section className="vh-section vh-dark">
        <div className="vh-container vh-split vh-split--reverse">
          <div className="vh-split__copy">
            <p className="vh-eyebrow">For organisations</p>
            <h2>Your best team, ranked and ready</h2>
            <p>
              Post an outreach, and every applicant arrives with a match score beside their
              V-Score. One tap accepts your best matches and waitlists the rest, and a freed place
              goes to the next in line.
            </p>
            <a className="vh-btn vh-btn--light" href="/organisations">
              See what organisations get
            </a>
          </div>
          <RosterIllustration />
        </div>
      </section>

      <section className="vh-section">
        <div className="vh-container">
          <div className="vh-heading">
            <p className="vh-eyebrow">How it works</p>
            <h2>From download to your first outreach</h2>
          </div>
          <ol className="vh-steps">
            <li>
              <span>1</span>
              <h3>Download VHub</h3>
              <p>Install the Android app from this site in under a minute.</p>
            </li>
            <li>
              <span>2</span>
              <h3>Build your profile</h3>
              <p>Tell us your category, your skills, where you are and when you are free.</p>
            </li>
            <li>
              <span>3</span>
              <h3>Join an outreach</h3>
              <p>Pick from outreaches ranked for you, choose your days, and show up.</p>
            </li>
          </ol>
        </div>
      </section>

      <CtaBand title="Ready to give your time where it counts?" body="Join VHub and find your next medical outreach today." />
    </>
  );
}
