import type { Metadata } from "next";
import { CtaBand, Feature, PageHero } from "../components";

export const metadata: Metadata = {
  title: "About",
  description: "Why VHub exists, and what it stands for.",
};

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About VHub"
        title="Every outreach deserves a full team"
        lead="Across Ghana, medical outreach brings screening, check-ups and health education to communities that need them. VHub exists so the people willing to help can find those events, and the people running them can find the right hands."
      />

      <section className="vh-section">
        <div className="vh-container vh-prose">
          <h2>The problem we set out to solve</h2>
          <p>
            Outreach has usually been organised the hard way: messages forwarded between groups,
            names on a list, and no real way of knowing who is qualified, who is nearby, or who will
            actually turn up. Willing volunteers miss events they would have been perfect for, and
            organisers go into the day unsure whether they have the team they need.
          </p>
          <p>
            VHub puts both sides in one place. Volunteers see outreaches ranked for them.
            Organisations see applicants ranked for their event. Verification, reminders,
            check-in and reviews happen in the same app, so trust is built into the process rather
            than left to chance.
          </p>
        </div>
      </section>

      <section className="vh-section vh-section--tint">
        <div className="vh-container">
          <div className="vh-heading">
            <p className="vh-eyebrow">What we stand for</p>
            <h2>The principles behind the app</h2>
          </div>
          <div className="vh-features">
            <Feature icon="users" title="Room for everyone" body="Qualified professionals and first-year students alike. Support roles are open to all, so nobody willing to help is turned away." />
            <Feature icon="target" title="Fair and explainable" body="Every match score shows its parts, and reputation can only ever lower a ranking, never inflate one." />
            <Feature icon="shield" title="Trust by design" body="Organisations are verified before they publish, and clinical roles need a reviewed credential." />
            <Feature icon="lock" title="Private by default" body="Documents are stored privately, contact details are shared only when you apply, and your location is never kept." />
          </div>
        </div>
      </section>

      <section className="vh-section">
        <div className="vh-container vh-prose">
          <h2>Made in Ghana</h2>
          <p>
            VHub was designed and built in Ghana, around how outreach actually works here: the
            sixteen regions and their districts, Ghanaian phone numbers, and the mix of hospitals,
            churches, student associations and NGOs that run it.
          </p>
        </div>
      </section>

      <CtaBand title="Be part of it" body="Whether you volunteer or organise, VHub is free to use." />
    </>
  );
}
