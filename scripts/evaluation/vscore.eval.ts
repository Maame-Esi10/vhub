import fs from 'fs';
import path from 'path';
import { createFakeDb, type FakeDb } from './fakeSupabase';
import { getVScoreBand, getReliabilityMultiplier } from '@/lib/vscore';

/*
  RESEARCH QUESTION 4: does the V-Score follow its rules through a realistic
  history, and does editing an old review produce exactly the score the
  corrected history implies?

  Reviews are filed through the REAL /api/vscore route handler (action
  "review"); cancellations through recordCancellationPenalty, the exact
  function /api/application-status calls when an accepted volunteer
  withdraws. Both end in replayAndStoreVScore, the only writer of v_score.
  The stored score is read back from the database after every step.

  THE EXPECTED SCORES ARE WORKED BY HAND from the rules and written below as
  fixed numbers with their arithmetic. They are not computed by any engine
  function. The rules:
    - start at 70;
    - review outcome = mean of the two ratings x 20; absent = 0;
      a multi-day event scales the outcome by days attended / days committed;
    - new score = 0.7 x old + 0.3 x outcome;
    - on-time cancellation -2, late cancellation -8, applied directly;
    - stored to 2 decimal places; bands 90+ Elite, 75-89 Trusted, 60-74 Active,
      40-59 Developing, below 40 At Risk; multipliers 1.00, 1.00, 1.00, 0.90, 0.70.
*/

let currentDb: FakeDb = createFakeDb();
jest.mock('../../api/src/server/supabaseAdmin', () => ({ getSupabaseAdmin: () => currentDb }));
jest.mock('../../api/src/server/auth', () => ({
  ...jest.requireActual('../../api/src/server/auth'),
  authenticate: async () => ({ userId: ORG, role: 'organisation' }),
}));
jest.mock('../../api/src/server/rateLimit', () => ({
  ...jest.requireActual('../../api/src/server/rateLimit'),
  enforceIpRateLimit: () => undefined,
  enforceUserRateLimit: () => undefined,
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const { POST } = require('../../api/src/app/api/vscore/route') as { POST: (req: Request) => Promise<Response> };
const { recordCancellationPenalty } = require('../../api/src/server/scorePenalties') as {
  recordCancellationPenalty: (admin: unknown, input: Record<string, unknown>) => Promise<{ score: number }>;
};
/* eslint-enable @typescript-eslint/no-require-imports */

const OUT = path.join(__dirname, 'output', '03-vscore.md');
const ORG = '00000000-0000-4000-8000-00000000a000';
const VOL = '00000000-0000-4000-8000-00000000b000';
const id = (n: number) => `00000000-0000-4000-8000-0000000c00${String(n).padStart(2, '0')}`;
const E1 = id(1), E2 = id(2), C1 = id(3), E3 = id(4), C2 = id(5), E4 = id(6);

function freshDb(): FakeDb {
  const outreaches = [E1, E2, C1, E3, C2, E4].map((o, i) => ({
    id: o, organisation_id: ORG, title: `Event ${i + 1}`, status: 'completed',
  }));
  const applications = [E1, E2, C1, E3, C2, E4].map((o) => ({
    id: `app-${o}`, outreach_id: o, volunteer_id: VOL,
    status: o === C1 || o === C2 ? 'cancelled' : 'accepted',
  }));
  // One committed day on every single-day event, four on E4.
  const application_days = [
    ...[E1, E2, E3].map((o) => ({ application_id: `app-${o}`, outreach_day_id: `${o}-d1`, released_at: null })),
    ...[1, 2, 3, 4].map((d) => ({ application_id: `app-${E4}`, outreach_day_id: `${E4}-d${d}`, released_at: null })),
  ];
  const attendance = [
    { volunteer_id: VOL, outreach_id: E3, outreach_day_id: `${E3}-d1`, organiser_status: 'absent' },
    { volunteer_id: VOL, outreach_id: E4, outreach_day_id: `${E4}-d1`, organiser_status: 'present' },
    { volunteer_id: VOL, outreach_id: E4, outreach_day_id: `${E4}-d2`, organiser_status: 'present' },
    { volunteer_id: VOL, outreach_id: E4, outreach_day_id: `${E4}-d3`, organiser_status: 'absent' },
    { volunteer_id: VOL, outreach_id: E4, outreach_day_id: `${E4}-d4`, organiser_status: 'absent' },
  ];
  return createFakeDb({
    outreaches,
    applications,
    application_days,
    attendance,
    profiles: [{ id: VOL, role: 'volunteer', full_name: 'Evaluation Volunteer' }],
    volunteer_profiles: [{ id: VOL, v_score: 70, events_attended: 0 }],
    event_reviews: [],
    score_events: [],
    disputes: [],
  });
}

async function review(outreachId: string, attended: boolean, reliability?: number, clinical?: number) {
  const response = await POST(
    new Request('http://eval.local/api/vscore', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer eval' },
      body: JSON.stringify({
        action: 'review', outreachId, volunteerId: VOL, attended,
        ...(reliability !== undefined ? { reliabilityScore: reliability, clinicalScore: clinical } : {}),
      }),
    })
  );
  if (response.status !== 200) throw new Error(`vscore returned ${response.status}: ${await response.text()}`);
}

async function cancel(outreachId: string, late: boolean) {
  await recordCancellationPenalty(currentDb, {
    volunteerId: VOL, applicationId: `app-${outreachId}`, outreachId,
    outreachTitle: 'an evaluation event', lateCancellation: late,
  });
}

const stored = () => Number(currentDb.tables.volunteer_profiles?.[0]?.v_score);

interface Step {
  label: string;
  run: () => Promise<void>;
  expected: number;
  working: string;
  band: string;
  multiplier: string;
}

const STEPS: Step[] = [
  { label: 'Good review (5, 5)', run: () => review(E1, true, 5, 5),
    expected: 79, working: 'outcome (5+5)/2 x 20 = 100; 0.7 x 70 + 0.3 x 100 = 49 + 30 = 79', band: 'Trusted', multiplier: '1.00' },
  { label: 'Good review (5, 4)', run: () => review(E2, true, 5, 4),
    expected: 82.3, working: 'outcome 4.5 x 20 = 90; 0.7 x 79 + 0.3 x 90 = 55.3 + 27 = 82.3', band: 'Trusted', multiplier: '1.00' },
  { label: 'On-time cancellation', run: () => cancel(C1, false),
    expected: 80.3, working: '82.3 - 2 = 80.3', band: 'Trusted', multiplier: '1.00' },
  { label: 'Review marked absent', run: () => review(E3, false),
    expected: 56.21, working: 'outcome 0; 0.7 x 80.3 + 0 = 56.21', band: 'Developing', multiplier: '0.90' },
  { label: 'Late cancellation', run: () => cancel(C2, true),
    expected: 48.21, working: '56.21 - 8 = 48.21', band: 'Developing', multiplier: '0.90' },
  { label: 'Multi-day event, 2 of 4 days, rated (5, 5)', run: () => review(E4, true, 5, 5),
    expected: 48.75, working: 'outcome 100 x 2/4 = 50; 0.7 x 48.21 + 0.3 x 50 = 33.747 + 15 = 48.747, stored 48.75', band: 'Developing', multiplier: '0.90' },
  { label: 'First review edited to (2, 2)', run: () => review(E1, true, 2, 2),
    expected: 42.57,
    working: 'replayed from 70: 0.7 x 70 + 0.3 x 40 = 61; 0.7 x 61 + 27 = 69.7; - 2 = 67.7; 0.7 x 67.7 = 47.39; - 8 = 39.39; 0.7 x 39.39 + 15 = 42.573, stored 42.57',
    band: 'Developing', multiplier: '0.90' },
];

test('V-Score simulation', async () => {
  currentDb = freshDb();
  const rows: string[] = [];
  const storedAfter: number[] = [];
  let allMatch = true;
  for (const [i, step] of STEPS.entries()) {
    await step.run();
    const actual = stored();
    storedAfter.push(actual);
    const band = getVScoreBand(actual);
    const multiplier = getReliabilityMultiplier(actual).toFixed(2);
    const ok = actual === step.expected && band === step.band && multiplier === step.multiplier;
    allMatch &&= ok;
    rows.push(`| ${i + 1} | ${step.label} | ${step.working} | ${step.expected} | ${actual} | ${band} | ${multiplier} | ${ok ? 'yes' : '**NO**'} |`);
  }
  const editedFinal = stored();
  const reviewRows = currentDb.tables.event_reviews?.length ?? 0;

  // The corrected history, filed that way from the start: the same sequence
  // with the first review rated (2, 2) at the time, and no edit.
  currentDb = freshDb();
  await review(E1, true, 2, 2);
  await review(E2, true, 5, 4);
  await cancel(C1, false);
  await review(E3, false);
  await cancel(C2, true);
  await review(E4, true, 5, 5);
  const correctedFromStart = stored();

  const L: string[] = [];
  L.push(`Run on ${new Date().toISOString().slice(0, 10)} by \`scripts/evaluation/vscore.eval.ts\`. Reviews were filed through the real \`/api/vscore\` route; cancellations through \`recordCancellationPenalty\`, the function \`/api/application-status\` calls when an accepted volunteer withdraws. "Expected" was worked by hand from the rules (the working is shown) and is a fixed number in the script, not computed by the engine. "Stored" is \`volunteer_profiles.v_score\` read back after the step. Band and multiplier are read from the stored score.`);
  L.push('');
  L.push('| Step | Event | Hand working | Expected | Stored | Band | Multiplier | Matches |');
  L.push('|---|---|---|---|---|---|---|---|');
  L.push(...rows);
  L.push('');
  L.push(`**All seven steps matched the hand calculation: ${allMatch ? 'yes' : 'NO'}.**`);
  L.push('');
  L.push('**The edit.** Step 7 changed the first review from (5, 5) to (2, 2). The review was updated in place, not added: after the edit the volunteer has ' + reviewRows + ' review rows for four reviewed events. The stored score went from ' + storedAfter[5] + ' to ' + editedFinal + '.');
  L.push('');
  L.push(`**Check against the corrected history.** The same sequence was run again on a fresh database with the first review rated (2, 2) from the start and never edited. Final stored score: ${correctedFromStart}. After the edit: ${editedFinal}. Equal: ${correctedFromStart === editedFinal ? 'yes' : 'NO'}.`);
  L.push('');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, L.join('\n'));
});
