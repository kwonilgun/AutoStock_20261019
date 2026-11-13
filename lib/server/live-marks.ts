import { headers } from "next/headers";
import { refreshFx } from "@/lib/server/fx";
import { ensurePortfolio } from "@/lib/server/portfolio";
import { oldestAutoQuoteAt, refreshPrices } from "@/lib/server/prices";
import { getCurrentUser } from "@/lib/server/session";
import { forgetViews } from "@/lib/server/view-cache";

const FRESH_MS = 30 * 60 * 1000;

type LiveState = {
  /** 이 시각에 받은 시세가 아직 유효하다. 가장 오래된 수신 시각을 넣는다. */
  at: Map<string, number>;
  inflight: Map<string, Promise<void>>;
};

const globalState = globalThis as unknown as { __eggLiveMarks?: LiveState };

function state(): LiveState {
  if (!globalState.__eggLiveMarks) {
    globalState.__eggLiveMarks = { at: new Map(), inflight: new Map() };
  }
  return globalState.__eggLiveMarks;
}

function remember(userId: string, at: number) {
  state().at.set(userId, at);
}

function storedAt(portfolio: { fxSource: string; fxUpdatedAt: Date; holdings: Parameters<typeof oldestAutoQuoteAt>[0] }): number {
  const times: number[] = [];
  const quotes = oldestAutoQuoteAt(portfolio.holdings);
  if (quotes != null) times.push(quotes);
  if (portfolio.fxSource === "auto") times.push(portfolio.fxUpdatedAt.getTime());
  return times.length > 0 ? Math.min(...times) : Date.now();
}

async function run(userId: string, force = false) {
  const portfolio = await ensurePortfolio(userId);
  const freshAfter = force ? undefined : new Date(Date.now() - FRESH_MS);
  const [fxFetched, pricesFetched] = await Promise.all([
    refreshFx(portfolio, freshAfter),
    refreshPrices(portfolio, freshAfter),
  ]);
  if (fxFetched || pricesFetched || force) {
    remember(userId, Date.now());
    forgetViews(userId);
    return;
  }
  remember(userId, storedAt(portfolio));
}

function join(userId: string, force = false): Promise<void> {
  const current = state();
  const existing = current.inflight.get(userId);
  if (existing) return existing;
  const at = current.at.get(userId);
  if (!force && at != null && Date.now() - at < FRESH_MS) return Promise.resolve();
  const job = run(userId, force).finally(() => {
    const latest = state();
    if (latest.inflight.get(userId) === job) latest.inflight.delete(userId);
  });
  current.inflight.set(userId, job);
  return job;
}

function isPrefetch(headerList: Headers) {
  return (
    headerList.get("next-router-prefetch") === "1" ||
    headerList.get("next-router-segment-prefetch") === "1" ||
    headerList.get("purpose") === "prefetch" ||
    headerList.get("sec-purpose") === "prefetch"
  );
}

function isRscRequest(headerList: Headers) {
  return (
    headerList.get("rsc") === "1" ||
    headerList.has("next-router-state-tree") ||
    headerList.get("sec-fetch-dest") === "empty" ||
    headerList.get("sec-fetch-mode") === "cors"
  );
}

/** 브라우저 새로고침·앱 재실행처럼 HTML을 다시 받는 요청인지. 탭 이동은 해당하지 않는다. */
function isDocumentRefresh(headerList: Headers) {
  if (headerList.get("next-hmr-refresh") === "1") return false;
  if (isRscRequest(headerList)) return false;
  const dest = headerList.get("sec-fetch-dest");
  if (dest === "document") return true;
  const mode = headerList.get("sec-fetch-mode");
  if (mode === "navigate") return true;
  return dest == null && mode == null;
}

/** 30분 주기처럼, 화면 전환과 상관없이 시세와 환율을 바로 다시 받는다. */
export async function forceRefreshLiveMarks(userId: string): Promise<void> {
  await join(userId, true);
}

/**
 * 앱을 새로고침하거나 다시 열 때만 시세와 환율을 다시 받는다.
 * 탭·화면 전환에서는 저장값을 그대로 쓴다.
 */
export async function refreshLiveMarks(): Promise<void> {
  try {
    const headerList = await headers();
    if (isPrefetch(headerList)) return;
    if (!isDocumentRefresh(headerList)) return;
    const user = await getCurrentUser();
    if (!user || user.role === "admin") return;
    await join(user.id, true).catch(() => undefined);
  } catch {
    // 시세를 못 받아도 마지막 저장값으로 화면을 연다.
  }
}
