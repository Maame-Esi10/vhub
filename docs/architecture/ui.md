# Screens and UI decisions


## Profile and Settings are ONE screen (merged 2026-09-22)

Owner: "a major change, I want the profile and settings to be one... the separated is kind of a mess". `app/(volunteer)/settings.tsx` and `app/(organisation)/settings.tsx` are DELETED; both Profile tabs now hold everything and the gear button is gone.

- **The split was never defensible and the arguments are in the git history**, several of them had twice. Identity Verification is arguably profile; Edit Profile is arguably settings; My Feedback is neither. Every row needed a ruling about which of two screens it belonged on.
- **Both screens carried their own identity header**, at 64px on Profile and 88px on Settings. The organisation's two disagreed about what an organisation is called: Profile read `profiles.full_name`, Settings read `organisation_profiles.org_name`, and those are different columns that can legitimately differ. **`org_name` won**, because it is the name volunteers see on an outreach.
- **The order is hers**: who you are, then your number, then everything you can change.
- **ANY `fallback` OR `from` POINTING AT A SETTINGS ROUTE MUST NOW POINT AT `profile`.** Ten of them did, mostly `ScreenHeader` fallbacks on account-security, notification-settings and organisation verification. A tab group keeps no history, so a stale fallback is a silent wrong destination rather than an error.
- **The ADMIN keeps its own `settings.tsx`.** There is no admin Profile tab to merge it into, and an admin has no child profile row at all.
- **The forms behind the rows stayed where they were.** Merging two screens that held only rows is not an argument for inlining Edit Profile or Account & Security into them.

## The V-Score card and the settings row, from the owner's references (2026-09-22)

Three reference images in `design-refs/Reference - *.png`, supplied by the owner. Only two were used; the hero promo card contributed its gradient and nothing else.

- **`components/volunteer/VScoreCard.tsx`** takes its anatomy from the metric-card reference: titled header with a circular arrow at the trailing edge, the figure large and right-aligned, a gradient track with a round KNOB at the current position. **The knob is the point**: a V-Score is a POSITION on a fixed 0-100 scale cut into five bands, so a marker on a track carries the meaning that a filled bar does not.
- **THE GRADIENT IS NOT A HEAT SCALE.** It runs coral to navy across the whole track whatever the score. Colouring it by value would contradict the band label, which is where the judgement lives, and would print "danger red" under somebody's number without the word. `react-native-svg` is already a dependency; stacked translucent Views band visibly at this size.
- **The knob is positioned by percentage MINUS half its own width.** A plain `left: ${score}%` hangs half the knob past the right edge at 100, which reads as a rendering fault rather than as a full score.
- **`SettingsRow` now ALWAYS stacks its label and value**, and this is a simplification rather than a restyle. The side-by-side form had been broken three separate times (label starved, then value starved, then both starved at a large font scale) and every fix was arbitration between two text nodes competing for ~230dp. Stacked, the competition does not exist: no `scaleWithFont` floors, no line caps, no `prefersStackedLayout` branch, no measurement. **The chevron sits in a white disc** on the grey slab, which is what makes a flat row read as tappable without a border.

## The app is VHub; the project is V-HUB (2026-09-15)

- **`constants/brand.ts` is the ONE home for the name, the tagline and the intro sentence.** They had already drifted: the splash said "Volunteer Medical Outreach" while login said "Virtual Health Unified Bridge", two descriptions of the same product on two screens a new user sees seconds apart.
- **`APP_TAGLINE` is what the app IS** (two clauses, display weight, under the wordmark). **`APP_INTRO` is what it DOES** (one sentence, quieter). Keep them apart: a tagline that explains is not a tagline, and an explanation at tagline length explains nothing.
- **CLAUDE.md and `docs/` keep V-HUB on purpose.** The app's display name is VHub; the final year project is V-HUB. They are different things and the documents are about the project.
- **`slug`, `scheme` and `package` in app.json are NOT the name** and must never be "renamed": slug links the repo to the EAS project, scheme is the deep-link protocol, and changing package makes a second app rather than a renamed one.
- **A launcher-label change needs a REAL BUILD.** `expo.name` lives in the native manifest, so an OTA update will leave the phone showing the old name while every screen shows the new one.
- **The wordmark is mixed case and takes NEGATIVE tracking at display size.** Positive letter-spacing is an all-caps treatment; applied to "VHub" it pulls the word apart into "V H u b".

## The splash is ONE composition (rebuilt 2026-09-15)

- **Grouping is stated by the spacing, not implied.** Mark and wordmark 4px apart (one lockup); **36px** before the tagline (the group boundary); 8px between tagline and intro. The gap between groups must be much larger than the gap within them or nothing reads as grouped - the same fault the Profile screen had.
- **The spinner is pinned near the bottom, away from the text**, so it reads as machinery rather than as a fifth line of the composition.
- **`MARK_CENTER_RATIO` is 0.42, and it is ONE constant shared by both variants.** A composition on the exact middle of a tall screen reads as adrift. More importantly the two splashes must agree: the mark used to be a different size in a different place in each, so the app's two loading screens read as two screens from two apps.
- **There is ONE splash mark size (`hero`).** `heroCompact` was deleted, reversing its own recorded rationale - it existed because 0.32 crowded the old flex column, which is not true of a composition with a real group boundary. Do not reintroduce a second size without solving the agreement problem another way.
- **Decoration is `react-native-svg`, already a dependency** (the check-in QR pulls it in) - so gradients needed no gated dependency change. Stacked translucent discs band visibly at this size.
- **The hold depends on the variant**: 3200ms for the intro splash (about twenty words to read), 1500ms for the mark-only one (nothing to read, and a returning volunteer just wants the app).
- **Accepted:** the native splash can only centre a flat image, so the mark rises ~3% and the glow appears at the native-to-JS handover. `imageWidth` tracks the JS mark size; there is no vertical offset in expo's splash config.


## Clinical and support are about the WORK (2026-09-15)

**Clinical is hands-on care. Support is what makes the event run. Verification is a CONSEQUENCE of the first, never its definition.** Both words had only ever appeared beside verification, which taught everyone that clinical means verified and support means unverified.

- **Two real costs:** a verified nurse reads "support" as beneath her and never applies; an organisation ticks "support" to stop the gate blocking applicants and takes the credential check off work that needed it.
- **`RoleTypeExplainer` is a DIAGRAM, not a paragraph** - two columns, four examples each. A comparison is what a paragraph is worst at. **The verification line sits underneath BOTH columns**, never inside the clinical one: attaching it there is how the misreading was taught.
- **It goes before the choice**, not after: the volunteer's first onboarding step, and `RoleBuilder` where an organisation picks role type.
- **`SKILL_AFFINITIES` in `constants/skills.ts` prompts thin profiles without Gemini.** Somebody who ticks three skills usually recognised three and stopped. The first draft named NINE skills that do not exist, written from memory rather than the file - `companionSkills` drops unknown entries, which is right at runtime and is exactly what hid it. A test asserts every suggestion is real.

## Info Hub: a map before the detail (2026-09-15)

- **`InfoTopics` (the topic rail) names every idea in two words.** (CLAUDE.md called this `GlanceGrid` until 2026-09-23; no such component exists.) A stack of collapsed sections is a table of contents written as furniture: you had to open things to learn whether the screen answered your question. It is deliberately NOT tappable - no navigation promise it would have to keep.
- **`HintRail` on both home screens, because nobody opens either hub unprompted.** (Called `HintRow` here until 2026-09-23; the file is `components/ui/HintRail.tsx`.) Not a card (it would compete with the outreaches the screen exists for) and not dismissible (that needs somewhere to remember the dismissal, and hands the least engaged user a way to remove the thing aimed at them). One quiet line survives being seen fifty times.
- **The volunteer feed carries a second line about skills**, because nothing told a volunteer their profile decides what the feed shows - so a thin profile read as a quiet platform rather than a fixable setting.

## The notifications inbox (rebuilt 2026-09-19)

**A DEPARTURE FROM RULE 7, owner-requested.** `design-refs/Notifications.png` is a full-bleed row list, faithfully built and now the last list in the app drawn that way; every other one became bordered white cards during the card-language work of 2026-09-16 to 2026-09-18. The screen is now the feed card's container to the token. The design is not wrong, it is older than the language the app arrived at.

- **`lib/notificationPresentation.ts` decides what a notification LOOKS like and WHERE IT GOES**, and both answers come from one place so the card's "View" affordance can never promise navigation the tap does not deliver.
- **`notifications.type` has FOUR values and NINE kinds of news travel through them.** Six endpoints write the real discriminator into `data.kind`; the application decisions write theirs as a status. Nothing on the client read any of it, so a credential approval, a dispute outcome, a suspension notice and an ordinary application update were one blue clipboard icon. Read kind, then status, then type. **No migration: the data was always being sent.**
- **NULL IS A REAL DESTINATION.** `moderation` and `test` go nowhere on purpose - a suspension refers to the account state the home banner already shows, and a test push exists to prove delivery. A plausible-looking destination would teach people that tapping does something unpredictable.
- **An application decision goes to the TRACKER, not to the outreach.** Changed here. The tracker states the status in words, says what it means, and gives a waitlisted volunteer their live queue place; the outreach page states none of that. Matches and reminders still go to the outreach.
- **THE ROW IS THE OWNER'S REFERENCE DESIGN (rebuilt 2026-09-22), not `design-refs/Notifications.png`.** She supplied a banking app's inbox and asked for that anatomy with emojis in place of its photographic thumbnails. Emoji tile, then title, message and timestamp stacked; no caption, no box per row, no "New" pill.
- **The uppercase category caption is GONE from the card and kept in the accessibility label.** It existed because nine kinds share four `type` values and one blue clipboard icon could not tell them apart. That was an argument about the ICON, and an emoji answers it better: "APPLICATION UPDATE" above "You're confirmed!" above "…your application is now accepted" was three lines saying one thing.
- **`NotificationPresentation.emoji` is what the inbox draws; `icon` is kept and still typed against the glyph map** for anything monochrome or state-tinted. **Emojis are chosen from the pre-Emoji-5.0 set**: a newer one draws as an empty box on an otherwise fine Android and nothing at runtime reports it. `notificationPresentation.test.ts` asserts every kind, decision and type resolves to a real emoji, because an empty string renders as a blank tile that looks deliberate.
- **The timestamp moved BACK under the message**, reversing the earlier fix, and the reversal is the point: it was moved up because a time under a short message in a rounded box is the strongest chat-bubble signal there is. The diagnosis was right and the cure was aimed at the wrong half. **It is the BOX that makes a bubble** - with the per-row box gone, a small grey time under a sentence is a dateline.
- **One rounded panel per DAY, hairline rules between rows**, via `first`/`last` on `NotificationCard` (computed in `toNotificationRows`, where the grouping already happens; this said `NotificationListRow` until 2026-09-23 and no such file exists). Not per-row boxes, and not the full-bleed rows called outdated: the card language moved up to the GROUP instead of repeating eleven times down a screen. There is no wrapper View - a FlatList renders rows, not sections, and wrapping would give up recycling.
- **Unread is a tinted row plus a coloured dot.** The word "New" went with the caption it sat on.
- **THE MESSAGE IS A TWO-LINE PREVIEW AND THE TAP OPENS IT.** A navigable row opens its screen; a row with no destination (a suspension, a test push) EXPANDS IN PLACE, because for those two the row is the only place the text is ever read. **Only the expandable rows carry a mark** ("More"/"Less"): tapping a notification to open the thing it is about needs no affordance and the reference has none.
- **The list inset is `spacing.base`, not `spacing.xl`.** The text column was being squeezed by the list inset, the card padding, the gap after the icon and the chevron's gap all at once, leaving the words about 250px of a 400px screen. Short lines in a narrow channel with wide empty margins read as centred text, which is what was reported. Anything added to either side of this row costs the words directly.
- **`lib/__tests__/notificationPresentation.test.ts` enumerates kinds from `api/src`, not from the map.** Its first version asserted behaviour ("does this render differently from the fallback?") and **passed with an entry deleted** - an unrecognised kind falls back to its `type`, which for all six is `application_status`, a perfectly ordinary-looking card. It now asserts against `RECOGNISED_NOTIFICATION_KINDS` directly, with a floor assertion guarding the regex so a refactored API cannot make the scan silently vacuous. See [[vhub-guards-that-hide-their-own-bugs]].
- **`NotificationPresentation.icon` is typed against MaterialCommunityIcons' glyph map**, not `string`: a misspelled name renders as an empty square and nothing at runtime would ever notice.

## Search (built 2026-09-22)

`app/(volunteer)/search.tsx` + `useSearchOutreaches` in `hooks/useOutreaches.ts`. Reached from the magnifier beside the bell on the feed header, which is its ONLY entry point: the screen is registered `href: null` and had been an unreachable 12-line stub since the scaffold. **There had been no keyword search anywhere in the app** - the feed filters by region and role type and orders by match, which answers "what suits me" and never "where is the eye screening in Kumasi".

- **TWO QUERIES, MERGED BY ID, rather than one clever one.** The text columns (title, description, location_name, district, region) go through `.or()` with `ilike`; `required_skills` goes through a second request using `.overlaps()`. Folding the array into the same `.or()` is possible in principle and fragile in practice - the array literal's own commas collide with the comma separating one filter from the next, and the failure mode is a query that quietly matches the wrong rows.
- **The skill search goes through the VOCABULARY, not the column.** Skills are a closed list, so the term is resolved to real skill names from `ALL_SKILLS` on the client and the query then asks for outreaches requiring any of them. That is what makes "triage" find an outreach whose description never uses the word.
- **`FILTER_GRAMMAR` strips `,()*%\"'` from the term.** Not SQL injection - supabase-js parameterises values - but PostgREST filter grammar: an unstripped comma splits one filter into two, and the result is a broken or wrong query rather than an unsafe one.
- **The date chips are measured from the day an outreach STARTS**, and every label says so ("Starting today", "Next 7 days"). Reading them as "runs at any point inside this window" would mean consulting `outreach_days`, whose answer arrives after the list is drawn and would change it under the volunteer's thumb. A narrower meaning is fine; a label that means something else is not.
- **THE MATCH PILL IS NOT DRAWN, a stated departure from `design-refs/Search Results.png`.** `/api/match`'s `rank_feed` ranks a REGION, not an arbitrary list of ids, so there is no score to fetch for a text query - and `MatchScoreBadge` correctly refuses to invent one, rendering "NOT RANKED YET", which here would be a row of identical pills reporting an outage that is not happening. `OutreachFeedCard` gained `showMatchScore` for this. **The design's "1.2 miles away" is absent for the same class of reason**: an outreach stores a region, a district and a venue name, and no coordinates.
- **The debounce lives in the CHANGE HANDLER, not in an effect.** An effect watching the term and setting the applied term is the textbook shape and would have been a thirteenth `set-state-in-effect` suppression. The only effect on the screen clears the timer on unmount and sets no state.
- **Idle is not empty.** Nothing typed and no filter set shows a prompt, never "nothing matched" - telling somebody their search failed before they have made one.


