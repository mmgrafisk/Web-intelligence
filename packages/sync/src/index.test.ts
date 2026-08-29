import { describe, expect, it } from "vitest";

import {
  createSyncOperation,
  nextRetryAt,
  selectConflictWinner,
  SyncProtocolError,
  SyncRunner,
  type SyncOperation,
  type SyncPushResult,
  type SyncQueue,
} from "./index";

const NOW = "2026-08-29T08:00:00.000Z";

class TestQueue implements SyncQueue {
  operations: SyncOperation[] = [];

  async acknowledge(operationIds: string[]): Promise<void> {
    this.operations = this.operations.map((operation) =>
      operationIds.includes(operation.id)
        ? { ...operation, state: "acked", nextAttemptAt: null }
        : operation,
    );
  }

  async enqueue(operation: SyncOperation): Promise<void> {
    this.operations.push(operation);
  }

  async fail(
    operationId: string,
    error: string,
    retryAt: string | null,
  ): Promise<void> {
    this.operations = this.operations.map((operation) =>
      operation.id === operationId
        ? {
            ...operation,
            state: retryAt === null ? "dead-letter" : "failed",
            attemptCount: operation.attemptCount + 1,
            nextAttemptAt: retryAt,
            lastError: error,
          }
        : operation,
    );
  }

  async listReady(now: string, limit: number): Promise<SyncOperation[]> {
    return this.operations
      .filter(
        (operation) =>
          (operation.state === "pending" || operation.state === "failed") &&
          operation.nextAttemptAt !== null &&
          operation.nextAttemptAt <= now,
      )
      .slice(0, limit);
  }
}

function createTestOperation(id = "01BATCH"): SyncOperation {
  return createSyncOperation({
    id,
    deviceId: "device-1",
    entityType: "bookmark",
    entityId: `bookmark-${id}`,
    action: "upsert",
    payload: { title: id },
    baseRevision: 0,
    now: NOW,
  });
}

async function expectProtocolRejection(
  result: SyncPushResult,
  expectedMessage: string,
): Promise<void> {
  const queue = new TestQueue();
  await queue.enqueue(createTestOperation());
  const before = queue.operations.map((operation) => ({ ...operation }));
  const runner = new SyncRunner(queue, {
    async push() {
      return result;
    },
  });

  await expect(runner.runOnce(NOW)).rejects.toThrowError(expectedMessage);
  expect(queue.operations).toEqual(before);
}

describe("sync foundation", () => {
  it("uses deterministic conflict ordering", () => {
    expect(
      selectConflictWinner(
        {
          updatedAt: "2026-08-29T08:00:00.000Z",
          deviceId: "a",
          operationId: "02",
        },
        {
          updatedAt: "2026-08-29T08:00:00.000Z",
          deviceId: "b",
          operationId: "01",
        },
      ),
    ).toBe("right");
  });

  it("caps exponential retry delay", () => {
    expect(nextRetryAt("2026-08-29T08:00:00.000Z", 20)).toBe(
      "2026-08-29T08:05:00.000Z",
    );
  });

  it("acknowledges idempotent successes and retries transient failures", async () => {
    const queue = new TestQueue();
    await queue.enqueue(
      createSyncOperation({
        id: "01ACCEPT",
        deviceId: "device-1",
        entityType: "bookmark",
        entityId: "bookmark-1",
        action: "upsert",
        payload: { title: "Accepted" },
        baseRevision: 0,
        now: "2026-08-29T08:00:00.000Z",
      }),
    );
    await queue.enqueue(
      createSyncOperation({
        id: "01RETRY",
        deviceId: "device-1",
        entityType: "bookmark",
        entityId: "bookmark-2",
        action: "upsert",
        payload: { title: "Retry" },
        baseRevision: 0,
        now: "2026-08-29T08:00:00.000Z",
      }),
    );
    const runner = new SyncRunner(queue, {
      async push() {
        return {
          acceptedOperationIds: ["01ACCEPT"],
          rejected: [
            { operationId: "01RETRY", reason: "temporary", retryable: true },
          ],
        };
      },
    });

    await runner.runOnce("2026-08-29T08:00:00.000Z");
    expect(queue.operations).toMatchObject([
      { id: "01ACCEPT", state: "acked" },
      { id: "01RETRY", state: "failed", attemptCount: 1 },
    ]);
  });

  it("rejects accepted and rejected IDs outside the submitted batch before queue mutation", async () => {
    await expectProtocolRejection(
      { acceptedOperationIds: ["01OUTSIDE"], rejected: [] },
      "Accepted operation ID is outside the submitted batch: 01OUTSIDE",
    );
    await expectProtocolRejection(
      {
        acceptedOperationIds: [],
        rejected: [
          { operationId: "01OUTSIDE", reason: "invalid", retryable: false },
        ],
      },
      "Rejected operation ID is outside the submitted batch: 01OUTSIDE",
    );
  });

  it("rejects duplicate accepted and rejected response IDs before queue mutation", async () => {
    await expectProtocolRejection(
      { acceptedOperationIds: ["01BATCH", "01BATCH"], rejected: [] },
      "Accepted operation ID is duplicated: 01BATCH",
    );
    await expectProtocolRejection(
      {
        acceptedOperationIds: [],
        rejected: [
          { operationId: "01BATCH", reason: "first", retryable: true },
          { operationId: "01BATCH", reason: "second", retryable: false },
        ],
      },
      "Rejected operation ID is duplicated: 01BATCH",
    );
  });

  it("rejects operation IDs reported as both accepted and rejected before queue mutation", async () => {
    await expectProtocolRejection(
      {
        acceptedOperationIds: ["01BATCH"],
        rejected: [
          { operationId: "01BATCH", reason: "conflict", retryable: false },
        ],
      },
      "Operation ID is both accepted and rejected: 01BATCH",
    );
  });

  it("rejects duplicate operation IDs in the submitted batch", async () => {
    const queue = new TestQueue();
    await queue.enqueue(createTestOperation());
    await queue.enqueue(createTestOperation());
    let pushCalls = 0;
    const runner = new SyncRunner(queue, {
      async push() {
        pushCalls += 1;
        return { acceptedOperationIds: ["01BATCH"], rejected: [] };
      },
    });

    await expect(runner.runOnce(NOW)).rejects.toBeInstanceOf(SyncProtocolError);
    expect(pushCalls).toBe(0);
    expect(queue.operations).toHaveLength(2);
    expect(
      queue.operations.every((operation) => operation.state === "pending"),
    ).toBe(true);
  });
});
