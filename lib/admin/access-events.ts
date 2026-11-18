// 권한 변경 기록(access_events) 화면용 순수 함수: action 한국어 이름·detail 한 줄 요약·거르기 값 검사.
// detail은 사용자 값이 섞일 수 있는 jsonb라 문자열로만 다룸(화면은 React 기본 이스케이프로 그림, HTML로 넣지 않음).
// action 목록 출처: 20260930120000·20261116120000·20261117170000 마이그레이션, lib/users/service.ts(user_added·ban_failed).

export const ACTION_LABEL: Record<string, string> = {
  user_added: "계정 만들기",
  user_updated: "역할·팀 변경",
  user_deactivated: "사용 중지",
  user_restored: "사용 재개",
  assigned: "담당 과제 지정",
  unassigned: "담당 과제 해제",
  ban_failed: "사용 중지 반영 실패",
  card_purged: "카드 영구 삭제",
};

/** 모르는 action은 원래 이름 그대로 */
export const actionLabel = (action: string): string => ACTION_LABEL[action] ?? action;

export const ROLE_NAME: Record<string, string> = { dept_user: "부서 담당자", pmo: "성과관리팀", admin: "관리자" };

export interface SummaryLookup {
  /** 팀 id → 이름(없으면 「#N」) */
  team?: (id: number) => string | undefined;
  /** 카드 id → 과제번호(없으면 카드 id 그대로) */
  taskNo?: (cardId: string) => string | undefined;
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "");

function fromTo(v: unknown): { from: unknown; to: unknown } | null {
  return isObj(v) && ("from" in v || "to" in v) ? { from: v.from, to: v.to } : null;
}

/** 한 줄 요약. 알 수 없는 모양이면 빈 문자열 */
export function summarizeDetail(action: string, detail: unknown, lookup: SummaryLookup = {}): string {
  const d: Json = isObj(detail) ? detail : {};
  // 앞에 「팀 」을 붙여 쓰므로 여기서는 이름만(없음 → 「없음」, 모르는 id → 「#id」)
  const teamName = (id: unknown) => {
    if (id === null || id === undefined) return "없음";
    const n = Number(id);
    return (Number.isFinite(n) ? lookup.team?.(n) : undefined) ?? `#${str(id)}`;
  };
  const parts: string[] = [];
  if (action === "user_added") {
    const role = str(d.role);
    parts.push(`역할 ${ROLE_NAME[role] ?? (role || "—")}`);
    if (d.team_id !== undefined) parts.push(`팀 ${teamName(d.team_id)}`);
    if (d.via === "paste") parts.push("일괄 등록");
  } else if (action === "user_updated" || action === "user_deactivated" || action === "user_restored") {
    const role = fromTo(d.role);
    if (role) parts.push(`역할 ${ROLE_NAME[str(role.from)] ?? (str(role.from) || "—")} → ${ROLE_NAME[str(role.to)] ?? (str(role.to) || "—")}`);
    const team = fromTo(d.team);
    if (team) parts.push(`팀 ${teamName(team.from)} → ${teamName(team.to)}`);
    // 사용 중지·재개는 action이 이미 말해 주므로 active 칸은 따로 적지 않음
  } else if (action === "assigned" || action === "unassigned") {
    const ids = Array.isArray(d.card_ids) ? d.card_ids.map(str).filter(Boolean) : [];
    const count = typeof d.count === "number" ? d.count : ids.length;
    const names = ids.map((id) => lookup.taskNo?.(id) ?? id);
    const shown = names.slice(0, 5);
    parts.push(shown.length ? `${shown.join(", ")}${count > shown.length ? ` 외 ${count - shown.length}건` : ""}` : `${count}건`);
    if (d.auto === true) parts.push("다른 변경에 따른 자동 처리");
  } else if (action === "ban_failed") {
    parts.push(d.active === true ? "재개 중 로그인 차단 해제 실패" : "로그인 차단 실패");
    const msg = str(d.ban_error);
    if (msg) parts.push(msg);
  } else if (action === "card_purged") {
    const no = str(d.task_no);
    const title = str(d.title);
    parts.push([no, title].filter(Boolean).join(" ") || str(d.card_id) || "—");
  } else {
    // 모르는 action: 값이 있는 칸 이름만 보임(내용은 추측하지 않음)
    const keys = Object.keys(d).filter((k) => k !== "via");
    if (keys.length) parts.push(keys.join(", "));
  }
  if (d.via === "system" && action !== "user_added") parts.push("시스템");
  return parts.join(" · ");
}

// ── 거르기 ──────────────────────────────────────────────────────────────────────────────────
export const EVENT_PERIODS = ["thisMonth", "lastMonth", "d90"] as const;
export type EventPeriod = (typeof EVENT_PERIODS)[number];
export const PERIOD_NAME: Record<EventPeriod, string> = { thisMonth: "이번 달", lastMonth: "지난달", d90: "최근 90일" };
export const DEFAULT_PERIOD: EventPeriod = "d90";

export const isEventPeriod = (v: string): v is EventPeriod => (EVENT_PERIODS as readonly string[]).includes(v);

/** 기간 → [시작, 끝) ISO(서울 +09:00 기준 달 경계). 끝이 null이면 지금까지 */
export function periodRange(period: EventPeriod, now: Date): { from: string; to: string | null } {
  if (period === "d90") return { from: new Date(now.getTime() - 90 * 86_400_000).toISOString(), to: null };
  const seoul = new Date(now.getTime() + 9 * 3_600_000);
  let y = seoul.getUTCFullYear();
  let m = seoul.getUTCMonth() + 1;
  const iso = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}-01T00:00:00+09:00`;
  if (period === "thisMonth") return { from: iso(y, m), to: null };
  const thisStart = iso(y, m);
  m -= 1;
  if (m === 0) {
    m = 12;
    y -= 1;
  }
  return { from: iso(y, m), to: thisStart };
}

/** 한 번에 보이는 줄 수와 더 보기 상한 */
export const EVENT_PAGE = 200;
export const EVENT_MAX = 2000;

/** ?n= 값 → 보일 줄 수(200 단위, 상한 EVENT_MAX) */
export function eventLimit(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < EVENT_PAGE) return EVENT_PAGE;
  return Math.min(EVENT_MAX, Math.ceil(n / EVENT_PAGE) * EVENT_PAGE);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 사용자 거르기 값은 uuid만 받음(아니면 무시) */
export const asUserId = (v: string): string | null => (UUID.test(v) ? v.toLowerCase() : null);
