import { describe, expect, it } from "vitest";

import { readSupabasePublicConfig } from "./index";

describe("Supabase public configuration", () => {
  it("keeps cloud mode disabled when credentials are absent", () => {
    expect(readSupabasePublicConfig({})).toBeNull();
  });

  it("never accepts insecure remote endpoints", () => {
    expect(() =>
      readSupabasePublicConfig({
        NEXT_PUBLIC_SUPABASE_URL: "http://example.com",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      }),
    ).toThrow("HTTPS");
  });
});
