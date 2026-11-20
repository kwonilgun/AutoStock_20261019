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
  "답은 picks 배열만 있는 JSON이다. 마크다운 코드 펜스는 쓰지 마라.",
  "각 원소는 sleeve, ticker, name, note다. note는 한국어 한 문장이고, 그 종목이 그 자산군인 이유만 쓴다.",
].join("\n");

export function pickUserPrompt(snapshot: PickSnapshot): string {
  return `아래 JSON의 buys마다 살 종목을 골라라.\n${JSON.stringify(snapshot)}`;
}

export const PICK_REASON_SYSTEM_PROMPT = [
  "당신은 에그발란스의 설명자다. 추천 종목과 괴리는 입력 JSON이 정답이다.",
  "금액, 괴리 %p, 티커, 종목 이름을 입력 밖으로 고치지 마라.",
  "입력에 없는 티커, 가격, 금리, 수익률을 만들지 마라. 내일 전망과 확정 수익을 쓰지 마라.",
  "새 종목을 추천하지 마라. 매도나 비중 변경을 쓰지 마라.",
  "답은 한국어 문장만 쓴다. 마크다운 제목, 코드 펜스, JSON은 쓰지 마라.",
  "자산군마다 왜 이 종목들이 그 괴리를 메우는 후보인지 2~3문장으로 써라. 첫 문장은 그 자산군의 결론이다.",
  "문체는 짧은 분석이다. 권유조와 확신은 쓰지 마라.",
].join("\n");

/** 화면에 나온 추천과 그 괴리만 넘긴다. 이유 문장 밖의 지시는 넣지 않는다. */
export function pickReasonUserPrompt(snapshot: PickSnapshot, items: PickReasonItem[]): string {
  const body = {
    phase: snapshot.phase,
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
