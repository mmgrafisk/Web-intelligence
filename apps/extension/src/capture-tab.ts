import {
  buildCaptureUrl,
  createCaptureRequest,
  type CaptureCollection,
} from "@bookmark-platform/capture";

export interface CapturableTab {
  title?: string | undefined;
  url?: string | undefined;
}

export function captureUrlForTab(input: {
  destination: CaptureCollection;
  libraryUrl: string;
  requestedAt?: string;
  tab: CapturableTab;
}): string {
  const pageUrl = input.tab.url?.trim();
  if (!pageUrl) {
    throw new Error("The current tab does not have a web address.");
  }

  let parsed: URL;
  try {
    parsed = new URL(pageUrl);
  } catch {
    throw new Error("The current tab does not have a valid web address.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS pages can be saved.");
  }

  const title = input.tab.title?.trim() || parsed.hostname;
  return buildCaptureUrl(
    input.libraryUrl,
    createCaptureRequest({
      collection: input.destination,
      title,
      url: parsed.toString(),
      ...(input.requestedAt ? { requestedAt: input.requestedAt } : {}),
    }),
  );
}
