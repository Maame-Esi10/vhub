import type { Metadata } from "next";
import { TERMS_SECTIONS } from "@/constants/policy";
import { PageHero } from "../components";

export const metadata: Metadata = { title: "Terms of use" };

/**
 * The SAME text the app shows on its policy screen, imported from
 * constants/policy.ts rather than retyped, so the website and the app can never
 * tell somebody two different things about their data.
 */
export default function Page() {
  return (
    <>
      <PageHero eyebrow="Terms" title="Terms of use" lead="What VHub is, and what volunteers and organisations promise each other when they use it." />
      <section className="section">
        <div className="container prose prose--legal">
          {TERMS_SECTIONS.map((section) => (
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
