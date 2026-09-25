This section is compiled from the project's own records of device testing, not from a script: device tests are carried out by hand on a phone. Each entry cites where the result was recorded at the time. **The device model and Android version were not recorded for any of these rounds**, so they are shown as "not recorded" rather than guessed. Rounds before 2026-09-24 ran on Expo development builds; the rounds of 2026-09-24 ran on the Android release APK.

A journey counts as tested only if a record shows it was carried out on a device. A journey whose last device run found a defect that was then fixed, with no recorded re-run afterwards, is listed as **needs re-test**, not as passed.

## 4.1 Journeys with a recorded device test

| Journey | Date | Device | Result | Defects found (all fixed in code afterwards) | Source |
|---|---|---|---|---|---|
| Quick Join | 2026-07-31 | not recorded | Passed | None recorded | `docs/REPORT_NOTES.md`, "Test on device next session (as of 2026-07-31)": "Confirmed working on device by the owner: Quick Join, Apply Now, withdraw, and re-apply after withdrawal" |
| Full Application (Apply Now) | 2026-07-31; 2026-09-24 | not recorded; release APK | Passed on 2026-07-31. Failed on the release APK on 2026-09-24, then passed on re-test the same day after the fix | "Your application was refused": every in-app application failed because `apply_to_outreach` issued a DELETE the volunteer no longer had permission for (migration 20260924) | `docs/REPORT_NOTES.md`, "Found on the first standalone APK (2026-09-24)" and the owner's re-test report of 2026-09-24 |
| Withdrawal and re-apply (without waitlist promotion) | 2026-07-31 | not recorded | Passed | None recorded | as Quick Join |
| QR check-in | 2026-08-21 | not recorded | Passed: "a real scan on a real phone returned 'You're checked in' against the correct event and date" | "Mark attendance" was missing from a live event before its stated start time | `docs/REPORT_NOTES.md`, "Device round 2: what test 01 turned up (2026-08-21)" |
| Push notification delivery | 2026-09-23 | not recorded | Passed: a push arrived on the phone and in the in-app inbox | Pushes had not been delivered because the FCM key was uploaded to Expo but never assigned to the app | `docs/REPORT_NOTES.md`, "Push works, and the cause was one word: 'assigned' (2026-09-23)" |
| Release APK: install and start, both icons, ranked feed, organisation verification, admin organisation queue, admin statistics | 2026-09-24 | release APK, model not recorded | Passed (owner's device checks 1 to 6) | None | The owner's report of 2026-09-24, recorded in the session notes |
| Admin round A1 to A8: organisation verification, credential review, moderation, disputes, statistics, vetted sources | 2026-09-22 | not recorded | Most steps reported as working | Rejected credential document not visible to the volunteer; reason field hidden behind the keyboard on five forms; no email to an approved organisation; publishing from the dashboard gave no confirmation; back navigation from notifications | `docs/REPORT_NOTES.md` and the fix list of 2026-09-22 |

## 4.2 Journeys that need a re-test (tested, defect found and fixed, no recorded re-run)

| Journey | Last recorded device run | Defect found | Source |
|---|---|---|---|
| Registration and the six-digit code | 2026-09-14 and 2026-09-21 | Signing in after registering did nothing (2026-09-14); after the code, a new volunteer was sent to the welcome screen instead of onboarding (2026-09-21) | `docs/architecture/verification-and-auth.md`, "LOGIN IS NOT A RESTING PLACE (fixed 2026-09-14)"; fix list of 2026-09-21 |
| Onboarding | 2026-09-21 | Step 5 showed a non-functional upload card; the ending was restructured. The wizard was reordered again on 2026-09-25 (role first, skill limits), which has not been on a device | fix list of 2026-09-21; this session |
| Creating and publishing an outreach | 2026-09-21 and 2026-09-22 | Saving a draft navigated into Manage Event; publishing from the dashboard gave no confirmation | fix lists of 2026-09-21 and 2026-09-22 |
| Credential review | 2026-09-22 | As in the admin round above | as above |
| Accepting applicants (single decision) | 2026-08-21 | Deciding an applicant sent an email but no push; the applicant card offered every action whatever the status; no confirmation after a decision | `docs/REPORT_NOTES.md`, "Device round 2 (2026-08-21)" |

## 4.3 Journeys with no recorded device test

These have unit or integration coverage in the code but no record of having been carried out on a phone. They are **not** reported as passed.

- The verification gate on a clinical role (an unverified volunteer refused a clinical Full Application)
- Accept top N
- Withdrawal that triggers waitlist promotion, with the promotion email and push
- Post-event review
- Offline behaviour

To complete this section, run each journey in 4.2 and 4.3 on the release APK and record the date, the phone model and Android version (Settings, About phone), the result and any defect.
