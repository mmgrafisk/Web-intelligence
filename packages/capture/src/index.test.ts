import { describe, expect, it } from "vitest";

import {
  buildCaptureUrl,
  createCaptureRequest,
  decodeCaptureHash,
  decodeCaptureRequest,
  encodeCaptureRequest,
  normalizeLibraryUrl,
} from "./index";

const request = createCaptureRequest({
  url: "https://example.com/guide",
  title: "A field guide — æøå",
  collection: "research",
  requestedAt: "2026-08-29T11:00:00.000Z",
});

describe("extension capture protocol", () => {
  it("round-trips validated UTF-8 capture requests", () => {
    expect(decodeCaptureRequest(encodeCaptureRequest(request))).toEqual(
      request,
    );
  });

  it("builds a fragment-only handoff to the configured library", () => {
    const target = buildCaptureUrl(
      "https://library.example/app?old=1",
      request,
    );
    const url = new URL(target);

    expect(`${url.origin}${url.pathname}`).toBe("https://library.example/app");
    expect(url.search).toBe("");
    expect(decodeCaptureHash(url.hash)).toEqual(request);
  });

  it("rejects invalid protocols and malformed capture tokens", () => {
    expect(() => normalizeLibraryUrl("file:///tmp/library")).toThrow(
      "HTTP or HTTPS",
    );
    expect(() => decodeCaptureRequest("not-json")).toThrow(
      "could not be validated",
    );
  });
});
