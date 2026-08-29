import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabasePublicConfig {
  publishableKey: string;
  url: string;
}

export function readSupabasePublicConfig(
  environment: Record<string, string | undefined>,
): SupabasePublicConfig | null {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return null;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("Supabase URL must use HTTPS outside localhost");
  }
  return { url: parsed.toString().replace(/\/$/, ""), publishableKey };
}

export function createSupabaseBrowserClient(
  config: SupabasePublicConfig,
): SupabaseClient {
  return createClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });
}
