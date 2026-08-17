let isProUser = false;
let workspaces = [];

const FREE_WORKSPACE_LIMIT = 3;

const LOCALE_DATE_TAGS = {
  en: "en-US",
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR",
  pt: "pt-PT",
  ja: "ja-JP"
};

function t(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

function pluralKey(count, oneKey, otherKey) {
  return count === 1 ? oneKey : otherKey;
}

function applyI18n(root) {
  const scope = root || document;
  scope.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  scope.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
  });
  scope.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.getAttribute("data-i18n-title"));
  });
}

const els = {
  proBadge: document.getElementById("proBadge"),
  statusToast: document.getElementById("statusToast"),
  showCreateFormBtn: document.getElementById("showCreateFormBtn"),
  createForm: document.getElementById("createForm"),
  workspaceNameInput: document.getElementById("workspaceNameInput"),
  confirmCreateBtn: document.getElementById("confirmCreateBtn"),
  cancelCreateBtn: document.getElementById("cancelCreateBtn"),
  limitInfo: document.getElementById("limitInfo"),
  emptyState: document.getElementById("emptyState"),
  workspaceList: document.getElementById("workspaceList"),
  exportBtn: document.getElementById("exportBtn"),
  importBtn: document.getElementById("importBtn"),
  exportImportLock: document.getElementById("exportImportLock"),
  ramCleanerBtn: document.getElementById("ramCleanerBtn"),
  importFileInput: document.getElementById("importFileInput"),
  proModalOverlay: document.getElementById("proModalOverlay"),
  proModalText: document.getElementById("proModalText"),
  modalCloseBtn: document.getElementById("modalCloseBtn"),
  modalUpgradeBtn: document.getElementById("modalUpgradeBtn"),
  workspaceCardTemplate: document.getElementById("workspaceCardTemplate"),
  tabRowTemplate: document.getElementById("tabRowTemplate")
};

let toastTimeoutId = null;

function showToast(message, isError) {
  els.statusToast.textContent = message;
  els.statusToast.classList.remove("status-toast--hidden");
  els.statusToast.classList.toggle("status-toast--error", isError === true);
  if (toastTimeoutId) clearTimeout(toastTimeoutId);
  toastTimeoutId = setTimeout(() => {
    els.statusToast.classList.add("status-toast--hidden");
  }, 3200);
}

function saveWorkspacesToStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ workspaces }, resolve);
  });
}

function loadStateFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["workspaces", "isProUser"], (result) => {
      workspaces = Array.isArray(result.workspaces) ? result.workspaces : [];
      isProUser = result.isProUser === true;
      resolve();
    });
  });
}

function getCurrentWindowId() {
  return new Promise((resolve) => {
    chrome.windows.getCurrent((win) => resolve(win.id));
  });
}

function sendBackgroundMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response || response.success !== true) {
        reject(new Error((response && response.error) || t("genericErrorUnknown")));
        return;
      }
      resolve(response);
    });
  });
}

function formatRelativeDate(timestamp) {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return t("timeJustNow");
  if (minutes < 60) return t("timeMinutesAgo", [String(minutes)]);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("timeHoursAgo", [String(hours)]);
  const days = Math.floor(hours / 24);
  if (days < 30) return t(pluralKey(days, "timeDaysAgoOne", "timeDaysAgoOther"), [String(days)]);
  const baseLang = chrome.i18n.getUILanguage().split("-")[0];
  const dateTag = LOCALE_DATE_TAGS[baseLang] || "en-US";
  return new Date(timestamp).toLocaleDateString(dateTag);
}

function formatTabCount(count) {
  return t(pluralKey(count, "tabCountOne", "tabCountOther"), [String(count)]);
}

function updateProUI() {
  els.proBadge.classList.toggle("pro-badge--hidden", !isProUser);

  els.exportImportLock.style.display = isProUser ? "none" : "inline";
  const ramCleanerLock = els.ramCleanerBtn.querySelector(".btn-lock");
  if (ramCleanerLock) ramCleanerLock.style.display = isProUser ? "none" : "inline";

  if (isProUser) {
    els.limitInfo.textContent = "";
  } else {
    const remaining = Math.max(0, FREE_WORKSPACE_LIMIT - workspaces.length);
    const key = remaining === 0 ? "freeLimitUsageReached" : "freeLimitUsage";
    els.limitInfo.textContent = t(key, [String(workspaces.length), String(FREE_WORKSPACE_LIMIT)]);
  }
}

function showProModal(text) {
  els.proModalText.textContent = text || t("proGateGeneric");
  els.proModalOverlay.classList.remove("modal-overlay--hidden");
}

function hideProModal() {
  els.proModalOverlay.classList.add("modal-overlay--hidden");
}

function buildTabRow(tabData, onRemove) {
  const fragment = els.tabRowTemplate.content.cloneNode(true);
  applyI18n(fragment);
  const row = fragment.querySelector(".tab-row");
  const favicon = fragment.querySelector(".tab-row__favicon");
  const title = fragment.querySelector(".tab-row__title");
  const url = fragment.querySelector(".tab-row__url");
  const removeBtn = fragment.querySelector(".tab-row__remove");

  favicon.src = tabData.favIconUrl || "icons/icon16.png";
  favicon.addEventListener("error", () => {
    favicon.removeAttribute("src");
  });
  title.textContent = tabData.title || tabData.url;
  url.textContent = tabData.url;
  removeBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    onRemove();
  });

  return row;
}

function buildWorkspaceCard(workspace) {
  const fragment = els.workspaceCardTemplate.content.cloneNode(true);
  applyI18n(fragment);
  const card = fragment.querySelector(".workspace-card");
  const nameEl = fragment.querySelector(".workspace-card__name");
  const metaEl = fragment.querySelector(".workspace-card__meta");
  const toggleBtn = fragment.querySelector(".workspace-card__toggle");
  const switchBtn = fragment.querySelector(".workspace-card__switch");
  const renameBtn = fragment.querySelector(".workspace-card__rename");
  const deleteBtn = fragment.querySelector(".workspace-card__delete");
  const tabsContainer = fragment.querySelector(".workspace-card__tabs");

  nameEl.textContent = workspace.name;
  metaEl.textContent = `${formatTabCount(workspace.tabs.length)} · ${formatRelativeDate(workspace.updatedAt)}`;

  toggleBtn.addEventListener("click", () => {
    const isHidden = tabsContainer.classList.toggle("workspace-card__tabs--hidden");
    toggleBtn.classList.toggle("is-expanded", !isHidden);
    if (!isHidden && tabsContainer.childElementCount === 0) {
      renderTabRows(workspace, tabsContainer, metaEl);
    }
  });

  switchBtn.addEventListener("click", async () => {
    if (workspace.tabs.length === 0) {
      showToast(t("toastWorkspaceEmpty"), true);
      return;
    }
    const originalLabel = switchBtn.textContent;
    switchBtn.disabled = true;
    switchBtn.textContent = t("switchingBtn");
    try {
      const windowId = await getCurrentWindowId();
      await sendBackgroundMessage({ type: "SWITCH_WORKSPACE", windowId, workspace });
      showToast(t("toastWorkspaceSwitched", [workspace.name]));
    } catch (error) {
      showToast(t("toastSwitchFailed"), true);
    } finally {
      switchBtn.disabled = false;
      switchBtn.textContent = originalLabel;
    }
  });

  renameBtn.addEventListener("click", () => {
    const newName = prompt(t("renamePromptLabel"), workspace.name);
    if (!newName) return;
    const trimmed = newName.trim();
    if (!trimmed) return;
    workspace.name = trimmed.slice(0, 60);
    workspace.updatedAt = Date.now();
    saveWorkspacesToStorage().then(renderWorkspaceList);
  });

  deleteBtn.addEventListener("click", () => {
    const confirmed = confirm(t("deleteConfirmMessage", [workspace.name]));
    if (!confirmed) return;
    workspaces = workspaces.filter((ws) => ws.id !== workspace.id);
    saveWorkspacesToStorage().then(renderWorkspaceList);
  });

  return card;
}

function renderTabRows(workspace, container, metaEl) {
  container.innerHTML = "";
  workspace.tabs.forEach((tabData) => {
    const row = buildTabRow(tabData, () => {
      workspace.tabs = workspace.tabs.filter((entry) => entry !== tabData);
      workspace.updatedAt = Date.now();
      saveWorkspacesToStorage().then(() => {
        renderTabRows(workspace, container, metaEl);
        metaEl.textContent = `${formatTabCount(workspace.tabs.length)} · ${formatRelativeDate(workspace.updatedAt)}`;
      });
    });
    container.appendChild(row);
  });
}

function renderWorkspaceList() {
  els.workspaceList.innerHTML = "";
  els.emptyState.classList.toggle("empty-state--hidden", workspaces.length > 0);

  workspaces
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .forEach((workspace) => {
      els.workspaceList.appendChild(buildWorkspaceCard(workspace));
    });

  updateProUI();
}

function toggleCreateForm(show) {
  els.createForm.classList.toggle("create-form--hidden", !show);
  els.showCreateFormBtn.classList.toggle("create-form--hidden", show);
  if (show) {
    els.workspaceNameInput.value = "";
    els.workspaceNameInput.focus();
  }
}

async function createWorkspaceFromCurrentTabs() {
  if (!isProUser && workspaces.length >= FREE_WORKSPACE_LIMIT) {
    showProModal(t("proGateLimitReached", [String(FREE_WORKSPACE_LIMIT)]));
    return;
  }

  const name = els.workspaceNameInput.value.trim();
  if (!name) {
    els.workspaceNameInput.focus();
    return;
  }

  els.confirmCreateBtn.disabled = true;
  try {
    const windowId = await getCurrentWindowId();
    const response = await sendBackgroundMessage({ type: "GET_CURRENT_TABS", windowId });
    const snapshot = response.snapshot;

    if (!snapshot.tabs.length) {
      showToast(t("toastNoTabsFound"), true);
      return;
    }

    const workspace = {
      id: crypto.randomUUID(),
      name: name.slice(0, 60),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tabs: snapshot.tabs,
      groups: snapshot.groups
    };

    workspaces.push(workspace);
    await saveWorkspacesToStorage();
    renderWorkspaceList();
    toggleCreateForm(false);
    showToast(t("toastWorkspaceSaved", [workspace.name]));
  } catch (error) {
    showToast(t("toastSaveFailed"), true);
  } finally {
    els.confirmCreateBtn.disabled = false;
  }
}

function exportWorkspaces() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    workspaces
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `workspaces-backup-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast(t("toastExportStarted"));
}

function importWorkspacesFromFile(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const importedList = Array.isArray(parsed) ? parsed : parsed.workspaces;
      if (!Array.isArray(importedList)) throw new Error("Invalid format");

      const validImports = importedList
        .filter((item) => item && typeof item.name === "string" && Array.isArray(item.tabs))
        .map((item) => ({
          id: crypto.randomUUID(),
          name: String(item.name).slice(0, 60),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          tabs: item.tabs
            .filter((tabItem) => tabItem && typeof tabItem.url === "string")
            .map((tabItem) => ({
              url: tabItem.url,
              title: typeof tabItem.title === "string" ? tabItem.title : tabItem.url,
              favIconUrl: typeof tabItem.favIconUrl === "string" ? tabItem.favIconUrl : "",
              pinned: tabItem.pinned === true,
              groupKey: typeof tabItem.groupKey === "string" ? tabItem.groupKey : null
            })),
          groups: Array.isArray(item.groups) ? item.groups : []
        }));

      if (!validImports.length) {
        showToast(t("toastNoValidWorkspaces"), true);
        return;
      }

      workspaces = workspaces.concat(validImports);
      await saveWorkspacesToStorage();
      renderWorkspaceList();
      showToast(t(pluralKey(validImports.length, "toastImportedCountOne", "toastImportedCountOther"), [String(validImports.length)]));
    } catch (error) {
      showToast(t("toastImportFailed"), true);
    }
  };
  reader.readAsText(file);
}

async function runRamCleaner() {
  els.ramCleanerBtn.disabled = true;
  try {
    const windowId = await getCurrentWindowId();
    const response = await sendBackgroundMessage({ type: "RAM_CLEANER", windowId });
    if (response.closedCount > 0) {
      showToast(t(pluralKey(response.closedCount, "toastRamCleanerClosedOne", "toastRamCleanerClosedOther"), [String(response.closedCount)]));
    } else {
      showToast(t("toastRamCleanerNone"));
    }
  } catch (error) {
    showToast(t("toastRamCleanerFailed"), true);
  } finally {
    els.ramCleanerBtn.disabled = false;
  }
}

function bindEvents() {
  els.showCreateFormBtn.addEventListener("click", () => toggleCreateForm(true));
  els.cancelCreateBtn.addEventListener("click", () => toggleCreateForm(false));
  els.confirmCreateBtn.addEventListener("click", createWorkspaceFromCurrentTabs);
  els.workspaceNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") createWorkspaceFromCurrentTabs();
    if (event.key === "Escape") toggleCreateForm(false);
  });

  els.exportBtn.addEventListener("click", () => {
    if (!isProUser) {
      showProModal(t("proGateExportImport"));
      return;
    }
    if (workspaces.length === 0) {
      showToast(t("toastNoWorkspacesToExport"), true);
      return;
    }
    exportWorkspaces();
  });

  els.importBtn.addEventListener("click", () => {
    if (!isProUser) {
      showProModal(t("proGateExportImport"));
      return;
    }
    els.importFileInput.click();
  });

  els.importFileInput.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) importWorkspacesFromFile(file);
    event.target.value = "";
  });

  els.ramCleanerBtn.addEventListener("click", () => {
    if (!isProUser) {
      showProModal(t("proGateRamCleaner"));
      return;
    }
    runRamCleaner();
  });

  els.modalCloseBtn.addEventListener("click", hideProModal);
  els.modalUpgradeBtn.addEventListener("click", hideProModal);
  els.proModalOverlay.addEventListener("click", (event) => {
    if (event.target === els.proModalOverlay) hideProModal();
  });
}

async function init() {
  document.documentElement.lang = chrome.i18n.getUILanguage();
  applyI18n(document);
  els.proModalText.textContent = t("proGateGeneric");
  await loadStateFromStorage();
  renderWorkspaceList();
  bindEvents();
}

document.addEventListener("DOMContentLoaded", init);
