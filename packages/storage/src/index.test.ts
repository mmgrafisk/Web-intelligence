import { describe, expect, it } from "vitest";

import { createBookmark } from "@bookmark-platform/domain";

import { InMemoryBookmarkRepository } from "./index";

describe("bookmark repository contract", () => {
  it("uses stable keyset pagination and excludes deleted records", async () => {
    const repository = new InMemoryBookmarkRepository();
    for (const [id, day] of [
      ["03", "03"],
      ["02", "02"],
      ["01", "01"],
    ] as const) {
      await repository.put(
        createBookmark({
          id,
          originalUrl: `https://example.com/${id}`,
          source: "example.com",
          contentType: "webpage",
          title: `Item ${id}`,
          storageMode: "local",
          now: `2026-08-${day}T08:00:00.000Z`,
        }),
      );
    }

    const first = await repository.list({ limit: 2 });
    expect(first.items.map(({ id }) => id)).toEqual(["03", "02"]);
    expect(first.nextCursor).toEqual({
      id: "02",
      savedAt: "2026-08-02T08:00:00.000Z",
    });

    const second = await repository.list({
      cursor: first.nextCursor!,
      limit: 2,
    });
    expect(second.items.map(({ id }) => id)).toEqual(["01"]);

    await repository.softDelete("01", "2026-08-29T08:00:00.000Z");
    expect((await repository.list()).items.map(({ id }) => id)).not.toContain(
      "01",
    );
  });
});
