import { syncOperationSchema } from "@bookmark-platform/schemas";
import { ulid } from "ulid";

export type SyncEntityType =
  "bookmark" | "project" | "folder" | "playlist" | "asset";
export type SyncAction = "upsert" | "delete";
export type SyncOperationState = "pending" | "failed" | "dead-letter" | "acked";

export interface SyncOperation {
  id: string;
  workspaceId?: string;
  deviceId: string;
  entityType: SyncEntityType;
  entityId: string;
  action: SyncAction;
  payload: Record<string, unknown> | null;
  baseRevision: number;
  createdAt: string;
  state: SyncOperationState;
  attemptCount: number;
  nextAttemptAt: string | null;
  lastError?: string;
}

export interface CreateSyncOperationInput {
  id?: string;
  workspaceId?: string;
  deviceId: string;
  entityType: SyncEntityType;
  entityId: string;
  action: SyncAction;
  payload: Record<string, unknown> | null;
  baseRevision: number;
  now?: string;
}

export interface SyncQueue {
  acknowledge(operationIds: string[]): Promise<void>;
  enqueue(operation: SyncOperation): Promise<void>;
  fail(
    operationId: string,
    error: string,
    nextAttemptAt: string | null,
  ): Promise<void>;
  listReady(now: string, limit: number): Promise<SyncOperation[]>;
}

export interface SyncPushResult {
  acceptedOperationIds: string[];
  rejected: Array<{ operationId: string; reason: string; retryable: boolean }>;
  cursor?: string;
}

export interface SyncTransport {
  push(operations: SyncOperation[]): Promise<SyncPushResult>;
}

export class SyncProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncProtocolError";
  }
}

export interface VersionStamp {
  deviceId: string;
  operationId: string;
  updatedAt: string;
}

export function createSyncOperation(
  input: CreateSyncOperationInput,
): SyncOperation {
  const now = input.now ?? new Date().toISOString();
  const operation: SyncOperation = {
    id: input.id ?? ulid(),
    ...(input.workspaceId === undefined
      ? {}
      : { workspaceId: input.workspaceId }),
    deviceId: input.deviceId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    payload: input.payload,
    baseRevision: input.baseRevision,
    createdAt: now,
    state: "pending" as const,
    attemptCount: 0,
    nextAttemptAt: now,
  };
  syncOperationSchema.parse(operation);
  return operation;
}

export function selectConflictWinner(
  left: VersionStamp,
  right: VersionStamp,
): "left" | "right" {
  const leftKey = `${left.updatedAt}\u0000${left.deviceId}\u0000${left.operationId}`;
  const rightKey = `${right.updatedAt}\u0000${right.deviceId}\u0000${right.operationId}`;
  return leftKey >= rightKey ? "left" : "right";
}

export function nextRetryAt(now: string, attemptCount: number): string {
  const baseDelayMs = 1_000;
  const maxDelayMs = 5 * 60_000;
  const delay = Math.min(
    maxDelayMs,
    baseDelayMs * 2 ** Math.max(0, attemptCount),
  );
  return new Date(new Date(now).getTime() + delay).toISOString();
}

export function validateSyncPushResult(
  submittedOperationIds: readonly string[],
  result: SyncPushResult,
): SyncPushResult {
  assertUniqueSubmittedOperationIds(submittedOperationIds);

  const batchIds = new Set<string>();
  for (const operationId of submittedOperationIds) {
    batchIds.add(operationId);
  }

  const acceptedIds = new Set<string>();
  for (const operationId of result.acceptedOperationIds) {
    if (!batchIds.has(operationId)) {
      throw new SyncProtocolError(
        `Accepted operation ID is outside the submitted batch: ${operationId}`,
      );
    }
    if (acceptedIds.has(operationId)) {
      throw new SyncProtocolError(
        `Accepted operation ID is duplicated: ${operationId}`,
      );
    }
    acceptedIds.add(operationId);
  }

  const rejectedIds = new Set<string>();
  for (const rejected of result.rejected) {
    if (!batchIds.has(rejected.operationId)) {
      throw new SyncProtocolError(
        `Rejected operation ID is outside the submitted batch: ${rejected.operationId}`,
      );
    }
    if (rejectedIds.has(rejected.operationId)) {
      throw new SyncProtocolError(
        `Rejected operation ID is duplicated: ${rejected.operationId}`,
      );
    }
    if (acceptedIds.has(rejected.operationId)) {
      throw new SyncProtocolError(
        `Operation ID is both accepted and rejected: ${rejected.operationId}`,
      );
    }
    rejectedIds.add(rejected.operationId);
  }

  return {
    ...result,
    acceptedOperationIds: [...result.acceptedOperationIds],
    rejected: result.rejected.map((rejected) => ({ ...rejected })),
  };
}

function assertUniqueSubmittedOperationIds(
  submittedOperationIds: readonly string[],
): void {
  const seen = new Set<string>();
  for (const operationId of submittedOperationIds) {
    if (seen.has(operationId)) {
      throw new SyncProtocolError(
        `Submitted sync batch contains duplicate operation ID: ${operationId}`,
      );
    }
    seen.add(operationId);
  }
}

export class SyncRunner {
  constructor(
    private readonly queue: SyncQueue,
    private readonly transport: SyncTransport,
  ) {}

  async runOnce(
    now = new Date().toISOString(),
    limit = 100,
  ): Promise<SyncPushResult | null> {
    const operations = await this.queue.listReady(
      now,
      Math.max(1, Math.min(limit, 500)),
    );
    if (operations.length === 0) return null;

    const submittedOperationIds = operations.map((operation) => operation.id);
    assertUniqueSubmittedOperationIds(submittedOperationIds);
    const submittedById = new Map(
      operations.map((operation) => [operation.id, { ...operation }]),
    );
    const result = validateSyncPushResult(
      submittedOperationIds,
      await this.transport.push(operations),
    );
    await this.queue.acknowledge(result.acceptedOperationIds);

    for (const rejected of result.rejected) {
      const operation = submittedById.get(rejected.operationId);
      if (operation === undefined) continue;
      await this.queue.fail(
        operation.id,
        rejected.reason.slice(0, 1_000),
        rejected.retryable
          ? nextRetryAt(now, operation.attemptCount + 1)
          : null,
      );
    }

    return result;
  }
}
