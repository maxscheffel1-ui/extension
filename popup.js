let isProUser = false;
let workspaces = [];

const FREE_WORKSPACE_LIMIT = 3;

const els = {
  proBadge: document.getElementById("proBadge"),
  devToggleBtn: document.getElementById("devToggleBtn"),
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
        reject(new Error((response && response.error) || "Unbekannter Fehler"));
        return;
      }
      resolve(response);
    });
  });
}

function formatRelativeDate(timestamp) {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `vor ${days} Tag${days === 1 ? "" : "en"}`;
  return new Date(timestamp).toLocaleDateString("de-DE");
}

function updateProUI() {
  els.proBadge.classList.toggle("pro-badge--hidden", !isProUser);
  els.devToggleBtn.classList.toggle("is-active", isProUser);
  els.devToggleBtn.textContent = isProUser ? "DEV: PRO AN" : "DEV";

  els.exportImportLock.style.display = isProUser ? "none" : "inline";
  const ramCleanerLock = els.ramCleanerBtn.querySelector(".btn-lock");
  if (ramCleanerLock) ramCleanerLock.style.display = isProUser ? "none" : "inline";

  if (isProUser) {
    els.limitInfo.textContent = "";
  } else {
    const remaining = Math.max(0, FREE_WORKSPACE_LIMIT - workspaces.length);
    els.limitInfo.textContent = `${workspaces.length} von ${FREE_WORKSPACE_LIMIT} kostenlosen Workspaces genutzt${remaining === 0 ? " · Limit erreicht" : ""}`;
  }
}

function showProModal(text) {
  els.proModalText.textContent = text || "Dieses Feature erfordert das Pro-Upgrade ($5 Einmalkauf).";
  els.proModalOverlay.classList.remove("modal-overlay--hidden");
}

function hideProModal() {
  els.proModalOverlay.classList.add("modal-overlay--hidden");
}

function buildTabRow(tabData, onRemove) {
  const fragment = els.tabRowTemplate.content.cloneNode(true);
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
  const card = fragment.querySelector(".workspace-card");
  const nameEl = fragment.querySelector(".workspace-card__name");
  const metaEl = fragment.querySelector(".workspace-card__meta");
  const toggleBtn = fragment.querySelector(".workspace-card__toggle");
  const switchBtn = fragment.querySelector(".workspace-card__switch");
  const renameBtn = fragment.querySelector(".workspace-card__rename");
  const deleteBtn = fragment.querySelector(".workspace-card__delete");
  const tabsContainer = fragment.querySelector(".workspace-card__tabs");

  nameEl.textContent = workspace.name;
  const tabCount = workspace.tabs.length;
  metaEl.textContent = `${tabCount} Tab${tabCount === 1 ? "" : "s"} · ${formatRelativeDate(workspace.updatedAt)}`;

  toggleBtn.addEventListener("click", () => {
    const isHidden = tabsContainer.classList.toggle("workspace-card__tabs--hidden");
    toggleBtn.classList.toggle("is-expanded", !isHidden);
    if (!isHidden && tabsContainer.childElementCount === 0) {
      renderTabRows(workspace, tabsContainer, metaEl);
    }
  });

  switchBtn.addEventListener("click", async () => {
    if (workspace.tabs.length === 0) {
      showToast("Dieser Workspace enthält keine Tabs mehr.", true);
      return;
    }
    switchBtn.disabled = true;
    switchBtn.textContent = "Wechsle...";
    try {
      const windowId = await getCurrentWindowId();
      await sendBackgroundMessage({ type: "SWITCH_WORKSPACE", windowId, workspace });
      showToast(`Workspace "${workspace.name}" geladen.`);
    } catch (error) {
      showToast("Wechsel fehlgeschlagen.", true);
    } finally {
      switchBtn.disabled = false;
      switchBtn.textContent = "Wechseln";
    }
  });

  renameBtn.addEventListener("click", () => {
    const newName = prompt("Neuer Name für den Workspace:", workspace.name);
    if (!newName) return;
    const trimmed = newName.trim();
    if (!trimmed) return;
    workspace.name = trimmed.slice(0, 60);
    workspace.updatedAt = Date.now();
    saveWorkspacesToStorage().then(renderWorkspaceList);
  });

  deleteBtn.addEventListener("click", () => {
    const confirmed = confirm(`Workspace "${workspace.name}" wirklich löschen?`);
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
      workspace.tabs = workspace.tabs.filter((t) => t !== tabData);
      workspace.updatedAt = Date.now();
      saveWorkspacesToStorage().then(() => {
        renderTabRows(workspace, container, metaEl);
        const tabCount = workspace.tabs.length;
        metaEl.textContent = `${tabCount} Tab${tabCount === 1 ? "" : "s"} · ${formatRelativeDate(workspace.updatedAt)}`;
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
    showProModal(`Du hast das kostenlose Limit von ${FREE_WORKSPACE_LIMIT} Workspaces erreicht. Dieses Feature erfordert das Pro-Upgrade ($5 Einmalkauf).`);
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
      showToast("Keine Tabs zum Speichern gefunden.", true);
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
    showToast(`Workspace "${workspace.name}" gespeichert.`);
  } catch (error) {
    showToast("Speichern fehlgeschlagen.", true);
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
  showToast("Export gestartet.");
}

function importWorkspacesFromFile(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const importedList = Array.isArray(parsed) ? parsed : parsed.workspaces;
      if (!Array.isArray(importedList)) throw new Error("Ungültiges Format");

      const validImports = importedList
        .filter((item) => item && typeof item.name === "string" && Array.isArray(item.tabs))
        .map((item) => ({
          id: crypto.randomUUID(),
          name: String(item.name).slice(0, 60),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          tabs: item.tabs
            .filter((t) => t && typeof t.url === "string")
            .map((t) => ({
              url: t.url,
              title: typeof t.title === "string" ? t.title : t.url,
              favIconUrl: typeof t.favIconUrl === "string" ? t.favIconUrl : "",
              pinned: t.pinned === true,
              groupKey: typeof t.groupKey === "string" ? t.groupKey : null
            })),
          groups: Array.isArray(item.groups) ? item.groups : []
        }));

      if (!validImports.length) {
        showToast("Keine gültigen Workspaces in der Datei gefunden.", true);
        return;
      }

      workspaces = workspaces.concat(validImports);
      await saveWorkspacesToStorage();
      renderWorkspaceList();
      showToast(`${validImports.length} Workspace(s) importiert.`);
    } catch (error) {
      showToast("Import fehlgeschlagen: ungültige Datei.", true);
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
      showToast(`${response.closedCount} doppelte/inaktive Tab(s) geschlossen.`);
    } else {
      showToast("Keine doppelten oder inaktiven Tabs gefunden.");
    }
  } catch (error) {
    showToast("RAM Cleaner fehlgeschlagen.", true);
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
      showProModal("Export/Import erfordert das Pro-Upgrade ($5 Einmalkauf).");
      return;
    }
    if (workspaces.length === 0) {
      showToast("Keine Workspaces zum Exportieren vorhanden.", true);
      return;
    }
    exportWorkspaces();
  });

  els.importBtn.addEventListener("click", () => {
    if (!isProUser) {
      showProModal("Export/Import erfordert das Pro-Upgrade ($5 Einmalkauf).");
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
      showProModal("RAM Cleaner erfordert das Pro-Upgrade ($5 Einmalkauf).");
      return;
    }
    runRamCleaner();
  });

  els.devToggleBtn.addEventListener("click", () => {
    isProUser = !isProUser;
    chrome.storage.local.set({ isProUser });
    updateProUI();
    showToast(isProUser ? "Dev-Modus: Pro aktiviert." : "Dev-Modus: Pro deaktiviert.");
  });

  els.modalCloseBtn.addEventListener("click", hideProModal);
  els.modalUpgradeBtn.addEventListener("click", hideProModal);
  els.proModalOverlay.addEventListener("click", (event) => {
    if (event.target === els.proModalOverlay) hideProModal();
  });
}

async function init() {
  await loadStateFromStorage();
  renderWorkspaceList();
  bindEvents();
}

document.addEventListener("DOMContentLoaded", init);
