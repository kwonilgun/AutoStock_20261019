import { getCurrentUser } from "@/lib/server/session";
import { readTossCredentials } from "@/lib/server/toss-keys";
import { parseTossAccountSeq, parseTossHoldings, type TossHolding } from "@/lib/toss/parse";

const BASE_URL = "https://openapi.tossinvest.com";

export type TossHoldingsResult =
  | { status: "ready"; items: TossHolding[] }
  | { status: "unconfigured" }
  | { status: "hidden" }
  | { status: "error"; message: string };

class TossHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super("toss");
  }
}

type Session = { token: string; expiresAt: number; accountSeq: number };

const sessions = new Map<string, Session>();

export function forgetTossSession(userId: string) {
  sessions.delete(userId);
}

function errorCode(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const oauth = (body as { error?: unknown }).error;
  if (typeof oauth === "string") return oauth;
  const code = oauth && typeof oauth === "object" ? (oauth as { code?: unknown }).code : "";
  return typeof code === "string" ? code : "";
}

function messageFor(error: unknown): string {
  if (error instanceof TossHttpError) {
    if (error.status === 401 || error.code === "invalid_client") return "토스증권 API 키를 확인해 주세요.";
    if (error.status === 403) return "이 서버 IP가 토스증권 허용 목록에 없습니다.";
    if (error.status === 429) return "토스증권 호출 한도에 걸렸습니다. 잠시 후 다시 열어 주세요.";
    return "토스증권 보유 종목을 가져오지 못했습니다.";
  }
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return "토스증권 응답이 지연되었습니다.";
  }
  if (error instanceof Error && error.message === "보유 응답 형식이 아닙니다.") {
    return "토스증권 보유 종목을 읽지 못했습니다.";
  }
  return "토스증권에 연결하지 못했습니다.";
}

async function tossFetch(path: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new TossHttpError(response.status, errorCode(body));
  return body;
}

async function accessToken(clientId: string, clientSecret: string): Promise<{ token: string; expiresAt: number }> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  const payload = await tossFetch("/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const token = payload && typeof payload === "object" ? (payload as { access_token?: unknown }).access_token : "";
  const expiresIn = payload && typeof payload === "object" ? (payload as { expires_in?: unknown }).expires_in : 0;
  if (typeof token !== "string" || !token) throw new Error("token");
  const seconds = typeof expiresIn === "number" && expiresIn > 120 ? expiresIn : 3600;
  return { token, expiresAt: Date.now() + (seconds - 60) * 1000 };
}

async function accountSeq(token: string): Promise<number> {
  const payload = await tossFetch("/api/v1/accounts", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const seq = parseTossAccountSeq(payload);
  if (seq == null) throw new Error("account");
  return seq;
}

async function openSession(userId: string, keys: { clientId: string; clientSecret: string }): Promise<Session> {
  const cached = sessions.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached;
  const issued = await accessToken(keys.clientId, keys.clientSecret);
  const seq = await accountSeq(issued.token);
  const session = { token: issued.token, expiresAt: issued.expiresAt, accountSeq: seq };
  sessions.set(userId, session);
  return session;
}

async function readHoldings(session: Session): Promise<TossHolding[]> {
  const payload = await tossFetch("/api/v1/holdings", {
    headers: {
      Authorization: `Bearer ${session.token}`,
      Accept: "application/json",
      "X-Tossinvest-Account": String(session.accountSeq),
    },
  });
  return parseTossHoldings(payload);
}

/** 로그인한 회원이 설정에 저장한 키로 보유 종목을 읽는다. 키와 계좌번호는 반환하지 않는다. */
export async function loadTossHoldings(): Promise<TossHoldingsResult> {
  const user = await getCurrentUser();
  if (!user || user.role !== "user") return { status: "hidden" };
  const keys = await readTossCredentials(user.id);
  if (keys === "corrupt") return { status: "error", message: "저장된 토스 키를 읽지 못했습니다. 설정에서 다시 저장해 주세요." };
  if (!keys) return { status: "unconfigured" };
  try {
    let session = await openSession(user.id, keys);
    try {
      return { status: "ready", items: await readHoldings(session) };
    } catch (error) {
      if (!(error instanceof TossHttpError) || error.status !== 401) throw error;
      forgetTossSession(user.id);
      session = await openSession(user.id, keys);
      return { status: "ready", items: await readHoldings(session) };
    }
  } catch (error) {
    if (error instanceof Error && error.message === "account") {
      return { status: "error", message: "종합매매 계좌를 찾지 못했습니다." };
    }
    if (error instanceof Error && error.message === "token") {
      return { status: "error", message: "토스증권 API 키를 확인해 주세요." };
    }
    return { status: "error", message: messageFor(error) };
  }
}
