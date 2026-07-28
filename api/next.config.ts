import path from "node:path";
import type { NextConfig } from "next";

/**
 * V-HUB API-only Next.js app.
 *
 * `outputFileTracingRoot` is pointed at the vhub/ repo root (one level up
 * from this api/ project) because this app imports the SAME pure,
 * unit-tested scoring/vscore modules the Expo app uses
 * (lib/matching/layer1.ts, lib/vscore.ts, constants/categories.ts,
 * types/database.ts) via the "@/*" tsconfig path alias -- there is
 * deliberately only ONE copy of that math, not a mirrored duplicate. Without
 * this, Vercel's serverless function file-tracing step (which walks the
 * import graph from each route handler) would infer this api/ folder itself
 * as the tracing root (nearest package.json/lockfile) and could fail to
 * bundle files that live outside it.
 */
const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, ".."),
};

export default nextConfig;
