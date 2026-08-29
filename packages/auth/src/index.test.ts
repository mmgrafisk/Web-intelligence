import { describe, expect, it } from "vitest";

import { LocalAuthProvider } from "./index";

describe("local auth", () => {
  it("creates an accountless device-scoped session", async () => {
    const provider = new LocalAuthProvider("device-1");
    await expect(provider.getSession()).resolves.toEqual({
      mode: "local",
      subject: "local:device-1",
      deviceId: "device-1",
    });
  });
});
