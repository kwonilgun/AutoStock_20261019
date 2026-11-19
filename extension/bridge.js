const PAGE = "eggbalance-holdings";
const EXT = "eggbalance-extension";

function allowed(origin) {
  return origin === "https://app.linkmedin.com" || origin === "http://localhost:3000";
}

window.addEventListener("message", (event) => {
  if (event.source !== window || !allowed(event.origin)) return;
  const data = event.data;
  if (!data || data.source !== PAGE || typeof data.id !== "string" || typeof data.type !== "string") return;
  chrome.runtime.sendMessage(
    {
      type: data.type,
      apiKey: typeof data.apiKey === "string" ? data.apiKey : undefined,
      workspaceId: typeof data.workspaceId === "string" ? data.workspaceId : undefined,
    },
    (response) => {
    const failure = chrome.runtime.lastError;
    window.postMessage(
      {
        source: EXT,
        id: data.id,
        ok: !failure && response?.ok === true,
        error: failure ? failure.message : typeof response?.error === "string" ? response.error : null,
        hasKey: response?.hasKey === true,
        hasWorkspace: response?.hasWorkspace === true,
        income: response?.income === true,
        holdings: Array.isArray(response?.holdings) ? response.holdings : undefined,
        incomes: Array.isArray(response?.incomes) ? response.incomes : undefined,
        step: typeof response?.step === "string" ? response.step : data.type,
        status: typeof response?.status === "number" ? response.status : null,
        detail: failure ? failure.message : typeof response?.detail === "string" ? response.detail : null,
      },
      event.origin,
    );
  });
});

window.postMessage({ source: EXT, type: "ready" }, window.location.origin);
