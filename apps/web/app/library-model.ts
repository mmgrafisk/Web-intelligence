import {
  createBookmark,
  type Bookmark,
  type ContentType,
} from "@bookmark-platform/domain";

export const collections = [
  { id: "inbox", label: "Inbox" },
  { id: "research", label: "Research" },
  { id: "inspiration", label: "Inspiration" },
  { id: "watch-later", label: "Watch later" },
] as const;

export type CollectionId = (typeof collections)[number]["id"];

export interface BookmarkDraft {
  collection: CollectionId;
  notes: string;
  tags: string;
  title: string;
  url: string;
}

export const emptyBookmarkDraft: BookmarkDraft = {
  collection: "inbox",
  notes: "",
  tags: "",
  title: "",
  url: "",
};

export function parseTags(input: string): string[] {
  return [
    ...new Set(
      input
        .split(",")
        .map((tag) => tag.trim().toLocaleLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 12);
}

export function collectionForBookmark(bookmark: Bookmark): CollectionId {
  return collections.some((collection) => collection.id === bookmark.projectId)
    ? (bookmark.projectId as CollectionId)
    : "inbox";
}

export function collectionLabel(bookmark: Bookmark): string {
  const collectionId = collectionForBookmark(bookmark);
  return (
    collections.find((collection) => collection.id === collectionId)?.label ??
    "Inbox"
  );
}

export function draftForBookmark(bookmark: Bookmark): BookmarkDraft {
  return {
    collection: collectionForBookmark(bookmark),
    notes: bookmark.notes ?? "",
    tags: bookmark.tags.join(", "),
    title: bookmark.title,
    url: bookmark.originalUrl,
  };
}

function contentTypeForUrl(url: URL): ContentType {
  if (/\.(avif|gif|jpe?g|png|webp)$/i.test(url.pathname)) return "image";
  if (/youtube\.com|youtu\.be|vimeo\.com/i.test(url.hostname)) return "video";
  if (/podcasts?|spotify\.com/i.test(`${url.hostname}${url.pathname}`)) {
    return "podcast";
  }
  return "article";
}

function sourceForUrl(url: URL): string {
  return url.hostname.toLocaleLowerCase().replace(/^www\./, "");
}

function titleForUrl(url: URL): string {
  const finalSegment = url.pathname.split("/").filter(Boolean).at(-1);
  if (finalSegment) {
    const readable = decodeURIComponent(finalSegment)
      .replace(/[-_]+/g, " ")
      .replace(/\.[a-z0-9]{2,5}$/i, "")
      .trim();
    if (readable) {
      return readable.charAt(0).toLocaleUpperCase() + readable.slice(1);
    }
  }
  return sourceForUrl(url);
}

export function createBookmarkFromDraft(
  draft: BookmarkDraft,
  options: { id: string; now: string },
): Bookmark {
  const url = new URL(draft.url.trim());
  const title = draft.title.trim() || titleForUrl(url);
  const notes = draft.notes.trim();

  return createBookmark({
    id: options.id,
    originalUrl: url.toString(),
    source: sourceForUrl(url),
    contentType: contentTypeForUrl(url),
    title,
    storageMode: "local",
    ...(draft.collection === "inbox" ? {} : { projectId: draft.collection }),
    tags: parseTags(draft.tags),
    ...(notes ? { notes } : {}),
    now: options.now,
  });
}

export function updateBookmarkFromDraft(
  bookmark: Bookmark,
  draft: BookmarkDraft,
  now: string,
): Bookmark {
  const title = draft.title.trim();
  if (!title) throw new Error("A title is required");
  const notes = draft.notes.trim();
  const base: Bookmark = { ...bookmark };
  delete base.projectId;
  delete base.notes;

  return {
    ...base,
    title,
    ...(draft.collection === "inbox" ? {} : { projectId: draft.collection }),
    tags: parseTags(draft.tags),
    ...(notes ? { notes } : {}),
    updatedAt: now,
    revision: bookmark.revision + 1,
  };
}
