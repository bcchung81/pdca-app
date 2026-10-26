// match_knowledge 처리기(참고자료 3단계): 카드 한 장 × 공통 지식 조각 → 과제 대응표 자동 초안(method='ai').
// 모델 호출·조각 읽기는 주입받아 입출력이 없다 — 실제 연결은 handlers/index.ts. 대응표는 거르는 장치가 아니라 표시·순서·숫자 근거용이므로
// 실패하거나 아직 안 돌았어도 AI 요청에는 규칙 범위 자료가 전부 들어간다(원칙 1).
// 규칙: 사람이 확정·뺀 행은 어떤 경우에도 덮지 않는다 — 계획(planScopeWrites)뿐 아니라 쓰는 순간에도 상태 조건을 건다(읽은 뒤 확정하는 경합 대비).

import type { BundleChunk } from "../../knowledge/bundle.ts";
import { type MatchResult, matchCandidates, parseMatches, splitByBudget } from "../../ai/match.ts";
import type { Usage } from "../../ai/run.ts";
import { aiUsageColumns } from "../../ai/pricing.ts";
import { type TrackSpec, trackSpecOfUnit } from "../../tracks/index.ts";
import type { PrepHandler, PrepStore } from "../run.ts";
import { planScopeWrites } from "../scope.ts";
import type { PrepJob, ScopeHit, ScopeRow } from "../types.ts";

export interface MatchCallResult {
  result: MatchResult;
  model: string;
  provider: string;
  usage: Usage;
}

export interface MatchKnowledgeDeps {
  call: (input: { card: { data: unknown }; unit: string; group: BundleChunk[] }) => Promise<MatchCallResult>;
  /** 카드의 트랙(평가단위에서 정함)의 공통 지식 조각 — 경영관리 카드는 경영관리 조각을 읽음 */
  loadChunks: (store: PrepStore, track: TrackSpec) => Promise<BundleChunk[]>;
  /** 한 번 묻는 조각 묶음의 글자 수 상한(시험에서 작게) */
  maxChars?: number;
}

const FEATURE = "prep_match";
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

/** 호출 하나를 ai_requests에 남김(토큰·오류만, 본문 저장 안 함). 작업을 건 사람이 있으면 user_id, 없으면 비움 */
async function logCall(store: PrepStore, job: PrepJob, cardId: string, r: MatchCallResult | { error: string }, ms: number) {
  // 소요 시간(호출 시작 → 끝, 실패 포함): 처리기는 running 행을 거치지 않고 끝난 뒤 한 번에 넣으므로 호출부가 잰 ms를 직접 남김
  const base = { user_id: job.requested_by, card_id: cardId, job_id: job.id, feature: FEATURE, mode: job.kind, duration_ms: Math.max(0, Math.round(ms)), finished_at: new Date().toISOString() };
  const row: Record<string, unknown> = "error" in r ? { ...base, status: "error", error: r.error } : { ...base, model: r.provider === "cli" ? `cli/${r.model}` : r.model, status: "ok", ...aiUsageColumns(r.usage) };
  const { error } = await store.table("ai_requests", "write").insert(row);
  if (error) console.error("[prep] ai_requests 기록 실패", error.message);
}

export function matchKnowledgeHandler(deps: MatchKnowledgeDeps): PrepHandler {
  return async ({ store, job }) => {
    const { data: card, error: cardError } = await store.table("cards", "read").select("id, eval_unit_id, data, status").eq("id", job.target).maybeSingle();
    if (cardError) throw new Error(`카드를 읽지 못했습니다: ${cardError.message}`);
    if (!card || card.status !== "active") return { progress: { skipped: card ? "보관한 카드" : "카드 없음" } };

    const docIds = Array.isArray(job.payload.docIds) ? job.payload.docIds.filter((d): d is string => typeof d === "string") : undefined;
    const candidates = matchCandidates(await deps.loadChunks(store, trackSpecOfUnit(card.eval_unit_id)), card.eval_unit_id, docIds);
    if (!candidates.length) return { progress: { candidates: 0, hits: 0 } };

    // 묶음마다 부름 — 하나라도 실패하면 던져서 아무것도 쓰지 않음(부분 결과로 옛 자동 행을 지우지 않게)
    const groups = splitByBudget(candidates, deps.maxChars);
    const hits: ScopeHit[] = [];
    let dropped = 0;
    for (const group of groups) {
      let r: MatchCallResult;
      const t0 = Date.now();
      try {
        r = await deps.call({ card: { data: card.data }, unit: card.eval_unit_id, group });
      } catch (e) {
        await logCall(store, job, card.id, { error: errorText(e) }, Date.now() - t0);
        throw e;
      }
      await logCall(store, job, card.id, r, Date.now() - t0);
      const parsed = parseMatches(r.result, new Set(group.map((c) => c.chunk_key)));
      const offset = hits.length;
      hits.push(...parsed.hits.map((h) => ({ ...h, rank: offset + (h.rank ?? 0) })));
      dropped += parsed.dropped;
    }

    const { data: existing, error: readError } = await store.table("card_knowledge_scope", "read").select("card_id, chunk_key, status, method, score, rank, basis").eq("card_id", card.id);
    if (readError) throw new Error(`대응표를 읽지 못했습니다: ${readError.message}`);
    const plan = planScopeWrites(card.id, (existing ?? []) as ScopeRow[], new Set(candidates.map((c) => c.chunk_key)), hits, "ai");

    const scope = () => store.table("card_knowledge_scope", "write");
    if (plan.insert.length) {
      // 이미 있는 행(그사이 사람이 정한 것 포함)은 건드리지 않음 — ON CONFLICT DO NOTHING
      const { error } = await scope().upsert(plan.insert, { onConflict: "card_id,chunk_key", ignoreDuplicates: true });
      if (error) throw new Error(`대응표 쓰기 실패: ${error.message}`);
    }
    for (const row of plan.update) {
      const { error } = await scope()
        .update({ score: row.score, rank: row.rank, basis: row.basis, status: row.status })
        .eq("card_id", card.id)
        .eq("chunk_key", row.chunk_key)
        .eq("method", "ai")
        .in("status", ["auto", "candidate"]);
      if (error) throw new Error(`대응표 쓰기 실패: ${error.message}`);
    }
    if (plan.remove.length) {
      const { error } = await scope().delete().eq("card_id", card.id).eq("method", "ai").in("status", ["auto", "candidate"]).in("chunk_key", plan.remove);
      if (error) throw new Error(`대응표 지우기 실패: ${error.message}`);
    }
    return { progress: { candidates: candidates.length, groups: groups.length, hits: hits.length, dropped, inserted: plan.insert.length, updated: plan.update.length, removed: plan.remove.length } };
  };
}
