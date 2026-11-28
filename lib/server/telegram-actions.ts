"use server";

import { prisma } from "@/lib/db";
import { gapAlertBand, parseGapBandInput } from "@/lib/engine/gap-alert";
import { sendCurrentGap } from "@/lib/server/gap-alert-run";
import { getCurrentUser } from "@/lib/server/session";
import { ensureTelegramPoller, makeLinkCode, telegramToken, telegramUsername } from "@/lib/server/telegram";

const LINK_MS = 24 * 60 * 60 * 1000;

export async function readTelegramLink(userId: string): Promise<{
  linked: boolean;
  botReady: boolean;
  over: number;
  under: number;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { telegramChatId: true, telegramLinkCode: true, telegramGapOver: true, telegramGapUnder: true },
  });
  if (user?.telegramLinkCode && !user.telegramChatId) ensureTelegramPoller();
  const band = gapAlertBand(user?.telegramGapOver, user?.telegramGapUnder);
  return { linked: Boolean(user?.telegramChatId), botReady: Boolean(telegramToken()), over: band.over, under: band.under };
}

export async function startTelegramLink(): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const user = await getCurrentUser();
  if (!user || user.role !== "user") return { ok: false, message: "로그인한 회원만 연결할 수 있습니다." };
  const token = telegramToken();
  if (!token) return { ok: false, message: "텔레그램 봇 토큰이 없습니다." };
  try {
    const username = await telegramUsername(token);
    const code = makeLinkCode();
    await prisma.user.update({
      where: { id: user.id },
      data: { telegramLinkCode: code, telegramLinkExpires: new Date(Date.now() + LINK_MS) },
    });
    ensureTelegramPoller();
    return { ok: true, url: `https://t.me/${username}?start=${code}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "텔레그램에 연결하지 못했습니다.";
    return { ok: false, message };
  }
}

export async function refreshTelegramLink(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user || user.role !== "user") return false;
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { telegramChatId: true },
  });
  if (!row?.telegramChatId) ensureTelegramPoller();
  return Boolean(row?.telegramChatId);
}

export async function confirmTelegramLink(): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const user = await getCurrentUser();
  if (!user || user.role !== "user") return { ok: false, message: "로그인한 회원만 연결할 수 있습니다." };
  const token = telegramToken();
  if (!token) return { ok: false, message: "텔레그램 봇 토큰이 없습니다." };
  ensureTelegramPoller();
  const { consumeTelegramLinks } = await import("@/lib/server/telegram");
  try {
    await consumeTelegramLinks(token, 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : "텔레그램 메시지를 확인하지 못했습니다.";
    return { ok: false, message };
  }
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { telegramChatId: true },
  });
  if (!row?.telegramChatId) {
    return { ok: false, message: "아직 시작 메시지가 오지 않았습니다. 텔레그램에서 시작을 누르면 연결 안내가 옵니다." };
  }
  return { ok: true, message: "연결했습니다. 평일 오전 8시와 오후 2시에 설정한 범위를 벗어난 괴리만 옵니다." };
}

export async function saveTelegramGapBand(
  overText: string,
  underText: string,
): Promise<{ ok: true; message: string; over: number; under: number } | { ok: false; message: string }> {
  const user = await getCurrentUser();
  if (!user || user.role !== "user") return { ok: false, message: "로그인한 회원만 저장할 수 있습니다." };
  const over = parseGapBandInput(overText);
  const under = parseGapBandInput(underText);
  if (over === null || under === null) return { ok: false, message: "0에서 100 사이의 숫자를 입력하세요." };
  await prisma.user.update({
    where: { id: user.id },
    data: { telegramGapOver: over, telegramGapUnder: under },
  });
  return { ok: true, message: `플러스 ${over}%p 이상, 마이너스 ${under}%p 이하이면 보냅니다.`, over, under };
}

export async function sendTelegramGapNow(
  overText: string,
  underText: string,
): Promise<{ ok: true; message: string; over: number; under: number } | { ok: false; message: string; over?: number; under?: number }> {
  const user = await getCurrentUser();
  if (!user || user.role !== "user") return { ok: false, message: "로그인한 회원만 보낼 수 있습니다." };
  const over = parseGapBandInput(overText);
  const under = parseGapBandInput(underText);
  if (over === null || under === null) return { ok: false, message: "0에서 100 사이의 숫자를 입력하세요." };
  await prisma.user.update({
    where: { id: user.id },
    data: { telegramGapOver: over, telegramGapUnder: under },
  });
  const row = await prisma.user.findUnique({ where: { id: user.id } });
  if (!row) return { ok: false, message: "계정을 찾지 못했습니다." };
  const sent = await sendCurrentGap(row);
  return { ...sent, over, under };
}

export async function unlinkTelegram(): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const user = await getCurrentUser();
  if (!user || user.role !== "user") return { ok: false, message: "로그인한 회원만 해제할 수 있습니다." };
  await prisma.user.update({
    where: { id: user.id },
    data: { telegramChatId: null, telegramLinkCode: null, telegramLinkExpires: null },
  });
  return { ok: true, message: "텔레그램 연결을 해제했습니다." };
}
