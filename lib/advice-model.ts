export const MEMBER_PROVIDERS = ["openai", "anthropic", "google"] as const;

export type MemberProvider = (typeof MEMBER_PROVIDERS)[number];

export type AdviceEngine = "spark" | MemberProvider;

export type AdviceModelOption = {
  id: MemberProvider;
  label: string;
};

export type AdviceChromeState = {
  selected: AdviceEngine;
  saved: AdviceModelOption[];
};

export type LlmKeyMask = {
  provider: MemberProvider;
  last4: string;
  /** 설정 화면에서 회원이 확인하는 키. 복호화에 실패하면 null. */
  secret: string | null;
};

export const MEMBER_PROVIDER_META: Record<MemberProvider, { label: string; hint: string }> = {
  openai: { label: "GPT", hint: "platform.openai.com에서 발급한 키" },
  anthropic: { label: "Claude", hint: "console.anthropic.com에서 발급한 키" },
  google: { label: "Gemini", hint: "aistudio.google.com에서 발급한 키" },
};

export function adviceEngineLabel(engine: AdviceEngine | "draft"): string {
  if (engine === "spark") return "Qwen";
  if (engine === "draft") return "초안";
  return MEMBER_PROVIDER_META[engine].label;
}

export function memberProvider(value: string | null | undefined): MemberProvider | null {
  if (value === "openai" || value === "anthropic" || value === "google") return value;
  return null;
}

/** 저장한 키가 있는 모델만 선택으로 인정한다. 없거나 지워졌으면 Spark. */
export function resolveAdviceEngine(selected: string | null | undefined, saved: readonly string[]): AdviceEngine {
  const provider = memberProvider(selected);
  if (provider && saved.includes(provider)) return provider;
  return "spark";
}

export function keyLast4(secret: string): string {
  return secret.trim().slice(-4);
}
