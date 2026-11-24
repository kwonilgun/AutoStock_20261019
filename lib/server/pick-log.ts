"use server";

import { logPickLine } from "@/lib/pick-log";

/** 브라우저에서 난 추천 실패만 서버 터미널에 남긴다. */
export async function logPick(input: unknown): Promise<void> {
  logPickLine(input);
}
