import { labelPickPrefs } from "./pick-prefs";
import type { PickSnapshot } from "./pick-context";

export type PickReasonItem = {
  sleeve: string;
  ticker: string;
  name: string;
  note: string;
};

export const PICK_SYSTEM_PROMPT = [
  "당신은 에그발란스의 종목 추천자다. 살 금액과 괴리 %p는 입력 JSON이 정답이다.",
  "buys에 있는 자산군만 추천한다. 여기 없는 자산군, 매도, 비중 변경은 쓰지 마라.",
  "금액, 비중, 괴리 %p를 고치지 마라. 가격, 금리, 수익률, 내일 전망을 쓰지 마라.",
  "자산군마다 instrument에 적힌 종류의 상장 종목만 최대 3개 고른다.",
  "티커는 실제 상장 코드만 쓴다. 한국 종목은 6자리 코드, 미국 종목은 영문 티커다.",
  "이미 가진 종목을 더 사도 되고, 그 자산군에 맞는 새 종목을 골라도 된다.",
  "prefs가 있으면 종목 선택에만 쓴다. prefs 때문에 자산군, 금액, 괴리 %p를 바꾸지 마라.",
  "instrument는 ETF 위주, ETF와 개별주, 개별주 위주 중 하나다. ETF 위주면 그 자산군의 ETF만 고른다. 개별주 위주면 개별 주식을 우선하고, 그 자산군에 개별 주식이 없으면 ETF를 쓴다. ETF와 개별주면 둘을 섞는다.",
  "buy는 가진 종목을 더 삼, 반반, 새 종목 중 하나다. 가진 종목을 더 삼이면 holdings에 있는 종목을 우선한다. 새 종목이면 holdings 밖을 우선한다. 반반이면 보유와 새 종목을 섞는다.",
  "market는 한국, 둘 다, 미국 중 하나다. 자산군을 바꾸지 마라. 한국 자산군은 한국 상장, 미국 자산군은 미국 상장을 유지한다. 금, 채권, 부동산처럼 양쪽 상장이 가능한 자산군에서만 market를 쓴다. 한국이면 한국 상장, 미국이면 미국 상장, 둘 다면 시장을 가리지 않는다.",
  "aim은 배당 이자 우선, 둘 다, 가격 상승 우선 중 하나다. 배당 이자 우선이면 그 자산군 안에서 배당이나 이자가 붙는 상품을 우선한다. 가격 상승 우선이면 그 자산군 안에서 가격이 움직이는 상품을 우선한다. 둘 다면 분배와 가격을 가리지 않는다. 자산군 조건은 그대로다.",
  "exclude에 레버리지·인버스가 있으면 레버리지와 인버스 상품을 빼라. 개별 종목이 있으면 개별 주식을 빼라. exclude가 instrument보다 우선이다.",
  "preferSectors에 적힌 섹터가 있으면 그 섹터를 위주로 고른다. 그 자산군에 그 섹터 상품이 없으면 자산군 조건에 맞는 다른 종목을 고른다. preferSectors가 빈 배열이면 섹터를 가리지 마라.",
  "답은 picks 배열만 있는 JSON이다. 마크다운 코드 펜스는 쓰지 마라.",
  "각 원소는 sleeve, ticker, name, note다. note는 한국어 한 문장이고, 그 종목이 그 자산군인 이유만 쓴다.",
].join("\n");

export function pickUserPrompt(snapshot: PickSnapshot): string {
  const prefs = snapshot.prefs ? labelPickPrefs(snapshot.prefs) : null;
  const body = prefs
    ? { phase: snapshot.phase, prefs, buys: snapshot.buys }
    : { phase: snapshot.phase, buys: snapshot.buys };
  const lead = prefs
    ? "아래 JSON의 buys마다 살 종목을 골라라. prefs는 종목 선택에만 써라."
    : "아래 JSON의 buys마다 살 종목을 골라라.";
  return `${lead}\n${JSON.stringify(body)}`;
}

export const PICK_REASON_SYSTEM_PROMPT = [
  "당신은 에그발란스의 설명자다. 추천 종목과 괴리는 입력 JSON이 정답이다.",
  "금액, 괴리 %p, 티커, 종목 이름을 입력 밖으로 고치지 마라.",
  "입력에 없는 티커, 가격, 금리, 수익률을 만들지 마라. 내일 전망과 확정 수익을 쓰지 마라.",
  "새 종목을 추천하지 마라. 매도나 비중 변경을 쓰지 마라.",
  "답은 한국어 문장만 쓴다. 마크다운 제목, 코드 펜스, JSON은 쓰지 마라.",
  "자산군마다 왜 이 종목들이 그 괴리를 메우는 후보인지 2~3문장으로 써라. 첫 문장은 그 자산군의 결론이다.",
  "prefs가 있으면 그 기준으로 고른 이유를 한 문장에 포함한다. prefs에 없는 성향은 만들지 마라.",
  "문체는 짧은 분석이다. 권유조와 확신은 쓰지 마라.",
].join("\n");

/** 화면에 나온 추천과 그 괴리만 넘긴다. 이유 문장 밖의 지시는 넣지 않는다. */
export function pickReasonUserPrompt(snapshot: PickSnapshot, items: PickReasonItem[]): string {
  const body = {
    phase: snapshot.phase,
    ...(snapshot.prefs ? { prefs: labelPickPrefs(snapshot.prefs) } : {}),
    buys: snapshot.buys,
    picks: items.map((item) => ({
      sleeve: item.sleeve,
      label: snapshot.buys.find((buy) => buy.sleeve === item.sleeve)?.label ?? item.sleeve,
      ticker: item.ticker,
      name: item.name,
      note: item.note,
    })),
  };
  return `아래 JSON만 근거로, 이 종목들을 이렇게 추천한 이유를 써라.\n${JSON.stringify(body)}`;
}
