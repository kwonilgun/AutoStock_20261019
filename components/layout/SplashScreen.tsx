"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { usePathname } from "next/navigation";
import logo from "../../rootoneai.jpg";

const SHOW_MS = 1000;
const FADE_MS = 200;

/** 로그인 폼이 제출되면 켜고, 로그인 화면을 벗어난 뒤에 스플래시가 읽는다. */
export const LOGIN_SPLASH_KEY = "eggbalance-login-splash";

function isAuthPage(pathname: string) {
  return pathname === "/login" || pathname === "/signup";
}

export function SplashScreen() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<"show" | "leave" | "done">(isAuthPage(pathname) ? "done" : "show");

  useLayoutEffect(() => {
    if (phase !== "done") return;
    if (isAuthPage(pathname)) return;
    if (sessionStorage.getItem(LOGIN_SPLASH_KEY) !== "1") return;
    setPhase("show");
  }, [pathname, phase]);

  useEffect(() => {
    if (phase !== "show") return;
    sessionStorage.removeItem(LOGIN_SPLASH_KEY);
    const leaveTimer = window.setTimeout(() => setPhase("leave"), SHOW_MS);
    return () => window.clearTimeout(leaveTimer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "leave") return;
    const doneTimer = window.setTimeout(() => setPhase("done"), FADE_MS);
    return () => window.clearTimeout(doneTimer);
  }, [phase]);

  useEffect(() => {
    if (phase === "done") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [phase]);

  if (phase === "done") return null;

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center bg-[#f2f4f6] transition-opacity duration-200 ${
        phase === "leave" ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <img
        src={logo.src}
        alt="Rootone AI"
        width={logo.width}
        height={logo.height}
        className="h-52 w-52 rounded-full object-cover"
      />
    </div>
  );
}
