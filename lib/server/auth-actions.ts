"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { investorStyleOf } from "@/lib/engine/investor";
import { prisma } from "@/lib/db";
import { ADMIN_ID, ensureAdminAccount, isUniqueEmailError, registerUser } from "@/lib/server/account";
import { loginAllowed } from "@/lib/server/approval";
import { hashPassword, verifyPassword } from "@/lib/server/password";
import { createSession, destroySession, getCurrentUser } from "@/lib/server/session";
import { forgetViews } from "@/lib/server/view-cache";

export type AuthState = { message: string; ok?: boolean } | null;

const credentials = z.object({
  email: z.string().trim().toLowerCase().email("이메일 형식을 확인해 주세요.").max(200),
  password: z.string().min(4, "비밀번호는 4자 이상이어야 합니다.").max(128, "비밀번호가 너무 깁니다."),
});

/** 로그인은 이메일 외에 관리자 ID도 받는다. 비밀번호 길이는 가입·변경 때만 검사한다. */
const loginCredentials = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .refine((value) => value === ADMIN_ID || z.string().email().safeParse(value).success, "이메일 형식을 확인해 주세요."),
  password: z.string().min(1, "비밀번호를 입력해 주세요.").max(128, "비밀번호가 너무 깁니다."),
});

function fieldMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? "입력값을 다시 확인해 주세요.";
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginCredentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { message: fieldMessage(parsed.error) };
  if (parsed.data.email === ADMIN_ID) await ensureAdminAccount();
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  const valid = await verifyPassword(parsed.data.password, user?.passwordHash);
  if (!user || !valid) return { message: "아이디(이메일) 또는 비밀번호가 올바르지 않습니다." };
  if (!loginAllowed(user)) {
    return { message: "관리자 승인 전에는 로그인할 수 없습니다. 승인 후 다시 시도해 주세요." };
  }
  await createSession(user.id);
  if (user.role === "admin") redirect(user.mustChangePassword ? "/admin/password" : "/admin");
  redirect("/");
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { message: fieldMessage(parsed.error) };
  try {
    await registerUser(parsed.data.email, parsed.data.password);
  } catch (error) {
    if (isUniqueEmailError(error)) return { message: "이미 가입된 이메일입니다." };
    return { message: "가입하지 못했습니다. 잠시 뒤 다시 시도해 주세요." };
  }
  redirect("/login?joined=1");
}

export async function signOut() {
  await destroySession();
  redirect("/login?reset=1");
}

export type PasswordState = { ok: boolean; message: string } | null;

const passwordChange = z
  .object({
    current: z.string().min(1, "지금 비밀번호를 입력해 주세요."),
    next: z.string().min(4, "새 비밀번호는 4자 이상이어야 합니다.").max(128, "비밀번호가 너무 깁니다."),
    confirm: z.string(),
  })
  .refine((value) => value.next === value.confirm, { message: "새 비밀번호 확인이 일치하지 않습니다." })
  .refine((value) => value.next !== value.current, { message: "지금 비밀번호와 다른 비밀번호를 입력해 주세요." });

export async function changePassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const parsed = passwordChange.safeParse({
    current: formData.get("current"),
    next: formData.get("next"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { ok: false, message: fieldMessage(parsed.error) };
  const record = await prisma.user.findUnique({ where: { id: user.id } });
  const valid = await verifyPassword(parsed.data.current, record?.passwordHash);
  if (!record || !valid) return { ok: false, message: "지금 비밀번호가 올바르지 않습니다." };
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.next), mustChangePassword: false },
  });
  if (user.role === "admin") redirect("/admin");
  return { ok: true, message: "비밀번호를 변경했습니다." };
}

export async function setInvestorStyle(style: string): Promise<{ ok: boolean; message: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") return { ok: false, message: "관리자 계정에는 투자 성향이 없습니다." };
  const next = investorStyleOf(style);
  if (next !== style) return { ok: false, message: "성향을 다시 골라 주세요." };
  await prisma.user.update({
    where: { id: user.id },
    data: { investorStyle: next },
  });
  forgetViews(user.id);
  revalidatePath("/");
  revalidatePath("/gap");
  revalidatePath("/settings");
  return { ok: true, message: "투자 성향을 저장했습니다." };
}

export async function deleteAccount(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") return { message: "관리자 계정은 탈퇴할 수 없습니다." };
  const parsed = z.string().min(1, "비밀번호를 입력해 주세요.").safeParse(formData.get("password"));
  if (!parsed.success) return { message: fieldMessage(parsed.error) };
  const record = await prisma.user.findUnique({ where: { id: user.id } });
  const valid = await verifyPassword(parsed.data, record?.passwordHash);
  if (!record || !valid) return { message: "비밀번호가 올바르지 않습니다." };
  await prisma.user.delete({ where: { id: user.id } });
  forgetViews(user.id);
  await destroySession();
  redirect("/login?reset=1");
}
