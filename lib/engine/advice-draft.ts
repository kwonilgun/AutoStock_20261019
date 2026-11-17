import type { AdviceContext, AdviceHold, AdviceOrder, AdviceSleeve } from "./advice-context";
import { formatNumber, formatPp, formatWonPlain } from "@/lib/format";

export type AdviceSections = {
  phase: string;
  portfolio: string;
  actions: string;
  leave: string;
};

const ACTION_LABEL: Record<AdviceOrder["action"], string> = {
  buy: "매수",
  sell: "매도",
  use_cash: "현금 사용",
  add_cash: "현금 확보",
};

const STATUS_LABEL: Record<AdviceSleeve["status"], string> = {
  over: "과다",
  under: "부족",
  hold: "유지",
  match: "일치",
};

/** 모델 없이 엔진 숫자만으로 네 칸을 채운다. Spark가 없거나 응답이 규칙을 벗어나면 이 글을 보여 준다. */
export function draftAdvice(context: AdviceContext): AdviceSections {
  return {
    phase: phaseParagraph(context),
    portfolio: portfolioParagraph(context),
    actions: actionParagraph(context),
    leave: leaveParagraph(context),
  };
}

function phaseParagraph(context: AdviceContext): string {
  const { phase, fx, fedTarget } = context;
  const bits = [
    `앱이 이번 달로 잡은 국면은 ${phase.id} ${phase.name}입니다.`,
    phase.environment,
    phase.why,
    phase.stance,
  ];
  if (fedTarget.low != null && fedTarget.high != null) {
    const low = fedTarget.low.toFixed(2);
    const high = fedTarget.high.toFixed(2);
    bits.push(`연준 목표금리는 ${low === high ? `${low}%` : `${low}~${high}%`}입니다.`);
  }
  if (fx.USDKRW > 0) bits.push(`원달러는 ${formatNumber(Math.round(fx.USDKRW * 100) / 100)}원입니다.`);
  return bits.join(" ");
}

function portfolioParagraph(context: AdviceContext): string {
  if (context.totalKrw <= 0) return "입력된 보유가 없어 현재 비중과 괴리를 계산하지 않습니다.";
  const off = context.sleeves.filter((sleeve) => sleeve.status === "over" || sleeve.status === "under");
  const quiet = context.sleeves.filter((sleeve) => sleeve.status === "hold" || sleeve.status === "match");
  const head = `총자산은 ${formatWonPlain(context.totalKrw)}입니다.`;
  if (off.length === 0) {
    return `${head} 자산군은 모두 ±2%p 안쪽이라 목표 옆에 있습니다.`;
  }
  const lines = off.map((sleeve) => `${sleeve.label} ${STATUS_LABEL[sleeve.status]} ${formatPp(sleeve.gapPp)} (${gapWon(sleeve)})`);
  const quietLabels = quiet.filter((sleeve) => sleeve.currentWeight > 0 || sleeve.targetWeight > 0).map((sleeve) => sleeve.label);
  const tail = quietLabels.length > 0 ? ` 밴드 안: ${quietLabels.join(", ")}.` : "";
  return `${head} ${lines.join(". ")}.${tail}`;
}

function actionParagraph(context: AdviceContext): string {
  if (context.totalKrw <= 0) return "보유가 없으면 이번 달 주문도 없습니다.";
  if (context.orders.length === 0) {
    return "이번 달 엔진이 만든 주문은 없습니다. 괴리가 ±2%p 안쪽이라 매매하지 않습니다.";
  }
  const lines = context.orders.map(
    (order) => `${order.label} ${order.name || order.ticker} ${ACTION_LABEL[order.action]} ${formatWonPlain(order.amountKrw)}`,
  );
  return `엔진이 만든 주문만 실행합니다. ${lines.join(". ")}.`;
}

function leaveParagraph(context: AdviceContext): string {
  if (context.totalKrw <= 0) return "종목과 현금을 입력한 뒤에 괴리를 봅니다.";
  if (context.holds.length === 0 && context.orders.length === 0) {
    return "맞출 주문이 없습니다. 비중은 그대로 둡니다.";
  }
  if (context.holds.length === 0) return "주문에 없는 자산군은 그대로 둡니다.";
  return `±2%p 안쪽은 그대로 둡니다. ${context.holds.map(holdLine).join(" ")}`;
}

function holdLine(hold: AdviceHold): string {
  return hold.reason.endsWith(".") ? hold.reason : `${hold.reason}.`;
}

function gapWon(sleeve: AdviceSleeve): string {
  const amount = Math.abs(sleeve.gapKrw);
  if (sleeve.gapKrw < 0) return `목표보다 ${formatWonPlain(amount)} 많음`;
  if (sleeve.gapKrw > 0) return `목표보다 ${formatWonPlain(amount)} 적음`;
  return "목표와 같음";
}
