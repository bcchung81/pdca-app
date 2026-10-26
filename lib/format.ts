// 화면 표기(서울 시각). 순수 함수라 서버·브라우저·테스트에서 같이 씁니다.

const TZ = "Asia/Seoul";

/** 26.09.25 */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: TZ, year: "2-digit", month: "2-digit", day: "2-digit" }).format(new Date(iso)).replace(/\s/g, "").replace(/\.$/, "");
}

/** 9.25 14:05 */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  );
  return `${p.month}.${p.day} ${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

/** 서울 기준 오늘 "2026-09-26" */
export function isoDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "2026-09" → "2026년 9월" */
export function periodLabel(period: string): string {
  const [y, m] = period.split("-");
  return `${y}년 ${Number(m)}월`;
}

/** "2026-09" → "9월" */
export function monthLabel(period: string): string {
  return `${Number(period.split("-")[1])}월`;
}

/** 기준 기간에서 n달 앞뒤 */
export function shiftPeriod(period: string, n: number): string {
  const [y, m] = period.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** YYYY-MM 형식인가 */
export function isPeriod(v: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/** 1234567 → "1,234,567" */
export function fmtInt(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : n.toLocaleString("ko-KR");
}
