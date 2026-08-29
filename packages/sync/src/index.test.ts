import { describe, expect, it } from "vitest";

import {
  createSyncOperation,
  nextRetryAt,
  selectConflictWinner,
  SyncRunner,
  type SyncOperation,
  type SyncQueue,
} from "./index";

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
});
