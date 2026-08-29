import Dexie, { type EntityTable } from "dexie";

import type { Bookmark } from "@bookmark-platform/domain";
import {
  bookmarkSchema,
  syncOperationSchema,
} from "@bookmark-platform/schemas";
import type {
  BookmarkCursor,
  BookmarkPage,
  BookmarkQuery,
  BookmarkRepository,
} from "@bookmark-platform/storage";
import type { SyncOperation, SyncQueue } from "@bookmark-platform/sync";

interface LocalSetting {
  key: string;
  value: unknown;
}

function validateBookmark(bookmark: Bookmark): Bookmark {
  bookmarkSchema.parse(bookmark);
  return bookmark;
}

function validateSyncOperation(operation: SyncOperation): SyncOperation {
  syncOperationSchema.parse(operation);
  return operation;
}

export class BookmarkLocalDatabase extends Dexie {
  bookmarks!: EntityTable<Bookmark, "id">;
  syncOperations!: EntityTable<SyncOperation, "id">;
  settings!: EntityTable<LocalSetting, "key">;

  constructor(name = "bookmark-intelligence") {
    super(name);
    this.version(1).stores({
      bookmarks:
        "id, canonicalUrl, savedAt, updatedAt, deletedAt, projectId, folderId, *tags",
      syncOperations:
        "id, state, createdAt, nextAttemptAt, entityId, [state+nextAttemptAt]",
      settings: "key",
    });
  }
}

function compareBookmarks(left: Bookmark, right: Bookmark): number {
  const byDate = right.savedAt.localeCompare(left.savedAt);
  return byDate === 0 ? right.id.localeCompare(left.id) : byDate;
}

function isAfterCursor(bookmark: Bookmark, cursor: BookmarkCursor): boolean {
  return (
    bookmark.savedAt < cursor.savedAt ||
    (bookmark.savedAt === cursor.savedAt && bookmark.id < cursor.id)
  );
}

export class IndexedDbBookmarkRepository implements BookmarkRepository {
  constructor(private readonly database: BookmarkLocalDatabase) {}

  async get(id: string): Promise<Bookmark | undefined> {
    const bookmark = await this.database.bookmarks.get(id);
    return bookmark === undefined ? undefined : validateBookmark(bookmark);
  }

  async list(query: BookmarkQuery = {}): Promise<BookmarkPage> {
    const limit = Math.max(1, Math.min(query.limit ?? 50, 200));
    const search = query.search?.trim().toLocaleLowerCase();
    const candidates = await this.database.bookmarks.toArray();
    const filtered = candidates
      .filter(
        (bookmark) =>
          query.includeDeleted === true || bookmark.deletedAt === undefined,
      )
      .filter(
        (bookmark) =>
          query.projectId === undefined ||
          bookmark.projectId === query.projectId,
      )
      .filter(
        (bookmark) =>
          query.cursor === undefined || isAfterCursor(bookmark, query.cursor),
      )
      .filter((bookmark) => {
        if (!search) return true;
        return [
          bookmark.title,
          bookmark.description ?? "",
          bookmark.notes ?? "",
          ...bookmark.tags,
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(search);
      })
      .sort(compareBookmarks);
    const items = filtered.slice(0, limit).map(validateBookmark);
    const last = items.at(-1);

    return {
      items,
      ...(filtered.length > limit && last !== undefined
        ? { nextCursor: { id: last.id, savedAt: last.savedAt } }
        : {}),
    };
  }

  async put(bookmark: Bookmark): Promise<void> {
    await this.database.bookmarks.put(validateBookmark(bookmark));
  }

  async softDelete(id: string, deletedAt: string): Promise<void> {
    await this.database.transaction("rw", this.database.bookmarks, async () => {
      const bookmark = await this.database.bookmarks.get(id);
      if (bookmark === undefined) return;
      const updated: Bookmark = {
        ...bookmark,
        deletedAt,
        updatedAt: deletedAt,
        revision: bookmark.revision + 1,
      };
      await this.database.bookmarks.put(validateBookmark(updated));
    });
  }
}

export class IndexedDbSyncQueue implements SyncQueue {
  constructor(private readonly database: BookmarkLocalDatabase) {}

  async enqueue(operation: SyncOperation): Promise<void> {
    await this.database.syncOperations.put(validateSyncOperation(operation));
  }

  async listReady(now: string, limit: number): Promise<SyncOperation[]> {
    const operations = await this.database.syncOperations
      .where("state")
      .anyOf(["pending", "failed"])
      .filter(
        (operation) =>
          operation.nextAttemptAt !== null && operation.nextAttemptAt <= now,
      )
      .sortBy("createdAt");
    return operations
      .slice(0, Math.max(1, Math.min(limit, 500)))
      .map(validateSyncOperation);
  }

  async acknowledge(operationIds: string[]): Promise<void> {
    await this.database.transaction(
      "rw",
      this.database.syncOperations,
      async () => {
        for (const id of operationIds) {
          const operation = await this.database.syncOperations.get(id);
          if (operation === undefined) continue;
          await this.database.syncOperations.put({
            ...operation,
            state: "acked",
            nextAttemptAt: null,
          });
        }
      },
    );
  }

  async fail(
    operationId: string,
    error: string,
    nextAttemptAt: string | null,
  ): Promise<void> {
    await this.database.transaction(
      "rw",
      this.database.syncOperations,
      async () => {
        const operation = await this.database.syncOperations.get(operationId);
        if (operation === undefined) return;
        await this.database.syncOperations.put({
          ...operation,
          state: nextAttemptAt === null ? "dead-letter" : "failed",
          attemptCount: operation.attemptCount + 1,
          nextAttemptAt,
          lastError: error.slice(0, 1_000),
        });
      },
    );
  }
}

export async function deleteLocalDatabase(name: string): Promise<void> {
  await Dexie.delete(name);
}
