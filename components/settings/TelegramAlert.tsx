"use client";

import { useEffect, useState, useTransition } from "react";
import {
  confirmTelegramLink,
  refreshTelegramLink,
  saveTelegramGapBand,
  sendTelegramGapNow,
  startTelegramLink,
  unlinkTelegram,
} from "@/lib/server/telegram-actions";

const inputClass =
  "h-10 w-20 rounded-xl bg-[#f2f4f6] px-3 text-right text-[16px] font-bold text-[#191f28] outline-none ring-[#3182f6] [appearance:textfield] focus:ring-2 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

export function TelegramAlert({
  linked,
  botReady,
  over,
  under,
}: {
  linked: boolean;
  botReady: boolean;
  over: number;
  under: number;
}) {
  const [connected, setConnected] = useState(linked);
  const [url, setUrl] = useState<string | null>(null);
  const [overText, setOverText] = useState(String(over));
  const [underText, setUnderText] = useState(String(under));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!url || connected) return;
    let stop = false;
    const tick = async () => {
      const linkedNow = await refreshTelegramLink();
      if (stop || !linkedNow) return;
      setConnected(true);
      setUrl(null);
      setMessage("연결했습니다. 평일 오전 8시와 오후 2시에 설정한 범위를 벗어난 괴리만 옵니다.");
    };
    const id = window.setInterval(() => void tick(), 3000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [url, connected]);

  return (
    <section className="rounded-[22px] bg-white px-5 py-5">
      <p className="text-[13px] font-medium text-[#8b95a1]">괴리 알림</p>
      <p className="mt-1 text-[16px] font-bold text-[#191f28]">텔레그램</p>
      <p className="mt-1.5 text-[13px] leading-5 text-[#6b7684]">
        평일 오전 8시와 오후 2시에 주식, 채권, 자산, 현금 중 아래 범위를 벗어난 묶음만 이 계정으로 보냅니다. 주말과 공휴일에는
        쉬고, 벗어난 묶음이 없으면 메시지를 보내지 않습니다. 지금 보내기도 같은 범위만 바로 보냅니다.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <label className="flex items-center justify-between gap-3">
          <span className="text-[14px] font-semibold text-[#191f28]">플러스</span>
          <span className="flex items-center gap-2">
            <input
              inputMode="decimal"
              value={overText}
              onChange={(event) => setOverText(event.target.value)}
              className={inputClass}
              aria-label="플러스 괴리"
            />
            <span className="w-12 text-[13px] font-medium text-[#6b7684]">%p 이상</span>
          </span>
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-[14px] font-semibold text-[#191f28]">마이너스</span>
          <span className="flex items-center gap-2">
            <input
              inputMode="decimal"
              value={underText}
              onChange={(event) => setUnderText(event.target.value)}
              className={inputClass}
              aria-label="마이너스 괴리"
            />
            <span className="w-12 text-[13px] font-medium text-[#6b7684]">%p 이하</span>
          </span>
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setMessage(null);
            start(async () => {
              const result = await saveTelegramGapBand(overText, underText);
              setMessage(result.message);
              if (result.ok) {
                setOverText(String(result.over));
                setUnderText(String(result.under));
              }
            });
          }}
          className="mt-1 inline-flex h-11 items-center self-start rounded-xl bg-[#f2f4f6] px-4 text-[15px] font-semibold text-[#191f28] disabled:opacity-50"
        >
          범위 저장
        </button>
      </div>
      {message ? <p className="mt-2 text-[13px] font-medium text-[#3182f6]">{message}</p> : null}
      <div className="mt-3 flex flex-col items-start gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setMessage(null);
            start(async () => {
              const result = await sendTelegramGapNow(overText, underText);
              setMessage(result.message);
              if (result.over !== undefined && result.under !== undefined) {
                setOverText(String(result.over));
                setUnderText(String(result.under));
              }
            });
          }}
          className="inline-flex h-11 items-center rounded-xl bg-[#3182f6] px-4 text-[15px] font-semibold text-white disabled:opacity-50"
        >
          지금 보내기
        </button>
        {!botReady ? (
          <p className="text-[13px] leading-5 text-[#6b7684]">
            .env에 TELEGRAM_BOT_TOKEN을 넣고 서버를 다시 시작하세요. 토큰은 BotFather에서 봇을 만들면 나옵니다.
          </p>
        ) : null}
        {connected ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setMessage(null);
              start(async () => {
                const result = await unlinkTelegram();
                setMessage(result.message);
                if (result.ok) {
                  setConnected(false);
                  setUrl(null);
                }
              });
            }}
            className="text-[14px] font-semibold text-[#8b95a1] disabled:opacity-50"
          >
            연결 해제
          </button>
        ) : null}
      </div>
      {botReady && !connected ? (
        <div className="mt-3 flex flex-col items-start gap-2">
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center rounded-xl bg-[#3182f6] px-4 text-[15px] font-semibold text-white"
            >
              텔레그램에서 열기
            </a>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setMessage(null);
                start(async () => {
                  const result = await startTelegramLink();
                  if (!result.ok) {
                    setMessage(result.message);
                    return;
                  }
                  setUrl(result.url);
                  setMessage("시작을 누르면 봇이 연결 안내를 보냅니다. 안내가 오면 이 화면도 연결됨으로 바뀝니다.");
                });
              }}
              className="inline-flex h-11 items-center rounded-xl bg-[#3182f6] px-4 text-[15px] font-semibold text-white disabled:opacity-50"
            >
              텔레그램 연결
            </button>
          )}
          {url ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setMessage(null);
                start(async () => {
                  const result = await confirmTelegramLink();
                  setMessage(result.message);
                  if (result.ok) setConnected(true);
                });
              }}
              className="text-[14px] font-semibold text-[#3182f6] disabled:opacity-50"
            >
              연결 확인
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
