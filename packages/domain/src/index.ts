export type StorageMode = "stream" | "cloud" | "local";
export type ContentType = "webpage" | "article" | "video" | "image" | "selection" | "podcast" | "unknown";

export interface Bookmark {
  id: string;
  canonicalUrl: string;
  originalUrl: string;
  source: string;
  contentType: ContentType;
  title: string;
  storageMode: StorageMode;
  projectId?: string;
  folderId?: string;
  playlistIds: string[];
  tags: string[];
  savedAt: string;
  provenance: { importedFrom: string; sourceId?: string };
}

export function normalizeUrl(input: string): string {
  const url = new URL(input.trim());
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

export function isDuplicate(a: Bookmark, b: Bookmark): boolean {
  return a.canonicalUrl === b.canonicalUrl ||
    (a.provenance.sourceId !== undefined && a.provenance.sourceId === b.provenance.sourceId);
}

export function createBookmark(input: Pick<Bookmark, "id" | "originalUrl" | "source" | "contentType" | "title" | "storageMode"> & Partial<Pick<Bookmark, "projectId" | "folderId" | "playlistIds" | "tags">>): Bookmark {
  const canonicalUrl = normalizeUrl(input.originalUrl);
  return {
    ...input,
    canonicalUrl,
    playlistIds: input.playlistIds ?? [],
    tags: input.tags ?? [],
    savedAt: new Date().toISOString(),
    provenance: { importedFrom: "manual" }
  };
}
