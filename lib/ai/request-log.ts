// AI 호출 기록·제한 공용 래퍼(2026-10-10 개선 계획 P0-3·B1 — docs/plan/코드-개선-계획.md). 마이그레이션 20261010100000_ai_requests_running.sql.
// 예전에는 기능마다(작성지원·질문·코멘트·월간 점검·경평 구성안·집필·블록 고치기) 「최근 60초 행 세기 → AI → 끝난 뒤 행 넣기」를 복사해 써서
// ① 5~10분짜리 진행 중 호출이 제한에 안 세졌고 ② 함수가 끊기면 쓴 토큰이 빠졌고 ③ AI는 성공했는데 검증이 예외를 던지면 토큰 없는 error 행만 남았고 ④ 걸린 시간을 몰랐음.
// 이제: 호출 직전 startAiRequest(오래된 running 정리 → 제한 확인(최근 60초·진행 중) → running 행) → AI가 돌려준 직후 finish(ok, 토큰·소요 시간 — 검증 전) →
// 실패면 finish(error). finish는 running 행에만 걸려(정책·조건) 두 번 불러도 처음 것이 남음. 클라이언트는 사용자 세션(RLS — 자기 행만).

import type { SupabaseClient } from "@supabase/supabase-js";
import { aiUsageColumns } from "./pricing.ts";

export const AI_LIMITS = {
  /** 최근 60초 안 호출 수 상한(다른 AI 작성지원 기능과 합산 — 첨부 그림 설명은 안 셈) */
  perMinute: 5,
  /** 동시에 돌 수 있는 호출 수(진행 중 running — 일괄 점검 동시 2건과 맞춤) */
  running: 2,
  /** 이보다 오래된 running 행은 끝맺지 못한 호출(함수가 시간 제한에서 끊김)로 보고 닫음 — 가장 긴 호출(집필 + 자동 고치기 ≈ 13분)보다 길게 */
  staleMs: 20 * 60_000,
} as const;

/** 제한에 세지 않는 기능(첨부 그림 설명 — 올리기 흐름의 부속) */
const UNCOUNTED = "material_describe";

type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number; cacheWrite1h: number };

export interface AiRequestFinish {
  status: "ok" | "error";
  model?: string;
  usage?: Usage;
  error?: string;
  /** 단계별 ms(prepare·call·fix·verify·save 등) + 고치기를 건너뛴 이유(skip — 글자) */
  timings?: Record<string, number | string>;
}

export type AiRequestStart = { ok: true; id: number; finish: (o: AiRequestFinish, now?: number) => Promise<void> } | { ok: false; message: string };

/**
 * AI 호출 직전에 부름. limited(기본 true)면 최근 60초 기록·진행 중 호출 수로 거절할 수 있음. 성공하면 running 행 id와 끝맺기 함수.
 * now는 시험용(기본 Date.now())
 */
export async function startAiRequest(db: SupabaseClient, o: { userId: string; cardId?: string | null; feature: string; mode?: string | null; limited?: boolean }, now = Date.now()): Promise<AiRequestStart> {
  await closeStale(db, o.userId, now);
  if (o.limited !== false) {
    const { running, recent } = await countActive(db, o.userId, now);
    if (running >= AI_LIMITS.running) return { ok: false, message: `AI 작업이 이미 ${running}건 돌고 있습니다. 끝난 뒤 다시 시도해 주세요.` };
    if (recent >= AI_LIMITS.perMinute) return { ok: false, message: "요청이 너무 잦습니다. 1분 뒤 다시 시도해 주세요." };
  }
  return insertRunning(db, o, now);
}

/**
 * 여러 안(같은 요청을 N번 동시에 — 경평 구성안 「다른 짜임 여러 안」, 2026-10-12) 허용 여부(순수). 묶음은 N건을 한꺼번에 동시에 돌려 동시 상한(running)을 혼자 넘으므로
 * 진행 중인 AI 호출이 하나도 없을 때만 허용하고, 1분 상한에는 N건으로 셈(최근 60초 + N이 상한을 넘으면 거절). 묶음이 도는 동안에는 running이 N건이라 다른 AI 요청이 거절됨
 */
export function batchLimitMessage(s: { running: number; recent: number }, n: number): string | null {
  if (n > AI_LIMITS.perMinute) return `한 번에 ${AI_LIMITS.perMinute}안까지입니다.`;
  if (s.running > 0) return `AI 작업이 이미 ${s.running}건 돌고 있습니다. 여러 안은 진행 중인 AI 작업이 없을 때만 만들 수 있습니다 — 끝난 뒤 다시 시도해 주세요.`;
  if (s.recent + n > AI_LIMITS.perMinute) return `요청이 너무 잦습니다 — 여러 안 ${n}개는 AI 요청 ${n}번으로 셉니다(1분에 ${AI_LIMITS.perMinute}번까지). 1분 뒤 다시 시도해 주세요.`;
  return null;
}

/**
 * 여러 안 묶음 시작: 제한(batchLimitMessage)을 본 뒤 안마다 running 행 하나(기록은 안마다 한 행 — 토큰·오류·소요 시간이 따로 남음). 행을 넣다 실패하면 이미 넣은 행은 error로 닫고 거절
 */
export async function startAiRequests(db: SupabaseClient, o: { userId: string; cardId?: string | null; feature: string; mode?: string | null }, n: number, now = Date.now()): Promise<{ ok: true; reqs: Array<Extract<AiRequestStart, { ok: true }>> } | { ok: false; message: string }> {
  await closeStale(db, o.userId, now);
  const blocked = batchLimitMessage(await countActive(db, o.userId, now), n);
  if (blocked) return { ok: false, message: blocked };
  const reqs: Array<Extract<AiRequestStart, { ok: true }>> = [];
  for (let i = 0; i < n; i++) {
    const r = await insertRunning(db, o, now);
    if (!r.ok) {
      for (const x of reqs) await x.finish({ status: "error", error: "여러 안 — 호출 기록을 남기지 못해 묶음을 멈춤" }, now);
      return r;
    }
    reqs.push(r);
  }
  return { ok: true, reqs };
}

/** 끝맺지 못한 오래된 running 행 닫기(동시 실행 수에서 빠지게, 기록에는 중단으로 남음) */
async function closeStale(db: SupabaseClient, userId: string, now: number) {
  await db
    .from("ai_requests")
    .update({ status: "error", error: "중단 — 끝맺지 못한 호출(시간 제한에서 끊김 추정)", finished_at: new Date(now).toISOString() })
    .eq("user_id", userId)
    .eq("status", "running")
    .lt("created_at", new Date(now - AI_LIMITS.staleMs).toISOString());
}

/** 진행 중 호출 수·최근 60초 호출 수(첨부 그림 설명은 안 셈) */
async function countActive(db: SupabaseClient, userId: string, now: number): Promise<{ running: number; recent: number }> {
  const [{ count: running }, { count: recent }] = await Promise.all([
    db.from("ai_requests").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "running").neq("feature", UNCOUNTED).gte("created_at", new Date(now - AI_LIMITS.staleMs).toISOString()),
    db.from("ai_requests").select("id", { count: "exact", head: true }).eq("user_id", userId).neq("feature", UNCOUNTED).gte("created_at", new Date(now - 60_000).toISOString()),
  ]);
  return { running: running ?? 0, recent: recent ?? 0 };
}

/** running 행 하나 넣고 끝맺기 함수를 돌려줌 */
async function insertRunning(db: SupabaseClient, o: { userId: string; cardId?: string | null; feature: string; mode?: string | null }, now: number): Promise<AiRequestStart> {
  const { data, error } = await db
    .from("ai_requests")
    .insert({ user_id: o.userId, card_id: o.cardId ?? null, feature: o.feature, mode: o.mode ?? null, status: "running" })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: "AI 호출 기록을 남기지 못해 요청을 멈췄습니다. 잠시 뒤 다시 시도해 주세요." };
  const id = Number((data as { id: number }).id);
  return {
    ok: true,
    id,
    finish: async (f, end = Date.now()) => {
      const { error: e } = await db
        .from("ai_requests")
        .update({
          status: f.status,
          ...(f.model ? { model: f.model } : {}),
          ...(f.usage ? aiUsageColumns(f.usage) : {}),
          ...(f.error ? { error: f.error.slice(0, 300) } : {}),
          finished_at: new Date(end).toISOString(),
          duration_ms: Math.max(0, Math.round(end - now)),
          ...(f.timings ? { timings: f.timings } : {}),
        })
        .eq("id", id)
        .eq("status", "running");
      if (e) console.error("finishAiRequest", e.message);
    },
  };
}

/** AI 사용량 화면의 상태: running(진행 중) · stalled(끝맺지 못한 오래된 running — 다음 호출 때 error로 닫힘) · ok · error */
export function requestState(r: { status: string; created_at: string }, now = Date.now()): "running" | "stalled" | "ok" | "error" {
  if (r.status === "running") return now - Date.parse(r.created_at) > AI_LIMITS.staleMs ? "stalled" : "running";
  return r.status === "ok" ? "ok" : "error";
}

/** 끝맺은 호출의 소요 시간 중앙값(ms) — 기록이 없으면 null */
export function medianMs(rows: Array<{ duration_ms: number | null }>): number | null {
  const xs = rows.map((r) => r.duration_ms).filter((x): x is number => typeof x === "number").sort((a, b) => a - b);
  if (!xs.length) return null;
  const m = xs.length >> 1;
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
}
