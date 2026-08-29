const destination = document.querySelector("#destination");
chrome.storage.local.get({ destination: "Inbox" }).then(({ destination: value }) => { destination.textContent = `Save to ${value}`; });
document.querySelector("#save").addEventListener("click", async () => { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); await chrome.runtime.sendMessage({ type: "quick-save", tab }); window.close(); });
