chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.local.set({
      isProUser: false,
      feePreset: "standard",
      installedAt: Date.now()
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "GET_ACTIVE_TAB_PRODUCT_DATA") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs && tabs[0];
      if (!activeTab || !activeTab.id) {
        sendResponse({ data: null });
        return;
      }

      chrome.tabs.sendMessage(
        activeTab.id,
        { type: "REQUEST_PRODUCT_DATA" },
        (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ data: null });
            return;
          }
          sendResponse({ data: response ? response.data : null });
        }
      );
    });
    return true;
  }

  if (message && message.type === "SET_PRO_STATUS") {
    chrome.storage.local.set({ isProUser: message.isProUser === true }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});
