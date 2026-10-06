# Serverless API, email, monitoring, Gemini

## Rate limiting on the serverless API (built 2026-09-01)

Every route in `api/` is a public URL and does work — a Supabase Auth call plus a `profiles` read — before it can refuse anyone. The gap was never access; it was **cost on a free tier, which is availability**. `lib/rateLimit.ts` is the pure window arithmetic; `api/src/server/rateLimit.ts` holds the counters, reads the caller's address and throws.

- **Three counters, three jobs.** Per IP across every route (120/min, deliberately loose — Ghanaian carrier NAT puts many real users behind one address, so a tight limit would lock out a neighbourhood). Per IP counting **only failed authentications** (20/min — this is the one that bites, and it can be strict because a working client never fails auth). Per signed-in user per endpoint (60/min default; match 20, document-url 20, upload-signature 20, vscore 30, account-closure 5). Both the default and a specific bucket apply, and the tighter one bites first.
- **Enforced in three places on purpose.** First statement of every route handler, ahead of reading the body — otherwise a malformed-body flood is rejected by validation before any limiter runs and is never counted. Again inside `authenticate()` and `assertCronSecret()`, so a route added later is covered even if the first line is forgotten. **Calling it twice in one request counts once** (a `WeakMap` on the request holds the decision) — without that the two call sites would silently halve every limit.
- **`assertCronSecret()` carries it too**, because the cron route is the one that never calls `authenticate()` and would otherwise be the single unlimited public URL here. A wrong cron secret counts as a failed authentication.
- **THE COUNTERS ARE IN MEMORY AND THEREFORE PER SERVERLESS INSTANCE.** A warm instance throttles a sustained flood; instances churn and run several at once, so an attacker spread across them gets a multiple of these limits. **This is a real mitigation, not a guarantee, and the module says so.** The durable version is a small Postgres table plus one atomic function — a **gated schema change**, deliberately not done. When approved, only `hit()` changes.
- **No daily quotas, only per-minute windows.** An instance that will not live a day cannot honestly enforce a daily cap.
- **Fixed windows, and a refused request still counts.** If refusals did not increment, a caller hammering the endpoint would sit at the limit and be let through as a steady trickle when the window expired on schedule.
- **`x-vercel-forwarded-for` is read BEFORE `x-forwarded-for`.** Vercel sets its own header and overwrites the client's; `x-forwarded-for` can carry client-supplied entries, and preferring the spoofable one would let an attacker rotate a fake address past the limit. No identifying header at all → one shared `unknown` bucket, which is the safe direction to fail.
- **A 429 is not a failure to report as one.** `ApiClientError.isRateLimited` + `retryAfterSeconds` (from `Retry-After`) let a screen say "wait a moment". `pingApi()` treats a 429 as **reachable** — only our own limiter produces one, so calling it unreachable would send someone to check DNS over a limit that clears in under a minute.

## Email delivery (2026-09-01) — Gmail SMTP, no domain

**No V-HUB email had ever reached anybody but the owner**, in either of the two
independent systems that send it, and neither failure was visible anywhere.

- **Two systems, and they are still separate.** **Supabase Auth** sends the signup
  confirmation, the recovery code and the login-email-change confirmation; **the API**
  sends the application decisions, the waitlist promotion and the outreach-cancelled
  notice. They share only the mail account they now go through.
- **The old failures.** Supabase's built-in mailer refuses every address that is not on
  the project team and caps at 2/hour — with "Confirm email" ON, **a stranger could not
  register at all**. Resend, with no verified domain, delivers only to the Resend account
  holder's own address and 403s the rest. Both API send paths log-and-swallow (correctly:
  a mail outage must never fail a recorded decision), so total failure looked like success.
- **THERE IS NO DOMAIN AND THERE WILL NOT BE ONE.** Ruled out on cost. That eliminates
  Resend, which has no usable sender without one — hence `nodemailer` over Gmail SMTP from
  a dedicated Google account, authenticated with a Google **app password**. Never
  reintroduce Resend without a verified domain.
- **`server/mailer.ts` is the ONLY transport; `server/email.ts` is the content.** The split
  predates the swap, which is why not one word of any email changed. Anything sending mail
  goes through `mailer.ts` — a second transport would be a second set of failure modes.
- **The sender address is NOT configurable.** Gmail overwrites the From header with the
  authenticated account unless the address is a verified "Send mail as" alias, and
  verifying one needs a domain. `env.mailFrom` therefore composes `"VHub" <GMAIL_USER>` (the app's own name, per constants/brand.ts);
  only `MAIL_FROM_NAME` is ours. Do not add an env var for the address.
- **Batch sends isolate each message.** Resend's `batch.send` put 100 messages in one
  try/catch, so one bad address silently discarded the rest. The loop over one pooled
  connection is not a downgrade — it is what stops thirty-nine emails dying with the
  fortieth. Each send also retries once through a rebuilt transport, because a pooled
  connection cached on a warm serverless instance can be frozen and dead while still
  looking open.
- **`api/src/app/page.tsx` is where confirmation links land**, because Supabase sends them
  to the Site URL and this project has no website — only the API deployment, whose root was
  a 404. It **confirms nothing itself** (Supabase already did, before redirecting), it
  **reads the error out of the URL before asserting success** so an expired link never says
  "confirmed", and it **clears the URL fragment**, which arrives carrying real session
  tokens. It is the only page in an otherwise API-only project; `app/layout.tsx` exists
  solely because the App Router demands one. **Its logo is imported from the Expo app's
  `assets/logo.png` through the `@/*` alias, NOT copied into `api/public/`** — the same
  one-copy arrangement `outputFileTracingRoot` already exists to support. Drawn with a
  plain `<img>` from the static import's `.src`, because `next/image` would put a fixed-size
  logo through Vercel's metered image optimiser for nothing.
- **THE TWO ACCOUNT DECISIONS NOW SEND MAIL TOO** (2026-09-22, owner-reported: "the org didn't get a mail that they've been approved"). The organisation-verification decision and the volunteer credential (Gate 1) decision had only ever written an in-app notification and a push. That pair is right for something happening WHILE somebody is using the app; it is wrong for these two, because the wait is long and open-ended, the person has closed the app, a push is not durable, and the decision blocks the whole ACCOUNT rather than one event. `sendOrganisationVerificationEmail` and `sendCredentialDecisionEmail` in `server/email.ts`, best-effort and last, like every other send. **The REJECTION reason is quoted verbatim and the APPROVAL reason is not**: a rejection's reason is addressed to the person and is the only thing telling them what to fix, while an approval's is a note for the next admin about why thin evidence passed.
- **The ceiling is ~500 recipients per rolling 24 hours**, shared with Supabase's auth
  emails, counted per recipient. Fine at this scale, not a production mail system. Moving
  to a real provider later is a change to `mailer.ts` and nothing else.
- **Changing the Google account's password revokes the app password** and stops all mail —
  the app's and Supabase's alike. It looks like Supabase breaking. Regenerate and paste into
  both Supabase SMTP settings and Vercel's `GMAIL_APP_PASSWORD`.

## Error monitoring on the serverless API (built 2026-09-08)

An endpoint failing in production was invisible. `errorResponse()`'s only reaction to an unexpected error was one `console.error` string, and on Vercel's Hobby plan runtime logs are a live tail with about an hour of retention and no alerting — so a route that started failing overnight left no trace by morning, and the way anybody found out was a user complaining. `lib/errorMonitor.ts` is the pure grouping and throttling; `api/src/server/errorMonitor.ts` holds the counters and sends. No migration, no new dependency.

- **It hangs off `errorResponse()` and nothing else.** Every route already ends its catch block there, so that one function is the complete set of places a failure becomes a response — a route added later is monitored without anybody remembering. Same argument that put the rate limiter inside `authenticate()`. Every call site now passes `req` so the record can name the route.
- **IT SHIPS INERT.** With `ALERT_EMAIL` unset, nothing is sent; the only change is that the log line becomes structured JSON. Turning alerting on is one Vercel env var and no deploy — whether an inbox should receive this is an operational decision, not a repository one.
- **Only 5xx alerts; EVERY status is logged.** A 400/401/403/404/409/429 is the API working — refusing a bad body, an expired token, a flood. Alerting on those would bury the one message that mattered. But they are all logged, because that is what makes "how often is this 403 happening?" answerable at all.
- **The fingerprint is what makes the throttle work.** Uuids, quoted values and bare numbers are normalised out of the message before grouping — without that every occurrence of one bug is its own kind, the throttle never engages, and a broken endpoint still sends one email per request.
- **Throttled to one alert per kind per 15 minutes, with the suppressed count carried into the next one.** Nothing is hidden; the message says how many more arrived while it was quiet. A first occurrence always alerts.
- **THE USER ID GOES IN THE LOG AND NEVER IN THE EMAIL.** The log stays inside Vercel; the email leaves for a third-party mailbox. `authenticate()` records the caller in a `WeakMap` keyed on the Request, the same arrangement `rateLimit.ts` uses.
- **A `ZodError`'s flattened detail is NOT recorded.** It echoes the request body back, and on these endpoints that can be a dispute statement or a rejection reason — somebody's words, in a log they never agreed to be in.
- **`observeError` never throws**, and a failed alert is a plain log line and nothing more: an alert that cannot be delivered must not itself become an alert.
- **The send runs in `after()`**, so a failing request is not also a slow one. A floating promise would not survive — Vercel may freeze the instance the moment a response is returned.
- **The counters are IN MEMORY and therefore per serverless instance**, the same accepted limitation as the rate limiter. It fails in the direction of extra noise, never silence, which is the right way round for something whose job is to tell you about a fault.

## Notification retention (built 2026-09-08)

`notifications` had no expiry and no delete policy, so it only ever grew — and it grows with volunteers × outreaches, because `new_match` writes one row per matching volunteer per outreach and the under-subscription ladder does the same up to three times per event. `lib/notificationRetention.ts` is the pure rule; `api/src/server/notificationRetention.ts` does the queries; the sweep is the **sixth pass of the existing nightly cron**. No migration, no new dependency.

- **A NOTIFICATION ROW IS ALSO A DEDUPE MARKER.** `checkinReminders` and `underSubscription` both remember what they have already sent by reading their own rows back (`data->>'stage'` + the outreach day id). Deleting one while it is still doing that job sends the notification twice, weeks later, with nothing connecting the two events. **This is the constraint the whole design is shaped around.**
- **Two independent defences, and neither may be removed as redundant.** (1) A row attached to an outreach that has not finished is never deleted, whatever its age — "finished" read from `outreach_days`, never `outreaches.date`, which is only the first day. (2) The sweep runs LAST in the cron, after every pass that reads this table.
- **It fails CLOSED.** If the "is this outreach finished?" check errors, everything is protected and the night is skipped. Missing a cleanup costs nothing; a duplicate push reaches a real person.
- **The window is 180 days.** Nothing is reachable only through a notification — the accepted application, the verification decision and the deduction each live in their own table with their own screen — so this is about the size of the table, not about hiding anything.
- **Bounded batches deleting by id, never one `where created_at < cutoff`.** The single statement takes an unbounded lock inside a function with five other passes to finish, and cannot express the protection rule at all. 500 per batch, 20 batches a night.
- **Pagination skips kept rows by OFFSET, not by a `created_at` cursor.** `notifyUsers` writes a whole fan-out in ONE batched insert, so hundreds of rows share a timestamp to the microsecond and a strictly-greater cursor would step over the rest of the group.
- **`dryRun` is not decoration.** The window is longer than this repository is old, so the pass finds nothing to do until 2027 and would otherwise run unattended for the first time having never been exercised. `POST /api/notifications { "action": "sweep-notifications", "dryRun": true, "retentionDays": 30 }`. **`retentionDays` is honoured ONLY on a dry run**, so there is no way to shorten the real window through the endpoint.


## Gemini has TWO jobs, and they are different (2026-09-15)

1. **`server/gemini.ts` -- equivalence, for the MATCHER.** "Are these two skill strings the same skill?" Layer 2 of the spec. **It rarely changes anything**, and that is structural: both sides pick from the same closed vocabulary in `constants/skills.ts`, so literal comparison already catches every real overlap. It earns its keep against `RETIRED_SKILLS` and pre-vocabulary rows. Kept because it costs nothing when it agrees, not because it moves scores.
2. **`server/geminiSkills.ts` + `/api/skill-suggest` -- recommendation, for a HUMAN filling in a form.** "Given what this person just wrote, which of our skills do they mean?" An organisation typing "breast cancer screening" finds nothing by search - "breast cancer" is not a skill - while clinical breast examination and referral coordination sit unfound. **This is additive and does not touch the matcher.**

- **THREE RULES, ENFORCED IN CODE, NOT TRUSTED TO THE MODEL.** The reply is matched back against `ALL_SKILLS` and anything invented is dropped; it RANKS and never filters, so the full list stays browsable underneath; it never applies a skill. Filtering would let one sentence permanently narrow a volunteer's own profile, which is what the matcher reads.
- **ONE CALL PER PRESS.** A button, never a watcher on a field. Bucket `skill_suggest`, 10/min.
- **UNAVAILABLE IS A 200, NEVER AN ERROR.** No key, timeout, quota gone and nothing relevant are one answer to a screen: show the picker it was going to show anyway. **It returns `UNIVERSAL_SUPPORT_SKILLS` with `basis: "general"`, not an empty array** (corrected here 2026-09-23; this line still said "an empty array" long after the code changed). An empty array made the screen say "no close match", which is a false statement about the vocabulary rather than an honest one about Gemini. `basis` is what stops the heading claiming her words were read when they were not: `matched` means Gemini answered, `general` means these are the skills almost any outreach can use.
- **NOTHING PERSONALLY IDENTIFYING GOES TO GOOGLE** on either path - skill strings, the vocabulary, and the free text the user just typed. `constants/policy.ts` already describes this accurately; keep it true.


