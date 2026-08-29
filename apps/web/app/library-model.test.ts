import { describe, expect, it } from "vitest";

import {
  collectionLabel,
  createBookmarkFromDraft,
  parseTags,
  updateBookmarkFromDraft,
} from "./library-model";

describe("local library model", () => {
  it("normalizes a real bookmark draft into the canonical model", () => {
    const bookmark = createBookmarkFromDraft(
      {
        url: " HTTPS://Example.com/Field-Guide/#chapter ",
        title: "",
        collection: "research",
        tags: "AI, research, ai",
        notes: "Read before Friday",
      },
      { id: "bookmark-1", now: "2026-08-29T10:00:00.000Z" },
    );

    expect(bookmark).toMatchObject({
      canonicalUrl: "https://example.com/Field-Guide",
      source: "example.com",
      title: "Field Guide",
      projectId: "research",
      tags: ["ai", "research"],
      notes: "Read before Friday",
      storageMode: "local",
    });
  });

  it("updates organization without losing canonical bookmark data", () => {
    const original = createBookmarkFromDraft(
      {
        url: "https://example.com/original",
        title: "Original",
        collection: "inbox",
        tags: "one",
        notes: "",
      },
      { id: "bookmark-2", now: "2026-08-29T10:00:00.000Z" },
    );

    const updated = updateBookmarkFromDraft(
      original,
      {
        url: original.originalUrl,
        title: "Organized",
        collection: "inspiration",
        tags: "design, colors",
        notes: "Use in moodboard",
      },
      "2026-08-29T10:05:00.000Z",
    );

    expect(updated.canonicalUrl).toBe(original.canonicalUrl);
    expect(updated.revision).toBe(2);
    expect(updated.projectId).toBe("inspiration");
    expect(collectionLabel(updated)).toBe("Inspiration");
  });

  it("deduplicates and bounds tags", () => {
    expect(parseTags(" One, two, one, , THREE ")).toEqual([
      "one",
      "two",
      "three",
    ]);
  });
});
