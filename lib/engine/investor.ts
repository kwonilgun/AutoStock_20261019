export const INVESTOR_STYLES = ["income", "balance", "growth"] as const;

export type InvestorStyle = (typeof INVESTOR_STYLES)[number];

export const INVESTOR_STYLE_META: Record<InvestorStyle, { label: string; summary: string }> = {
  income: {
    label: "생활비 우선",
    summary: "매달 쓸 현금흐름을 먼저 지킵니다.",
  },
  balance: {
    label: "균형",
    summary: "생활비와 자산 성장을 같이 봅니다.",
  },
  growth: {
    label: "성장 여유",
    summary: "당장 배당보다 싼 자산을 더 담아도 됩니다.",
  },
};

export function investorStyleOf(value: string | null | undefined): InvestorStyle {
  if (value === "income" || value === "balance" || value === "growth") return value;
  return "income";
}
