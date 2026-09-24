import type { Metadata } from "next";
import { CtaBand, PageHero } from "../components";
import { FaqExplorer, type FaqGroup } from "../motion";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers to common questions about VHub for volunteers and organisations.",
};

/**
 * EVERY ANSWER MUST BE TRUE OF THE CODE. The numbers here (70, the bands, the
 * five matching factors, the 24-hour line, 2 and 8 points) are the app's own;
 * if one changes, this page is wrong until it is updated.
 */
const GROUPS: FaqGroup[] = [
  {
    id: "getting-started",
    title: "Getting started",
    items: [
      { q: "Is VHub free?", a: "Yes. VHub is free for volunteers and for organisations." },
      { q: "Which phones does it work on?", a: "VHub is available for Android. There is no iPhone version at the moment." },
      { q: "Why is it not on the Play Store?", a: "VHub installs directly from this website for now. The Download page walks you through it, and it takes about a minute." },
      { q: "Who can volunteer?", a: "Doctors, nurses, midwives, pharmacists, health and medical students, first aiders, and anyone else willing to help. Support roles are open to everyone." },
      { q: "Which parts of Ghana does VHub cover?", a: "All sixteen regions. Your feed starts with your own region and its neighbours, and widens when there is not much nearby." },
    ],
  },
  {
    id: "taking-part",
    title: "Applying and taking part",
    items: [
      { q: "What is the difference between clinical and support roles?", a: "Clinical roles are hands-on care, such as blood pressure checks, screening or examinations. Support roles make the event run: registration, crowd flow, health talks, data entry. Clinical roles need a verified credential; support roles never do." },
      { q: "How do I get verified?", a: "Sign the declaration and upload a credential document in the app, such as your licence to practise or your student identity card. An admin checks it is genuine and legible, and you are told the outcome." },
      { q: "Do I have to attend every day of a multi-day outreach?", a: "No. You choose the days you can make when you apply, and only those days count. You can release a future day if your plans change." },
      { q: "What if the outreach is full?", a: "You may be placed on the waitlist. You can see your place in the queue, and if a place opens up it is offered to the next person in line." },
      { q: "How do I check in on the day?", a: "Scan the outreach's QR code at the venue. VHub compares your location with the venue once and keeps only the result, never your coordinates." },
    ],
  },
  {
    id: "matching",
    title: "Matching and your V-Score",
    items: [
      { q: "How is my match score worked out?", a: "From five things: your skills (the biggest part), your category, your location, your availability on the outreach's days, and your experience. The app shows you the breakdown for each outreach." },
      { q: "What is a V-Score?", a: "A reliability score from 0 to 100, built from the reviews organisations give after each outreach. The bands are At Risk, Developing, Active, Trusted and Elite." },
      { q: "What score do I start with?", a: "Everyone starts at 70, in the Active band. An untested record is not a bad one." },
      { q: "What happens if I cancel?", a: "Withdrawing an application that was still pending or waitlisted costs nothing. Cancelling a place you were accepted for costs 2 points, or 8 if it is within 24 hours of the start." },
      { q: "What if a review or an absence is wrong?", a: "You can dispute it in the app. If an admin upholds your dispute, that event stops counting against your score." },
    ],
  },
  {
    id: "organisations",
    title: "For organisations",
    items: [
      { q: "Why do organisations need to be verified?", a: "Volunteers give up their time for the events they see on VHub, so every organisation is checked before it can publish an outreach. You can prepare drafts while your verification is reviewed." },
      { q: "Can one outreach need several kinds of volunteer?", a: "Yes. Ask for, say, two doctors, three nurses and six helpers on one outreach, each role with its own skills and experience level." },
      { q: "How are applicants ordered?", a: "By how well they fit your outreach, adjusted for reliability. You see the match score and the V-Score separately for every applicant." },
    ],
  },
  {
    id: "privacy",
    title: "Privacy",
    items: [
      { q: "Who can see my phone number and email?", a: "No other user, until you apply to an outreach. Then that organisation can see them, because it needs to be able to reach you." },
      { q: "Who can see my credential document?", a: "You, the admins who review it, and organisations you have applied to. It is stored privately and every link to it expires within fifteen minutes." },
      { q: "Can I close my account?", a: "Yes, from Account & Security in the app. It happens immediately and removes your personal details. The full detail is in our privacy policy." },
    ],
  },
];

export default function FaqPage() {
  return (
    <>
      <PageHero
        eyebrow="FAQ"
        title={
          <>
            Questions, <span className="shimmer">answered</span>
          </>
        }
        lead="Everything you need to know about volunteering and organising on VHub. Search, or pick a topic."
      />
      <section className="section">
        <div className="container">
          <FaqExplorer groups={GROUPS} />
        </div>
      </section>
      <CtaBand title="Still curious?" body="The quickest way to see VHub is to try it." />
    </>
  );
}
