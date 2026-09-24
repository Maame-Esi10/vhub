import type { Metadata } from "next";
import { CheckinIllustration, CtaBand, Feature, PageHero, RosterIllustration } from "../components";

export const metadata: Metadata = {
  title: "For organisations",
  description: "Post medical outreaches, get applicants ranked by fit and reliability, and fill every place with the right people.",
};

export default function OrganisationsPage() {
  return (
    <>
      <PageHero
        eyebrow="For organisations"
        title="Fill your outreach with the right people"
        lead="From a one-day screening to a month-long campaign, VHub brings you qualified, reliable volunteers and keeps them informed until the last day."
      />

      <section className="vh-section">
        <div className="vh-container">
          <div className="vh-features">
            <Feature icon="calendar" title="Post in minutes" body="Dates, venue, the skills you need, and how many of each role, from doctors and nurses to students and helpers." />
            <Feature icon="users" title="Several roles, one event" body="Ask for two doctors, three nurses and six helpers on the same outreach, each with its own requirements." />
            <Feature icon="chart" title="Applicants ranked for you" body="Every applicant comes with a match score and a V-Score, so the strongest fits are at the top." />
            <Feature icon="check" title="Accept your best in one tap" body="Accept the top matches for your free places and waitlist the rest. Nobody is rejected unless you choose to." />
            <Feature icon="bell" title="Fewer empty places" body="A freed place goes to the next person on the waitlist, and if you are short as the day approaches, matching volunteers nearby are told." />
            <Feature icon="star" title="Attendance and reviews" body="Volunteers check in by scanning your code at the venue. Your review afterwards is what their V-Score is made of." />
          </div>
        </div>
      </section>

      <section className="vh-section vh-section--tint">
        <div className="vh-container vh-split">
          <div className="vh-split__copy">
            <p className="vh-eyebrow">Choosing your team</p>
            <h2>The strongest fits, at the top</h2>
            <p>
              Applicants are ordered by how well they fit your outreach, adjusted for reliability.
              You see both numbers side by side, and for clinical roles you can open the
              volunteer&apos;s credential document before you decide.
            </p>
          </div>
          <RosterIllustration />
        </div>
      </section>

      <section className="vh-section">
        <div className="vh-container vh-split vh-split--reverse">
          <div className="vh-split__copy">
            <p className="vh-eyebrow">On the day</p>
            <h2>Know who turned up</h2>
            <p>
              Your outreach has its own check-in code. Volunteers scan it at the venue on each day
              they committed to, you see who has arrived, and you mark anyone missing yourself. Days nobody marked never count
              against anyone.
            </p>
          </div>
          <CheckinIllustration />
        </div>
      </section>

      <section className="vh-section vh-section--tint">
        <div className="vh-container">
          <div className="vh-heading">
            <p className="vh-eyebrow">Getting verified</p>
            <h2>Trusted before you publish</h2>
            <p className="vh-lead">
              Volunteers give their Saturdays to the events they see on VHub, so every organisation
              is checked before it can publish. You can prepare drafts while you wait.
            </p>
          </div>
          <ol className="vh-steps">
            <li>
              <span>1</span>
              <h3>Register</h3>
              <p>Create your organisation account and tell us who you are.</p>
            </li>
            <li>
              <span>2</span>
              <h3>Submit your details</h3>
              <p>Your registration numbers, official contact and supporting documents.</p>
            </li>
            <li>
              <span>3</span>
              <h3>Get approved</h3>
              <p>An admin reviews them and you hear the outcome by email and in the app.</p>
            </li>
          </ol>
        </div>
      </section>

      <CtaBand title="Plan your next outreach on VHub" body="Register your organisation and start building your team." />
    </>
  );
}
