# Verification gate and sign-in flows


## Verification Gate (Phase 2 eligibility rule)

Volunteers with `verification_status != 'verified'` can browse all outreaches and apply via Quick Join to support-role events. They cannot submit Full Applications to clinical-role events (`role_type = 'clinical'`) — the application form must prompt them to complete identity verification first. Support-role events never require verification.

**The flow that satisfies that prompt (built 2026-08-20; the completion screen merged into it 2026-09-11).** There are TWO screens named `verify-identity` and they must never be confused:

- `app/(auth)/verify-identity.tsx` is **step 5 of the onboarding wizard**. It submits the whole wizard payload from `useOnboardingStore`, which is `reset()` afterwards — so reaching it from outside the wizard would blank a volunteer's saved category, skills, specialties and availability, and the now-null category would drag them back through the whole wizard. **Nothing outside onboarding may ever link here**; `persistAndFinish` refuses the submit as a second line of defence.
- `app/(volunteer)/verify-identity.tsx` is **the standalone flow**: sign the declaration, upload the credential document, replace it or withdraw it. It is what Settings → Identity Verification and the clinical gate both open.

**The order is sign-then-upload, and it is a constraint rather than a preference.** `/api/verification-document` refuses a document while `declaration_signed` is false, because a credential attached to no declaration is evidence nobody has vouched for — and the declaration is written by the onboarding submit. So onboarding cannot host the upload; it explains that the document comes next, and the completion screen offers it.

**THE COMPLETION SCREEN IS BACK, AND THE UPLOAD MOVED INTO STEP 5** (owner-approved 2026-09-21). This reverses the 2026-09-11 deletion of `app/(auth)/onboarding/complete.tsx`, and it keeps the reason for that deletion rather than discarding it.

- **Step 5 now signs AND uploads.** The declaration and the document still cannot be written in one call, but that was only ever a constraint on the order of two SERVER CALLS and had been implemented as an order on two SCREENS. `persistAndFinish` writes the declaration, then opens the picker and uploads, on one press.
- **Why the celebration is safe again.** It was deleted because it stood BETWEEN signing and uploading, so the one outstanding task arrived as an optional-looking card a new volunteer could walk past. It now comes AFTER the upload, so it reports the outcome of a task already attempted instead of standing in front of one.
- **It READS THE PROFILE, never a navigation flag.** `credential_document_id` is server-only, so its presence is proof the endpoint ran; a flag would only record that the app tried. A cancelled file picker is therefore reported honestly as "no document yet".
- **What it replaced was worse.** Sending the volunteer straight to `/(volunteer)/verify-identity` made the last screen of registration a Settings screen. Owner: "is this how to welcome a new user?"
- **TWO TICKS, AND THEY ARE DIFFERENT AGREEMENTS.** The accuracy declaration and the document-storage consent sat on two screens with nothing saying they were not the same thing. Both are still required (consent is written in the same statement as the document, so it cannot be inferred from the declaration) and they now sit together, each labelled.
- **The missing document is stated and deliberately does not block anything**: an unverified volunteer can browse everything and Quick Join every support-role outreach, so a gate would be wrong; silence was the bug.

**A REJECTED DOCUMENT IS STILL SHOWN** (fixed 2026-09-22). `app/(volunteer)/verify-identity.tsx` branched on `status === 'unverified'` and treated that as "has no document". Those are the same question only until the first rejection: a rejection sets the status back to `unverified` and deliberately KEEPS the file, so a rejected volunteer was shown the empty upload state with "No document uploaded yet" printed directly under a card explaining why the document they could not see had been turned down. **The branch is on `hasDocument`.** The "What should I send?" link moved out of that branch too, because the person whose document was just sent back is exactly the reader it exists for.

**Nothing in the app can grant `verified`.** `verification_status` is absent from `volunteer_profiles`' UPDATE grant list, so the client cannot write it at all; `/api/verification-document` moves it to `documents_pending` on the service-role key and never further. Approval is a human decision, made by an admin in the credential queue (package D).


## Forgot password (built 2026-09-01)

`app/(auth)/forgot-password.tsx` (the designed screen) → `app/(auth)/reset-password.tsx` (code + new password) → `hooks/usePasswordReset.ts`. The "Forgot Password?" link on login had been an intentional no-op since Phase 1, so a forgotten password meant no route back into the account at all.

- **A SIX-DIGIT CODE, NOT A LINK, and that is a documented departure from `design-refs/Forgot Password.png`.** A recovery link would have to reopen the app through `vhub://` and the app would then have to lift session tokens out of the URL fragment itself — password recovery genuinely needs the session to write the new password. **Nothing in this app parses a deep link**; the login-email change is verified entirely on Supabase's side, so the app only reopens and never reads the URL. The link route is new machinery failing in places we cannot see (dev-client vs production scheme, Android mail clients, a redirect allowlist that fails silently into the Site URL). A code is typed into a screen we control. The design's layout is unchanged; only the word "link" becomes "code".
- **REQUIRES `{{ .Token }}` IN SUPABASE'S RECOVERY EMAIL TEMPLATE.** The default template carries only the link, and without that line the email arrives with no code in it. Authentication → Email Templates → Reset Password. **Done 2026-09-01** — but only after custom SMTP was configured, because Supabase locks template editing for new free-tier projects on its own mailer. See the email-delivery section below.
- **The code and the new password are on ONE screen.** `verifyOtp` signs the person in — at that instant they hold a session opened with a code rather than a password. Two screens would create a state where somebody is signed in on a recovery code and has not yet chosen a password; one submission means it never exists.
- **The guard already tolerates this.** `AUTH_ENTRY_SCREENS` (welcome/login/register) is what bounces a signed-in user out of `(auth)`, so a session appearing mid-flow does not yank them into their tabs. The onboarding wizard relies on the same exclusion. On success the screen replaces to the ROOT, not a role home, so the guard routes them like any other sign-in — including a volunteer whose onboarding is unfinished.
- **Nothing reveals whether an address has an account.** `resetPasswordForEmail` succeeds either way and the copy is true either way; a wrong, used and expired code all get one message. Same reasoning as `/api/document-url`'s flat 403.
- **The reset screen has NO design** — the Figma export stops at the email form. It reuses the auth visual language exactly (same header, pill inputs, navy button, the Account & Security strength meter). The illustration on the designed screen is DRAWN (tinted ground, two off-edge discs, one Material icon) because the artwork is not among the exported assets — the same treatment as the no-flyer outreach banner.


## Signup confirmation is a CODE, not a link (built 2026-09-14)

`app/(auth)/confirm-email.tsx` + `hooks/useConfirmSignUp.ts`. Register -> push to the code screen -> `verifyOtp({ type: 'signup' })` -> profile rows written immediately -> `replace('/')` and the guard routes.

- **REQUIRES `{{ .Token }}` IN SUPABASE'S "CONFIRM SIGNUP" TEMPLATE**, exactly as the recovery template already does. Without that line the email arrives with no code in it.
- **The link still works and is now the FALLBACK.** `api/src/app/page.tsx` still receives anyone who taps it; confirming that way falls through to `useConfirmSignUp`'s `existing` branch. The code is the primary path.
- **Why it replaced the link.** The link route crosses three apps - mail client, browser, back by hand - and V-HUB can observe none of it. A flow whose failures are invisible to the person in it cannot be reported, which is what happened on 2026-09-14: a landing page that said "confirmed", then a login that did nothing.
- **It removes the bootstrap gamble, which is the deeper reason.** `signUp` returns NO SESSION when confirmation is required, so profile rows cannot be written at registration; the link path defers them to first login, from `user_metadata`, on a screen that has no idea it is happening. `verifyOtp` returns a real session, so the rows are written right there while somebody is looking at a screen that can report a failure.
- **`lib/profileRows.ts` is the ONE implementation** of that insert, shared by `useSignUp`, `useConfirmSignUp` and `useAuthGuard`'s bootstrap. Its column list is exactly `id, role, full_name, email` because a column-level GRANT pins it. It THROWS rather than returning a status - every caller needs the reason.
- **NEVER add `confirm-email` (or `reset-password`) to `AUTH_ENTRY_SCREENS`.** The guard bounces a signed-in user off those screens, and `verifyOtp` creates the session BEFORE the profile rows exist - so adding it would redirect into a tab group with no profile, recreating the exact dead end this removed. `hooks/__tests__/authEntryScreens.test.ts` asserts it.

## LOGIN IS NOT A RESTING PLACE (fixed 2026-09-14)

**A volunteer who has just confirmed their email is `onboardingIncomplete` by definition** - `volunteer_profiles.category` is null until the wizard's last step writes it. That branch of `useAuthGuard`'s routing effect used to say "anywhere inside (auth) is fine" and return, which is right for welcome and every wizard step and **wrong for login**, the screen you are standing on when you sign in. The result: a successful sign-in with no visible result at all, and no error, because nothing had failed. It hit every newly registered volunteer; organisations were unaffected because the rule is volunteer-only.

- **The branch must keep pulling a user off an entry screen**, excluding `welcome` - welcome is the destination, so redirecting from it to itself loops. `hooks/__tests__/authEntryScreens.test.ts` asserts it.
- **The interaction was already documented and the consequence was never drawn.** `AUTH_ENTRY_SCREENS`' docstring said a volunteer with incomplete onboarding "never reaches this check at all". True, and nobody asked what that cost. **A comment stating a fact is not a comment stating what the fact costs.**
- **Do not diagnose from one plausible story.** The first explanation offered for this was a failed profile bootstrap; the owner's SQL showed the profile rows existed and the diagnosis was wrong. Check the state before building the fix.

## `humanError` must recognise NETWORK failures (2026-09-14)

Android says **`fetch failed: java.net.UnknownHostException: ...`**. React Native's old wording is `Network request failed` and the browser's is `Failed to fetch`; the table had only those two, so the most common error on a phone was the one shape that reached users raw.

- **`looksMachineGenerated` rejects any message naming a JVM or Android class** (a dotted path with a capitalised leaf). This is the half that matters: the pattern table can only match families somebody thought of, and this makes an unrecognised platform exception fall back to the caller's sentence rather than being shown.
- **Never let a hostname reach a user.** In this app it is always the Supabase project ref.

## A failure after a successful sign-in must still speak (built 2026-09-14)

**`signInWithPassword` succeeding does not mean the user is in.** The profile load that follows can fail, and the routing effect's response to a missing profile is to stay put rather than guess a home route - correctly. That combination left a person holding a valid session on the login screen with nothing on it: `signIn.error` was null because signing in had worked.

- **`authStore.authError` is where a post-sign-in failure is recorded**, set by `useAuthGuard` and rendered by the login screen. **It deliberately SURVIVES `reset()`**, because `reset()` runs on the sign-out that the message exists to explain.
- **`ProfileFetchOutcome`'s error variant carries `cause`.** It used to be a bare status, so the app knew exactly why it could not sign somebody in and threw the answer away - that discarding is what made the failure both unexplainable to the user and undiagnosable afterwards.
- **The `'error'` outcome means TWO different things and they must stay separated.** No profile in the store = a stuck fresh sign-in: say so, log the cause, sign out. A profile already in the store = a mid-session network blip: do nothing, because treating "couldn't fetch" as "profile incomplete" would bounce an onboarded volunteer into the wizard mid-session.
- **The general rule, which this shares with the swallowed email failures:** "do not fail loudly here" must be implemented as *record it where it can still be read*, never as *forget it*.


