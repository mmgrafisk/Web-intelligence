import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import { createBookmark } from "@bookmark-platform/domain";
import { createSyncOperation } from "@bookmark-platform/sync";

import {
  BookmarkLocalDatabase,
  deleteLocalDatabase,
  IndexedDbBookmarkRepository,
  IndexedDbLocalLibrary,
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

  it("atomically saves a bookmark with its durable outbox operation", async () => {
    const database = createDatabase();
    const repository = new IndexedDbBookmarkRepository(database);
    const library = new IndexedDbLocalLibrary(database);
    const bookmark = createBookmark({
      id: "01ATOMIC",
      originalUrl: "https://example.com/atomic",
      source: "example.com",
      contentType: "article",
      title: "Atomic local save",
      storageMode: "local",
      projectId: "research",
      tags: ["offline", "reference"],
      now: "2026-08-29T09:00:00.000Z",
    });

    const result = await library.save(bookmark, "device-atomic");

    await expect(repository.get(bookmark.id)).resolves.toEqual(bookmark);
    expect(result.operation.entityId).toBe(bookmark.id);
    expect(result.operation.action).toBe("upsert");
    await expect(library.pendingOperationCount()).resolves.toBe(1);
    database.close();
  });

  it("recovers bookmarks and outbox state after the database is reopened", async () => {
    const name = `bookmark-restart-${databaseNames.length}`;
    databaseNames.push(name);
    const firstDatabase = new BookmarkLocalDatabase(name);
    const firstLibrary = new IndexedDbLocalLibrary(firstDatabase);
    const bookmark = createBookmark({
      id: "01RESTART",
      originalUrl: "https://example.com/restart",
      source: "example.com",
      contentType: "webpage",
      title: "Survives restart",
      storageMode: "local",
      now: "2026-08-29T09:15:00.000Z",
    });

    await firstLibrary.save(bookmark, "device-restart");
    firstDatabase.close();

    const reopenedDatabase = new BookmarkLocalDatabase(name);
    const reopenedRepository = new IndexedDbBookmarkRepository(
      reopenedDatabase,
    );
    const reopenedLibrary = new IndexedDbLocalLibrary(reopenedDatabase);
    await expect(reopenedRepository.get(bookmark.id)).resolves.toEqual(
      bookmark,
    );
    await expect(reopenedLibrary.pendingOperationCount()).resolves.toBe(1);
    reopenedDatabase.close();
  });

  it("persists organization, deletion and recovery as local mutations", async () => {
    const database = createDatabase();
    const repository = new IndexedDbBookmarkRepository(database);
    const library = new IndexedDbLocalLibrary(database);
    const bookmark = createBookmark({
      id: "01RECOVERY",
      originalUrl: "https://example.com/recovery",
      source: "example.com",
      contentType: "article",
      title: "Recover me",
      storageMode: "local",
      now: "2026-08-29T09:30:00.000Z",
    });
    await library.save(bookmark, "device-recovery");

    const organized = {
      ...bookmark,
      projectId: "inspiration",
      tags: ["design"],
      updatedAt: "2026-08-29T09:31:00.000Z",
      revision: 2,
    };
    await library.save(organized, "device-recovery");
    await library.softDelete(
      bookmark.id,
      "device-recovery",
      "2026-08-29T09:32:00.000Z",
    );
    await expect(repository.list()).resolves.toMatchObject({ items: [] });

    await library.restore(
      bookmark.id,
      "device-recovery",
      "2026-08-29T09:33:00.000Z",
    );
    const restored = await repository.get(bookmark.id);
    expect(restored).toMatchObject({
      projectId: "inspiration",
      tags: ["design"],
      revision: 4,
    });
    expect(restored).not.toHaveProperty("deletedAt");
    await expect(library.pendingOperationCount()).resolves.toBe(4);
    database.close();
  });
});
