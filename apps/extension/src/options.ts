import { destinationOptions, getSettings, saveSettings } from "./settings";

const form = document.querySelector<HTMLFormElement>("#settings-form");
const libraryUrl = document.querySelector<HTMLInputElement>("#library-url");
const destination = document.querySelector<HTMLSelectElement>("#destination");
const status = document.querySelector<HTMLElement>("#status");

if (!form || !libraryUrl || !destination || !status) {
  throw new Error("The extension settings could not be initialized.");
}

for (const option of destinationOptions) {
  destination.add(new Option(option.label, option.id));
}

const settings = await getSettings();
libraryUrl.value = settings.libraryUrl;
destination.value = settings.destination;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.className = "status";
  status.textContent = "Saving…";

  try {
    const saved = await saveSettings({
      destination: destination.value as typeof settings.destination,
      libraryUrl: libraryUrl.value,
    });
    libraryUrl.value = saved.libraryUrl;
    status.className = "status success";
    status.textContent = "Settings saved.";
  } catch (error) {
    status.className = "status error";
    status.textContent =
      error instanceof Error ? error.message : "Settings could not be saved.";
  }
});
