import "server-only";

// 등록 계기(docs/plan/참고자료-3단계-구현계획.md Task 5 · 3-5 재정의 — 삭제, git 이력 c7dfa69): 카드가 바뀌거나 생기면 「공통 지식 대응」 매칭 작업을 등록하고 자동 처리를 건다.
// 3-5 재정의(2026-09-30)로 근거 목록표 재준비와 보고서 추가자료 AI 제안은 없앴다 — 목록표는 요청 때 계산하고 자료의 과제는 사람이 고른다.
// 저장 결과를 실패로 만들지 않도록 어떤 오류도 던지지 않고 로그만 남긴다 — 매칭이 없어도 요청은 규칙 범위 전부로 된다(원칙 1).
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueuePrepJobs, kickPrep } from "./enqueue.ts";
import { cardIdentityFingerprint } from "./fingerprint.ts";
import type { NewJob } from "./types.ts";

async function register(supabase: SupabaseClient, userId: string, jobs: NewJob[]) {
  if (jobs.length === 0) return;
  try {
    const { queued } = await enqueuePrepJobs(supabase, userId, jobs);
    if (queued > 0) kickPrep();
  } catch (e) {
    console.error("[prep] 작업 등록 실패", e);
  }
}

/** 원장 카드가 저장·확정·현행화로 바뀜 — 과제 정체성(과제명·실행과제·계량지표)이 바뀐 경우만 다시 매칭 */
export async function prepCardChanged(supabase: SupabaseClient, userId: string, cardId: string, before: unknown, after: unknown) {
  if (cardIdentityFingerprint(before) === cardIdentityFingerprint(after)) return;
  await register(supabase, userId, [{ kind: "match_knowledge", target: cardId }]);
}

/** 새 카드가 생기거나 보관했던 카드를 되살림 — 전체 문서와 매칭 */
export async function prepCardAdded(supabase: SupabaseClient, userId: string, cardId: string) {
  await register(supabase, userId, [{ kind: "match_knowledge", target: cardId }]);
}
