importScripts("ExtPay.js", "extpay-config.js");

const extpay = ExtPay(EXTPAY_EXTENSION_ID);
extpay.startBackground();

extpay.onPaid.addListener(() => {
  chrome.runtime.sendMessage({ type: "PRO_STATUS_CHANGED" }).catch(() => {});
});

const INACTIVE_THRESHOLD_MS = 30 * 60 * 1000;
const NONE_GROUP_ID = chrome.tabGroups ? chrome.tabGroups.TAB_GROUP_ID_NONE : -1;

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.local.set({
      workspaces: [],
      installedAt: Date.now()
    });
  }
  updateBadge();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.workspaces) {
    updateBadge();
  }
});

function updateBadge() {
  chrome.storage.local.get(["workspaces"], (result) => {
    const count = Array.isArray(result.workspaces) ? result.workspaces.length : 0;
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#6d5efc" });
  });
}

async function snapshotCurrentTabs(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  const groupIdsSeen = new Map();
  const groups = [];
  const snapshotTabs = [];

  for (const tab of tabs) {
    if (!tab.url) continue;

    let groupKey = null;
    if (chrome.tabGroups && typeof tab.groupId === "number" && tab.groupId !== NONE_GROUP_ID) {
      if (!groupIdsSeen.has(tab.groupId)) {
        try {
          const groupInfo = await chrome.tabGroups.get(tab.groupId);
          groupKey = `g${groups.length}`;
          groupIdsSeen.set(tab.groupId, groupKey);
          groups.push({
            key: groupKey,
            title: groupInfo.title || "",
            color: groupInfo.color || "grey"
          });
        } catch (err) {
          groupKey = null;
        }
      } else {
        groupKey = groupIdsSeen.get(tab.groupId);
      }
    }

    snapshotTabs.push({
      url: tab.url,
      title: tab.title || tab.url,
      favIconUrl: tab.favIconUrl || "",
      pinned: tab.pinned === true,
      groupKey
    });
  }

  return { tabs: snapshotTabs, groups };
}

async function openWorkspaceTabs(windowId, workspace) {
  const groupKeyToTabIds = new Map();
  let firstNewTabId = null;

  for (const tabData of workspace.tabs) {
    const created = await chrome.tabs.create({
      windowId,
      url: tabData.url,
      pinned: tabData.pinned === true,
      active: false
    });
    if (firstNewTabId === null) firstNewTabId = created.id;

    if (tabData.groupKey) {
      if (!groupKeyToTabIds.has(tabData.groupKey)) {
        groupKeyToTabIds.set(tabData.groupKey, []);
      }
      groupKeyToTabIds.get(tabData.groupKey).push(created.id);
    }
  }

  if (chrome.tabGroups && Array.isArray(workspace.groups)) {
    for (const group of workspace.groups) {
      const tabIds = groupKeyToTabIds.get(group.key);
      if (!tabIds || tabIds.length === 0) continue;
      try {
        const newGroupId = await chrome.tabs.group({ tabIds, createProperties: { windowId } });
        await chrome.tabGroups.update(newGroupId, {
          title: group.title || "",
          color: group.color || "grey"
        });
      } catch (err) {
        // Grouping is a best-effort enhancement; tabs remain usable ungrouped.
      }
    }
  }

  if (firstNewTabId !== null) {
    await chrome.tabs.update(firstNewTabId, { active: true });
  }
}

async function switchToWorkspace(windowId, workspace) {
  const existingTabs = await chrome.tabs.query({ windowId });
  const existingTabIds = existingTabs.map((tab) => tab.id).filter((id) => typeof id === "number");

  await openWorkspaceTabs(windowId, workspace);

  if (existingTabIds.length > 0) {
    await chrome.tabs.remove(existingTabIds);
  }
}

async function runRamCleaner(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  const toClose = new Set();

  const tabsByUrl = new Map();
  for (const tab of tabs) {
    if (!tab.url) continue;
    if (!tabsByUrl.has(tab.url)) tabsByUrl.set(tab.url, []);
    tabsByUrl.get(tab.url).push(tab);
  }

  for (const duplicates of tabsByUrl.values()) {
    if (duplicates.length < 2) continue;
    const keeper = duplicates.find((tab) => tab.active) || duplicates[0];
    for (const tab of duplicates) {
      if (tab === keeper || tab.pinned) continue;
      toClose.add(tab.id);
    }
  }

  const now = Date.now();
  for (const tab of tabs) {
    if (toClose.has(tab.id)) continue;
    if (tab.active || tab.pinned || tab.audible) continue;
    if (typeof tab.lastAccessed === "number" && now - tab.lastAccessed > INACTIVE_THRESHOLD_MS) {
      toClose.add(tab.id);
    }
  }

  const idsToClose = Array.from(toClose).filter((id) => typeof id === "number");
  if (idsToClose.length > 0) {
    await chrome.tabs.remove(idsToClose);
  }
  return idsToClose.length;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return false;

  if (message.type === "GET_CURRENT_TABS") {
    snapshotCurrentTabs(message.windowId)
      .then((snapshot) => sendResponse({ success: true, snapshot }))
      .catch((error) => sendResponse({ success: false, error: String(error) }));
    return true;
  }

  if (message.type === "SWITCH_WORKSPACE") {
    switchToWorkspace(message.windowId, message.workspace)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: String(error) }));
    return true;
  }

  if (message.type === "RAM_CLEANER") {
    runRamCleaner(message.windowId)
      .then((closedCount) => sendResponse({ success: true, closedCount }))
      .catch((error) => sendResponse({ success: false, error: String(error) }));
    return true;
  }

  return false;
});
