import { claudeAdviceBody } from "@/lib/advice-claude";
import type { MemberProvider } from "@/lib/advice-model";
import type { AdviceContext } from "@/lib/engine/advice-context";
import { ADVICE_SYSTEM_PROMPT, adviceUserPrompt } from "@/lib/engine/advice-prompt";

export type SparkModelConfig = {
  url: string;
  model: string;
  key: string;
};

const MEMBER_MODEL: Record<MemberProvider, { env: string; fallback: string }> = {
  openai: { env: "ADVICE_OPENAI_MODEL", fallback: "gpt-6.2-sol" },
  anthropic: { env: "ADVICE_ANTHROPIC_MODEL", fallback: "claude-sonnet-5-5" },
  google: { env: "ADVICE_GOOGLE_MODEL", fallback: "gemini-3.8-flash" },
};

export function memberModelName(provider: MemberProvider): string {
  return process.env[MEMBER_MODEL[provider].env]?.trim() || MEMBER_MODEL[provider].fallback;
}

export function openAiMessageText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return "";
  const content = (choices[0] as { message?: { content?: unknown } }).message?.content;
  return typeof content === "string" ? content.trim() : "";
}

export function anthropicMessageText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is { type: string; text: string } => {
      return Boolean(block) && typeof block === "object" && (block as { type?: string }).type === "text" && typeof (block as { text?: unknown }).text === "string";
    })
    .map((block) => block.text)
    .join("\n")
    .trim();
}

export function sparkMessageText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";
  return output
    .filter((item): item is { type?: string; content: string } => {
      return Boolean(item) && typeof item === "object" && (item as { type?: string }).type === "message" && typeof (item as { content?: unknown }).content === "string";
    })
    .map((item) => item.content)
    .join("\n")
    .trim();
}

function redactSecrets(text: string): string {
  return text.replace(/sk-ant-[A-Za-z0-9_\-]+/g, "sk-ant-…").replace(/sk-[A-Za-z0-9_\-]+/g, "sk-…").replace(/AIza[0-9A-Za-z_\-]+/g, "AIza…");
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, label = "advice"): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  console.log(`[${label}] response\n${JSON.stringify({ status: response.status, body: redactSecrets(raw).slice(0, 4000) })}`);
  if (!response.ok) throw new Error(`advice model ${response.status}`);
  return JSON.parse(raw) as unknown;
}

/** 오늘 자문과 보유 가져오기가 같은 LM Studio 주소와 같은 필드로 접속한다. */
export function sparkChatBody(model: string, systemPrompt: string, input: string) {
  return {
    model,
    system_prompt: systemPrompt,
    input,
    temperature: 0.2,
    reasoning: "off" as const,
    store: false,
  };
}

export async function askSpark(config: SparkModelConfig, systemPrompt: string, input: string, label = "advice"): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.key) headers.Authorization = `Bearer ${config.key}`;
  const url = `${config.url}/api/v1/chat`;
  const body = sparkChatBody(config.model, systemPrompt, input);
  const requestLog =
    label === "advice"
      ? { url, model: config.model, key: config.key ? "(set)" : "(empty)", body }
      : { url, model: config.model, key: config.key ? "(set)" : "(empty)", chars: input.length };
  console.log(`[${label}] request\n${JSON.stringify(requestLog, null, label === "advice" ? 2 : 0)}`);
  const payload = await postJson(url, headers, body, label);
  const content = sparkMessageText(payload) || openAiMessageText(payload);
  if (!content) throw new Error("advice model empty");
  return content;
}

export async function completeSpark(config: SparkModelConfig, context: AdviceContext): Promise<string> {
  return askSpark(config, ADVICE_SYSTEM_PROMPT, adviceUserPrompt(context));
}

export async function completeMember(provider: MemberProvider, apiKey: string, context: AdviceContext): Promise<string> {
  const model = memberModelName(provider);
  const user = adviceUserPrompt(context);
  console.log(`[advice] request\n${JSON.stringify({ provider, model, key: "(member)" }, null, 2)}`);
  if (provider === "anthropic") {
    const payload = await postJson(
      "https://api.anthropic.com/v1/messages",
      {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      claudeAdviceBody(model, ADVICE_SYSTEM_PROMPT, user),
    );
    const content = anthropicMessageText(payload);
    if (!content) throw new Error("advice model empty");
    return content;
  }
  const url =
    provider === "openai"
      ? "https://api.openai.com/v1/chat/completions"
      : "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
  const payload = await postJson(
    url,
    { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    {
      model,
      messages: [
        { role: "system", content: ADVICE_SYSTEM_PROMPT },
        { role: "user", content: user },
      ],
      ...(provider === "openai" ? { max_completion_tokens: 4000 } : { max_tokens: 4000 }),
    },
  );
  const content = openAiMessageText(payload);
  if (!content) throw new Error("advice model empty");
  return content;
}
