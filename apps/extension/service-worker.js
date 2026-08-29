chrome.runtime.onInstalled.addListener(() => chrome.contextMenus.create({ id: "save-page", title: "Save page to Bookmark Intelligence", contexts: ["page"] }));
chrome.contextMenus.onClicked.addListener((info, tab) => { if (info.menuItemId === "save-page" && tab?.url) save(tab); });
chrome.commands.onCommand.addListener(async command => { if (command === "quick-save") { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); if (tab?.url) save(tab); } });
chrome.runtime.onMessage.addListener(message => { if (message.type === "quick-save" && message.tab?.url) save(message.tab); });
async function save(tab) { const { destination = "Inbox" } = await chrome.storage.local.get({ destination: "Inbox" }); await chrome.storage.local.set({ lastSaved: { url: tab.url, title: tab.title ?? tab.url, destination, savedAt: new Date().toISOString() } }); }
