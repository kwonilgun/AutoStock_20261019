import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { investorStyleOf, type InvestorStyle } from "@/lib/engine/investor";
import { pickPrefsFromRow, type PickPrefs } from "@/lib/engine/pick-prefs";
import { pickPlanWeeksOf, type PickPlanWeeks } from "@/lib/engine/pick-schedule";
import { loginAllowed } from "@/lib/server/approval";

const COOKIE = "egg_session";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SEEN_GAP_MS = 5 * 60 * 1000;

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: "user" | "admin";
  mustChangePassword: boolean;
  investorStyle: InvestorStyle;
  pickEnabled: boolean;
  pickPrefs: PickPrefs | null;
  planWeeks: PickPlanWeeks;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + THIRTY_DAYS_MS);
  await prisma.$transaction([
    prisma.session.create({
      data: { userId, tokenHash: hashToken(token), expiresAt },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: now, lastSeenAt: now },
    }),
  ]);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  jar.delete(COOKIE);
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt.getTime() <= Date.now()) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (!loginAllowed(session.user)) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  const seenAt = session.user.lastSeenAt?.getTime() ?? 0;
  if (Date.now() - seenAt > SEEN_GAP_MS) {
    const now = new Date();
    console.log(`[use] ${session.user.email}`);
    void prisma.user.update({ where: { id: session.user.id }, data: { lastSeenAt: now } }).catch(() => undefined);
  }
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role === "admin" ? "admin" : "user",
    mustChangePassword: session.user.mustChangePassword,
    investorStyle: investorStyleOf(session.user.investorStyle),
    pickEnabled: session.user.pickEnabled,
    pickPrefs: pickPrefsFromRow({
      instrument: session.user.pickInstrument,
      addTo: session.user.pickAddTo,
      market: session.user.pickMarket,
      aim: session.user.pickAim,
      exclude: session.user.pickExclude,
      sectors: session.user.pickSectors,
    }),
    planWeeks: pickPlanWeeksOf(session.user.pickPlanWeeks),
  };
});
