# VHub demo guide

A 20-minute live walkthrough of VHub for a panel, with everything to prepare
beforehand, the script to follow on the day, what to say at each step, and what
to do if something goes wrong.

The demo follows one story: **a nurse finds and joins an outreach, an
organisation builds its team, the event happens, and the nurse's reputation
grows.** Every feature shown serves that story, so the panel never has to
wonder why they are looking at a screen.

---

## 1. What you need

- **Two Android phones** with the release app installed from the website's
  Download button (not a development build, so the panel sees what users get):
  - **Phone V** is the volunteer.
  - **Phone O** is the organisation, and later the admin.
- **A laptop** with the website open, and ideally both phones mirrored onto a
  screen the panel can see.
- **Internet on all three.** Mobile data as a backup if the venue Wi-Fi is weak.

### The accounts

Create these once, as soon as possible, following section 2. Write the passwords
down; you will sign in and out on the day. **Each account you register needs an
email address that can receive the six-digit sign-up code.** One Gmail account
covers all three: Gmail delivers `yourname+org@gmail.com`,
`yourname+hospital@gmail.com` and `yourname+nurse@gmail.com` to the same inbox,
and VHub treats them as three different accounts.

| Account | Role | Used for |
|---|---|---|
| Your admin account | Admin | Verifying organisations and credentials |
| **Demo Health Outreach** | Organisation, verified | Posting outreaches, choosing the team, check-in, reviews |
| **Anwiam Hospital (Demo)** | Organisation, submitted but NOT approved | Showing the HeFRA licence check in the admin queue |
| **Demo volunteer** (for example "Esi Nurse") | Volunteer, nurse, credential approved | The main character of the story |
| Ten seeded volunteers | Volunteers | Filling an outreach so the ranking has something to rank. Password for all ten: `SeedVolunteer1` |

Use a clearly fictional name for the verified organisation. **Anwiam Hospital
(Demo)** is named after a real licensed facility on purpose, because it makes the
HeFRA check show a real match; keep it unapproved, never publish anything from
it, and close it after the demo.

---

## 2. Setting up (once, well before the defence)

**Everything here is done ONCE, as soon as possible, and never repeated.** The
defence date is not fixed, so nothing in this guide depends on it: the
outreaches used live are dated in December (they stay open whenever the
defence falls), and the only outreach that has to happen on a particular day
(D, for check-in) runs within the next few days and is finished long before.
On the day itself you only sign in. No scripts, no setup.

Do these in order. Each step says where it happens.

1. **Start from a clean database.** Follow the first item of "Before final
   submission / demo" in [REPORT_NOTES.md](REPORT_NOTES.md): keep only the
   admin, delete every other test user, and check `outreaches`,
   `applications` and `event_reviews` are empty.
2. **Add the ten seeded volunteers** (Supabase SQL editor): run
   `supabase/seed/01_test_volunteers.sql`. Five of them are in Greater Accra,
   two in Ayawaso East, which is what makes outreach A below rank them
   visibly.
3. **Register Demo Health Outreach** (Phone O): register as an organisation,
   confirm the email code, then Profile, Organisation Verification, fill it in
   and submit.
4. **Approve it** (Phone O, signed in as admin): Orgs tab, open Demo Health
   Outreach, approve with a short reason such as "Demo organisation, details
   checked". Sign back in as the organisation.
5. **Register Anwiam Hospital (Demo)** (Phone O): register a second
   organisation and confirm the code. Then Profile, **Edit Profile**, set the
   region to **Ashanti** and save. Then Profile, Organisation Verification,
   fill it in and **submit, but do not approve it**. It has to be waiting in the queue on the day. The region matters: the
   "(Demo)" in the name lowers the name match, and being in the same region as
   the real facility is what lifts it back over the threshold.
6. **Register the demo volunteer** (Phone V): register as a volunteer and go
   through onboarding with these values, so the ranking favours her:
   - Category: **Nurse**, experience **Experienced**
   - Region **Greater Accra**, district **Ayawaso East**
   - Skills: at least **Blood pressure measurement**, **Vital signs
     monitoring** and **Blood glucose testing**
   - Availability: tick **every Saturday slot** and today's weekday
   - At step 5, sign the declaration and upload a document. **Use a sample
     file, never a real person's licence**: a one-page PDF with the word
     SAMPLE on it is enough.
7. **Approve her credential** (admin): Creds tab, open her document, approve
   with a reason. She is now verified, so clinical roles open to her.
8. **Create the outreaches** (Phone O, as Demo Health Outreach, Create tab).
   Publish each one. Dates are deliberately far ahead so none of them closes
   before the defence.

   | | Title | Type | Region, district | Date and time | Places | Required skills |
   |---|---|---|---|---|---|---|
   | **A** | Blood Pressure Screening, Madina | Clinical, Nurse | Greater Accra, Ayawaso East | Saturday 5 December 2026, 08:00 to 14:00 | **3** | Blood pressure measurement, Vital signs monitoring |
   | **R** | Blood Pressure Screening, Madina (Rehearsal) | Same as A | Same as A | Saturday 12 December 2026, 08:00 to 14:00 | **3** | Same as A |
   | **B** | Community Health Walk | Support | Greater Accra, Ayawaso East | Saturday 28 November 2026, 07:00 to 11:00 | 10 | none |
   | **C** | Diabetes Check Day | Clinical, Nurse | Greater Accra, Ga West | Saturday 19 December 2026, 09:00 to 15:00 | 4 | Blood glucose testing |
   | **D** | Morning Health Screening | Clinical, Nurse | Greater Accra, Ayawaso East | **A day within the next week that suits you**, 06:00 to 09:00 | 2 | Vital signs monitoring |
   | **E** | Eye Screening Week, Kumasi | Clinical, **several roles**: 2 Nurse (Experienced and above), 4 Health or Medical Student (support) | Ashanti, Kumasi Metropolitan | **Three consecutive days** from Monday 7 December 2026, 09:00 to 15:00; open the third day and set it to 09:00 to 12:00 | from the roles | Visual acuity screening (nurse role) |

   R exists so rehearsals never use up A. E is not used in the live demo; it is
   there for the multi-day and multi-role screenshots.
9. **Fill A and R with applicants** (SQL editor): open
   `supabase/seed/02_apply_to_outreach.sql`, find-and-replace the title with
   exactly `Blood Pressure Screening, Madina` (it appears seven times), run it.
   Then do the same again with `Blood Pressure Screening, Madina (Rehearsal)`.
   This is the only script, and it is run once.
10. **The demo volunteer applies to A, R and D** (Phone V): open each, tap
    **Apply Now** (the Full Application), write a sentence, submit.
11. **Accept her on D** (Phone O): Applicants tab, choose D, accept her. Leave
    A and R alone; A is accepted live at the defence.
12. **On D's day, check her in** (both phones): Phone O opens D, **Show
    check-in code**; Phone V, Schedule tab, D, **Scan check-in code**, scans it
    and allows location. **Do NOT file a review for D.** From the day after,
    D is closed automatically and stays reviewable for as long as it is left
    unreviewed, so the review is filed live at the defence.
13. **Rehearse on R**, never on A or D: Scenes 5 and 6 on R. For Scenes 7 and 8,
    open D's check-in code and open the review sheet, then close it without
    submitting.

---

## 3. On the day (sign in, nothing else)

- Open https://vhub-mu.vercel.app/api/keepalive in a browser. `"ok": true`
  means the API and the database are both awake.
- Open each phone's app and scroll the feed once. The API sleeps when unused,
  and the first request after a sleep takes a few seconds; do it now, not in
  front of the panel.
- Phone V signed in as the demo volunteer, Phone O as Demo Health Outreach.
- Notifications allowed on both phones, Do Not Disturb off, volume up,
  brightness up, battery charged.
- The laptop on the website home page.

---

## 4. The walkthrough

Each scene says what to **do**, what to **say**, and what the panel should
**see**. Times are a guide; the whole thing runs about 20 minutes.

### Scene 1. The website (1 minute)

- **Do:** on the laptop, scroll the home page slowly to the map, then to the
  closing band with the QR code.
- **Say:** "VHub connects health volunteers with the organisations running
  medical outreach across Ghana. This is its website: anyone can download the
  app here, and on a computer they scan this code to open the download on their
  phone."
- **See:** the animated feed on the phone, the skills, the map of the sixteen
  regional capitals.

### Scene 2. A feed ranked for you (3 minutes)

- **Do (Phone V):** open Home. Tap the match percentage on outreach A to open
  **Why this match?**
- **Say:** "Every outreach is scored against this nurse's profile out of 100:
  skills count 35, category 20, location 20, availability 15, experience 10.
  She can see exactly why an event sits where it does. The scoring always
  runs; Google's Gemini adds a second layer that recognises when two
  differently worded skills mean the same thing, and if Gemini is unavailable
  the ranking simply continues without it."
- **Do:** open the search (magnifier) and search `screening`.
- **See:** the ranked feed, the breakdown, search results.

### Scene 3. Joining an outreach (2 minutes)

- **Do (Phone V):** open outreach B, **Quick Join**.
- **Say:** "Support roles such as registration, crowd flow and health talks
  are open to everyone in one tap. That is how a first-year student gets
  started."
- **Do:** open outreach C, tap **Apply Now** (the Full Application).
- **Say:** "Clinical roles are hands-on care, so they need a credential an
  admin has checked. Hers was approved, so this form is open to her; an
  unverified volunteer is asked to verify first. Support roles never ask."
- **Do:** submit, then open the **Applications** tab.
- **See:** both applications with their status.

### Scene 4. Posting an outreach (2 minutes)

- **Do (Phone O):** open the **Create** tab. Type a title and a description
  such as "Free breast cancer screening for market women", then tap **Suggest
  skills**.
- **Say:** "Organisers describe the event in their own words, and the app
  suggests the skills it needs from the platform's list. It never adds
  anything by itself, and the full list is always there underneath. One
  outreach can ask for several roles, for example two doctors, three nurses
  and six helpers, and run over several days."
- **Do:** go back without publishing.

### Scene 5. Choosing the team (3 minutes)

- **Do (Phone O):** **Applicants** tab, choose outreach A.
- **Say:** "Eleven people applied for three places. They are ranked by how well
  they fit, adjusted for reliability, and the organiser sees the match score
  and the V-Score side by side. Skill coverage shows whether the team as a
  whole covers what the event needs."
- **Do:** tap **Accept top 3** and confirm.
- **Say:** "The best three are accepted and the rest go on the waitlist. Nobody
  is rejected unless the organiser chooses to."
- **See:** Phone V receives a notification if the demo volunteer was accepted.

### Scene 6. A place frees up (2 minutes)

- **Do (Phone V):** Applications, outreach A, **Withdraw**, give a reason.
- **Say:** "If an accepted volunteer pulls out, the place goes straight to the
  next person on the waitlist, the same order the waitlist shows, and they are
  told by push and email. The organiser does nothing. Withdrawing from a place
  you were given costs a couple of V-Score points, more if it is within 24
  hours, which is what keeps the waitlist honest."
- **Do (Phone O):** refresh the applicants on A.
- **See:** the first volunteer on the waitlist is now accepted.

### Scene 7. Check-in (2 minutes)

- **Do (Phone O):** open outreach D, **Show check-in code**.
- **Say:** "Every outreach has its own check-in code. On the day, an accepted
  volunteer scans it at the venue. It only works on a day the outreach runs and
  only for someone accepted, and the phone's location is compared with the
  venue once, keeping only the result, never her coordinates."
- **Do (Phone O):** open D's **Attendance**.
- **See:** the demo volunteer recorded as present from her scan on D's day.

### Scene 8. The review and the V-Score (2 minutes)

- **Do (Phone V):** Profile. Point at her V-Score.
- **Do (Phone O):** the **Reviews** tab, choose D, review the demo volunteer:
  attended, reliability and clinical ratings of 5, submit.
- **Do (Phone V):** pull to refresh Profile, then open **My Feedback**.
- **Say:** "Her V-Score is built from reviews like this one. Everyone starts at
  70, and the score is recalculated from her whole history each time, so if a
  review is disputed and upheld, that event simply stops counting."
- **See:** the V-Score has moved, and the review is on My Feedback.

### Scene 9. The admin (3 minutes)

- **Do (Phone O):** sign out, sign in as the admin.
- **Do:** **Home**, open **Statistics**.
- **Say:** "The admin sees whether the platform is working: how full outreaches
  are, whether no-shows are falling, and what is waiting on them."
- **Do:** **Orgs** tab, open **Anwiam Hospital (Demo)**. Scroll to **HeFRA
  licence register**.
- **Say:** "Before an organisation can publish anything, an admin reviews it.
  Here the app has checked the name against HeFRA's register of 1,778 licensed
  facilities and found a licensed hospital of that name, with its licence date.
  It is evidence, not a verdict: most outreach organisers are NGOs and
  churches that will never be on that list."
- **Do:** **Creds** tab (empty now, which is fine: "her document was checked
  here"), then **People**, search for a seeded volunteer by name.
- **Say:** "Every admin decision needs a written reason and is recorded
  permanently, and moderation starts from a search for a specific person,
  never a browsable list of everyone."

### Scene 10. Close (1 minute)

- **Say:** "So: volunteers find outreaches that fit them, organisations get
  the right team, and trust is built in on both sides. Credential documents are
  private and every link to one expires in fifteen minutes, contact details
  are shared only with organisations someone applied to, location is never
  stored, and the whole thing runs on Supabase, a serverless API and free
  tiers, sized for Ghana."

---

## 5. If something goes wrong

| What happens | What to do |
|---|---|
| The feed shows "Not ranked yet" or loads slowly | The API was asleep. Pull to refresh once. Say: "the ranking service is waking up; if it is ever unreachable the feed still shows every outreach, just unranked." |
| A push notification does not arrive | Open the bell (Notifications). Every push is also written to the in-app inbox. |
| D does not appear under Reviews | It was reviewed during a rehearsal. Show My Feedback with that review and explain the scene instead. |
| The demo volunteer was not in the top 3 on A | Skip Scene 6 and describe the waitlist promotion in words. |
| No internet at all | The app shows an offline screen rather than crashing. Show it, explain, and continue with screenshots if you took them during the rehearsal. |
| Gemini does not suggest skills | It falls back to general skills and says so. This is the designed behaviour; point it out. |

**Take screenshots of every scene during the rehearsal.** If the venue has no
signal, they are the demo.

---

## 6. Questions the panel may ask

- **Why Supabase and not Firebase?** Supabase is Postgres, so the data is
  relational (volunteers, outreaches, applications, reviews all point at each
  other), and Row Level Security enforces who can read which row inside the
  database itself rather than in app code.
- **What stops someone giving themselves a high V-Score?** The app cannot write
  the score at all. Column-level permissions make it server-only, and it is
  recalculated by the API from reviews, which only an organisation that
  accepted the volunteer can file.
- **What if Gemini is down or out of quota?** Matching never stops. The first
  layer is plain, fully tested code; Gemini only improves the skills part, and
  any failure falls back to the first layer silently.
- **How is this fair to new volunteers?** Everyone starts at 70, in the Active
  band, and reliability can only lower a ranking, never raise it above what
  the fit earns. An untested record is not a bad one.
- **Why only Android?** Nothing in the code is Android-only; iOS needs a paid
  Apple developer account to build and test, which is a cost, not a technical
  limit.
- **How do you know the organisations are real?** Registration numbers,
  official contact details and documents are reviewed by an admin before an
  organisation can publish, with the HeFRA register as supporting evidence.
- **What happens to someone's data if they leave?** They can close their
  account in the app. Their personal details are removed immediately; records
  of work (that an outreach happened, who attended) are kept without their
  name, so nobody else's score changes.

---

## 7. After the demo

- Close **Anwiam Hospital (Demo)** (sign in as it, Profile, Account & Security,
  Close account), so a real facility's name does not stay on the platform.
- Remove the seeded volunteers with `supabase/seed/03_teardown.sql` if they
  are no longer needed.
