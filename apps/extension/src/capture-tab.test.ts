import { describe, expect, it } from "vitest";

import { decodeCaptureHash } from "@bookmark-platform/capture";

import { captureUrlForTab } from "./capture-tab";

describe("extension Quick Save", () => {
  it("sends the current page to the remembered destination", () => {
    const target = new URL(
      captureUrlForTab({
        destination: "watch-later",
        libraryUrl: "https://library.example/",
        requestedAt: "2026-08-29T11:00:00.000Z",
        tab: {
          title: "A useful video",
          url: "https://video.example/watch?v=42",
        },
      }),
    );

    expect(decodeCaptureHash(target.hash)).toMatchObject({
      collection: "watch-later",
      title: "A useful video",
      url: "https://video.example/watch?v=42",
    });
  });

  it("explains why browser-internal pages cannot be captured", () => {
    expect(() =>
      captureUrlForTab({
        destination: "inbox",
        libraryUrl: "https://library.example/",
        tab: { title: "Extensions", url: "chrome://extensions" },
      }),
    ).toThrow("Only HTTP and HTTPS pages can be saved.");
  });
});
