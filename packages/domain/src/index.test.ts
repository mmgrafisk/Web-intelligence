import { describe, expect, it } from "vitest";

import { createBookmark, isDuplicate, normalizeUrl } from "./index";

describe("bookmark domain", () => {
  it("normalizes fragments, host casing, and trailing slashes", () => {
    expect(normalizeUrl(" HTTPS://Example.COM/path///#section ")).toBe(
      "https://example.com/path",
    );
  });

  it("rejects non-web URL schemes", () => {
    expect(() => normalizeUrl("javascript:alert(1)")).toThrow("HTTP and HTTPS");
  });

  it("creates a local-first bookmark with deterministic defaults", () => {
    const bookmark = createBookmark({
      id: "01TEST",
      originalUrl: "https://example.com/article",
      source: "example.com",
      contentType: "article",
      title: "Example",
      storageMode: "local",
      now: "2026-08-29T08:00:00.000Z",
    });

    expect(bookmark).toMatchObject({
      canonicalUrl: "https://example.com/article",
      mediaAvailability: "source-only",
      revision: 1,
      savedAt: "2026-08-29T08:00:00.000Z",
      updatedAt: "2026-08-29T08:00:00.000Z",
    });
  });

  it("detects canonical URL duplicates", () => {
    const first = createBookmark({
      id: "01FIRST",
      originalUrl: "https://example.com/article#first",
      source: "example.com",
      contentType: "article",
      title: "First",
      storageMode: "stream",
    });
    const second = createBookmark({
      id: "01SECOND",
      originalUrl: "https://example.com/article#second",
      source: "example.com",
      contentType: "article",
      title: "Second",
      storageMode: "stream",
    });

    expect(isDuplicate(first, second)).toBe(true);
  });
});
