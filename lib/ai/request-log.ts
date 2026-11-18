// AI 호출 기록·제한 공용 래퍼(2026-10-10 개선 계획 P0-3·B1 — docs/plan/코드-개선-계획.md). 마이그레이션 20261010100000_ai_requests_running.sql.
// 예전에는 기능마다(작성지원·질문·코멘트·월간 점검·경평 구성안·집필·블록 고치기) 「최근 60초 행 세기 → AI → 끝난 뒤 행 넣기」를 복사해 써서
// ① 5~10분짜리 진행 중 호출이 제한에 안 세졌고 ② 함수가 끊기면 쓴 토큰이 빠졌고 ③ AI는 성공했는데 검증이 예외를 던지면 토큰 없는 error 행만 남았고 ④ 걸린 시간을 몰랐음.
// 이제: 호출 직전 startAiRequest(오래된 running 정리 → 제한 확인(최근 60초·진행 중) → running 행) → AI가 돌려준 직후 finish(ok, 토큰·소요 시간 — 검증 전) →
// 실패면 finish(error). finish는 running 행에만 걸려 두 번 불러도 처음 것이 남음.
// 2026-11-16(웹 취약점 점검, 마이그레이션 20261116110000_ai_requests_rpc.sql): 사용자가 공개 키로 직접 running 행을 닫아 동시 제한을 풀거나 가짜 토큰 행을 넣을 수 있어
// 표 쓰기를 거두고 rpc 두 개로만 씀 — start_ai_request(사용자별 잠금 안에서 정리·세기·판정·넣기를 한 번에, 한도는 DB 함수에 고정)와
// finish_ai_request(시작 때 만든 난수 키가 맞아야 끝맺음). 키는 이 모듈의 끝맺기 클로저에만 있고 화면 응답에 싣지 않음(after() 작업도 같은 프로세스에서 클로저를 씀).
// 클라이언트는 사용자 세션(행 주인 = auth.uid()).

import type { SupabaseClient } from "@supabase/supabase-js";
import { aiUsageColumns } from "./pricing.ts";

/** AI 기능 공용 한도. 1분·동시 한도는 DB 함수 start_ai_request에 같은 값으로 고정(바꾸면 함께 — lib/db/migrations.test.ts가 대조) */
export const AI_LIMITS = {
  /** 최근 60초 안 호출 수 상한(다른 AI 작성지원 기능과 합산 — 첨부 그림 설명은 따로 셈) */
  perMinute: 5,
  /** 동시에 돌 수 있는 호출 수(진행 중 running — 일괄 점검 동시 2건과 맞춤) */
  running: 2,
  /** 이보다 오래된 running 행은 끝맺지 못한 호출(함수가 시간 제한에서 끊김)로 보고 닫음 — 가장 긴 호출(집필 + 자동 고치기 ≈ 13분)보다 길게 */
  staleMs: 20 * 60_000,
} as const;

/** 첨부 그림 설명(material_describe) 한도 — 다른 AI 기능과 따로 셈. 넘으면 AI를 부르지 않고 「읽기 보류」(요청 때 다시 읽음).
 * 올리기 화면은 파일을 하나씩 차례로 올리고(components/ui/file-drop.tsx) 그림 설명 한 번이 몇 초~십수 초 걸려 한 사람이 정상으로 1분에 만드는 설명은 10건 안팎 —
 * 그보다 넉넉한 15건. 동시 3건 = 올리기 + 다른 탭의 요청 때 다시 읽기가 겹쳐도 막지 않는 수. DB 함수 start_ai_request에 같은 값 */
export const DESCRIBE_LIMITS = { perMinute: 15, running: 3 } as const;

/** 따로 세는 기능(첨부 그림 설명 — 올리기 흐름의 부속, 한도 DESCRIBE_LIMITS) */
export const DESCRIBE_FEATURE = "material_describe";

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

/** 시작 인자. userId는 예전 호출 호환용(행 주인은 DB가 auth.uid()로 정함) */
type StartInput = { userId?: string; cardId?: string | null; feature: string; mode?: string | null; job?: string };

const LOG_FAIL = "AI 호출 기록을 남기지 못해 요청을 멈췄습니다. 잠시 뒤 다시 시도해 주세요.";
/** 관리자가 AI 일시 중지를 켰을 때(start_ai_request가 paused — 20261118140000) */
export const AI_PAUSED_MESSAGE = "관리자가 AI 기능을 잠시 멈췄습니다. 잠시 뒤 다시 시도하세요.";

/** 한도에 걸렸을 때 안내(한 건) */
function limitMessage(s: { running: number; recent: number }, feature: string): string {
  const lim = feature === DESCRIBE_FEATURE ? DESCRIBE_LIMITS : AI_LIMITS;
  if (s.running >= lim.running) return `AI 작업이 이미 ${s.running}건 돌고 있습니다. 끝난 뒤 다시 시도해 주세요.`;
  return "요청이 너무 잦습니다. 1분 뒤 다시 시도해 주세요.";
}

/**
 * AI 호출 직전에 부름. 최근 60초 기록·진행 중 호출 수로 거절할 수 있음(판정은 DB 함수 — 기능이 그림 설명이면 그 한도). 성공하면 running 행 id와 끝맺기 함수.
 * now는 소요 시간 계산의 시작 시각(시험용, 기본 Date.now())
 */
export async function startAiRequest(db: SupabaseClient, o: StartInput, now = Date.now()): Promise<AiRequestStart> {
  const r = await callStart(db, o, 1, false, now);
  if (r.ok) return r.reqs[0];
  return { ok: false, message: r.message ?? limitMessage(r, o.feature) };
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
 * 여러 안 묶음 시작: 제한(batchLimitMessage와 같은 규칙 — DB 함수가 판정)을 본 뒤 안마다 running 행 하나(기록은 안마다 한 행 — 토큰·오류·소요 시간이 따로 남음). 행은 한 번에 모두 넣거나 하나도 안 넣음.
 * job(백그라운드 작업 종류 — lib/ai/jobs.ts)은 첫 행에만 적음(묶음 하나가 작업 하나 — 결과 행은 첫 행 id로)
 */
export async function startAiRequests(db: SupabaseClient, o: StartInput, n: number, now = Date.now()): Promise<{ ok: true; reqs: Array<Extract<AiRequestStart, { ok: true }>> } | { ok: false; message: string }> {
  const tooMany = batchLimitMessage({ running: 0, recent: 0 }, n);
  if (tooMany) return { ok: false, message: tooMany };
  const r = await callStart(db, o, n, true, now);
  if (r.ok) return r;
  return { ok: false, message: r.message ?? batchLimitMessage(r, n) ?? limitMessage(r, o.feature) };
}

/** 난수 키(hex 64자)와 그 sha256(hex) — Web Crypto(이 모듈은 화면 묶음에도 들어가므로 node:crypto를 쓰지 않음) */
async function newKey(): Promise<{ key: string; hash: string }> {
  const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  const key = hex(crypto.getRandomValues(new Uint8Array(32)));
  const hash = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key))));
  return { key, hash };
}

type Started = { ok: true; reqs: Array<Extract<AiRequestStart, { ok: true }>> } | { ok: false; running: number; recent: number; message?: string };

/** start_ai_request 부르기 → 행마다 끝맺기 함수(키는 클로저에만) */
async function callStart(db: SupabaseClient, o: StartInput, n: number, batch: boolean, now: number): Promise<Started> {
  const keys = await Promise.all(Array.from({ length: n }, newKey));
  const { data, error } = await db.rpc("start_ai_request", {
    p_feature: o.feature,
    p_card_id: o.cardId ?? null,
    p_mode: o.mode ?? null,
    p_job: o.job ?? null,
    p_key_hashes: keys.map((k) => k.hash),
    p_batch: batch,
  });
  const res = data as { ok?: boolean; ids?: number[]; running?: number; recent?: number; paused?: boolean } | null;
  if (error || !res) {
    if (error) console.error("startAiRequest", error.message);
    return { ok: false, running: 0, recent: 0, message: LOG_FAIL };
  }
  if (!res.ok && res.paused) return { ok: false, running: 0, recent: 0, message: AI_PAUSED_MESSAGE };
  if (!res.ok) return { ok: false, running: Number(res.running ?? 0), recent: Number(res.recent ?? 0) };
  const ids = (res.ids ?? []).map(Number);
  if (ids.length !== n) return { ok: false, running: 0, recent: 0, message: LOG_FAIL };
  return { ok: true, reqs: ids.map((id, i) => ({ ok: true as const, id, finish: finisher(db, id, keys[i].key, now) })) };
}

/** 끝맺기 함수: finish_ai_request(키가 맞고 running일 때만 — 두 번 불러도 처음 것이 남음). 실패는 기록만 */
function finisher(db: SupabaseClient, id: number, key: string, start: number) {
  return async (f: AiRequestFinish, end = Date.now()) => {
    const u = f.usage ? aiUsageColumns(f.usage) : null;
    const { error } = await db.rpc("finish_ai_request", {
      p_id: id,
      p_key: key,
      p_status: f.status,
      p_model: f.model || null,
      p_input_tokens: u?.input_tokens ?? null,
      p_output_tokens: u?.output_tokens ?? null,
      p_cache_read_tokens: u?.cache_read_tokens ?? null,
      p_cache_write_tokens: u?.cache_write_tokens ?? null,
      p_cache_write_1h_tokens: u?.cache_write_1h_tokens ?? null,
      p_error: f.error ? f.error.slice(0, 300) : null,
      p_duration_ms: Math.max(0, Math.round(end - start)),
      p_timings: f.timings ?? null,
    });
    if (error) console.error("finishAiRequest", error.message);
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
