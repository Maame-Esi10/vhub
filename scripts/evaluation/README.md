# Evaluation scripts (thesis Chapter Five)

Everything in `docs/evaluation-results.md` is produced by these scripts. Nothing
is typed into that file by hand except its headings and Section 4 (device
testing), which is compiled from the project's own records and says where each
entry comes from.

## What each file does

| File | Produces | Needs |
|---|---|---|
| `dataset.ts` | The test set: 6 outreaches, 72 volunteers, and the meaning tag of every skill wording | nothing |
| `relevance.eval.ts` | `output/00-relevance.md`: which volunteers are relevant, written from the tags alone, before any scoring | nothing |
| `layers.eval.ts` | `output/01-layers.md` and `layers.json`: Layer 1 against Layer 1 + Gemini | a Gemini key for runs B and C |
| `failure.eval.ts` | `output/02-failure.md`: six forced Gemini failures | nothing (the failures are simulated) |
| `vscore.eval.ts` | `output/03-vscore.md`: the V-Score simulation | nothing |
| `output/04-functional.md` | Device testing, compiled from the records | kept up to date by hand |
| `perf.mjs` | `output/05-performance.md` and `performance.json` | accounts on the live project; phone timings measured by hand |
| `jest-summary.js` | `output/06-jest.md`: the test suite, per file | nothing |
| `assemble.js` | `docs/evaluation-results.md` from all of the above | nothing |
| `fakeSupabase.ts`, `evalEnv.ts` | The in-memory database and the Gemini call recorder the runs share | |

The `.eval.ts` files run under their own Jest configuration, so `npx jest` never
runs them.

**How the runs stay faithful to the product.** Each run calls the real API route
handler (`/api/match`, `/api/vscore`) and the real server code. Only three things
are replaced: the database (an in-memory copy, so no test data reaches the live
project), the sign-in check and the rate limiter. The matching engine, Layer 2,
the skill cache code and the V-Score replay run unchanged.

## Running everything

```
npx jest -c scripts/evaluation/jest.eval.config.js relevance
npx jest -c scripts/evaluation/jest.eval.config.js layers
npx jest -c scripts/evaluation/jest.eval.config.js failure
npx jest -c scripts/evaluation/jest.eval.config.js vscore.eval
node scripts/evaluation/jest-summary.js
node scripts/evaluation/perf.mjs report
node scripts/evaluation/assemble.js
```

## The Gemini key (layer comparison, runs B and C)

The key lives only in Vercel. Create `scripts/evaluation/.env.local` (gitignored)
containing one line:

```
GEMINI_API_KEY=your-key
```

Without it, the layer comparison runs Layer 1 only and says so in the report.

## Performance

**API timings** (from a computer, over the network): add to `.env.local` the
`PERF_*` settings listed at the top of `perf.mjs`, then run each series. The
report labels these as measured from a computer, not the phone.

**Phone timings** (on the Android release build), measured by hand:

1. Turn on the phone's screen recorder. Note the phone model and Android version
   (Settings, About phone) and the network (Wi-Fi or mobile data, and its speed).
2. **Feed load:** with the app fully closed, open it and let it land on the Home
   feed. The time is from the first frame in which the tap on the app icon
   registers to the first frame in which the first outreach card is drawn.
3. Repeat 10 times, closing the app fully between runs.
4. Step through the recording frame by frame in a video player to read the two
   timestamps, and subtract. Record the results in milliseconds:

```
node scripts/evaluation/perf.mjs device feed_load 1840 1720 1905 ...
```

Set `PERF_DEVICE` and `PERF_NETWORK` in `.env.local` first, so they are recorded
with the timings. Then run `node scripts/evaluation/perf.mjs report` and
`node scripts/evaluation/assemble.js`.
