let isProUser = false;

const DEFAULT_PLATFORM_FEE = 12;

const els = {
  platformLabel: document.getElementById("platformLabel"),
  productTitle: document.getElementById("productTitle"),
  refreshPriceBtn: document.getElementById("refreshPriceBtn"),
  sellingPrice: document.getElementById("sellingPrice"),
  costPrice: document.getElementById("costPrice"),
  shippingCost: document.getElementById("shippingCost"),
  platformFee: document.getElementById("platformFee"),
  netProfitValue: document.getElementById("netProfitValue"),
  marginValue: document.getElementById("marginValue"),
  roiValue: document.getElementById("roiValue"),
  csvExportBtn: document.getElementById("csvExportBtn"),
  feePresetsBtn: document.getElementById("feePresetsBtn"),
  feePresetsPanel: document.getElementById("feePresetsPanel"),
  proBadge: document.getElementById("proBadge"),
  demoProToggle: document.getElementById("demoProToggle"),
  proModalOverlay: document.getElementById("proModalOverlay"),
  modalCloseBtn: document.getElementById("modalCloseBtn"),
  modalUpgradeBtn: document.getElementById("modalUpgradeBtn")
};

function formatCurrency(value) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
  }).format(Number.isFinite(value) ? value : 0);
}

function formatPercent(value) {
  return `${new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(Number.isFinite(value) ? value : 0)} %`;
}

function parseFieldValue(input) {
  const value = parseFloat(input.value);
  return Number.isFinite(value) ? value : 0;
}

function calculateAndRender() {
  const sellingPrice = parseFieldValue(els.sellingPrice);
  const costPrice = parseFieldValue(els.costPrice);
  const shippingCost = parseFieldValue(els.shippingCost);
  const platformFeePercent = els.platformFee.value === ""
    ? DEFAULT_PLATFORM_FEE
    : parseFieldValue(els.platformFee);

  const feeAmount = sellingPrice * (platformFeePercent / 100);
  const netProfit = sellingPrice - costPrice - shippingCost - feeAmount;
  const margin = sellingPrice > 0 ? (netProfit / sellingPrice) * 100 : 0;
  const investedCapital = costPrice + shippingCost;
  const roi = investedCapital > 0 ? (netProfit / investedCapital) * 100 : 0;

  els.netProfitValue.textContent = formatCurrency(netProfit);
  els.marginValue.textContent = formatPercent(margin);
  els.roiValue.textContent = formatPercent(roi);

  [els.netProfitValue, els.marginValue, els.roiValue].forEach((el) => {
    el.classList.remove("result-card__value--positive", "result-card__value--negative");
  });

  const profitClass = netProfit >= 0 ? "result-card__value--positive" : "result-card__value--negative";
  els.netProfitValue.classList.add(profitClass);
  els.marginValue.classList.add(margin >= 0 ? "result-card__value--positive" : "result-card__value--negative");
  els.roiValue.classList.add(roi >= 0 ? "result-card__value--positive" : "result-card__value--negative");

  persistFormState({ sellingPrice, costPrice, shippingCost, platformFeePercent });
}

function persistFormState(values) {
  chrome.storage.local.set({
    formState: {
      sellingPrice: els.sellingPrice.value,
      costPrice: els.costPrice.value,
      shippingCost: els.shippingCost.value,
      platformFee: els.platformFee.value
    }
  });
}

function restoreFormState(callback) {
  chrome.storage.local.get(["formState"], (result) => {
    const state = result.formState || {};
    if (state.sellingPrice) els.sellingPrice.value = state.sellingPrice;
    if (state.costPrice) els.costPrice.value = state.costPrice;
    if (state.shippingCost) els.shippingCost.value = state.shippingCost;
    els.platformFee.value = state.platformFee || String(DEFAULT_PLATFORM_FEE);
    if (typeof callback === "function") callback();
  });
}

function setPlatformLabel(platform) {
  const labels = {
    amazon: "Amazon erkannt",
    ebay: "eBay erkannt"
  };
  els.platformLabel.textContent = labels[platform] || "Keine Produktseite erkannt";
}

function applyProductData(data) {
  if (!data) {
    return;
  }

  setPlatformLabel(data.platform);

  if (data.title) {
    els.productTitle.textContent = data.title;
  }

  if (typeof data.price === "number" && Number.isFinite(data.price)) {
    els.sellingPrice.value = data.price.toFixed(2);
    calculateAndRender();
  }
}

function requestActiveTabProductData() {
  chrome.runtime.sendMessage({ type: "GET_ACTIVE_TAB_PRODUCT_DATA" }, (response) => {
    if (chrome.runtime.lastError) {
      return;
    }
    if (response && response.data) {
      applyProductData(response.data);
    } else {
      chrome.storage.local.get(["lastScrapedProduct"], (result) => {
        if (result.lastScrapedProduct) {
          applyProductData(result.lastScrapedProduct);
        }
      });
    }
  });
}

function updateProUI() {
  els.proBadge.classList.toggle("pro-badge--hidden", !isProUser);
  els.demoProToggle.checked = isProUser;

  [els.csvExportBtn, els.feePresetsBtn].forEach((btn) => {
    const lockIcon = btn.querySelector(".btn-lock");
    if (lockIcon) {
      lockIcon.style.display = isProUser ? "none" : "inline";
    }
  });

  if (!isProUser) {
    els.feePresetsPanel.classList.add("fee-presets--hidden");
  }
}

function showProModal() {
  els.proModalOverlay.classList.remove("modal-overlay--hidden");
}

function hideProModal() {
  els.proModalOverlay.classList.add("modal-overlay--hidden");
}

function exportCsv() {
  const sellingPrice = parseFieldValue(els.sellingPrice);
  const costPrice = parseFieldValue(els.costPrice);
  const shippingCost = parseFieldValue(els.shippingCost);
  const platformFeePercent = els.platformFee.value === ""
    ? DEFAULT_PLATFORM_FEE
    : parseFieldValue(els.platformFee);
  const feeAmount = sellingPrice * (platformFeePercent / 100);
  const netProfit = sellingPrice - costPrice - shippingCost - feeAmount;
  const margin = sellingPrice > 0 ? (netProfit / sellingPrice) * 100 : 0;
  const investedCapital = costPrice + shippingCost;
  const roi = investedCapital > 0 ? (netProfit / investedCapital) * 100 : 0;

  const headers = [
    "Produkttitel",
    "Verkaufspreis (EUR)",
    "Einkaufspreis (EUR)",
    "Versandkosten (EUR)",
    "Plattformgebuehr (%)",
    "Reingewinn (EUR)",
    "Marge (%)",
    "ROI (%)"
  ];

  const row = [
    (els.productTitle.textContent || "").replace(/"/g, '""'),
    sellingPrice.toFixed(2),
    costPrice.toFixed(2),
    shippingCost.toFixed(2),
    platformFeePercent.toFixed(1),
    netProfit.toFixed(2),
    margin.toFixed(1),
    roi.toFixed(1)
  ];

  const csvContent = [
    headers.map((h) => `"${h}"`).join(";"),
    row.map((v) => `"${v}"`).join(";")
  ].join("\r\n");

  const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `profit-calculation-${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function init() {
  chrome.storage.local.get(["isProUser"], (result) => {
    isProUser = result.isProUser === true;
    updateProUI();
  });

  restoreFormState(() => {
    calculateAndRender();
  });

  requestActiveTabProductData();

  [els.sellingPrice, els.costPrice, els.shippingCost, els.platformFee].forEach((input) => {
    input.addEventListener("input", calculateAndRender);
  });

  els.refreshPriceBtn.addEventListener("click", () => {
    requestActiveTabProductData();
  });

  els.csvExportBtn.addEventListener("click", () => {
    if (!isProUser) {
      showProModal();
      return;
    }
    exportCsv();
  });

  els.feePresetsBtn.addEventListener("click", () => {
    if (!isProUser) {
      showProModal();
      return;
    }
    els.feePresetsPanel.classList.toggle("fee-presets--hidden");
  });

  els.feePresetsPanel.addEventListener("click", (event) => {
    const target = event.target.closest(".fee-preset");
    if (!target) return;
    els.platformFee.value = target.dataset.fee;
    calculateAndRender();
  });

  els.demoProToggle.addEventListener("change", (event) => {
    isProUser = event.target.checked;
    chrome.storage.local.set({ isProUser });
    updateProUI();
  });

  els.modalCloseBtn.addEventListener("click", hideProModal);

  els.modalUpgradeBtn.addEventListener("click", () => {
    hideProModal();
  });

  els.proModalOverlay.addEventListener("click", (event) => {
    if (event.target === els.proModalOverlay) {
      hideProModal();
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
