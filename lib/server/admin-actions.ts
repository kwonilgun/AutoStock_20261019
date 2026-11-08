"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { weightProblem } from "@/lib/engine/targets";
import { PHASES, SLEEVES, type Sleeve } from "@/lib/engine/types";
import { formatDay, seoulDay } from "@/lib/format";
import { RECOMMEND_CATEGORIES, RECOMMEND_LABEL, RECOMMEND_MAX_ITEMS } from "@/lib/recommendations";
import { isReportDate } from "@/lib/reports";
import { createAnalysisReport, deleteAnalysisReport, updateAnalysisReport } from "@/lib/server/analysis-reports";
import { parseWhyNote } from "@/lib/engine/phase-why";
import { currentWhyNotes, parseOverrides, savePhaseSetting } from "@/lib/server/phase-setting";
import { getRecommendationSetting, saveRecommendationSetting } from "@/lib/server/recommendation-setting";
import { hashPassword } from "@/lib/server/password";
import { getCurrentUser } from "@/lib/server/session";
import { forgetViews } from "@/lib/server/view-cache";

/** 비밀번호를 잊은 사용자의 임시 비밀번호. 관리자가 사용자 화면에서 되돌린다. */
const RESET_PASSWORD = "0000";

export type AdminResult = { ok: true; message?: string; id?: string } | { ok: false; message: string };

const phaseSchema = z.enum(PHASES);
const percentSchema = z.coerce.number().min(0).max(100);
const weightsSchema = z.object(Object.fromEntries(SLEEVES.map((sleeve) => [sleeve, percentSchema])) as Record<Sleeve, typeof percentSchema>);

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") throw new Error("관리자만 바꿀 수 있습니다.");
  if (user.mustChangePassword) redirect("/admin/password");
  return user;
}

function fail(error: unknown): AdminResult {
  unstable_rethrow(error);
  if (error instanceof z.ZodError) return { ok: false, message: "입력값을 다시 확인해 주세요." };
  if (error instanceof Error) return { ok: false, message: error.message };
  return { ok: false, message: "저장하지 못했습니다." };
}

async function currentOverrides() {
  const row = await prisma.phaseSetting.findUnique({ where: { id: "global" } });
  return parseOverrides(row?.weightsJson ?? "");
}

export async function adminSetPhase(phase: string): Promise<AdminResult> {
  try {
    const admin = await requireAdmin();
    await savePhaseSetting({ phase: phaseSchema.parse(phase) }, admin.id);
    forgetViews();
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/** 화면은 %로 받는다. 저장은 0.0001 단위 비율로 한다. */
export async function adminSaveWeights(phase: string, percents: Record<string, unknown>): Promise<AdminResult> {
  try {
    const admin = await requireAdmin();
    const parsedPhase = phaseSchema.parse(phase);
    const parsed = weightsSchema.parse(percents);
    const weights = {} as Record<Sleeve, number>;
    for (const sleeve of SLEEVES) weights[sleeve] = Math.round(parsed[sleeve] * 100) / 10000;
    const problem = weightProblem(weights);
    if (problem) return { ok: false, message: problem };
    const overrides = await currentOverrides();
    overrides[parsedPhase] = weights;
    await savePhaseSetting({ overrides }, admin.id);
    forgetViews();
    revalidatePath("/", "layout");
    return { ok: true, message: `${parsedPhase} 비중을 저장했습니다.` };
  } catch (error) {
    return fail(error);
  }
}

const recommendItemSchema = z.object({
  ticker: z.string().trim().max(20),
  name: z.string().trim().max(60),
  note: z.string().trim().max(300),
});

export async function adminSaveRecommendations(category: string, rows: unknown): Promise<AdminResult> {
  try {
    const admin = await requireAdmin();
    const parsedCategory = z.enum(RECOMMEND_CATEGORIES).parse(category);
    const items = z
      .array(recommendItemSchema)
      .parse(rows)
      .filter((row) => row.ticker || row.name);
    if (items.length > RECOMMEND_MAX_ITEMS) {
      return { ok: false, message: `분류마다 ${RECOMMEND_MAX_ITEMS}개까지 추천할 수 있습니다.` };
    }
    const current = await getRecommendationSetting();
    await saveRecommendationSetting({ items: { ...current.items, [parsedCategory]: items } }, admin.id);
    revalidatePath("/");
    revalidatePath("/recommend");
    revalidatePath("/admin/recommend");
    return { ok: true, message: `${RECOMMEND_LABEL[parsedCategory]} 추천 ${items.length}개를 저장했습니다.` };
  } catch (error) {
    return fail(error);
  }
}

function revalidateReports() {
  revalidatePath("/");
  revalidatePath("/recommend");
  revalidatePath("/admin/report");
}

function parseReportText(title: string, body: string) {
  const reportTitle = z.string().trim().max(100).parse(title);
  const reportBody = z.string().trim().max(20000).parse(body);
  if (!reportTitle && !reportBody) return { ok: false as const, message: "제목이나 본문을 적어 주세요." };
  return { ok: true as const, title: reportTitle, body: reportBody };
}

export async function adminSaveReport(date: string, title: string, body: string): Promise<AdminResult> {
  try {
    const admin = await requireAdmin();
    const parsedDate = z.string().parse(date);
    if (!isReportDate(parsedDate, seoulDay())) return { ok: false, message: "날짜는 오늘 또는 지난날을 고르세요." };
    const text = parseReportText(title, body);
    if (!text.ok) return text;
    const created = await createAnalysisReport({ date: parsedDate, title: text.title, body: text.body }, admin.id);
    revalidateReports();
    return { ok: true, id: created.id, message: `${formatDay(parsedDate)} 리포트를 추가했습니다.` };
  } catch (error) {
    return fail(error);
  }
}

export async function adminUpdateReport(id: string, title: string, body: string): Promise<AdminResult> {
  try {
    const admin = await requireAdmin();
    const parsedId = z.string().min(1).parse(id);
    const existing = await prisma.analysisReport.findUnique({ where: { id: parsedId } });
    if (!existing) return { ok: false, message: "없는 리포트입니다." };
    const text = parseReportText(title, body);
    if (!text.ok) return text;
    await updateAnalysisReport(parsedId, { title: text.title, body: text.body }, admin.id);
    revalidateReports();
    return { ok: true, message: `${formatDay(existing.date)} 리포트를 고쳤습니다.` };
  } catch (error) {
    return fail(error);
  }
}

export async function adminDeleteReport(id: string): Promise<AdminResult> {
  try {
    await requireAdmin();
    const parsedId = z.string().min(1).parse(id);
    const existing = await prisma.analysisReport.findUnique({ where: { id: parsedId } });
    if (!existing) return { ok: false, message: "없는 리포트입니다." };
    await deleteAnalysisReport(parsedId);
    revalidateReports();
    return { ok: true, message: `${formatDay(existing.date)} 리포트를 지웠습니다.` };
  } catch (error) {
    return fail(error);
  }
}

const whySectionSchema = z.object({
  title: z.string().trim().max(40),
  body: z.string().trim().max(800),
});

const whyNoteSchema = z.object({
  when: z.string().trim().max(80),
  lead: z.string().trim().max(800),
  sections: z.array(whySectionSchema).max(6),
  close: z.string().trim().max(800),
});

export async function adminSavePhaseWhy(phase: string, note: unknown): Promise<AdminResult> {
  try {
    const admin = await requireAdmin();
    const parsedPhase = phaseSchema.parse(phase);
    const parsed = whyNoteSchema.parse(note);
    const clean = parseWhyNote(parsed);
    if (!clean || !clean.lead) return { ok: false, message: "왜 이 국면인지 본문을 적어 주세요." };
    const notes = await currentWhyNotes();
    notes[parsedPhase] = clean;
    await savePhaseSetting({ whyNotes: notes }, admin.id);
    forgetViews();
    revalidatePath("/", "layout");
    return { ok: true, message: `${parsedPhase} 국면 설명을 저장했습니다.` };
  } catch (error) {
    return fail(error);
  }
}

export async function adminResetPhaseWhy(phase: string): Promise<AdminResult> {
  try {
    const admin = await requireAdmin();
    const parsedPhase = phaseSchema.parse(phase);
    const notes = await currentWhyNotes();
    delete notes[parsedPhase];
    await savePhaseSetting({ whyNotes: notes }, admin.id);
    forgetViews();
    revalidatePath("/", "layout");
    return { ok: true, message: `${parsedPhase} 국면 설명을 기본문으로 되돌렸습니다.` };
  } catch (error) {
    return fail(error);
  }
}

/** 비밀번호를 잊은 회원의 비밀번호를 0000으로 바꾸고, 기존 로그인을 끊는다. */
export async function adminResetUserPassword(userId: string): Promise<AdminResult> {
  try {
    await requireAdmin();
    const id = z.string().min(1).parse(userId);
    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true },
    });
    if (!target || target.role !== "user") return { ok: false, message: "사용자를 찾지 못했습니다." };
    await prisma.$transaction([
      prisma.user.update({
        where: { id: target.id },
        data: { passwordHash: await hashPassword(RESET_PASSWORD) },
      }),
      prisma.session.deleteMany({ where: { userId: target.id } }),
    ]);
    revalidatePath("/admin/users");
    return { ok: true, message: `${target.email} 비밀번호를 0000으로 바꿨습니다.` };
  } catch (error) {
    return fail(error);
  }
}

export async function adminResetWeights(phase: string): Promise<AdminResult> {
  try {
    const admin = await requireAdmin();
    const parsedPhase = phaseSchema.parse(phase);
    const overrides = await currentOverrides();
    delete overrides[parsedPhase];
    await savePhaseSetting({ overrides }, admin.id);
    forgetViews();
    revalidatePath("/", "layout");
    return { ok: true, message: `${parsedPhase} 비중을 기본표로 되돌렸습니다.` };
  } catch (error) {
    return fail(error);
  }
}
