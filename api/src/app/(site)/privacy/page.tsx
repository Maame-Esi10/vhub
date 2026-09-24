import type { Metadata } from "next";
import { PRIVACY_UPDATED, PRIVACY_SECTIONS } from "@/constants/policy";
import { PageHero } from "../components";

export const metadata: Metadata = { title: "Privacy policy" };

/**
 * The SAME text the app shows on its policy screen, imported from
 * constants/policy.ts rather than retyped, so the website and the app can never
 * tell somebody two different things about their data.
 */
export default function Page() {
  return (
    <>
      <PageHero eyebrow={`Last updated ${PRIVACY_UPDATED}`} title="Privacy policy" lead="What VHub knows about you, what it does with it, and what you can ask for. In plain language." />
      <section className="section">
        <div className="container prose prose--legal">
          {PRIVACY_SECTIONS.map((section) => (
            <div key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
