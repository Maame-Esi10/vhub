import type { Metadata } from "next";
import { DownloadButton, PageHero } from "../components";

export const metadata: Metadata = {
  title: "Download",
  description: "Download VHub for Android and install it in about a minute.",
};

const STEPS = [
  { title: "Download the app", body: "Tap the button above. Your phone saves the VHub installer (a file ending in .apk)." },
  { title: "Open the file", body: "Open it from your notifications or your Downloads folder." },
  { title: "Allow the install", body: "VHub is not from the Play Store yet, so Android asks first. Tap Settings, turn on Allow from this source for your browser or Files app, then go back." },
  { title: "Install and sign up", body: "Tap Install, open VHub, and create your account as a volunteer or an organisation." },
];

export default function DownloadPage() {
  return (
    <>
      <PageHero
        eyebrow="Download"
        title="Get VHub for Android"
        lead="Free for volunteers and organisations. Installs straight from this site in about a minute."
      />
      <section className="vh-section">
        <div className="vh-container">
          <div className="vh-download">
            <div className="vh-download__card">
              <h2>VHub for Android</h2>
              <p>Version 1.0 · For Android phones</p>
              <DownloadButton />
            </div>
            <ol className="vh-install">
              {STEPS.map((step, index) => (
                <li key={step.title}>
                  <span>{index + 1}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <p className="vh-small">
            Your phone may warn that apps from unknown sources can be harmful. That warning appears
            for every app installed outside the Play Store. Only download VHub from this website.
          </p>
        </div>
      </section>
    </>
  );
}
