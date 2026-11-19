/** 자산 자동 추가가 이 브라우저에 둔 Claude 키. 서버에는 저장하지 않는다. */
export const BROWSER_CLAUDE_KEY = "eggbalance.brave.claudeApiKey";
export const BROWSER_CLAUDE_WORKSPACE = "eggbalance.brave.claudeWorkspaceId";
/** 키 자체는 넣지 않는다. 오늘 자문이 이 브라우저 키를 쓸지만 서버에 알린다. */
export const BROWSER_CLAUDE_COOKIE = "advice_claude_browser";

export type BrowserClaudeCredential = {
  apiKey: string;
  workspaceId: string;
};

function notifyBrowserClaudeKey(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("eggbalance-claude-key"));
}

function readStored(name: string): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(name)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function readBrowserClaudeCredential(): BrowserClaudeCredential | null {
  const apiKey = readStored(BROWSER_CLAUDE_KEY);
  if (!apiKey) return null;
  return { apiKey, workspaceId: readStored(BROWSER_CLAUDE_WORKSPACE) };
}

export function rememberBrowserClaude(apiKey: string, workspaceId?: string): void {
  if (typeof window === "undefined") return;
  const key = apiKey.trim();
  if (!key) return;
  try {
    localStorage.setItem(BROWSER_CLAUDE_KEY, key);
    if (workspaceId?.trim()) localStorage.setItem(BROWSER_CLAUDE_WORKSPACE, workspaceId.trim());
  } catch {
    return;
  }
  syncBrowserClaudeCookie(true);
  notifyBrowserClaudeKey();
}

export function rememberBrowserClaudeWorkspace(workspaceId: string): void {
  if (typeof window === "undefined") return;
  const id = workspaceId.trim();
  if (!id) return;
  try {
    localStorage.setItem(BROWSER_CLAUDE_WORKSPACE, id);
  } catch {
    return;
  }
  notifyBrowserClaudeKey();
}

export function forgetBrowserClaudeWorkspace(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(BROWSER_CLAUDE_WORKSPACE);
  } catch {
    return;
  }
  notifyBrowserClaudeKey();
}

export function forgetBrowserClaude(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(BROWSER_CLAUDE_KEY);
    localStorage.removeItem(BROWSER_CLAUDE_WORKSPACE);
  } catch {
    return;
  }
  syncBrowserClaudeCookie(false);
  notifyBrowserClaudeKey();
}

export function subscribeBrowserClaudeKey(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("eggbalance-claude-key", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("eggbalance-claude-key", onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function syncBrowserClaudeCookie(enabled: boolean): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  if (enabled) {
    document.cookie = `${BROWSER_CLAUDE_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    return;
  }
  document.cookie = `${BROWSER_CLAUDE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}
