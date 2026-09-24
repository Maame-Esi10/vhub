import type { Metadata } from "next";
import { DownloadButton, PageHero } from "../components";
import { DownloadQr, PhoneFeed } from "../illustrations";
import { APK_SIZE, APP_VERSION } from "../site";

export const metadata: Metadata = {
  title: "Download",
  description: "Download VHub for Android and install it in about a minute.",
};

const STEPS = [
  {
    title: "Download the app",
    body: "Tap the button. Your phone saves the VHub installer, a file ending in .apk. If Google Drive says it cannot scan the file for viruses, tap Download anyway: Drive says that about every large file.",
  },
  { title: "Open the file", body: "Open it from your notifications or your Downloads folder." },
  {
    title: "Allow the install",
    body: "VHub is not from the Play Store yet, so Android asks first. Tap Settings, turn on Allow from this source for your browser or Files app, then go back.",
  },
  { title: "Install and sign up", body: "Tap Install, open VHub, and create your account as a volunteer or an organisation." },
];

export default function DownloadPage() {
  return (
    <>
      <PageHero
        eyebrow="Download"
        title={
          <>
            Get VHub <span className="shimmer">for Android</span>
          </>
        }
        lead="Free for volunteers and organisations. Installs straight from this site in about a minute."
        visual={<PhoneFeed />}
      />
      <section className="section">
        <div className="container download">
          <div className="download__card reveal">
            <p className="eyebrow eyebrow--light">Version {APP_VERSION}</p>
            <h2>VHub for Android</h2>
            <p>
              {APK_SIZE} · For Android phones · Free
            </p>
            <DownloadButton variant="light" />
            <div className="download__qr">
              <DownloadQr size={132} />
              <p>On a computer? Scan this with your phone to open this page there.</p>
            </div>
          </div>
          <ol className="install">
            {STEPS.map((step, index) => (
              <li key={step.title} className="reveal" style={{ transitionDelay: `${index * 0.08}s` }}>
                <span>{index + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="container">
          <p className="small">
            Your browser or phone may warn that this type of file can harm your device. That warning
            appears for every app installed outside the Play Store, so tap Download anyway or Keep.
            Only download VHub from this website.
          </p>
        </div>
      </section>
    </>
  );
}
