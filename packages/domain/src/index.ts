export type StorageMode = "stream" | "cloud" | "local";
export type ContentType =
  | "webpage"
  | "article"
  | "video"
  | "image"
  | "selection"
  | "podcast"
  | "unknown";
export type MediaAvailability =
  | "source-only"
  | "available-local"
  | "available-cloud"
  | "missing"
  | "unavailable";
export type StatisticAvailability =
  "available" | "unavailable" | "not-supplied";
export type SocialStatistic =
  "views" | "likes" | "comments" | "shares" | "saves" | "followers";

export interface CreatorReference {
  id?: string;
  handle?: string;
  name?: string;
}

export interface StatisticValue {
  availability: StatisticAvailability;
  capturedAt?: string;
  value: number | null;
}

export type CustomFieldValue = string | number | boolean | null;

export interface Bookmark {
  id: string;
  workspaceId?: string;
  canonicalUrl: string;
  originalUrl: string;
  source: string;
  contentType: ContentType;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  creator?: CreatorReference;
  publishedAt?: string;
  durationSeconds?: number;
  storageMode: StorageMode;
  mediaAvailability: MediaAvailability;
  projectId?: string;
  folderId?: string;
  playlistIds: string[];
  tags: string[];
  categories: string[];
  notes?: string;
  favorite: boolean;
  customFields: Record<string, CustomFieldValue>;
  archivedAssetIds: string[];
  transcript?: string;
  readableText?: string;
  statistics: Partial<Record<SocialStatistic, StatisticValue>>;
  platformMetadata: Record<string, unknown>;
  savedAt: string;
  updatedAt: string;
  lastCheckedAt?: string;
  deletedAt?: string;
  revision: number;
  provenance: {
    importedFrom: string;
    sourceId?: string;
    originalMetadata?: Record<string, unknown>;
  };
}

export function normalizeUrl(input: string): string {
  const url = new URL(input.trim());
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only HTTP and HTTPS bookmark URLs are supported");
  }
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

export function isDuplicate(a: Bookmark, b: Bookmark): boolean {
  return (
    a.canonicalUrl === b.canonicalUrl ||
    (a.source === b.source &&
      a.provenance.sourceId !== undefined &&
      a.provenance.sourceId === b.provenance.sourceId)
  );
}

type CreateBookmarkInput = Pick<
  Bookmark,
  "id" | "originalUrl" | "source" | "contentType" | "title" | "storageMode"
> &
  Partial<
    Pick<
      Bookmark,
      | "workspaceId"
      | "projectId"
      | "folderId"
      | "playlistIds"
      | "tags"
      | "categories"
      | "description"
      | "notes"
      | "favorite"
      | "platformMetadata"
    >
  > & {
    now?: string;
  };

export function createBookmark(input: CreateBookmarkInput): Bookmark {
  const canonicalUrl = normalizeUrl(input.originalUrl);
  const now = input.now ?? new Date().toISOString();
  const {
    now: _now,
    workspaceId,
    projectId,
    folderId,
    description,
    notes,
    ...required
  } = input;

  return {
    ...required,
    ...(workspaceId === undefined ? {} : { workspaceId }),
    ...(projectId === undefined ? {} : { projectId }),
    ...(folderId === undefined ? {} : { folderId }),
    ...(description === undefined ? {} : { description }),
    ...(notes === undefined ? {} : { notes }),
    canonicalUrl,
    playlistIds: input.playlistIds ?? [],
    tags: input.tags ?? [],
    categories: input.categories ?? [],
    favorite: input.favorite ?? false,
    customFields: {},
    archivedAssetIds: [],
    statistics: {},
    platformMetadata: input.platformMetadata ?? {},
    mediaAvailability: "source-only",
    savedAt: now,
    updatedAt: now,
    revision: 1,
    provenance: { importedFrom: "manual" },
  };
}
