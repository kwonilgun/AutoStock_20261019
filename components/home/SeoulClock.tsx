"use client";

import { useEffect, useState } from "react";

const WEEKDAY_KO: Record<string, string> = {
  Sun: "일",
  Mon: "월",
  Tue: "화",
  Wed: "수",
  Thu: "목",
  Fri: "금",
  Sat: "토",
};

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((item) => item.type === type)?.value ?? "";
}

function seoulParts(date: Date): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
}

function seoulLabel(date: Date): string {
  const parts = seoulParts(date);
  const weekday = WEEKDAY_KO[part(parts, "weekday")] ?? "";
  const month = Number(part(parts, "month"));
  const day = Number(part(parts, "day"));
  const hour = part(parts, "hour");
  const minute = part(parts, "minute");
  return `${month}월 ${day}일 (${weekday}) ${hour}:${minute}`;
}

function seoulDateTime(date: Date): string {
  const parts = seoulParts(date);
  return `${part(parts, "year")}-${part(parts, "month")}-${part(parts, "day")}T${part(parts, "hour")}:${part(parts, "minute")}+09:00`;
}

export function SeoulClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <time
      dateTime={now ? seoulDateTime(now) : undefined}
      className="shrink-0 text-[13px] font-medium tabular-nums text-[#8b95a1]"
      suppressHydrationWarning
    >
      {now ? seoulLabel(now) : "\u00a0"}
    </time>
  );
}
