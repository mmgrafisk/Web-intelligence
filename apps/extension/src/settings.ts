import {
  normalizeLibraryUrl,
  type CaptureCollection,
} from "@bookmark-platform/capture";

export interface ExtensionSettings {
  destination: CaptureCollection;
  libraryUrl: string;
}

export const destinationOptions: readonly {
  id: CaptureCollection;
  label: string;
}[] = [
  { id: "inbox", label: "Inbox" },
  { id: "research", label: "Research" },
  { id: "inspiration", label: "Inspiration" },
  { id: "watch-later", label: "Watch later" },
];

export const defaultSettings: ExtensionSettings = {
  destination: "inbox",
  libraryUrl: "http://localhost:3000/",
};

export function isCaptureCollection(
  value: unknown,
): value is CaptureCollection {
  return destinationOptions.some((option) => option.id === value);
}

export function validateSettings(input: {
  destination: unknown;
  libraryUrl: unknown;
}): ExtensionSettings {
  if (!isCaptureCollection(input.destination)) {
    throw new Error("Choose a valid destination.");
  }
  if (typeof input.libraryUrl !== "string") {
    throw new Error("Enter the address of your Bookmark Intelligence app.");
  }

  try {
    return {
      destination: input.destination,
      libraryUrl: normalizeLibraryUrl(input.libraryUrl),
    };
  } catch {
    throw new Error("Enter an HTTP or HTTPS address for your library.");
  }
}

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(defaultSettings);
  try {
    return validateSettings({
      destination: stored.destination,
      libraryUrl: stored.libraryUrl,
    });
  } catch {
    return defaultSettings;
  }
}

export async function saveSettings(
  settings: ExtensionSettings,
): Promise<ExtensionSettings> {
  const validated = validateSettings(settings);
  await chrome.storage.local.set(validated);
  return validated;
}
