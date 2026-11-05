export type AnalysisReportView = {
  id: string;
  date: string;
  title: string;
  body: string;
  createdAt: string;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 서울 달력의 오늘(`today`, YYYY-MM-DD)까지 허용한다. 없는 날짜와 미래는 거절한다. */
export function isReportDate(value: string, today: string): boolean {
  if (!DATE.test(value) || !DATE.test(today) || value > today) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}
