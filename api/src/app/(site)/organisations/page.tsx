import type { Metadata } from "next";
import { CheckinIllustration, RosterIllustration } from "../illustrations";
import { CtaBand, Feature, PageHero, SectionHeading } from "../components";

export const metadata: Metadata = {
  title: "For organisations",
  description: "Post medical outreaches, get applicants ranked by fit and reliability, and fill every place with the right people.",
};

export default function OrganisationsPage() {
  return (
    <>
      <PageHero
        eyebrow="For organisations"
        title={
          <>
            Fill your outreach with <span className="shimmer">the right people</span>
          </>
        }
        lead="From a one-day screening to a month-long campaign, VHub brings you qualified, reliable volunteers and keeps them informed until the last day."
        visual={<RosterIllustration />}
      />

      <section className="section">
        <div className="container">
          <SectionHeading eyebrow="What you get" title="Run the outreach. VHub handles the team." />
          <div className="features features--3">
            <Feature icon="calendar" tone="coral" title="Post in minutes" body="Dates, venue, the skills you need, and how many of each role, from doctors and nurses to students and helpers." />
            <Feature icon="users" tone="violet" delay={0.05} title="Several roles, one event" body="Ask for two doctors, three nurses and six helpers on the same outreach, each with its own requirements." />
            <Feature icon="chart" tone="teal" delay={0.1} title="Applicants ranked for you" body="Every applicant comes with a match score and a V-Score, so the strongest fits are at the top." />
            <Feature icon="check" tone="amber" delay={0.15} title="Accept your best in one tap" body="Accept the top matches for your free places and waitlist the rest. Nobody is rejected unless you choose to." />
            <Feature icon="bell" tone="coral" delay={0.2} title="Fewer empty places" body="A freed place goes to the next person on the waitlist, and if you are short as the day approaches, matching volunteers nearby are told." />
            <Feature icon="star" tone="navy" delay={0.25} title="Attendance and reviews" body="Volunteers check in by scanning your code at the venue. Your review afterwards is what their V-Score is made of." />
          </div>
        </div>
      </section>

      <section className="section section--tint">
        <div className="container story">
          <div className="story__copy reveal">
            <p className="eyebrow">On the day</p>
            <h2>Know who turned up</h2>
            <p>
              Your outreach has its own check-in code. Volunteers scan it at the venue on each day
              they committed to, you see who has arrived, and you mark anyone missing yourself.
              Days nobody marked never count against anyone.
            </p>
            <p>
              For clinical roles you can open the volunteer&apos;s credential document before you
              decide, through a private link that expires in minutes.
            </p>
          </div>
          <CheckinIllustration />
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHeading
            eyebrow="Getting verified"
            title="Trusted before you publish"
            lead="Volunteers give their Saturdays to the events they see on VHub, so every organisation is checked before it can publish. You can prepare drafts while you wait."
            center
          />
          <ol className="journey">
            {[
              { title: "Register", body: "Create your organisation account and tell us who you are." },
              { title: "Submit your details", body: "Your registration numbers, official contact and supporting documents." },
              { title: "Get approved", body: "An admin reviews them and you hear the outcome by email and in the app." },
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

      <CtaBand title="Plan your next outreach on VHub" body="Register your organisation and start building your team." />
    </>
  );
}
