import type { Metadata } from "next";
import { GHANA_REGIONS } from "@/constants/ghana-locations";
import { CtaBand, Feature, PageHero, SectionHeading } from "../components";
import { GhanaMap, PEOPLE, Person } from "../illustrations";

export const metadata: Metadata = {
  title: "About",
  description: "Why VHub exists, and what it stands for.",
};

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About VHub"
        title={
          <>
            Every outreach deserves <span className="shimmer">a full team</span>
          </>
        }
        lead="Across Ghana, medical outreach brings screening, check-ups and health education to communities that need them. VHub exists so the people willing to help can find those events, and the people running them can find the right hands."
        visual={<GhanaMap />}
      />

      <section className="section">
        <div className="container split-prose">
          <div className="reveal">
            <p className="eyebrow">The problem</p>
            <h2>Good intentions, lost in group chats</h2>
          </div>
          <div className="prose reveal">
            <p>
              Outreach has usually been organised the hard way: messages forwarded between groups,
              names on a list, and no real way of knowing who is qualified, who is nearby, or who
              will actually turn up.
            </p>
            <p>
              Willing volunteers miss events they would have been perfect for. Organisers go into
              the day unsure whether they have the team they need.
            </p>
          </div>
        </div>
      </section>

      <section className="section section--cream">
        <div className="container split-prose">
          <div className="reveal">
            <p className="eyebrow">What VHub does</p>
            <h2>Both sides, in one place</h2>
          </div>
          <div className="prose reveal">
            <p>
              Volunteers see outreaches ranked for them. Organisations see applicants ranked for
              their event. Verification, reminders, check-in and reviews happen in the same app, so
              trust is built into the process rather than left to chance.
            </p>
            <div className="about-people">
              {Object.entries(PEOPLE).map(([key, person]) => (
                <Person key={key} {...person} size={64} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHeading eyebrow="What we stand for" title="The principles behind the app" />
          <div className="features">
            <Feature icon="users" tone="violet" title="Room for everyone" body="Qualified professionals and first-year students alike. Support roles are open to all, so nobody willing to help is turned away." />
            <Feature icon="target" tone="coral" delay={0.06} title="Fair and explainable" body="Every match score shows its parts, and reputation can only ever lower a ranking, never inflate one." />
            <Feature icon="shield" tone="teal" delay={0.12} title="Trust by design" body="Organisations are verified before they publish, and clinical roles need a reviewed credential." />
            <Feature icon="lock" tone="navy" delay={0.18} title="Private by default" body="Documents are stored privately, contact details are shared only when you apply, and your location is never kept." />
          </div>
        </div>
      </section>

      <section className="section section--tint">
        <div className="container split-prose">
          <div className="reveal">
            <p className="eyebrow">Made in Ghana</p>
            <h2>Built around how outreach works here</h2>
          </div>
          <div className="prose reveal">
            <p>
              VHub was designed and built in Ghana: all {GHANA_REGIONS.length} regions and their
              districts, Ghanaian phone numbers, and the mix of hospitals, churches, student
              associations and NGOs that run outreach.
            </p>
          </div>
        </div>
      </section>

      <CtaBand title="Be part of it" body="Whether you volunteer or organise, VHub is free to use." />
    </>
  );
}
