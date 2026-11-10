// 월간 점검 AI 초안 작업 한 번(2026-11-10 — 백그라운드 전환). 서버 액션 runInspectionDraft가 권한·잠금·근거를 확인하고 작업을 시작(lib/ai/background.ts startAiJob)한 뒤,
// 이 함수를 응답 뒤(after — launchAiJob)에 돌림. 순수: AI 호출·호출 기록·검증·저장은 deps로 받음(시험 draft-job.test.ts).
// 순서는 예전 동기 액션과 같음: AI 호출 → 호출 기록 끝맺음(토큰 — 검증 전) → 검증(verifyInspection·verifyInspectionMg) → 초안 저장 → 끝맺음 글.
// 저장은 시작 때 본 판(updated_at, 없었으면 「없음」)일 때만(경평 초안 saveDraftRow와 같은 방식 — T4 리뷰 X3): AI가 도는 사이 다른 사람이 고쳤거나 만들었거나
// 보냈거나 지웠으면 덮지 않고 결과만 남김(ai_results — 편집 화면 「AI 결과 보기」). 못 쓴 까닭은 나눠 알림(X4 — saveMissReason).

import type { JobOutcome } from "../ai/jobs.ts";
import { type InspectionResult, MGMT_FORM_ID, checklistCounts, tally } from "./model.ts";

/** 작업 결과(ai_results.result.data) — 편집 화면이 받아 같은 점검월의 점검표에 채움(다른 달이면 채우지 않고 화면만 새로 그림). 저장하지 못했으면 saved=false·까닭 */
export interface InspectionJobData {
  period: string;
  result: InspectionResult;
  saved: boolean;
  reason?: SaveMiss;
  /** 저장했으면 그 행의 새 판(updated_at) — 편집 화면의 다음 저장 조건(T4 리뷰 X3a) */
  version?: string;
}

/** AI 결과를 점검표에 쓰지 못한 까닭(T4 리뷰 X4): 보내짐(확인 포함)·다른 사람이 고침·다른 사람이 만듦·지워짐·권한 없음(사용 중지·역할 변경)·그 밖의 DB 오류 */
export type SaveMiss = "sent" | "changed" | "created" | "gone" | "denied" | "error";

/** 못 쓴 까닭별 끝맺음 글 — 모두 결과는 남아 편집 화면 「AI 결과 보기」로 불러올 수 있음 */
export const SAVE_MISS_MESSAGE: Record<SaveMiss, string> = {
  sent: "AI가 점검하는 사이 점검표가 부서에 보내져(또는 확인돼) 초안을 저장하지 않았습니다 — 「AI 결과 보기」로 결과만 볼 수 있습니다.",
  changed: "AI가 점검하는 사이 이 점검표가 바뀌어(다른 창·다른 사람의 저장) 저장하지 않았습니다 — 「AI 결과 보기」로 견줘 본 뒤 필요한 것만 반영하세요.",
  created: "AI가 점검하는 사이 이 달 점검표가 새로 만들어져(다른 창·다른 사람) 저장하지 않았습니다 — 「AI 결과 보기」로 견줘 본 뒤 필요한 것만 반영하세요.",
  gone: "AI가 점검하는 사이 점검표가 지워져 저장하지 않았습니다 — 「AI 결과 보기」로 불러와 다시 저장할 수 있습니다.",
  denied: "점검표를 저장할 권한이 없어(사용 중지·역할 변경 등) 저장하지 않았습니다 — 「AI 결과 보기」로 결과만 볼 수 있습니다.",
  error: "점검표를 저장하지 못했습니다(DB 오류) — 「AI 결과 보기」로 불러와 다시 저장해 보세요.",
};

/** 저장이 안 됐을 때 까닭을 고르는 재료(서버가 쓰기 뒤에 다시 읽어 채움) */
export interface SaveCheck {
  /** 시작 때 그 달 행의 updated_at(행이 없었으면 null) */
  base: string | null;
  /** 쓰기 오류(update가 0행이면 null) */
  error: { code?: string; message: string } | null;
  /** 쓰기 뒤 다시 읽은 그 달 행(안 보이면 null) */
  row: { status: string; updated_at: string } | null;
  /** 지금 저장할 수 있는 사람인가(활성 성과관리팀·관리자 — 본인 프로필) */
  staff: boolean;
}

const RLS_DENIED = /row-level security|permission denied/i;

/** 못 쓴 까닭: 권한(역할·사용 중지·RLS 거절) → 보내짐 → 그 밖의 오류 → 지워짐/없음 → 다른 사람이 고침(시작 때 행이 있었음)·만듦(없었음) */
export function saveMissReason(c: SaveCheck): SaveMiss {
  if (!c.staff || (c.error && (c.error.code === "42501" || RLS_DENIED.test(c.error.message)))) return "denied";
  if (c.row && c.row.status !== "draft") return "sent";
  if (c.error && c.error.code !== "23505") return "error";
  if (!c.row) return c.base ? "gone" : "error";
  if (c.base && c.row.updated_at === c.base) return "error";
  return c.base ? "changed" : "created";
}

export interface InspectionJobDeps<C> {
  period: string;
  /** 근거 조각 수(끝맺음 글) */
  sources: number;
  /** AI 호출(주요사업 callInspection·경영관리 callInspectionMg) */
  call(): Promise<C>;
  /** AI가 돌려준 직후 호출 기록을 ok로(토큰은 검증 전에 기록 — 검증이 던져도 쓴 토큰이 남음) */
  recorded(call: C): Promise<void>;
  verify(call: C): { result: InspectionResult; unverified: number; missing: number };
  /** 시작 때 본 판일 때만 초안으로 저장 — 썼으면 { ok: true }, 못 썼으면 까닭(saveMissReason) */
  save(result: InspectionResult): Promise<{ ok: true; version?: string } | { ok: false; reason: SaveMiss }>;
  /** 실패: 호출 기록을 error로 끝맺고 사용자에게 보일 글을 돌려줌(아직 running인 기록만 바뀜) */
  failed(e: unknown): Promise<string>;
}

/** 끝맺음 글(지침의 결과 메시지처럼): 충족 수 · 보완 건수 · 집중보완 여부(경영관리는 체크리스트 대조 건수도) · 근거 조각 수·원문과 다른 인용·빠진 항목 */
export function draftSavedMessage(result: InspectionResult, sources: number, unverified: number, missing: number): string {
  const t = tally(result);
  const cl = result.form === MGMT_FORM_ID ? checklistCounts(result.checklist) : null;
  const counts = `7대축 ${t.tables.axes.met}/7 · 질의패턴 ${t.tables.patterns.met}/8 · 정합성 ${t.tables.coherence.met}/5, 보완 ${t.needs}건, ${t.focus ? "집중보완" : "집중보완 아님"}${cl ? ` · 체크리스트 대조 ${cl.total}개(예 ${cl.yes}·부분 ${cl.partial}·아니오 ${cl.no})` : ""}`;
  const notes = [`근거 조각 ${sources}개`, unverified ? `원문과 다른 인용 ${unverified}개` : "", missing ? `빠진 항목 ${missing}개` : ""].filter(Boolean).join(" · ");
  return `AI 초안을 저장했습니다(${counts}). ${notes} — 확인한 뒤 부서에 보내세요.`;
}

/** 작업 한 번 — 무엇으로 끝나든 끝맺음({ ok, message, data? })을 돌려줌(결과 행은 lib/ai/job-run.ts runJob이 남김) */
export async function runInspectionJob<C>(d: InspectionJobDeps<C>): Promise<JobOutcome> {
  try {
    const call = await d.call();
    await d.recorded(call);
    const { result, unverified, missing } = d.verify(call);
    const saved = await d.save(result);
    if (!saved.ok) {
      const kept: InspectionJobData = { period: d.period, result, saved: false, reason: saved.reason };
      return { ok: false, message: SAVE_MISS_MESSAGE[saved.reason], data: kept };
    }
    const data: InspectionJobData = { period: d.period, result, saved: true, ...(saved.version ? { version: saved.version } : {}) };
    return { ok: true, message: draftSavedMessage(result, d.sources, unverified, missing), data };
  } catch (e) {
    return { ok: false, message: await d.failed(e) };
  }
}

/**
 * 편집 화면을 다시 열었을 때 되찾을 AI 결과(T4 리뷰 T3-R5 — 「AI 결과 보기」로 불러온 결과를 저장하다 충돌해 새로 불러오면 잃던 것):
 * 본인 결과 행(GET /api/ai/results?card=…&feature=inspection) 가운데 이 점검월의 **저장하지 못한** 결과로, 지금 점검표의 마지막 저장(updatedAt)보다 늦게 끝난 것 중 가장 늦은 것.
 * 그 결과를 불러와 저장하면 점검표 판이 결과보다 늦어져 다시 뜨지 않음. 없으면 null
 */
export function pendingAiResult(rows: ReadonlyArray<{ at: string; result: { ok: boolean; data?: unknown } }>, period: string, updatedAt: string | null): unknown {
  const after = updatedAt ? Date.parse(updatedAt) : Number.NEGATIVE_INFINITY;
  const hit = [...rows]
    .filter((r) => !r.result.ok && Date.parse(r.at) > after)
    .map((r) => ({ at: Date.parse(r.at), got: inspectionJobResult(r.result.data, period) }))
    .filter((x) => x.got && !x.got.saved)
    .sort((a, b) => b.at - a.at)[0];
  return hit?.got?.result ?? null;
}

/** 작업 결과에서 그 점검월의 점검표·저장 여부·새 판(편집 화면 — 다른 달이거나 모양이 아니면 null). 저장 여부가 없는 결과(이 판 전)는 저장된 것으로 봄 */
export function inspectionJobResult(data: unknown, period: string): { result: unknown; saved: boolean; version: string | null } | null {
  const d = data as Partial<InspectionJobData> | null | undefined;
  if (!d || typeof d !== "object" || d.period !== period || !d.result || typeof d.result !== "object") return null;
  return { result: d.result, saved: d.saved !== false, version: typeof d.version === "string" && d.version ? d.version : null };
}
