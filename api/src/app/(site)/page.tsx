import { APP_INTRO } from "@/constants/brand";
import { ALL_SKILLS } from "@/constants/skills";
import { GHANA_REGIONS } from "@/constants/ghana-locations";
import { AuthLinkOutcome } from "./AuthLinkOutcome";
import { CtaBand, DownloadButton, Feature, SectionHeading } from "./components";
import {
  CheckinIllustration,
  EcgLine,
  GhanaMap,
  MatchIllustration,
  PEOPLE,
  PeopleStack,
  Person,
  PhoneFeed,
  RosterIllustration,
  SkillMarquee,
  VScoreIllustration,
} from "./illustrations";
import { CountUp } from "./motion";

/**
 * The home page, which shares its address with the email-confirmation card:
 * Supabase sends every confirmation link to this root. AuthLinkOutcome shows
 * the card only when the URL carries Supabase's auth parameters.
 */
export default function HomePage() {
  return <AuthLinkOutcome landing={<Home />} />;
}

// Read from the app's own data, so the numbers cannot drift from the product.
const REGION_COUNT = GHANA_REGIONS.length;
const DISTRICT_COUNT = GHANA_REGIONS.reduce((sum, region) => sum + region.districts.length, 0);
const SKILL_COUNT = ALL_SKILLS.length;

const PERSONAS = [
  { key: "nurse", role: "Nurses", line: "Screenings, vitals and health checks, matched to the skills you already have." },
  { key: "doctor", role: "Doctors", line: "Lead the clinical side of an outreach, with a team ranked for the event." },
  { key: "midwife", role: "Midwives", line: "Maternal and child health days, close to where you are." },
  { key: "pharmacist", role: "Pharmacists", line: "Medicine advice where communities rarely get it." },
  { key: "student", role: "Health students", line: "Real experience from your first year, starting with support roles." },
  { key: "firstAider", role: "First aiders", line: "Registration, crowd flow and first aid that keep the day running." },
] as const;

function Home() {
  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section className="hero">
        <div className="aurora" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="hero__grid-bg" aria-hidden="true" />
        <div className="container hero__grid">
          <div className="hero__copy">
            <p className="badge">
              <span className="badge__dot" />
              Medical outreach across all {REGION_COUNT} regions of Ghana
            </p>
            <h1 className="hero__title">
              <span>Connecting volunteers.</span>
              <span className="shimmer">Transforming healthcare.</span>
            </h1>
            <p className="lead lead--light hero__lead">{APP_INTRO}</p>
            <div className="actions">
              <DownloadButton />
              <a className="btn btn--ghost" href="/organisations">
                I run outreaches
              </a>
            </div>
            <div className="hero__proof">
              <PeopleStack size={38} />
              <p>
                For doctors, nurses, midwives, pharmacists, health students and first aiders.
                <strong> Free for everyone.</strong>
              </p>
            </div>
          </div>
          <div className="hero__visual">
            <PhoneFeed />
          </div>
        </div>
        <EcgLine className="hero__ecg" />
      </section>

      {/* -------------------------------------------------------- skills */}
      <section className="skills-band">
        <p className="skills-band__label">
          <strong>{SKILL_COUNT} skills</strong> volunteers bring to an outreach
        </p>
        <SkillMarquee />
      </section>

      {/* --------------------------------------------------------- stats */}
      <section className="section section--tight">
        <div className="container stats">
          <div className="stat reveal">
            <strong>
              <CountUp value={REGION_COUNT} />
            </strong>
            <span>regions covered</span>
          </div>
          <div className="stat reveal" style={{ transitionDelay: "0.08s" }}>
            <strong>
              <CountUp value={DISTRICT_COUNT} />
            </strong>
            <span>districts on the map</span>
          </div>
          <div className="stat reveal" style={{ transitionDelay: "0.16s" }}>
            <strong>
              <CountUp value={SKILL_COUNT} />
            </strong>
            <span>skills to match on</span>
          </div>
          <div className="stat reveal" style={{ transitionDelay: "0.24s" }}>
            <strong>
              <CountUp value={5} />
            </strong>
            <span>factors in every match</span>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ personas */}
      <section className="section">
        <div className="container">
          <SectionHeading
            eyebrow="Everyone has a place"
            title={
              <>
                Whoever you are in healthcare,
                <br /> <span className="ink-coral">there is an outreach that needs you.</span>
              </>
            }
          />
          <div className="personas">
            {PERSONAS.map((persona, index) => (
              <article key={persona.key} className="persona reveal" style={{ transitionDelay: `${index * 0.06}s` }}>
                <div className="persona__art">
                  <Person {...PEOPLE[persona.key]} size={96} />
                </div>
                <h3>{persona.role}</h3>
                <p>{persona.line}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ why vhub */}
      <section className="section section--cream">
        <div className="container">
          <SectionHeading
            eyebrow="Why VHub"
            title="Outreach organising, without the endless group chats"
            lead="Volunteers find events that fit them. Organisers fill their places with the right people. Everyone knows where they stand."
          />
          <div className="features">
            <Feature icon="target" tone="coral" title="Matched, not scrolled" body="Your feed is ranked on your skills, category, location, availability and experience, so the outreaches that need you come first." />
            <Feature icon="bolt" tone="amber" delay={0.06} title="Join in a tap" body="Support roles are open to everyone with Quick Join. Clinical roles take a short professional application." />
            <Feature icon="shield" tone="teal" delay={0.12} title="Verified on both sides" body="Organisations are checked before they can publish, and clinical roles need a reviewed credential." />
            <Feature icon="bell" tone="violet" delay={0.18} title="Nothing slips" body="Reminders before the day, instant updates on your applications, and your waitlist place as it moves." />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- stories */}
      <section className="section">
        <div className="container story">
          <div className="story__copy reveal">
            <p className="eyebrow">Smart matching</p>
            <h2>See exactly why an outreach suits you</h2>
            <p>
              Every match score is made of five parts you can see: skills, category, location,
              availability and experience. No black box, and no guessing why one event sits above
              another.
            </p>
            <a className="link" href="/features">
              How matching works <span aria-hidden="true">→</span>
            </a>
          </div>
          <MatchIllustration />
        </div>
      </section>

      <section className="section section--tint">
        <div className="container story story--reverse">
          <div className="story__copy reveal">
            <p className="eyebrow">V-Score</p>
            <h2>A reputation that follows your work</h2>
            <p>
              Your V-Score is built from the reviews organisations give after each outreach.
              Everyone starts at 70, so nobody new is behind. Turn up, do good work, and it shows.
            </p>
            <a className="link" href="/faq">
              How the V-Score works <span aria-hidden="true">→</span>
            </a>
          </div>
          <VScoreIllustration />
        </div>
      </section>

      <section className="section">
        <div className="container story">
          <div className="story__copy reveal">
            <p className="eyebrow">On the day</p>
            <h2>Check in with one scan</h2>
            <p>
              Scan the outreach&apos;s code at the venue and you are checked in for that day. Your
              location is compared with the venue once, and only the result is kept, never your
              coordinates.
            </p>
          </div>
          <CheckinIllustration />
        </div>
      </section>

      {/* ----------------------------------------------------------- map */}
      <section className="section mapband">
        <div className="container mapband__grid">
          <div className="mapband__copy reveal">
            <p className="eyebrow eyebrow--light">Wherever outreach happens</p>
            <h2>From Bolgatanga to Takoradi</h2>
            <p>
              VHub knows all {REGION_COUNT} regions and {DISTRICT_COUNT} districts. Your feed starts
              with your own region and its neighbours, and reaches further when there is not much
              nearby, so a quiet week never means an empty feed.
            </p>
            <p className="mapband__note">Every regional capital, joined wherever two regions share a border.</p>
          </div>
          <div className="mapband__art reveal">
            <GhanaMap />
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- organisations */}
      <section className="section">
        <div className="container story story--reverse">
          <div className="story__copy reveal">
            <p className="eyebrow">For organisations</p>
            <h2>Your best team, ranked and ready</h2>
            <p>
              Post an outreach and every applicant arrives with a match score beside their V-Score.
              One tap accepts your best matches and waitlists the rest, and a freed place goes to
              the next in line.
            </p>
            <a className="btn btn--dark" href="/organisations">
              See what organisations get
            </a>
          </div>
          <RosterIllustration />
        </div>
      </section>

      {/* ------------------------------------------------------- journey */}
      <section className="section section--cream">
        <div className="container">
          <SectionHeading eyebrow="How it works" title="From download to your first outreach" center />
          <ol className="journey">
            {[
              { title: "Download VHub", body: "Install the Android app from this site in about a minute." },
              { title: "Build your profile", body: "Your category, your skills, where you are and when you are free." },
              { title: "Join an outreach", body: "Pick from outreaches ranked for you, choose your days, and show up." },
            ].map((step, index) => (
              <li key={step.title} className="journey__step reveal" style={{ transitionDelay: `${index * 0.12}s` }}>
                <span className="journey__num">{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <CtaBand title="Ready to give your time where it counts?" body="Join VHub and find your next medical outreach today." />
    </>
  );
}
