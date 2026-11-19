import { cookies } from "next/headers";
import { MEMBER_PROVIDER_META, resolveAdviceEngine, type AdviceChromeState } from "@/lib/advice-model";
import { listSavedProviders } from "@/lib/server/llm-keys";
import { getCurrentUser } from "@/lib/server/session";

const COOKIE = "advice_model";

export async function readAdviceEngine(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE)?.value ?? null;
}

export async function loadAdviceChrome(): Promise<AdviceChromeState> {
  const user = await getCurrentUser();
  if (!user || user.role === "admin") return { selected: "spark", saved: [] };
  const saved = await listSavedProviders(user.id);
  return {
    selected: resolveAdviceEngine(await readAdviceEngine(), saved),
    saved: saved.map((id) => ({ id, label: MEMBER_PROVIDER_META[id].label })),
  };
}

export async function writeAdviceEngine(engine: string): Promise<void> {
  const value = engine === "openai" || engine === "anthropic" || engine === "google" ? engine : "spark";
  const jar = await cookies();
  jar.set(COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
