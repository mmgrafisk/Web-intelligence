import { destinationOptions, getSettings, saveSettings } from "./settings";

const pageTitle = document.querySelector<HTMLElement>("#page-title");
const pageUrl = document.querySelector<HTMLElement>("#page-url");
const destination = document.querySelector<HTMLSelectElement>("#destination");
const saveButton = document.querySelector<HTMLButtonElement>("#save");
const status = document.querySelector<HTMLElement>("#status");
const optionsButton = document.querySelector<HTMLButtonElement>("#options");

if (
  !pageTitle ||
  !pageUrl ||
  !destination ||
  !saveButton ||
  !status ||
  !optionsButton
) {
  throw new Error("The Quick Save interface could not be initialized.");
}

for (const option of destinationOptions) {
  destination.add(new Option(option.label, option.id));
}

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const settings = await getSettings();
destination.value = settings.destination;
pageTitle.textContent = tab?.title || "Current page";
pageUrl.textContent = tab?.url || "No web address available";

destination.addEventListener("change", () => {
  void saveSettings({
    ...settings,
    destination: destination.value as typeof settings.destination,
  });
});

optionsButton.addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});

saveButton.addEventListener("click", async () => {
  saveButton.disabled = true;
  status.className = "status";
  status.textContent = "Opening your library…";

  try {
    const savedSettings = await saveSettings({
      ...settings,
      destination: destination.value as typeof settings.destination,
    });
    const result = (await chrome.runtime.sendMessage({
      destination: savedSettings.destination,
      tab,
      type: "quick-save",
    })) as { error?: string; ok: boolean };

    if (!result.ok) throw new Error(result.error || "Quick Save failed.");
    status.className = "status success";
    status.textContent = "Sent. Confirm the bookmark in your library.";
    window.setTimeout(() => window.close(), 500);
  } catch (error) {
    status.className = "status error";
    status.textContent =
      error instanceof Error ? error.message : "Quick Save failed.";
    saveButton.disabled = false;
  }
});
