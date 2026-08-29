import type { Bookmark } from "@bookmark-platform/domain";

export interface BookmarkCursor {
  id: string;
  savedAt: string;
}

export interface BookmarkQuery {
  cursor?: BookmarkCursor;
  includeDeleted?: boolean;
  limit?: number;
  projectId?: string;
  search?: string;
}

export interface BookmarkPage {
  items: Bookmark[];
  nextCursor?: BookmarkCursor;
}

export interface BookmarkRepository {
  get(id: string): Promise<Bookmark | undefined>;
  list(query?: BookmarkQuery): Promise<BookmarkPage>;
  put(bookmark: Bookmark): Promise<void>;
  softDelete(id: string, deletedAt: string): Promise<void>;
}

export interface AssetReference {
  id: string;
  bookmarkId: string;
  mediaType: string;
  byteLength: number;
}

export interface AssetStore {
  delete(id: string): Promise<void>;
  get(id: string): Promise<Blob | undefined>;
  put(reference: AssetReference, data: Blob): Promise<void>;
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

export class InMemoryBookmarkRepository implements BookmarkRepository {
  readonly #bookmarks = new Map<string, Bookmark>();

  async get(id: string): Promise<Bookmark | undefined> {
    const bookmark = this.#bookmarks.get(id);
    return bookmark === undefined ? undefined : structuredClone(bookmark);
  }

  async list(query: BookmarkQuery = {}): Promise<BookmarkPage> {
    const limit = Math.max(1, Math.min(query.limit ?? 50, 200));
    const search = query.search?.trim().toLocaleLowerCase();
    const filtered = [...this.#bookmarks.values()]
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
    const items = filtered
      .slice(0, limit)
      .map((bookmark) => structuredClone(bookmark));
    const last = items.at(-1);

    return {
      items,
      ...(filtered.length > limit && last !== undefined
        ? { nextCursor: { id: last.id, savedAt: last.savedAt } }
        : {}),
    };
  }

  async put(bookmark: Bookmark): Promise<void> {
    this.#bookmarks.set(bookmark.id, structuredClone(bookmark));
  }

  async softDelete(id: string, deletedAt: string): Promise<void> {
    const bookmark = this.#bookmarks.get(id);
    if (bookmark === undefined) return;
    this.#bookmarks.set(id, {
      ...bookmark,
      deletedAt,
      updatedAt: deletedAt,
      revision: bookmark.revision + 1,
    });
  }
}
