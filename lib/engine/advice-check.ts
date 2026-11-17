import type { AdviceContext } from "./advice-context";
import type { AdviceSections } from "./advice-draft";

const TOKEN = /\b[A-Z]{2,5}\b|\b\d{6}\b/g;

/** 본문에 나와도 티커로 보지 않는 단어. */
const STOP = new Set([
  "ETF",
  "USD",
  "KRW",
  "MMF",
  "AI",
  "IRP",
  "GDP",
  "CPI",
  "FED",
  "NAV",
  "PER",
  "PBR",
  "ROE",
  "JSON",
  "API",
]);

/** 컨텍스트 밖 티커, 또는 유지 자산군을 매수·매도로 말한 응답이면 이유를 돌려준다. */
export function adviceTextProblem(text: AdviceSections, context: AdviceContext): string | null {
  const foreign = foreignTicker(text, context);
  if (foreign) return `컨텍스트에 없는 티커 ${foreign}`;
  const traded = tradedHold(text.actions, context);
  if (traded) return `${traded}은 유지인데 행동 칸에서 매매로 말함`;
  return null;
}

function foreignTicker(text: AdviceSections, context: AdviceContext): string | null {
  const allowed = new Set<string>([context.phase.id]);
  for (const row of context.holdings) allowed.add(row.ticker.toUpperCase());
  for (const row of context.orders) allowed.add(row.ticker.toUpperCase());
  for (const row of context.deferred) allowed.add(row.ticker.toUpperCase());
  const blob = `${text.phase}\n${text.portfolio}\n${text.actions}\n${text.leave}`;
  for (const token of blob.match(TOKEN) ?? []) {
    if (STOP.has(token) || allowed.has(token)) continue;
    return token;
  }
  return null;
}

function tradedHold(actions: string, context: AdviceContext): string | null {
  const quiet = new Set(
    context.sleeves.filter((sleeve) => sleeve.status === "hold" || sleeve.status === "match").map((sleeve) => sleeve.label),
  );
  for (const part of actions.split(/[.。\n]/)) {
    if (!part.includes("매수") && !part.includes("매도")) continue;
    for (const label of quiet) {
      if (part.includes(label)) return label;
    }
  }
  return null;
}
