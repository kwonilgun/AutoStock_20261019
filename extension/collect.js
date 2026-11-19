(() => {
  if (globalThis.collectEggHoldingsText) return;

  // lib/holdings-import.ts maskHoldingsPage 와 같은 순서다.
  function maskHoldingsPage(raw) {
    const source = String(raw).slice(0, 40000);
    const masked = source
      .replace(/<\/?page>/gi, "")
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[이메일]")
      .replace(/\d{6}-\d{7}/g, "[주민번호]")
      .replace(/01[016789]-?\d{3,4}-?\d{4}/g, "[전화]")
      .replace(/\d{2,4}-\d{2,6}-\d{3,8}/g, "[계좌]")
      .replace(/\d{10,}/g, "[숫자]");
    return masked.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 12000);
  }

  function cellText(element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll("script,style,noscript,input,textarea,select").forEach((node) => node.remove());
    return (clone.textContent || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function collectEggHoldingsText() {
    const lines = [];
    document.querySelectorAll("table").forEach((table) => {
      table.querySelectorAll("tr").forEach((row) => {
        const cells = [...row.children].filter((element) => element.tagName === "TD" || element.tagName === "TH");
        const text = cells.map(cellText).filter(Boolean).join(" | ");
        if (text) lines.push(text);
      });
    });
    if (lines.length < 2) {
      const root = document.querySelector("main") || document.body;
      if (root) lines.push(cellText(root));
    }
    return maskHoldingsPage(lines.join("\n"));
  }

  globalThis.collectEggHoldingsText = collectEggHoldingsText;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "collect" || sender.id !== chrome.runtime.id) return;
    sendResponse({ text: collectEggHoldingsText() });
  });
})();
