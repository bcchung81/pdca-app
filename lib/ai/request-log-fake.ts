// 시험용 가짜 rpc: start_ai_request·finish_ai_request(마이그레이션 20261116110000_ai_requests_rpc.sql)를 메모리 표 위에서 흉내 냄.
// 시험에서만 import한다(운영 코드는 쓰지 않음). 실제 DB 함수의 동작은 lib/db/migrations.test.ts가 PGlite로 확인하고, 여기서는 TS 래퍼(lib/ai/request-log.ts)를 시험할 만큼만.

import { createHash } from "node:crypto";
import { AI_LIMITS, DESCRIBE_FEATURE, DESCRIBE_LIMITS } from "./request-log.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

/** rows = ai_requests 표, user = 로그인 사용자(auth.uid()), now = DB 시계 */
export function fakeAiRequestRpc(rows: Row[], o: { user: string; now?: () => number }) {
  const now = o.now ?? Date.now;
  const iso = (ms: number) => new Date(ms).toISOString();
  let nextId = rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
  return async (fn: string, a: Record<string, any>): Promise<{ data: any; error: { message: string } | null }> => {
    const t = now();
    if (fn === "start_ai_request") {
      const describe = a.p_feature === DESCRIBE_FEATURE;
      const lim = describe ? DESCRIBE_LIMITS : AI_LIMITS;
      const n = (a.p_key_hashes as string[]).length;
      if (n < 1 || (!a.p_batch && n !== 1) || n > lim.perMinute) return { data: null, error: { message: "값이 올바르지 않습니다" } };
      for (const r of rows)
        if (r.user_id === o.user && r.status === "running" && r.created_at < iso(t - AI_LIMITS.staleMs)) Object.assign(r, { status: "error", error: "중단 — 끝맺지 못한 호출(시간 제한에서 끊김 추정)", finished_at: iso(t) });
      const mine = rows.filter((r) => r.user_id === o.user && r.created_at >= iso(t - AI_LIMITS.staleMs) && (r.feature === DESCRIBE_FEATURE) === describe);
      const running = mine.filter((r) => r.status === "running").length;
      const recent = mine.filter((r) => r.created_at >= iso(t - 60_000)).length;
      if ((a.p_batch && (running > 0 || recent + n > lim.perMinute)) || (!a.p_batch && (running >= lim.running || recent >= lim.perMinute))) return { data: { ok: false, running, recent }, error: null };
      const ids = (a.p_key_hashes as string[]).map((h, i) => {
        const id = nextId++;
        rows.push({ id, user_id: o.user, card_id: a.p_card_id, feature: a.p_feature, mode: a.p_mode, status: "running", job: i === 0 ? a.p_job : null, finish_key_hash: h, created_at: iso(t) });
        return id;
      });
      return { data: { ok: true, ids }, error: null };
    }
    if (fn === "finish_ai_request") {
      const hash = createHash("sha256").update(String(a.p_key), "utf8").digest("hex");
      const r = rows.find((x) => x.id === a.p_id && x.user_id === o.user && x.status === "running" && x.finish_key_hash === hash);
      if (!r) return { data: false, error: null };
      const keep = (k: string, v: unknown) => (v === null || v === undefined ? r[k] : v);
      Object.assign(r, {
        status: a.p_status,
        model: keep("model", a.p_model),
        input_tokens: keep("input_tokens", a.p_input_tokens),
        output_tokens: keep("output_tokens", a.p_output_tokens),
        cache_read_tokens: keep("cache_read_tokens", a.p_cache_read_tokens),
        cache_write_tokens: keep("cache_write_tokens", a.p_cache_write_tokens),
        cache_write_1h_tokens: keep("cache_write_1h_tokens", a.p_cache_write_1h_tokens),
        error: keep("error", a.p_error),
        finished_at: iso(t),
        duration_ms: keep("duration_ms", a.p_duration_ms),
        timings: keep("timings", a.p_timings),
        finish_key_hash: null,
      });
      return { data: true, error: null };
    }
    return { data: null, error: { message: `모르는 함수 ${fn}` } };
  };
}
