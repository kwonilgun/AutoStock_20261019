"use server";

import { revalidatePath } from "next/cache";
import { SecretBoxError } from "@/lib/server/secret-box";
import { getCurrentUser } from "@/lib/server/session";
import { forgetTossSession } from "@/lib/server/toss";
import { cleanTossKey, deleteTossCredentials, saveTossCredentials, type TossKeyMask } from "@/lib/server/toss-keys";

export type TossKeyActionResult = {
  ok: boolean;
  message: string;
  saved: TossKeyMask | null;
};

function refresh() {
  revalidatePath("/settings");
  revalidatePath("/portfolio");
}

async function memberId(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user || user.role !== "user") return null;
  return user.id;
}

export async function saveTossKeys(clientId: string, clientSecret: string): Promise<TossKeyActionResult> {
  const userId = await memberId();
  if (!userId) return { ok: false, message: "로그인 후 저장할 수 있습니다.", saved: null };
  const id = cleanTossKey(clientId);
  const secret = cleanTossKey(clientSecret);
  if (!id || !secret) {
    return { ok: false, message: "Client ID와 Client Secret을 공백 없이 8자 이상 입력해 주세요.", saved: null };
  }
  try {
    const saved = await saveTossCredentials(userId, id, secret);
    forgetTossSession(userId);
    refresh();
    return { ok: true, message: "저장했습니다. 끝 네 자리만 표시합니다.", saved };
  } catch (error) {
    if (error instanceof SecretBoxError) {
      return { ok: false, message: "서버에 키 암호화 설정이 없습니다.", saved: null };
    }
    return { ok: false, message: "키를 저장하지 못했습니다.", saved: null };
  }
}

export async function deleteTossKeys(): Promise<TossKeyActionResult> {
  const userId = await memberId();
  if (!userId) return { ok: false, message: "로그인 후 삭제할 수 있습니다.", saved: null };
  await deleteTossCredentials(userId);
  forgetTossSession(userId);
  refresh();
  return { ok: true, message: "토스 키를 삭제했습니다.", saved: null };
}
