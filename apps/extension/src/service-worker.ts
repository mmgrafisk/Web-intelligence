import type { CaptureCollection } from "@bookmark-platform/capture";

import { captureUrlForTab, type CapturableTab } from "./capture-tab";
import { getSettings, isCaptureCollection } from "./settings";

interface QuickSaveMessage {
  destination?: CaptureCollection;
  tab?: CapturableTab;
  type: "quick-save";
}

interface QuickSaveResult {
  error?: string;
  ok: boolean;
}

async function setBadge(text: string, color: string): Promise<void> {
  await Promise.all([
    chrome.action.setBadgeBackgroundColor({ color }),
    chrome.action.setBadgeText({ text }),
  ]);
}

async function openCapture(
  tab: CapturableTab,
  destination?: CaptureCollection,
): Promise<QuickSaveResult> {
  try {
    const settings = await getSettings();
    const target = captureUrlForTab({
      destination: destination ?? settings.destination,
      libraryUrl: settings.libraryUrl,
      tab,
    });
    await chrome.tabs.create({ url: target });
    await chrome.storage.local.set({
      lastCapture: {
        destination: destination ?? settings.destination,
        openedAt: new Date().toISOString(),
        title: tab.title ?? tab.url,
        url: tab.url,
      },
    });
    await setBadge("OK", "#315d50");
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The page could not be sent to your library.";
    await chrome.storage.local.set({ lastCaptureError: message });
    await setBadge("!", "#8f3832");
    return { error: message, ok: false };
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.contextMenus.removeAll().then(() =>
    chrome.contextMenus.create({
      contexts: ["page"],
      id: "save-page",
      title: "Save page to Bookmark Intelligence",
    }),
  );
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "save-page" && tab) void openCapture(tab);
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "quick-save") return;
  void chrome.tabs
    .query({ active: true, currentWindow: true })
    .then(([tab]) => (tab ? openCapture(tab) : undefined));
});

chrome.runtime.onMessage.addListener(
  (message: QuickSaveMessage, _sender, sendResponse) => {
    if (message.type !== "quick-save" || !message.tab) return false;
    const destination = isCaptureCollection(message.destination)
      ? message.destination
      : undefined;
    void openCapture(message.tab, destination).then(sendResponse);
    return true;
  },
);
