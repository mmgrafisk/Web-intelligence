import { z } from "zod";

export const storageModeSchema = z.enum(["stream", "cloud", "local"]);
export const contentTypeSchema = z.enum([
  "webpage",
  "article",
  "video",
  "image",
  "selection",
  "podcast",
  "unknown",
]);
export const mediaAvailabilitySchema = z.enum([
  "source-only",
  "available-local",
  "available-cloud",
  "missing",
  "unavailable",
]);
export const statisticAvailabilitySchema = z.enum([
  "available",
  "unavailable",
  "not-supplied",
]);
export const socialStatisticSchema = z.enum([
  "views",
  "likes",
  "comments",
  "shares",
  "saves",
  "followers",
]);
export const collectionIdSchema = z.enum([
  "inbox",
  "research",
  "inspiration",
  "watch-later",
]);

const dateTimeSchema = z.string().datetime({ offset: true });
const httpUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => value.startsWith("https://") || value.startsWith("http://"),
    {
      message: "Only HTTP and HTTPS URLs are supported",
    },
  );
const creatorReferenceSchema = z
  .object({
    id: z.string().min(1).optional(),
    handle: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
  })
  .strict();
const statisticValueSchema = z
  .object({
    availability: statisticAvailabilitySchema,
    capturedAt: dateTimeSchema.optional(),
    value: z.number().finite().nonnegative().nullable(),
  })
  .strict();

export const bookmarkSchema = z
  .object({
    id: z.string().min(1),
    workspaceId: z.string().min(1).optional(),
    canonicalUrl: httpUrlSchema,
    originalUrl: httpUrlSchema,
    source: z.string().min(1),
    contentType: contentTypeSchema,
    title: z.string().min(1),
    description: z.string().optional(),
    thumbnailUrl: httpUrlSchema.optional(),
    creator: creatorReferenceSchema.optional(),
    publishedAt: dateTimeSchema.optional(),
    durationSeconds: z.number().finite().nonnegative().optional(),
    storageMode: storageModeSchema,
    mediaAvailability: mediaAvailabilitySchema,
    projectId: z.string().min(1).optional(),
    folderId: z.string().min(1).optional(),
    playlistIds: z.array(z.string().min(1)),
    tags: z.array(z.string().min(1)),
    categories: z.array(z.string().min(1)),
    notes: z.string().optional(),
    favorite: z.boolean(),
    customFields: z.record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    ),
    archivedAssetIds: z.array(z.string().min(1)),
    transcript: z.string().optional(),
    readableText: z.string().optional(),
    statistics: z.partialRecord(socialStatisticSchema, statisticValueSchema),
    platformMetadata: z.record(z.string(), z.unknown()),
    savedAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
    lastCheckedAt: dateTimeSchema.optional(),
    deletedAt: dateTimeSchema.optional(),
    revision: z.number().int().positive(),
    provenance: z
      .object({
        importedFrom: z.string().min(1),
        sourceId: z.string().min(1).optional(),
        originalMetadata: z.record(z.string(), z.unknown()).optional(),
      })
      .strict(),
  })
  .strict();

export const syncOperationSchema = z
  .object({
    id: z.string().min(1),
    workspaceId: z.string().min(1).optional(),
    deviceId: z.string().min(1),
    entityType: z.enum(["bookmark", "project", "folder", "playlist", "asset"]),
    entityId: z.string().min(1),
    action: z.enum(["upsert", "delete"]),
    payload: z.record(z.string(), z.unknown()).nullable(),
    baseRevision: z.number().int().nonnegative(),
    createdAt: dateTimeSchema,
    state: z.enum(["pending", "failed", "dead-letter", "acked"]),
    attemptCount: z.number().int().nonnegative(),
    nextAttemptAt: dateTimeSchema.nullable(),
    lastError: z.string().optional(),
  })
  .strict();

export const captureRequestSchema = z
  .object({
    version: z.literal(1),
    source: z.literal("extension"),
    url: httpUrlSchema,
    title: z.string().trim().min(1).max(2_000),
    collection: collectionIdSchema,
    requestedAt: dateTimeSchema,
  })
  .strict();

export type BookmarkDto = z.infer<typeof bookmarkSchema>;
export type SyncOperationDto = z.infer<typeof syncOperationSchema>;
export type CaptureRequestDto = z.infer<typeof captureRequestSchema>;
