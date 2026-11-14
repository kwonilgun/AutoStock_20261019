/** 관리자는 승인 여부와 관계없이 로그인한다. 일반 회원은 승인이 켜져 있어야 한다. */
export function loginAllowed(user: { role: string; approved: boolean }) {
  return user.role === "admin" || user.approved;
}
