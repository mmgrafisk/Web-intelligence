import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import { createBookmark } from "@bookmark-platform/domain";
import { createSyncOperation } from "@bookmark-platform/sync";

import {
  BookmarkLocalDatabase,
  deleteLocalDatabase,
  IndexedDbBookmarkRepository,
  IndexedDbSyncQueue,
} from "./index";

const databaseNames: string[] = [];

function createDatabase(): BookmarkLocalDatabase {
  const name = `bookmark-test-${databaseNames.length}`;
  databaseNames.push(name);
  return new BookmarkLocalDatabase(name);
}

afterEach(async () => {
  for (const name of databaseNames.splice(0)) await deleteLocalDatabase(name);
});

describe("IndexedDB local-first storage", () => {
  it("persists and validates canonical bookmarks", async () => {
    const database = createDatabase();
    const repository = new IndexedDbBookmarkRepository(database);
    const bookmark = createBookmark({
      id: "01LOCAL",
      originalUrl: "https://example.com/local",
      source: "example.com",
      contentType: "article",
      title: "Stored locally",
      storageMode: "local",
      now: "2026-08-29T08:00:00.000Z",
    });

    await repository.put(bookmark);
    await expect(repository.get(bookmark.id)).resolves.toEqual(bookmark);
    database.close();
  });

  it("persists retryable sync operations without requiring cloud credentials", async () => {
    const database = createDatabase();
    const queue = new IndexedDbSyncQueue(database);
    const operation = createSyncOperation({
      id: "01OUTBOX",
      deviceId: "device-1",
      entityType: "bookmark",
      entityId: "bookmark-1",
      action: "upsert",
      payload: { title: "Local first" },
      baseRevision: 1,
      now: "2026-08-29T08:00:00.000Z",
    });

    await queue.enqueue(operation);
    expect(await queue.listReady("2026-08-29T08:00:00.000Z", 10)).toEqual([
      operation,
    ]);
    await queue.fail(operation.id, "offline", "2026-08-29T08:01:00.000Z");
    expect(await queue.listReady("2026-08-29T08:00:30.000Z", 10)).toEqual([]);
    database.close();
  });
});
