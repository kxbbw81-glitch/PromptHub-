// ==========================================
// PromptHub Extension - Background Service Worker
// Bridges extension storage with the PromptHub website
// ==========================================

const STORAGE_KEY = 'prompthub_ext_queue';

chrome.runtime.onInstalled.addListener(() => {
  console.log('PromptHub Collector installed');
});

// Listen for storage changes to sync queue to website
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.prompthub_sync_queue) {
    const queue = changes.prompthub_sync_queue.newValue;
    if (queue && queue.length > 0) {
      // Try to find PromptHub tab and send data
      chrome.tabs.query({ url: '*://localhost*/*' }, (tabs) => {
        if (tabs.length > 0) {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
              action: 'extensionImport',
              data: queue
            }).catch(() => {});
          });
        }
      });
    }
  }
});

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getQueue') {
    chrome.storage.local.get(STORAGE_KEY).then(result => {
      sendResponse({ queue: result[STORAGE_KEY] || [] });
    });
    return true;
  }
  if (request.action === 'clearQueue') {
    chrome.storage.local.remove(STORAGE_KEY).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});
