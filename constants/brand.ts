/**
 * The app's name, tagline and one-line introduction.
 *
 * ONE PLACE, because these three strings appear on more than one screen and
 * drifted the last time they were written out by hand: the splash said
 * "Volunteer Medical Outreach" over "Connecting compassionate volunteers with
 * communities in need of medical care", while the login screen said "Virtual
 * Health Unified Bridge" - two different descriptions of the same product, on
 * two screens a new user sees within seconds of each other.
 *
 * THE DISTINCTION BETWEEN THE TWO LINES IS DELIBERATE, and copy added later
 * should keep it:
 *
 *   APP_TAGLINE  is what VHub IS. A claim, in two short clauses, set at
 *                display weight directly under the wordmark.
 *   APP_INTRO    is what VHub DOES. A full sentence, set quieter and smaller,
 *                which does the explaining the tagline deliberately does not.
 *
 * A tagline that explains is not a tagline, and an explanation compressed to
 * tagline length explains nothing. Keep them separate.
 *
 * APP_NAME is the DISPLAY name and is "VHub" everywhere a person can read it.
 * The FINAL YEAR PROJECT is called V-HUB, and CLAUDE.md and docs/ keep that
 * name on purpose - they are documents about the project, not the product.
 */

/** Display name. See app.json `expo.name` for the launcher label, which matches. */
export const APP_NAME = 'VHub';

/** What the app is. Two clauses, no verb needed, sits under the wordmark. */
export const APP_TAGLINE = 'Connecting Volunteers. Transforming Healthcare.';

/** What the app does. One sentence, and the only place the detail belongs. */
export const APP_INTRO =
  'Find medical outreach opportunities, join impactful events, and help communities in need.';
