"use server";

import { revalidatePath } from "next/cache";
import { resolveAdviceEngine } from "@/lib/advice-model";
import { readAdviceEngine, writeAdviceEngine } from "@/lib/server/advice-choice";
import { deleteLlmKey, listSavedProviders, providerFromForm, saveLlmKey } from "@/lib/server/llm-keys";
import { SecretBoxError } from "@/lib/server/secret-box";
import { getCurrentUser } from "@/lib/server/session";

function refresh() {
  revalidatePath("/", "layout");
}

export async function saveMemberLlmKey(
  _prev: { ok: boolean; message: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; message: string } | null> {
  const user = await getCurrentUser();
  if (!user || user.role === "admin") return { ok: false, message: "로그인 후 저장할 수 있습니다." };
  const provider = providerFromForm(formData.get("provider"));
  if (!provider) return { ok: false, message: "모델을 확인해 주세요." };
  const secret = formData.get("secret");
  if (typeof secret !== "string" || secret.trim().length === 0) return { ok: false, message: "키를 입력해 주세요." };
  try {
    await saveLlmKey(user.id, provider, secret);
  } catch (error) {
    if (error instanceof SecretBoxError) return { ok: false, message: "서버에 키 암호화 설정이 없습니다." };
    return { ok: false, message: "키를 저장하지 못했습니다." };
  }
  refresh();
  return { ok: true, message: "저장했습니다." };
}

export async function selectAdviceModel(provider: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || user.role === "admin") return;
  const saved = await listSavedProviders(user.id);
  await writeAdviceEngine(resolveAdviceEngine(provider, saved));
  refresh();
}

export async function deleteMemberLlmKey(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || user.role === "admin") return;
  const provider = providerFromForm(formData.get("provider"));
  if (!provider) return;
  await deleteLlmKey(user.id, provider);
  if ((await readAdviceEngine()) === provider) await writeAdviceEngine("spark");
  refresh();
}
