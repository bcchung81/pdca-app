// 「접속 기록」 화면(app/(app)/admin/access-log/page.tsx)의 순수 부분: 행위·내려받기 종류 한국어 이름, 기간 거르기, 더 보기 상한, 일시 표기, 덧붙임 한 줄.
// detail은 jsonb라 문자열로만 다룸(화면은 React 기본 이스케이프로 그림). 입출력 없음 — 시험 access-log-view.test.ts.

import type { AccessAction } from "./access-log-core.ts";

export const ACTION_NAME: Record<AccessAction, string> = {
  login: "로그인",
  visit: "첫 접속(하루)",
  download: "내려받기",
  user_manage: "사용자 관리",
  ai_switch: "AI 스위치",
};
export const isAccessAction = (v: string): v is AccessAction => v in ACTION_NAME;
export const actionName = (a: string) => (isAccessAction(a) ? ACTION_NAME[a] : a);

/** 내려받기 종류(lib/ops/access-log-core.ts DownloadKind) */
export const DOWNLOAD_NAME: Record<string, string> = {
  card_hwpx: "카드 한글",
  card_hwpx_screen: "카드 한글(화면 그대로)",
  report_hwpx: "경평 초안 한글",
  report_hwpx_screen: "경평 초안 한글(화면 그대로)",
  report_html: "경평 초안 HTML",
  unit_hwpx: "지표 한 파일 한글",
  inspection_summary_md: "월간 점검 취합 보고(MD)",
  cards_csv: "과제 원장 목록(CSV)",
  inspections_csv: "월간 점검 결과(CSV)",
};

/** 사용자 관리 작업(app/(app)/users/actions.ts) */
export const OP_NAME: Record<string, string> = {
  updateUser: "이름·팀·역할 바꾸기",
  inviteUser: "계정 만들기",
  setUserActive: "사용 중지·재개",
  setUserAssignments: "담당 과제 맞추기",
  applyUserPaste: "일괄 등록",
};

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** 덧붙임 한 줄(내려받기 종류·파일 이름, 작업 이름·건수, 스위치 켜고 끈 것). 모르는 모양이면 빈 글 */
export function detailText(action: string, detail: unknown): string {
  const d = isObj(detail) ? detail : {};
  const parts: string[] = [];
  if (action === "download") {
    const kind = str(d.kind);
    if (kind) parts.push(DOWNLOAD_NAME[kind] ?? kind);
    if (str(d.name)) parts.push(str(d.name));
    if (num(d.count) !== null) parts.push(`${num(d.count)}줄`);
  } else if (action === "user_manage") {
    const op = str(d.op);
    if (op) parts.push(OP_NAME[op] ?? op);
    if (typeof d.active === "boolean") parts.push(d.active ? "재개" : "중지");
    if (num(d.added) !== null || num(d.removed) !== null) parts.push(`추가 ${num(d.added) ?? 0} · 제외 ${num(d.removed) ?? 0}`);
    if (num(d.count) !== null) parts.push(`${num(d.count)}명${num(d.errors) ? ` · 실패 ${num(d.errors)}` : ""}`);
  } else if (action === "ai_switch") {
    if (typeof d.on === "boolean") parts.push(d.on ? "멈춤" : "다시 켬");
    if (str(d.reason)) parts.push(str(d.reason));
  }
  if (d.truncated === true) parts.push("(줄임)");
  return parts.join(" · ");
}

// ── 거르기 ────────────────────────────────────────────────────────────────────────────────
export const LOG_PERIODS = ["today", "d7", "d30", "thisMonth", "lastMonth"] as const;
export type LogPeriod = (typeof LOG_PERIODS)[number];
export const LOG_PERIOD_NAME: Record<LogPeriod, string> = { today: "오늘", d7: "최근 7일", d30: "최근 30일", thisMonth: "이번 달", lastMonth: "지난달" };
export const DEFAULT_LOG_PERIOD: LogPeriod = "d7";
export const isLogPeriod = (v: string): v is LogPeriod => (LOG_PERIODS as readonly string[]).includes(v);

const DAY = 86_400_000;
/** 서울 기준 날짜 경계(+09:00) */
const seoulParts = (now: Date) => {
  const s = new Date(now.getTime() + 9 * 3_600_000);
  return { y: s.getUTCFullYear(), m: s.getUTCMonth() + 1, d: s.getUTCDate() };
};
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00+09:00`;

/** 기간 → [시작, 끝) ISO. 끝이 null이면 지금까지. 오늘·이번 달·지난달은 서울 자정·달 경계, 최근 N일은 지금부터 N×24시간 */
export function logRange(period: LogPeriod, now: Date): { from: string; to: string | null } {
  const { y, m, d } = seoulParts(now);
  if (period === "today") return { from: iso(y, m, d), to: null };
  if (period === "d7" || period === "d30") return { from: new Date(now.getTime() - (period === "d7" ? 7 : 30) * DAY).toISOString(), to: null };
  if (period === "thisMonth") return { from: iso(y, m, 1), to: null };
  const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
  return { from: iso(py, pm, 1), to: iso(y, m, 1) };
}

/** 한 번에 보이는 줄 수·더 보기 상한·통계용으로 읽는 줄 상한 */
export const LOG_PAGE = 200;
export const LOG_MAX = 2000;
export const LOG_STAT_READ = 20_000;

/** ?n= → 보일 줄 수(200 단위, 상한 LOG_MAX) */
export function logLimit(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < LOG_PAGE) return LOG_PAGE;
  return Math.min(LOG_MAX, Math.ceil(n / LOG_PAGE) * LOG_PAGE);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 사용자 거르기·대상 풀기: uuid 모양만 */
export const asUuid = (v: string): string | null => (UUID.test(v) ? v.toLowerCase() : null);

/** 일시(서울) 「YYYY-MM-DD HH:mm:ss」 */
export function fmtLogTime(at: string): string {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return "—";
  return new Date(t + 9 * 3_600_000).toISOString().slice(0, 19).replace("T", " ");
}
