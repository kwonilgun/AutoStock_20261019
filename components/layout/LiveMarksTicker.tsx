"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { refreshQuotesAndFx } from "@/lib/server/actions";

const INTERVAL_MS = 30 * 60 * 1000;

/** 열려 있는 동안 30분마다 시세와 환율을 갱신한다. 화면을 옮겨도 이 타이머만 돌아간다. */
export function LiveMarksTicker() {
  const router = useRouter();

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshQuotesAndFx().finally(() => router.refresh());
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [router]);

  return null;
}
