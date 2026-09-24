"use client";

import { useEffect, useRef, useState } from "react";

/*
 * The website's only client-side code: scroll reveals, count-ups and the FAQ.
 *
 * NOTHING HERE MAY HIDE CONTENT FROM A VISITOR WHOSE JAVASCRIPT FAILS. The
 * pre-reveal state (faded, shifted down) only applies under `html.js`, a class
 * an inline script in the site layout adds before first paint. Without it,
 * every section simply renders, still and complete.
 *
 * `prefers-reduced-motion` is honoured in site.css, which neutralises every
 * transition and animation; the count-up checks it too and shows the final
 * number at once.
 */

/** Adds `is-in` to every `.reveal` element as it scrolls into view, once. */
export function RevealObserver() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(".reveal:not(.is-in)"));
    if (!("IntersectionObserver" in window)) {
      nodes.forEach((node) => node.classList.add("is-in"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
  return null;
}

/** Counts from 0 to `value` when it first comes into view. */
export function CountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) return;

    // The server rendered the real number; start from zero only once we know
    // we can finish the count, so a failed script never leaves a zero behind.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShown(0);
    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const duration = 1400;
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          setShown(Math.round(value * eased));
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);

  return (
    <span ref={ref}>
      {shown}
      {suffix}
    </span>
  );
}

export interface FaqGroup {
  id: string;
  title: string;
  items: { q: string; a: string }[];
}

/**
 * The FAQ: a search box that filters as you type, topic chips, and answers
 * that open with a height animation rather than a jump.
 */
export function FaqExplorer({ groups }: { groups: FaqGroup[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(groups[0]?.items[0]?.q ?? null);
  const term = query.trim().toLowerCase();

  const visible = groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !term || item.q.toLowerCase().includes(term) || item.a.toLowerCase().includes(term)
      ),
    }))
    .filter((group) => group.items.length > 0);

  let number = 0;

  return (
    <div className="faq">
      <aside className="faq__side">
        <label className="faq__search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the questions"
            aria-label="Search the questions"
          />
        </label>
        <nav className="faq__topics" aria-label="Topics">
          {groups.map((group) => (
            <a key={group.id} href={`#${group.id}`}>
              {group.title}
              <span>{group.items.length}</span>
            </a>
          ))}
        </nav>
      </aside>

      <div className="faq__list">
        {visible.length === 0 ? (
          <p className="faq__empty">
            Nothing matches &ldquo;{query}&rdquo;. Try a single word, such as <em>verify</em> or <em>cancel</em>.
          </p>
        ) : (
          visible.map((group) => (
            <section key={group.id} id={group.id} className="faq__group">
              <h2>{group.title}</h2>
              {group.items.map((item) => {
                number += 1;
                const isOpen = open === item.q || term.length > 0;
                return (
                  <div key={item.q} className={`faq__item${isOpen ? " is-open" : ""}`}>
                    <button
                      type="button"
                      className="faq__q"
                      aria-expanded={isOpen}
                      onClick={() => setOpen(open === item.q ? null : item.q)}
                    >
                      <span className="faq__num">{String(number).padStart(2, "0")}</span>
                      <span className="faq__text">{item.q}</span>
                      <span className="faq__icon" aria-hidden="true" />
                    </button>
                    <div className="faq__a">
                      <div>
                        <p>{item.a}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
