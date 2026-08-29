import { describe, expect, it } from "vitest";

import { storageModeLabel, syncStateLabel } from "./shell-copy";

describe("web shell copy", () => {
  it("keeps the approved local-first promise explicit", () => {
    expect(storageModeLabel).toBe("Local first");
    expect(syncStateLabel).toBe("Cloud sync is optional");
  });
});
