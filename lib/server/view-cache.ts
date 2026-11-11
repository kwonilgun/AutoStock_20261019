import type { Phase } from "@/lib/engine/types";
import { seoulDay } from "@/lib/format";

const TTL_MS = 60_000;

type Slot<T> = {
  day: string;
  at: number;
  view: T;
};

type Flight = { gen: string; promise: Promise<unknown> };

type ViewCacheState = {
  globalGen: number;
  userGen: Map<string, number>;
  slots: Map<string, Slot<unknown>>;
  inflight: Map<string, Flight>;
};

const globalState = globalThis as unknown as { __eggViewCache?: ViewCacheState };

/** 서버 액션과 페이지 렌더가 모듈을 따로 불러도 같은 기억을 쓴다. */
function state(): ViewCacheState {
  const current = globalState.__eggViewCache;
  if (!current?.userGen) {
    globalState.__eggViewCache = {
      globalGen: 0,
      userGen: new Map(),
      slots: new Map(),
      inflight: new Map(),
    };
  }
  return globalState.__eggViewCache!;
}

function generation(userId: string) {
  const current = state();
  return `${current.globalGen}:${current.userGen.get(userId) ?? 0}`;
}

/** 보유·환율·국면을 바꾼 뒤에는 탭 전환용 기억을 지운다. 사용자를 주면 그 사람만 지운다. */
export function forgetViews(userId?: string) {
  const current = state();
  if (userId) {
    current.userGen.set(userId, (current.userGen.get(userId) ?? 0) + 1);
    current.slots.delete(userId);
    return;
  }
  current.globalGen += 1;
  current.userGen.clear();
  current.slots.clear();
}

export function viewGeneration(userId: string) {
  return generation(userId);
}

/** 관리자가 국면을 바꾼 뒤에도 탭 전환 기억이 예전 국면을 보여 주면 안 된다. */
export function cachedViewApplies<T extends { phase: Phase; phaseWhy?: unknown; quantityEvents?: unknown; positionDays?: unknown }>(
  cached: T | null | undefined,
  phase: Phase,
): cached is T {
  return Boolean(
    cached &&
      cached.phase === phase &&
      cached.phaseWhy &&
      Array.isArray(cached.quantityEvents) &&
      Array.isArray(cached.positionDays),
  );
}

export function readView<T>(userId: string): T | null {
  const slot = state().slots.get(userId);
  if (!slot) return null;
  if (slot.day !== seoulDay()) return null;
  if (Date.now() - slot.at > TTL_MS) return null;
  return slot.view as T;
}

export function writeView<T>(userId: string, view: T, gen: string) {
  const current = state();
  if (gen !== generation(userId)) return;
  current.slots.set(userId, { day: seoulDay(), at: Date.now(), view });
}

/** 같은 세대의 동시 요청은 한 번만 계산한다. 삭제 이전에 시작된 계산은 다시 쓰지 않는다. */
export function shareViewLoad<T>(userId: string, start: () => Promise<T>): Promise<T> {
  const current = state();
  const gen = generation(userId);
  const existing = current.inflight.get(userId);
  if (existing && existing.gen === gen) return existing.promise as Promise<T>;
  const pending = start().finally(() => {
    const latest = state().inflight.get(userId);
    if (latest?.promise === pending) state().inflight.delete(userId);
  });
  current.inflight.set(userId, { gen, promise: pending });
  return pending;
}
