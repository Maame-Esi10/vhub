import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let cachedClient: SupabaseClient | null = null;

/**
 * The ONE Supabase client this whole api/ project uses -- created with the
 * service-role key, so it bypasses RLS entirely. This is exactly why this
 * key must never leave this project: anything imported from here can read
 * or write every row in the database. Every route handler must still
 * authenticate/authorise the caller itself (see auth.ts) before using this
 * client to act on their behalf -- RLS is not doing that job here, this code is.
 *
 * Memoised across invocations within the same warm serverless instance
 * (harmless to recreate per-request, just avoidable overhead).
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!cachedClient) {
    cachedClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return cachedClient;
}
