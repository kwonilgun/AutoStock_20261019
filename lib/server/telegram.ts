import { prisma } from "@/lib/db";
import { isBareTelegramStart, telegramStartCode } from "@/lib/engine/gap-alert";

const LINKED_TEXT = [
  "에그발란스 알림을 연결했습니다.",
  "평일 오전 8시와 오후 2시에, 주식·채권·자산·현금이 설정에서 정한 괴리 범위를 벗어나면 이 채팅으로 보냅니다.",
  "주말과 공휴일에는 쉬고, 벗어난 묶음이 없으면 메시지를 보내지 않습니다.",
].join("\n");

const POLL_MS = 30 * 60 * 1000;

type TelegramChat = { id: number; type?: string };
type TelegramUpdate = {
  update_id: number;
  message?: { text?: string; chat?: TelegramChat };
};

type PollState = { running: boolean; gen: number; chain: Promise<void> };

const pollState = globalThis as unknown as { __eggTelegramPoll?: PollState };

function poll(): PollState {
  if (!pollState.__eggTelegramPoll) {
    pollState.__eggTelegramPoll = { running: false, gen: 0, chain: Promise.resolve() };
  }
  return pollState.__eggTelegramPoll;
}

const pollGen = ++poll().gen;
poll().running = false;

export function telegramToken(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return token ? token : null;
}

async function telegramCall<T>(token: string, method: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { ok?: boolean; description?: string; result?: T };
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.description || "텔레그램 요청이 거절되었습니다.");
  }
  return payload.result as T;
}

export async function telegramUsername(token: string): Promise<string> {
  const me = await telegramCall<{ username?: string }>(token, "getMe", {});
  const username = me.username?.trim();
  if (!username) throw new Error("봇 사용자 이름이 없습니다.");
  return username;
}

export async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  await telegramCall(token, "sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });
}

export function makeLinkCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

const UNLINKED_TEXT = "설정에서 텔레그램 연결을 누른 뒤, 여기로 돌아와 시작을 다시 눌러 주세요.";

async function waitingLinkUsers() {
  return prisma.user.findMany({
    where: { telegramLinkCode: { not: null } },
  });
}

async function userForStart(text: string) {
  const code = telegramStartCode(text);
  if (code) {
    const matched = await prisma.user.findFirst({
      where: { telegramLinkCode: code },
    });
    if (matched) return matched;
  }
  if (!isBareTelegramStart(text) && !code) return null;
  const waiting = await waitingLinkUsers();
  return waiting.length === 1 ? waiting[0] : null;
}

let consumeChain = poll().chain;

/** 쌓인 시작 메시지를 회원 코드와 맞추고, 맞은 채팅에 연결 안내를 보낸다. */
export function consumeTelegramLinks(token: string, timeout = 0): Promise<void> {
  const job = consumeChain.then(() => readTelegramLinks(token, timeout));
  consumeChain = job.catch(() => undefined);
  poll().chain = consumeChain;
  return job;
}

async function readTelegramLinks(token: string, timeout: number): Promise<void> {
  const cursor = await prisma.telegramCursor.upsert({
    where: { id: "global" },
    create: { id: "global", updateId: 0 },
    update: {},
  });
  let offset = cursor.updateId;
  for (let page = 0; page < 5; page += 1) {
    const updates = await telegramCall<TelegramUpdate[]>(token, "getUpdates", {
      offset,
      timeout,
      limit: 100,
      allowed_updates: ["message"],
    });
    if (updates.length === 0) break;
    const linkedChats = new Set<string>();
    for (const update of updates) {
      if (update.update_id >= offset) offset = update.update_id + 1;
      const chat = update.message?.chat;
      const text = update.message?.text ?? "";
      if (!chat || chat.type !== "private") continue;
      if (!isBareTelegramStart(text) && !telegramStartCode(text)) continue;
      const chatId = String(chat.id);
      if (linkedChats.has(chatId)) continue;
      const already = await prisma.user.findFirst({ where: { telegramChatId: chatId }, select: { id: true } });
      if (already) {
        linkedChats.add(chatId);
        continue;
      }
      const user = await userForStart(text);
      if (!user) {
        console.log("[telegram] start did not match a waiting account");
        await sendTelegram(token, chatId, UNLINKED_TEXT);
        continue;
      }
      await sendTelegram(token, chatId, LINKED_TEXT);
      await prisma.user.update({
        where: { id: user.id },
        data: { telegramChatId: chatId, telegramLinkCode: null, telegramLinkExpires: null },
      });
      linkedChats.add(chatId);
      console.log(`[telegram] linked ${user.email}`);
    }
    await prisma.telegramCursor.update({ where: { id: "global" }, data: { updateId: offset } });
    if (updates.length < 100) break;
  }
}

/** 연결 코드가 있는 동안 시작 메시지를 기다렸다가 안내 글을 보낸다. */
export function ensureTelegramPoller(): void {
  const token = telegramToken();
  const state = poll();
  if (!token || state.running) return;
  state.running = true;
  const gen = pollGen;
  void watchTelegramLinks(token, gen).finally(() => {
    if (poll().gen === gen) poll().running = false;
  });
}

async function watchTelegramLinks(token: string, gen: number): Promise<void> {
  await telegramCall(token, "deleteWebhook", { drop_pending_updates: false }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(`[telegram] webhook clear failed ${message}`);
  });
  const deadline = Date.now() + POLL_MS;
  while (Date.now() < deadline && poll().gen === gen) {
    const pending = await waitingLinkUsers();
    if (pending.length === 0 || poll().gen !== gen) return;
    try {
      await consumeTelegramLinks(token, 20);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      console.error(`[telegram] poll ${message}`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}
