"use server";

import { pickLogText } from "@/lib/pick-log";

/** 브라우저에서 난 추천 단계를 개발 서버 터미널에 남긴다. */
export async function logPick(input: unknown): Promise<void> {
  console.log(pickLogText(input));
}
