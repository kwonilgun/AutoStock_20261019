"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AdviceChromeState, AdviceEngine } from "@/lib/advice-model";
import { selectAdviceModel } from "@/lib/server/llm-key-actions";

export function AdviceModelSelect({ advice }: { advice: AdviceChromeState }) {
  const router = useRouter();
  const [value, setValue] = useState<AdviceEngine>(advice.selected);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setValue(advice.selected);
  }, [advice.selected]);

  if (advice.saved.length === 0) return null;

  async function onChange(next: string) {
    const engine: AdviceEngine = next === "openai" || next === "anthropic" || next === "google" ? next : "spark";
    setValue(engine);
    setPending(true);
    await selectAdviceModel(engine);
    router.refresh();
    setPending(false);
  }

  return (
    <select
      aria-label="자문 모델"
      value={value}
      disabled={pending}
      onChange={(event) => void onChange(event.target.value)}
      className="h-10 max-w-[6.75rem] shrink-0 rounded-full bg-white px-2.5 text-[13px] font-semibold text-[#4e5968] outline-none disabled:opacity-60"
    >
      <option value="spark">Spark</option>
      {advice.saved.map((item) => (
        <option key={item.id} value={item.id}>
          {item.label}
        </option>
      ))}
    </select>
  );
}
