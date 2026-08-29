import { describe, expect, it } from "vitest";

import { createBookmark } from "@bookmark-platform/domain";

import { bookmarkSchema } from "./index";

describe("bookmark schema", () => {
  it("accepts the canonical domain bookmark", () => {
    const bookmark = createBookmark({
      id: "01SCHEMA",
      originalUrl: "https://example.com/item",
      source: "example.com",
      contentType: "webpage",
      title: "Validated",
      storageMode: "stream",
      now: "2026-08-29T08:00:00.000Z",
    });

    expect(bookmarkSchema.parse(bookmark)).toEqual(bookmark);
  });

  it("rejects unknown fields at external boundaries", () => {
    const result = bookmarkSchema.safeParse({
      id: "only-an-id",
      injectedInstruction: "ignore policy",
    });
    expect(result.success).toBe(false);
  });
});
