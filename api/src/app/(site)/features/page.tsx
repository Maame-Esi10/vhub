import type { Metadata } from "next";
import { CtaBand, Feature, MatchIllustration, PageHero, VScoreIllustration } from "../components";

export const metadata: Metadata = {
  title: "For volunteers",
  description: "Find medical outreaches matched to your skills, location and availability, and build a reputation that follows your work.",
};

export default function FeaturesPage() {
  return (
    <>
      <PageHero
        eyebrow="For volunteers"
        title="Give your time where it counts"
        lead="Whether you are a qualified nurse or a first-year student, VHub finds the outreaches that need someone like you, and makes taking part simple."
      />

      <section className="vh-section">
        <div className="vh-container">
          <div className="vh-features">
            <Feature icon="target" title="Outreaches ranked for you" body="Your feed puts the best fits first, weighing your skills, your category, where you are, when you are free and your experience." />
            <Feature icon="bolt" title="Quick Join" body="Registration, crowd flow, health talks, data entry: support roles are open to everyone, in one tap." />
            <Feature icon="shield" title="Clinical roles, done properly" body="Hands-on care needs a reviewed credential. Upload it once, and when it is approved every clinical role opens to you." />
            <Feature icon="calendar" title="Choose your days" body="On a multi-day campaign, commit only to the days you can make, and release a day ahead of time if plans change." />
            <Feature icon="bell" title="Always in the loop" body="Instant updates when an organiser decides, reminders before the day, and your live place on any waitlist." />
            <Feature icon="pin" title="Search by place or skill" body="Looking for eye screening in Kumasi? Search by town, region, skill or keyword and filter by date." />
          </div>
        </div>
      </section>

      <section className="vh-section vh-section--tint">
        <div className="vh-container vh-split">
          <div className="vh-split__copy">
            <p className="vh-eyebrow">Matching</p>
            <h2>Five things decide your match</h2>
            <ul className="vh-checklist">
              <li><strong>Skills</strong> count most: how many of the skills the outreach needs, you have.</li>
              <li><strong>Category</strong>: an exact match, or a closely related one.</li>
              <li><strong>Location</strong>: the same district, the same region, or further.</li>
              <li><strong>Availability</strong>: whether you are free on the days and at the times it runs.</li>
              <li><strong>Experience</strong>: beginner, intermediate or experienced.</li>
            </ul>
            <p>Support roles never mark you down for clinical skills. A registration desk needs willing hands, not a clinical skill set.</p>
          </div>
          <MatchIllustration />
        </div>
      </section>

      <section className="vh-section">
        <div className="vh-container vh-split vh-split--reverse">
          <div className="vh-split__copy">
            <p className="vh-eyebrow">V-Score</p>
            <h2>Recognition for showing up</h2>
            <p>
              After each outreach, the organiser reviews how it went. Your V-Score is built from
              those reviews, from Developing through Active and Trusted to Elite.
            </p>
            <p>
              Everyone starts at 70, so a new volunteer is never behind. Withdrawing from something
              you were only waiting to hear about costs nothing. Cancelling a place you were given
              costs a few points, more if it is within 24 hours of the start.
            </p>
            <p>If you think a review or an absence was wrong, you can dispute it and an admin will look again.</p>
          </div>
          <VScoreIllustration />
        </div>
      </section>

      <CtaBand title="Your next outreach is waiting" body="Download VHub, set up your profile in a few minutes, and see what is near you." />
    </>
  );
}
