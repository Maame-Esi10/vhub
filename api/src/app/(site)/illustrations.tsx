import { ALL_SKILLS } from "@/constants/skills";
import { GHANA_REGION_ADJACENCY, GHANA_REGIONS } from "@/constants/ghana-locations";
import { DOWNLOAD_QR } from "./downloadQr";

/*
 * Every picture on the website, drawn in SVG and CSS rather than shipped as
 * images: they stay sharp at any size, weigh almost nothing on a phone
 * connection, animate, and cannot go stale against a screen that has since
 * changed shape. Movement lives in site.css and stops for anyone who has asked
 * their device for reduced motion.
 *
 * The outreaches, people and numbers inside the phone and the cards are
 * ILLUSTRATIVE and are labelled that way for screen readers. The facts on the
 * page around them (regions, districts, skills, the five matching factors,
 * the V-Score bands) are read from the app's own constants.
 */

// ---------------------------------------------------------------- people

type Outfit = "coat" | "scrubs" | "polo" | "tee";
type Hair = "short" | "bun" | "braids" | "wrap" | "fade" | "puff";

export interface PersonProps {
  skin: string;
  hair: Hair;
  hairColor?: string;
  outfit: Outfit;
  outfitColor: string;
  bg: string;
  stethoscope?: boolean;
  size?: number;
  label: string;
}

/** A drawn person, head and shoulders. Deliberately simple, deliberately warm. */
export function Person({ skin, hair, hairColor = "#1b1210", outfit, outfitColor, bg, stethoscope, size = 64, label }: PersonProps) {
  const id = label.replace(/[^a-z0-9]/gi, "");
  return (
    <svg className="person" width={size} height={size} viewBox="0 0 80 80" role="img" aria-label={label}>
      <defs>
        <clipPath id={`clip-${id}`}>
          <circle cx="40" cy="40" r="40" />
        </clipPath>
      </defs>
      <g clipPath={`url(#clip-${id})`}>
        <rect width="80" height="80" fill={bg} />
        {hair === "braids" && (
          <path d="M20 34c0-14 9-22 20-22s20 8 20 22v26h-6V38H26v22h-6z" fill={hairColor} />
        )}
        {/* shoulders */}
        <path d="M8 80c2-16 14-24 32-24s30 8 32 24z" fill={outfit === "coat" ? "#ffffff" : outfitColor} />
        {outfit === "coat" && (
          <>
            <path d="M32 57l8 14 8-14" fill={outfitColor} />
            <path d="M31 57l9 23M49 57l-9 23" stroke="#d8dde6" strokeWidth="1.5" />
          </>
        )}
        {outfit === "scrubs" && <path d="M33 57l7 9 7-9" fill="none" stroke="rgba(0,0,0,.18)" strokeWidth="2" />}
        {outfit === "polo" && <path d="M34 57h12l-6 8z" fill="rgba(255,255,255,.35)" />}
        {/* neck and head */}
        <rect x="34" y="44" width="12" height="14" rx="5" fill={skin} />
        <ellipse cx="40" cy="34" rx="13" ry="15" fill={skin} />
        <ellipse cx="27.5" cy="35" rx="2.5" ry="3.5" fill={skin} />
        <ellipse cx="52.5" cy="35" rx="2.5" ry="3.5" fill={skin} />
        {/* hair */}
        {hair === "short" && <path d="M27 30c0-10 6-15 13-15s13 5 13 15c-3-5-8-7-13-7s-10 2-13 7z" fill={hairColor} />}
        {hair === "fade" && <path d="M27.5 29c1-9 6-13 12.5-13s11.5 4 12.5 13c-4-3-8-4-12.5-4s-8.5 1-12.5 4z" fill={hairColor} />}
        {hair === "bun" && (
          <>
            <circle cx="40" cy="14" r="6.5" fill={hairColor} />
            <path d="M27 31c0-11 6-16 13-16s13 5 13 16c-2-6-7-9-13-9s-11 3-13 9z" fill={hairColor} />
          </>
        )}
        {hair === "puff" && <path d="M24 30c-2-12 6-20 16-20s18 8 16 20c-3-6-9-9-16-9s-13 3-16 9z" fill={hairColor} />}
        {hair === "braids" && <path d="M27 31c0-11 6-16 13-16s13 5 13 16c-2-6-7-9-13-9s-11 3-13 9z" fill={hairColor} />}
        {hair === "wrap" && (
          <>
            <path d="M25 30c0-13 7-19 15-19s15 6 15 19c-4-4-9-6-15-6s-11 2-15 6z" fill={outfitColor} />
            <path d="M44 12c6 0 9 4 8 8-2-3-5-4-8-4z" fill={outfitColor} opacity=".8" />
          </>
        )}
        {/* face */}
        <circle cx="35" cy="35" r="1.4" fill="#1b1210" />
        <circle cx="45" cy="35" r="1.4" fill="#1b1210" />
        <path d="M36 41c2 2 6 2 8 0" fill="none" stroke="#1b1210" strokeWidth="1.4" strokeLinecap="round" />
        {stethoscope && (
          <path d="M31 58c-2 8 0 12 4 13m14-13c2 8 0 12-4 13m-5 0v4" fill="none" stroke="#2b3350" strokeWidth="2" strokeLinecap="round" />
        )}
      </g>
    </svg>
  );
}

/** The cast, reused across the site so the same faces recur and become familiar. */
export const PEOPLE = {
  doctor: { skin: "#7a4a2a", hair: "fade", outfit: "coat", outfitColor: "#3a4270", bg: "#e8ecff", stethoscope: true, label: "A doctor" },
  nurse: { skin: "#8d5524", hair: "bun", outfit: "scrubs", outfitColor: "#2bb3a3", bg: "#ddf6f2", label: "A nurse" },
  midwife: { skin: "#5c3a21", hair: "wrap", outfit: "scrubs", outfitColor: "#ff6b6b", bg: "#ffe4e1", label: "A midwife" },
  pharmacist: { skin: "#a0662f", hair: "short", outfit: "coat", outfitColor: "#12172b", bg: "#fff1d6", label: "A pharmacist" },
  student: { skin: "#6b3e26", hair: "braids", outfit: "polo", outfitColor: "#6c63ff", bg: "#ecebff", label: "A health student" },
  firstAider: { skin: "#8b5a34", hair: "puff", outfit: "tee", outfitColor: "#f59e0b", bg: "#fff4e0", label: "A first aider" },
} satisfies Record<string, PersonProps>;

export function PeopleStack({ size = 44 }: { size?: number }) {
  return (
    <div className="people-stack" aria-label="Doctors, nurses, midwives, pharmacists, students and first aiders">
      {Object.entries(PEOPLE).map(([key, person]) => (
        <Person key={key} {...person} size={size} />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ phone

const FEED = [
  { org: "COMMUNITY HEALTH NETWORK", title: "Free eye screening", place: "Kumasi, Ashanti", date: "Sat 11 Oct", score: 94, tone: "coral" },
  { org: "STUDENTS FOR HEALTH", title: "Blood pressure & diabetes check", place: "Madina, Greater Accra", date: "Sat 18 Oct", score: 87, tone: "navy" },
  { org: "HOPE MEDICAL OUTREACH", title: "Maternal health day", place: "Tamale, Northern", date: "Sun 26 Oct", score: 72, tone: "sand" },
];

/** The feed, with cards arriving one after another and a confirmation dropping in. */
export function PhoneFeed() {
  return (
    <div className="phone-scene" role="img" aria-label="The VHub app on a phone: sample outreaches ranked by match score, and a confirmation notification">
      <div className="phone">
        <div className="phone__notch" />
        <div className="phone__screen">
          <div className="phone__top">
            <div>
              <small>Good morning</small>
              <strong>Outreaches for you</strong>
            </div>
            <span className="phone__bell">
              <i />
            </span>
          </div>
          <div className="phone__chips">
            <span className="is-on">All</span>
            <span>Clinical</span>
            <span>Support</span>
          </div>
          {FEED.map((item, index) => (
            <div key={item.title} className="feedcard" style={{ animationDelay: `${0.5 + index * 0.35}s` }}>
              <div className={`feedcard__banner feedcard__banner--${item.tone}`}>
                <span className="pill">
                  <i />
                  {item.score}% MATCH
                </span>
              </div>
              <div className="feedcard__body">
                <small>{item.org}</small>
                <strong>{item.title}</strong>
                <span>
                  {item.place} · {item.date}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="float-card float-card--toast">
        <span className="float-card__icon">✓</span>
        <div>
          <strong>You&apos;re confirmed!</strong>
          <small>Free eye screening · Sat 11 Oct</small>
        </div>
      </div>
      <div className="float-card float-card--match">
        <Person {...PEOPLE.nurse} size={36} />
        <div>
          <small>Top match</small>
          <strong>94%</strong>
        </div>
      </div>
      <div className="float-card float-card--score">
        <small>V-Score</small>
        <strong>82</strong>
        <span className="float-card__band">Trusted</span>
      </div>
    </div>
  );
}

// -------------------------------------------------------------- the ECG line

/** The heartbeat from the logo, drawn across a section and redrawn on a loop. */
export function EcgLine({ className = "" }: { className?: string }) {
  return (
    <svg className={`ecg ${className}`} viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true">
      <path
        className="ecg__path"
        d="M0 70 H380 L410 70 L430 20 L455 110 L480 40 L500 70 H700 L720 70 L735 45 L750 85 L765 70 H1200"
        fill="none"
        pathLength={1}
      />
    </svg>
  );
}

// -------------------------------------------------------------- the skills

/** Two rows of the app's real skills, drifting in opposite directions. */
export function SkillMarquee() {
  const half = Math.ceil(ALL_SKILLS.length / 2);
  const rows = [ALL_SKILLS.slice(0, half), ALL_SKILLS.slice(half)];
  return (
    <div className="marquee" aria-label={`${ALL_SKILLS.length} skills volunteers can offer, from ${ALL_SKILLS.slice(0, 3).join(", ")} and more`}>
      {rows.map((row, index) => (
        <div key={index} className={`marquee__row${index === 1 ? " marquee__row--reverse" : ""}`} aria-hidden="true">
          <div className="marquee__track">
            {[...row, ...row].map((skill, i) => (
              <span key={`${skill}-${i}`} className="marquee__chip">
                {skill}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ the map

/**
 * Ghana, drawn as its sixteen regional capitals at their real positions,
 * joined wherever two regions border each other. The border is never drawn,
 * so nothing here can be a wrong border; the constellation takes the shape of
 * the country on its own. Neighbours come from GHANA_REGION_ADJACENCY, the
 * same table the feed uses to widen its search, and a test keeps it symmetric.
 */
const CAPITAL_COORDS: Record<string, [lat: number, lon: number]> = {
  "Greater Accra": [5.6, -0.19],
  Ashanti: [6.69, -1.62],
  Central: [5.1, -1.25],
  Eastern: [6.09, -0.26],
  Western: [4.93, -1.76],
  "Western North": [6.21, -2.49],
  Volta: [6.6, 0.47],
  Oti: [8.07, 0.18],
  Bono: [7.34, -2.33],
  "Bono East": [7.59, -1.94],
  Ahafo: [6.8, -2.52],
  Northern: [9.4, -0.84],
  Savannah: [9.08, -1.82],
  "North East": [10.53, -0.37],
  "Upper East": [10.79, -0.85],
  "Upper West": [10.06, -2.5],
};

export function GhanaMap() {
  const W = 320;
  const H = 440;
  const lonMin = -3.1;
  const lonMax = 1.1;
  const latMin = 4.5;
  const latMax = 11.2;
  const project = ([lat, lon]: [number, number]) => ({
    x: ((lon - lonMin) / (lonMax - lonMin)) * W,
    y: ((latMax - lat) / (latMax - latMin)) * H,
  });
  const points = GHANA_REGIONS.map((region) => {
    const coords = CAPITAL_COORDS[region.name];
    return coords ? { name: region.name, capital: region.capital, xy: project(coords) } : null;
  }).filter((p): p is { name: string; capital: string; xy: { x: number; y: number } } => p !== null);
  const byName = new Map(points.map((p) => [p.name, p]));
  const edges: [{ x: number; y: number }, { x: number; y: number }][] = [];
  for (const p of points) {
    for (const neighbour of GHANA_REGION_ADJACENCY[p.name] ?? []) {
      const q = byName.get(neighbour);
      if (q && p.name < q.name) edges.push([p.xy, q.xy]);
    }
  }

  return (
    <svg className="ghana" viewBox={`-20 -20 ${W + 40} ${H + 40}`} role="img" aria-label="Ghana's sixteen regional capitals, joined where their regions share a border">
      {edges.map(([a, b], index) => (
        <line key={index} className="ghana__edge" x1={a.x} y1={a.y} x2={b.x} y2={b.y} style={{ animationDelay: `${index * 0.05}s` }} pathLength={1} />
      ))}
      {points.map((p, index) => (
        <g key={p.name} className="ghana__node" style={{ animationDelay: `${0.4 + index * 0.08}s` }}>
          <circle className="ghana__pulse" cx={p.xy.x} cy={p.xy.y} r="14" style={{ animationDelay: `${index * 0.4}s` }} />
          <circle cx={p.xy.x} cy={p.xy.y} r="5.5" className="ghana__dot" />
          <text x={p.xy.x + 10} y={p.xy.y + 4} className="ghana__label">
            {p.capital}
          </text>
          <title>{`${p.capital}, ${p.name} Region`}</title>
        </g>
      ))}
    </svg>
  );
}

// ------------------------------------------------------------ app features

export function MatchIllustration() {
  const rows = [
    { label: "Skills", weight: 35, value: 1 },
    { label: "Category", weight: 20, value: 1 },
    { label: "Location", weight: 20, value: 0.5 },
    { label: "Availability", weight: 15, value: 1 },
    { label: "Experience", weight: 10, value: 0.6 },
  ];
  const total = Math.round(rows.reduce((sum, row) => sum + row.weight * row.value, 0));
  return (
    <div className="illo reveal" role="img" aria-label={`An example match score of ${total} percent, broken into its five parts`}>
      <div className="illo__head">
        <span>Why this match</span>
        <strong>{total}%</strong>
      </div>
      {rows.map((row, index) => (
        <div key={row.label} className="bar">
          <span>{row.label}</span>
          <div className="bar__track">
            <div className="bar__fill" style={{ width: `${row.value * 100}%`, transitionDelay: `${0.2 + index * 0.12}s` }} />
          </div>
          <em>+{Math.round(row.weight * row.value)}</em>
        </div>
      ))}
    </div>
  );
}

export function VScoreIllustration() {
  const score = 82;
  return (
    <div className="illo reveal" role="img" aria-label={`An example V-Score of ${score}, in the Trusted band`}>
      <div className="illo__head">
        <span>Your V-Score</span>
        <strong>{score}</strong>
      </div>
      <div className="vscore__track">
        <div className="vscore__knob" style={{ ["--to" as string]: `calc(${score}% - 13px)` }} />
      </div>
      <div className="vscore__bands">
        <span>At Risk</span>
        <span>Developing</span>
        <span>Active</span>
        <span className="is-on">Trusted</span>
        <span>Elite</span>
      </div>
      <div className="vscore__events">
        <span className="vscore__event">
          <b>+</b> Reviewed after Eye screening, Kumasi
        </span>
        <span className="vscore__event">
          <b>+</b> Reviewed after Health walk, Cape Coast
        </span>
      </div>
    </div>
  );
}

export function CheckinIllustration() {
  const grid = DOWNLOAD_QR.slice(0, 21).map((row) => row.slice(0, 21));
  return (
    <div className="illo illo--center reveal" role="img" aria-label="Checking in at the venue by scanning the outreach's code">
      <div className="scan">
        <div className="scan__code">
          {grid.map((row, y) =>
            row.split("").map((cell, x) => <i key={`${x}-${y}`} className={cell === "1" ? "is-on" : undefined} />)
          )}
        </div>
        <div className="scan__line" />
        <div className="scan__tick">✓</div>
      </div>
      <p className="illo__caption">Checked in for today · Location verified</p>
    </div>
  );
}

export function RosterIllustration() {
  const people = [
    { who: PEOPLE.nurse, name: "Nurse · Experienced", score: 96, v: 88, state: "Accepted" },
    { who: PEOPLE.doctor, name: "Doctor · Intermediate", score: 91, v: 79, state: "Accepted" },
    { who: PEOPLE.student, name: "Student · Beginner", score: 84, v: 70, state: "Accepted" },
    { who: PEOPLE.midwife, name: "Midwife · Experienced", score: 80, v: 74, state: "Waitlisted" },
  ];
  return (
    <div className="illo reveal" role="img" aria-label="An organisation's applicants, ranked, with the top three accepted and the next waitlisted">
      <div className="illo__head">
        <span>Applicants · 3 places</span>
        <strong className="illo__action">Accept top 3</strong>
      </div>
      {people.map((person, index) => (
        <div key={person.name} className="roster" style={{ ["--i" as string]: index }}>
          <Person {...person.who} size={40} label={person.name} />
          <div>
            <strong>{person.name}</strong>
            <small>
              {person.score}% match · V-Score {person.v}
            </small>
          </div>
          <em className={person.state === "Accepted" ? "is-ok" : "is-wait"}>{person.state}</em>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- the QR

/** The real, scannable code for the Download page. */
export function DownloadQr({ size = 168 }: { size?: number }) {
  const n = DOWNLOAD_QR.length;
  const cells: string[] = [];
  DOWNLOAD_QR.forEach((row, y) => row.split("").forEach((cell, x) => cell === "1" && cells.push(`M${x} ${y}h1v1h-1z`)));
  return (
    <svg className="qr" width={size} height={size} viewBox={`-2 -2 ${n + 4} ${n + 4}`} role="img" aria-label="QR code for the VHub download page">
      <rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" rx="2" />
      <path d={cells.join("")} fill="#12172b" />
    </svg>
  );
}
