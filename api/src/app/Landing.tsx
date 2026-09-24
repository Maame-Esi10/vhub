import logo from "@/assets/logo.png";
import { APP_INTRO, APP_NAME, APP_TAGLINE_LINES } from "@/constants/brand";
import styles from "./landing.module.css";

/**
 * The VHub landing page (built 2026-09-24).
 *
 * NO DESIGN EXISTS FOR THIS in design-refs/, so it reuses the app's own visual
 * language rather than inventing a third look: the coral and navy of
 * constants/theme.ts, the white rounded cards on a pale grey ground, the
 * tagline and intro from constants/brand.ts (imported, not retyped, so the
 * site and the splash screen cannot describe the app two different ways).
 *
 * EVERY CLAIM HERE MUST BE TRUE OF THE CODE, the same rule constants/policy.ts
 * lives under. Nothing is promised that is not built: no iPhone app, no
 * "thousands of volunteers", no map.
 */

/**
 * Where the Download button points.
 *
 * AN EAS BUILD LINK EXPIRES. It is fine for testing and wrong for a page meant
 * to outlive one build, so this is the ONE line to change when the APK moves to
 * a permanent home (a GitHub release or a shared Drive file). Until then it is
 * the most recent preview build.
 */
const ANDROID_DOWNLOAD_URL =
  "https://expo.dev/artifacts/eas/-7GdLBl8CjxWZhGOmTAvDRoBbbT2HGFt1py_vFTArao.apk";

const VOLUNTEER_FEATURES = [
  {
    title: "Outreaches matched to you",
    body: "Your feed is ranked on your skills, your category, where you are, when you are free and your experience, so the events that need someone like you come first.",
  },
  {
    title: "Join in a tap",
    body: "Support roles such as registration, crowd flow, health talks and data entry are open to everyone with Quick Join. Clinical roles take a full application.",
  },
  {
    title: "Pick your days",
    body: "On an event that runs over several days, commit only to the days you can make, and release a day ahead of time if plans change.",
  },
  {
    title: "Always know where you stand",
    body: "Track every application, see your place on a waitlist, get reminders before the day and check in at the venue by scanning a QR code.",
  },
  {
    title: "A record that is yours",
    body: "Your V-Score is built from the reviews organisations file after each event, so reliable volunteers are recognised and a new volunteer starts on a fair footing.",
  },
];

const ORGANISATION_FEATURES = [
  {
    title: "Post an outreach in minutes",
    body: "Set the dates, the venue, the skills you need and how many of each role, from doctors and nurses to students and helpers.",
  },
  {
    title: "Applicants ranked for you",
    body: "Every applicant arrives with a match score beside their V-Score, and one tap accepts your best matches and waitlists the rest.",
  },
  {
    title: "Fewer empty places",
    body: "If a place opens up, the next person on the waitlist is offered it. If an event is short of people as the day approaches, matching volunteers nearby are told about it.",
  },
  {
    title: "Attendance and reviews",
    body: "Volunteers check in on the day by scanning your event's QR code, and you review them afterwards. Your review is what their V-Score is made of.",
  },
];

const TRUST_POINTS = [
  "Every organisation is checked before it can publish an outreach.",
  "Clinical roles are only open to volunteers whose credentials have been reviewed.",
  "Credential documents are stored privately and never shown publicly.",
  "Check-in compares your location with the venue once and keeps only the result, never your coordinates.",
];

const STEPS = [
  { title: "Download", body: "Get the app for Android using the button on this page." },
  { title: "Create your account", body: "Register as a volunteer or as an organisation and confirm your email with the code we send." },
  { title: "Get involved", body: "Volunteers find and join outreaches. Organisations post them and choose their team." },
];

const INSTALL_STEPS = [
  "Tap Download for Android and let the file finish downloading.",
  "Open the downloaded file. If your phone asks, allow installs from this source (usually your browser or Files app).",
  "Tap Install, then open VHub.",
];

export function Landing() {
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.lockup}>
            <img src={logo.src} alt="" width={56} height={56} />
            <span className={styles.wordmark}>{APP_NAME}</span>
          </div>
          <h1 className={styles.tagline}>
            {APP_TAGLINE_LINES.map((line) => (
              <span key={line} className={styles.taglineLine}>
                {line}
              </span>
            ))}
          </h1>
          <p className={styles.intro}>{APP_INTRO}</p>
          <p className={styles.introSub}>
            VHub connects nurses, doctors, midwives, pharmacists, health students and first
            aiders with the organisations running medical outreach across all sixteen regions of
            Ghana.
          </p>
          <div className={styles.ctaRow}>
            <a className={styles.primaryButton} href={ANDROID_DOWNLOAD_URL}>
              Download for Android
            </a>
            <a className={styles.secondaryButton} href="#how-it-works">
              How it works
            </a>
          </div>
          <p className={styles.ctaNote}>Free. Android only for now.</p>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.section} aria-labelledby="volunteers">
          <p className={styles.eyebrow}>For volunteers</p>
          <h2 id="volunteers" className={styles.sectionTitle}>
            Give your time where it counts
          </h2>
          <div className={styles.grid}>
            {VOLUNTEER_FEATURES.map((feature) => (
              <article key={feature.title} className={styles.card}>
                <span className={styles.cardMark} aria-hidden="true" />
                <h3 className={styles.cardTitle}>{feature.title}</h3>
                <p className={styles.cardBody}>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section} aria-labelledby="organisations">
          <p className={styles.eyebrow}>For organisations</p>
          <h2 id="organisations" className={styles.sectionTitle}>
            Fill your outreach with the right people
          </h2>
          <div className={styles.grid}>
            {ORGANISATION_FEATURES.map((feature) => (
              <article key={feature.title} className={styles.card}>
                <span className={`${styles.cardMark} ${styles.cardMarkNavy}`} aria-hidden="true" />
                <h3 className={styles.cardTitle}>{feature.title}</h3>
                <p className={styles.cardBody}>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={`${styles.section} ${styles.trust}`} aria-labelledby="trust">
          <h2 id="trust" className={styles.trustTitle}>
            Built on trust
          </h2>
          <ul className={styles.trustList}>
            {TRUST_POINTS.map((point) => (
              <li key={point} className={styles.trustItem}>
                <span className={styles.tick} aria-hidden="true">
                  ✓
                </span>
                {point}
              </li>
            ))}
          </ul>
        </section>

        <section id="how-it-works" className={styles.section} aria-labelledby="steps">
          <p className={styles.eyebrow}>How it works</p>
          <h2 id="steps" className={styles.sectionTitle}>
            Three steps to your first outreach
          </h2>
          <ol className={styles.steps}>
            {STEPS.map((step, index) => (
              <li key={step.title} className={styles.step}>
                <span className={styles.stepNumber}>{index + 1}</span>
                <div>
                  <h3 className={styles.cardTitle}>{step.title}</h3>
                  <p className={styles.cardBody}>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.download} aria-labelledby="download">
          <h2 id="download" className={styles.downloadTitle}>
            Get VHub
          </h2>
          <p className={styles.downloadBody}>
            VHub is not on the Play Store yet, so it installs directly from this page.
          </p>
          <ol className={styles.installList}>
            {INSTALL_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <a className={styles.primaryButton} href={ANDROID_DOWNLOAD_URL}>
            Download for Android
          </a>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>
          {APP_NAME} is a final year project at the University of Ghana, built by Melissa Otoo.
        </p>
      </footer>
    </div>
  );
}
