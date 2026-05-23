/* ============================================================
   ChapterAI – Background Service Worker
   Handles extension icon click and keyboard shortcut relay.
   ============================================================ */

// When the extension action icon is clicked, toggle the panel
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url?.startsWith('https://studio.youtube.com')) {
    // Not on YouTube Studio – do nothing or show a notification
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
  } catch (err) {
    // Content script might not be injected yet – inject it manually
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js', 'panel.js']
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['panel.css']
      });
      // Wait a bit for scripts to initialize, then send toggle
      setTimeout(async () => {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
        } catch (e) {
          console.warn('[ChapterAI] Could not communicate with content script:', e);
        }
      }, 500);
    } catch (injectErr) {
      console.error('[ChapterAI] Failed to inject scripts:', injectErr);
    }
  }
});

// Listen for keyboard shortcut commands (if defined in manifest)
chrome.commands?.onCommand?.addListener(async (command) => {
  if (command === 'generate-chapters') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url?.startsWith('https://studio.youtube.com')) {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'generate' });
      } catch (err) {
        console.warn('[ChapterAI] Could not send generate command:', err);
      }
    }
  }
});

// Installation handler
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[ChapterAI] Extension installed successfully');
  }
});
