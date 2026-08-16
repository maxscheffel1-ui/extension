(() => {
  const AMAZON_PRICE_SELECTORS = [
    ".a-price .a-offscreen",
    "#corePrice_feature_div .a-price .a-offscreen",
    "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
    "#priceblock_ourprice",
    "#priceblock_dealprice",
    "#priceblock_saleprice"
  ];

  const AMAZON_TITLE_SELECTORS = [
    "#productTitle",
    "#title #productTitle"
  ];

  const EBAY_PRICE_SELECTORS = [
    ".x-price-primary span.ux-textspans",
    ".x-price-primary",
    "#prcIsum",
    "#mm-saleDscPrc"
  ];

  const EBAY_TITLE_SELECTORS = [
    "h1.x-item-title__mainTitle span.ux-textspans",
    "h1.x-item-title__mainTitle",
    "#itemTitle"
  ];

  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes("amazon.")) return "amazon";
    if (host.includes("ebay.")) return "ebay";
    return null;
  }

  function queryFirstText(selectors) {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent && el.textContent.trim().length > 0) {
        return el.textContent.trim();
      }
    }
    return "";
  }

  function parsePrice(rawText) {
    if (!rawText) return null;

    let cleaned = rawText
      .replace(/[^0-9.,]/g, "")
      .trim();

    if (!cleaned) return null;

    const hasComma = cleaned.includes(",");
    const hasDot = cleaned.includes(".");

    if (hasComma && hasDot) {
      if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
        cleaned = cleaned.replace(/\./g, "").replace(",", ".");
      } else {
        cleaned = cleaned.replace(/,/g, "");
      }
    } else if (hasComma && !hasDot) {
      const parts = cleaned.split(",");
      if (parts[parts.length - 1].length === 2) {
        cleaned = cleaned.replace(",", ".");
      } else {
        cleaned = cleaned.replace(/,/g, "");
      }
    }

    const value = parseFloat(cleaned);
    return Number.isFinite(value) ? value : null;
  }

  function scrapeProductData() {
    const platform = detectPlatform();
    if (!platform) return null;

    let titleText = "";
    let priceText = "";

    if (platform === "amazon") {
      titleText = queryFirstText(AMAZON_TITLE_SELECTORS);
      priceText = queryFirstText(AMAZON_PRICE_SELECTORS);
    } else if (platform === "ebay") {
      titleText = queryFirstText(EBAY_TITLE_SELECTORS);
      priceText = queryFirstText(EBAY_PRICE_SELECTORS);
    }

    const price = parsePrice(priceText);

    if (!titleText && price === null) return null;

    return {
      platform,
      title: titleText || "",
      price: price,
      url: window.location.href,
      scrapedAt: Date.now()
    };
  }

  function storeProductData(data) {
    if (!data) return;
    chrome.storage.local.set({ lastScrapedProduct: data });
  }

  const initialData = scrapeProductData();
  if (initialData) {
    storeProductData(initialData);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === "REQUEST_PRODUCT_DATA") {
      const data = scrapeProductData();
      if (data) {
        storeProductData(data);
      }
      sendResponse({ data });
    }
    return true;
  });
})();
