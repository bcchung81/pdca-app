// AI 백그라운드 작업(2026-11-06 사용자 결정 — 「다른 화면으로 가도 답이 나올 때까지 유지」, 마이그레이션 20261106100000_ai_results.sql)의 순수 규칙.
// 서버 액션은 시작만 하고(lib/ai/background.ts) AI 호출·검증·저장은 after()에서 돎. 화면은 GET 라우트(app/api/ai/requests)로 진행 상태를 읽고
// 끝난 결과는 ai_results(app/api/ai/results)에서 받음. 여기는 서버(시작 전 중복 막기·라우트)와 화면(머리띠·대화 차례)이 함께 쓰는 판정·글만 둠.

import { AI_LIMITS } from "./request-log.ts";

/**
 * 작업 종류 → 호출 기록 기능 키(ai_requests.feature)·묶음(같은 카드에서 한 번에 하나 — 같은 묶음끼리 막음)·이름.
 * report = 경평 초안(모두 같은 초안 행에 씀), assist = 과제원장 AI 작성지원·질문(한 대화), comment = 카드 리뷰어 코멘트,
 * inspect = 월간 점검 AI 초안(2026-11-10 — 같은 과제의 점검은 점검월이 달라도 한 번에 하나). DB ai_requests.job의 허용값(check)도 같은 목록이어야 함
 */
export const JOB_KINDS = {
  outline: { feature: "report_outline", group: "report", label: "구성안 만들기" },
  alts: { feature: "report_outline", group: "report", label: "다른 짜임 여러 안" },
  part: { feature: "report_outline", group: "report", label: "절 다시 짜기" },
  plan: { feature: "report_section", group: "report", label: "구성안대로 집필" },
  revise: { feature: "report_section", group: "report", label: "자료 반영 고치기" },
  draft: { feature: "report_section", group: "report", label: "바로 만들기" },
  assist: { feature: "card_assist", group: "assist", label: "AI 작성지원" },
  chat: { feature: "card_chat", group: "assist", label: "질문" },
  comment: { feature: "card_comment", group: "comment", label: "리뷰어 코멘트" },
  inspect: { feature: "inspection", group: "inspect", label: "AI 점검 초안" },
} as const;
export type JobKind = keyof typeof JOB_KINDS;
export type JobGroup = (typeof JOB_KINDS)[JobKind]["group"];
export const isJobKind = (k: unknown): k is JobKind => typeof k === "string" && k in JOB_KINDS;
export const jobsOfGroup = (g: JobGroup): JobKind[] => (Object.keys(JOB_KINDS) as JobKind[]).filter((k) => JOB_KINDS[k].group === g);

/** 화면이 진행 상태를 읽는 창(머리띠·대화 — 이보다 오래된 작업은 목록에 안 옴. 가장 긴 작업 staleMs 20분보다 길게) */
export const JOB_WINDOW_MS = 30 * 60_000;
/** 화면이 진행 중 작업을 다시 읽는 간격(창이 보일 때만) */
export const JOB_POLL_MS = 4_000;
/** after 작업이 던졌을 때 사용자에게 보일 글(자세한 오류는 서버 로그) */
export const JOB_CRASH_MSG = "AI 작업이 중간에 멈췄습니다. 잠시 뒤 다시 시도해 주세요.";
/** 결과 행이 끝내 안 생긴 작업(함수가 시간 제한에서 끊김 추정) */
export const JOB_STALE_MSG = "AI 작업이 끝맺지 못했습니다(시간 제한에서 끊김 추정). 다시 요청해 주세요.";

/** 작업 결과(ai_results.result) — data는 기능마다(작성지원·질문 = 대화 차례(실패도 — 다른 PC에서 요청 말풍선을 다시 그림), 코멘트 = 처리 결과·보낼 때 카드, 여러 안 = 견본) */
export type JobOutcome = { ok: boolean; message: string; data?: unknown };

/** GET 라우트가 읽는 호출 기록 한 행(ai_requests + 카드 + 결과 끝맺음) */
export interface JobRow {
  id: number;
  feature: string;
  job: string | null;
  mode: string | null;
  status: string;
  error: string | null;
  created_at: string;
  finished_at: string | null;
  card?: { uid: string; task_no: string; title: string } | Array<{ uid: string; task_no: string; title: string }> | null;
  res?: { ok: unknown; message: unknown } | Array<{ ok: unknown; message: unknown }> | null;
}

export type JobState = "running" | "ok" | "error";

/** 화면에 넘기는 작업 하나 */
export interface AiJob {
  id: number;
  kind: JobKind;
  feature: string;
  /** 호출 기록 mode(작성지원은 요청 종류 — 다른 화면에서 보낸 차례의 이름) */
  mode: string | null;
  state: JobState;
  /** 끝맺음 글(성공 알림·실패 이유) — 진행 중이면 빈 글 */
  message: string;
  /** 시작 시각(running 행 created_at — 진행 줄의 경과 시간) */
  at: string;
  /** 끝난 시각(모르면 null — 결과 행 시각이 아니라 호출 기록의 finished_at) */
  endAt: string | null;
  card: { uid: string; taskNo: string; title: string } | null;
}

const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/**
 * 작업 상태: 결과 행이 있으면 그 끝맺음(ok·message), 없고 호출 기록이 error면 실패(그 오류 글), 시작한 지 staleMs가 지나도 결과가 없으면 끊김, 나머지는 진행 중.
 * 호출 기록은 AI가 돌려준 직후 ok로 끝맺으므로(토큰 기록 — 검증 전) 결과 행이 생기기 전까지는 ok여도 진행 중(검증·저장·분량 채움이 남음)
 */
export function jobState(r: Pick<JobRow, "status" | "error" | "created_at" | "res">, now = Date.now()): { state: JobState; message: string } {
  const res = one(r.res);
  if (res) return { state: res.ok === true ? "ok" : "error", message: typeof res.message === "string" ? res.message : "" };
  if (r.status === "error") return { state: "error", message: r.error ?? JOB_CRASH_MSG };
  if (now - Date.parse(r.created_at) > AI_LIMITS.staleMs) return { state: "error", message: JOB_STALE_MSG };
  return { state: "running", message: "" };
}

/** 호출 기록 행 → 화면 작업(작업 종류가 없거나 모르는 행은 null) */
export function toAiJob(r: JobRow, now = Date.now()): AiJob | null {
  if (!isJobKind(r.job)) return null;
  const s = jobState(r, now);
  const c = one(r.card);
  return { id: Number(r.id), kind: r.job, feature: r.feature, mode: r.mode, state: s.state, message: s.message, at: r.created_at, endAt: r.finished_at, card: c ? { uid: String(c.uid), taskNo: c.task_no, title: c.title } : null };
}

/**
 * 같은 카드에서 같은 묶음 작업이 이미 도는가(시작 전 중복 막기 — 다른 탭·다른 PC에서 보낸 것 포함, 본인 기록만). rows = 이 사용자·이 카드의 작업 행(결과 끝맺음 포함).
 * 돌면 거절 글, 아니면 null
 */
export function busyJobMessage(rows: Array<Pick<JobRow, "job" | "status" | "error" | "created_at" | "res">>, kind: JobKind, now = Date.now()): string | null {
  const group = JOB_KINDS[kind].group;
  const running = rows.find((r) => isJobKind(r.job) && JOB_KINDS[r.job].group === group && jobState(r, now).state === "running");
  if (!running || !isJobKind(running.job)) return null;
  return `이 과제의 「${JOB_KINDS[running.job].label}」 AI 작업이 아직 돌고 있습니다(다른 화면에서 보낸 것 포함). 끝난 뒤 다시 보내 주세요.`;
}

/** 작업 화면 주소(경평 초안은 과제별 초안, 월간 점검은 점검 목록의 그 과제 옆 창(이번 달 — 점검월은 작업에 없음), 과제원장은 카드 전체 쪽 — 부서 담당자도 같은 주소로 염) */
export function jobHref(j: Pick<AiJob, "kind" | "card">): string | null {
  if (!j.card) return null;
  const group = JOB_KINDS[j.kind].group;
  if (group === "report") return `/reports/cards/${j.card.uid}`;
  if (group === "inspect") return `/inspections?peek=${encodeURIComponent(j.card.uid)}`;
  return `/cards/${j.card.uid}`;
}

/** 작업 이름(「1-가 경평 초안 · 구성안 만들기」 · 「1-가 월간 점검 · AI 점검 초안」) */
export function jobTitle(j: Pick<AiJob, "kind" | "card">): string {
  const group = JOB_KINDS[j.kind].group;
  const where = group === "report" ? "경평 초안" : group === "inspect" ? "월간 점검" : "과제원장";
  return [j.card?.taskNo, where].filter(Boolean).join(" ") + ` · ${JOB_KINDS[j.kind].label}`;
}

/** 끝 알림 글(「1-가 경평 초안 · 구성안 만들기가 끝났어요」 / 실패) */
export function jobNotice(j: Pick<AiJob, "kind" | "card" | "state">): string {
  return `${jobTitle(j)} — ${j.state === "ok" ? "끝났어요" : "실패했어요"}`;
}

/** 경과 시간(「3분 12초」 · 「45초」) */
export function elapsedLabel(fromIso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(fromIso)) / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`;
}

/**
 * 폴링 대상 판정(화면): 진행 중 작업이 있거나 아직 서버에서 못 본 시작한 작업(watch)이 있을 때만, 창이 보일 때만 다시 읽음
 */
export function shouldPoll(jobs: Array<Pick<AiJob, "id" | "state">>, watch: number[], visible: boolean): boolean {
  if (!visible) return false;
  if (jobs.some((j) => j.state === "running")) return true;
  const seen = new Set(jobs.map((j) => j.id));
  return watch.some((id) => !seen.has(id));
}

/** 이번 읽기에서 끝난 작업(전에 진행 중으로 본 것 중 지금 끝난 것 — 끝 알림·화면 새로 그리기) */
export function finishedSince(before: Array<Pick<AiJob, "id" | "state">>, after: AiJob[]): AiJob[] {
  const was = new Set(before.filter((j) => j.state === "running").map((j) => j.id));
  return after.filter((j) => was.has(j.id) && j.state !== "running");
}

/** 쉼표로 잇은 요청 id(라우트 쿼리 — 양의 정수만, 많아야 n개) */
export function parseIds(raw: string | null | undefined, n = 30): number[] {
  return [
    ...new Set(
      String(raw ?? "")
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((x) => Number.isSafeInteger(x) && x > 0),
    ),
  ].slice(0, n);
}

/** 결과 표 읽기 한 줄(app/api/ai/results — ai_results) */
export interface JobResultRow {
  requestId: number;
  feature: string;
  at: string;
  result: JobOutcome;
}

/** 결과 표에서 카드 기록으로 다시 채우는 기능(작성지원·질문) */
export const ASSIST_FEATURES = ["card_assist", "card_chat"] as const;
