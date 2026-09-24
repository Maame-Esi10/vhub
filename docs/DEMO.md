# VHub demo guide

A live walkthrough of VHub for the defence panel: about 15 minutes, six
essential scenes and two optional ones.

It tells one story: **a nurse finds an outreach that fits her, an organisation
builds its team, the event happens, and her reputation grows.** Every screen
shown serves that story.

**There is no setup in this guide.** Everything the demo uses is created once,
during the screenshot preparation (the thesis screenshot guide, section A.2).
On the day you only sign in.

---

## 1. What must already exist

Check each of these a few days before. If one is missing, the scene that needs
it can be shown from its screenshot instead (section 4).

| Needed | How to check | Used in |
|---|---|---|
| The demo volunteer: nurse, **verified**, Greater Accra / Ayawaso East | Her Profile shows the verified tick | Scenes 1, 2, 5 |
| Outreach **A** (Blood Pressure Screening, Madina) with **11 pending applicants**, nobody accepted | Organisation, Applicants, A | Scene 3 |
| Outreach **B** (Community Health Walk, support), Quick Joined by the demo volunteer | Her Applications tab lists B | Scene 2 |
| Outreach **C** (Diabetes Check Day, clinical) that the demo volunteer has **not** applied to | In her feed without an "Applied" label | Scene 2 |
| Outreach **D** past its date, the demo volunteer **checked in** and **not yet reviewed** | Organisation, Reviews tab, D lists her | Scene 5 |
| **Anwiam Hospital (Demo)** submitted and **not approved** | Admin, Orgs tab | Scene 6 |
| The release app (1.0.0) installed from the website on both phones | App opens without a development menu | All |

## 2. On the day

- **Two phones**: Phone V signed in as the demo volunteer, Phone O as Demo
  Health Outreach. **A laptop** with `https://vhub-mu.vercel.app` open, and the
  admin password to hand.
- **Wake the service**: open `https://vhub-mu.vercel.app/api/keepalive` on the
  laptop (it should say `"ok": true`), then open the app on both phones and
  scroll the feed once. The first request after a quiet spell takes a few
  seconds; better now than in front of the panel.
- Notifications allowed on both phones, Do Not Disturb off, sound on,
  brightness up, batteries charged, mobile data on as a backup to Wi-Fi.
- If you can, mirror both phones onto the projector.
- Have the screenshot folder open on the laptop as the backup for any scene.

---

## 3. The walkthrough

Each scene has what to **do**, what to **say**, and what the panel should
**see**. Essential scenes are marked; the optional ones are for when there is
time.

### Opening (optional, 1 minute): the website

- **Do**: on the laptop, scroll the home page to the map of the sixteen
  regional capitals, then to the closing band with the QR code.
- **Say**: "VHub connects health volunteers with the organisations running
  medical outreach across Ghana. Anyone can download it here; on a computer
  they scan this code to open the download on their phone."

### Scene 1 (essential, 3 minutes): a feed ranked for her

- **Do (Phone V)**: open **Home**. Tap the match percentage on outreach A to
  open **Why this match?**
- **Say**: "Every outreach is scored against her profile out of 100: skills
  count 35, category 20, location 20, availability 15, experience 10. She sees
  exactly why an event sits where it does. This scoring is plain code and always
  runs. On top of it, Google's Gemini recognises skills written differently
  that mean the same thing, like venipuncture and blood draw. If Gemini is slow
  or unavailable, the ranking simply carries on without it; matching never
  stops."
- **See**: the ranked feed, then the five-part breakdown.
- **If asked about support roles**: "A support outreach like B gives everyone
  full marks on skills and category, so a first-year student is not ranked down
  for a registration desk."

### Scene 2 (essential, 2 minutes): joining an outreach

- **Do (Phone V)**: open outreach **B**, a support outreach she joined with
  **Quick Join** in one tap. Then open outreach **C** and tap **Apply Now**;
  show the Full Application sheet with her match score and statement box, and
  submit.
- **Say**: "Support roles, like registration and health talks, are open to
  everyone in one tap. Clinical roles are hands-on care, so they need a
  credential an admin has checked. Hers was approved, so this form is open to
  her. An unverified volunteer sees Apply Now disabled with a prompt to verify
  first, and the database itself refuses a clinical application from an
  unverified account, so the rule cannot be bypassed."
- **See**: the confirmation, and C listed under the **Applications** tab.

### Scene 3 (essential, 3 minutes): the organisation chooses its team

- **Do (Phone O)**: **Applicants** tab, choose outreach **A**.
- **Say**: "Eleven people applied for three places. They are ranked by how well
  they fit, adjusted for reliability: an At Risk V-Score multiplies the match by
  0.7. The organiser sees the match score and the V-Score side by side, and
  skill coverage shows whether the team as a whole covers what the event
  needs."
- **Do**: point at the seeded nurse Kwabena Osei: "His raw match is the
  second highest, 58.5, but his reliability puts him lower." Then tap
  **Accept top 3** and confirm.
- **Say**: "The best three are accepted and the next six go on the waitlist.
  Nobody is rejected unless the organiser chooses to. Everyone is told
  immediately, by push notification and email."
- **See**: three accepted, six waitlisted; Phone V receives "You're
  confirmed!".

### Scene 4 (optional, 2 minutes): a place frees up

- **Do (Phone V)**: **Applications**, outreach A, **Withdraw**, choose a
  reason.
- **Say**: "When an accepted volunteer pulls out, the place goes straight to the
  first person on the waitlist, in exactly the order the waitlist shows, and
  they are told at once. The organiser does nothing. Pulling out of a place you
  were given costs a couple of V-Score points, more within 24 hours of the
  start, which keeps the waitlist honest; withdrawing while still pending costs
  nothing."
- **Do (Phone O)**: refresh A's applicants.
- **See**: the first waitlisted volunteer is now accepted.

### Scene 5 (essential, 3 minutes): the event, the review and the V-Score

- **Do (Phone O)**: open outreach **D**, **Show check-in code**.
- **Say**: "On the day, an accepted volunteer scans this code at the venue. It
  only works on a day the outreach runs and only for someone accepted. The
  phone's location is compared with the venue once and only the result is
  kept, never her coordinates."
- **Do (Phone O)**: open D's **Attendance**: she is recorded present.
- **Do (Phone V)**: **Profile**, point at her V-Score.
- **Do (Phone O)**: **Reviews** tab, choose D, review the demo volunteer:
  attended, reliability 5, clinical 5, a remark such as "Punctual", submit.
- **Do (Phone V)**: pull to refresh Profile, then open **My Feedback**.
- **Say**: "Everyone starts at 70. Each review blends 70% of the old score with
  30% of the event score, and ratings of 1 to 5 map to 20 to 100. The score is
  recalculated from her whole history every time, so if a review is disputed
  and upheld, that event simply stops counting."
- **See**: her V-Score has moved, and the review is in My Feedback.

### Scene 6 (essential, 2 minutes): trust, through the admin

- **Do (Phone O)**: sign out, sign in as the admin. **Orgs** tab, open
  **Anwiam Hospital (Demo)**, scroll to **HeFRA licence register**.
- **Say**: "No organisation can publish an outreach until an admin has verified
  it. Here the app has checked the name against HeFRA's register of 1,778
  licensed facilities and found a licensed hospital of that name, with its
  licence date. It is evidence for the admin, not a verdict: most outreach
  organisers are NGOs and churches that will never be on that register."
- **Do**: **Home**, open **Statistics**.
- **Say**: "Every admin decision needs a written reason and is kept in a
  permanent record, and the statistics answer whether the platform is doing its
  job: how full outreaches are and whether no-shows are falling."

### Close (1 minute)

- **Say**: "Volunteers find outreaches that fit them, organisations get the
  right team, and trust is built in on both sides: verified organisations,
  reviewed credentials, private documents, and a reputation that is earned
  event by event. It is built on Supabase with row-level security on every
  table, a serverless API and Google Gemini, with 706 automated tests behind
  it."

---

## 4. If something goes wrong

**Any scene can be shown from its screenshot.** Keep the screenshot folder open
and say "here is that step from our testing".

| What happens | What to do |
|---|---|
| The feed says "Not ranked yet" or is slow | The service was asleep. Pull to refresh once. Say: "if the ranking service is ever unreachable, the feed still shows every outreach, just unranked." |
| A push notification does not arrive | Open the bell icon: every notification is also saved in the in-app inbox. |
| D does not appear in the Reviews tab | Her review was already filed. Open My Feedback on Phone V and explain the scene from there. |
| Accept top 3 was already done on A | Show the accepted and waitlisted lists as they are, and explain. |
| Gemini-based skill suggestions show general skills | That is the designed fallback when Gemini does not answer; point it out as resilience. |
| No internet | The app shows an offline banner and the saved feed rather than crashing. Show it, then continue from screenshots. |

---

## 5. Questions the panel may ask

- **Why Supabase rather than Firebase?** The data is relational: volunteers,
  outreaches, applications and reviews all refer to each other, which suits
  PostgreSQL. Row-level security enforces who can read which row inside the
  database itself rather than in app code. (Android push notifications travel
  through Firebase Cloud Messaging because Android allows no other route; no
  data is stored in Firebase.)
- **How does matching work, and why those weights?** Five parts, weighted
  35/20/20/15/10: skills matter most because they decide whether someone can do
  the work; category and location next; availability and experience refine the
  order. Skills are measured against what the outreach requires, so extra skills
  never count against anyone.
- **What if Gemini fails or runs out of quota?** Matching never stops. The first
  layer is plain, fully tested code; Gemini only improves the skills part, with
  an 8-second limit, and any failure silently falls back to the first layer.
  Answers are cached, so each skill pair is only asked about once.
- **What stops someone giving themselves a high V-Score?** The app cannot write
  the score at all: the database only allows the server to write it, and the
  server recalculates it from reviews, which only an organisation that accepted
  the volunteer can file.
- **Is the V-Score fair to new volunteers?** Everyone starts at 70, in the
  Active band, and reliability can only lower a ranking, never raise it above
  what the fit earns. An untested record is not a bad one.
- **How do you know organisations are real?** Registration numbers, official
  contact details and documents are reviewed by an admin before an
  organisation can publish, with the HeFRA register as supporting evidence.
- **How is personal data protected?** Credential documents are stored
  privately and every link to one expires in fifteen minutes; phone numbers and
  emails are shown only to organisations someone applied to; the location check
  keeps only a yes-or-no result.
- **What happens when someone leaves?** They can close their account in the
  app. Personal details are removed at once; records of work, such as who
  attended an outreach, are kept without the name, so nobody else's score
  changes.
- **How was it tested?** 706 automated tests cover the matching engine, the
  V-Score, rostering and the app's guard rules, alongside repeated device
  testing of every role's flows on Android.
- **Why only Android?** Nothing in the code is Android-only; an iOS release
  needs an Apple developer account, which is the planned next step.
- **Will it scale?** The feed only ranks outreaches in the volunteer's region
  and its neighbours, widening only when there are too few, and Gemini answers
  are cached and shared across all users.

---

## 6. After the defence

- Close **Anwiam Hospital (Demo)** (sign in as it, Profile, Account & Security,
  Close account), so a real facility's name does not stay on the platform.
- Remove the seeded volunteers with `supabase/seed/03_teardown.sql` if they are
  no longer needed.
