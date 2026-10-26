// 같은 과제의 대기 작업에 문서 목록 합치기(서비스 키 경로 — 시드·CLI·등록 스크립트). 사용자 권한(RLS)은 prep_jobs를 고칠 수 없어 이 함수를 쓰지 않는다.
// 합치는 규칙은 순수 함수 mergeJobPayload(enqueue-core.ts).

import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeJobPayload } from "./enqueue-core.ts";
import type { NewJob } from "./types.ts";

/** enqueueWith의 merge 인자 — 그 (종류, 대상)의 대기 작업 payload에 job.payload를 합침. 합쳐서 바뀌었으면 true */
export const mergeQueuedJob = (db: SupabaseClient) => async (job: NewJob): Promise<boolean> => {
  const { data } = await db.from("prep_jobs").select("id, payload").eq("kind", job.kind).eq("target", job.target).eq("status", "queued").maybeSingle();
  if (!data) return false;
  const next = mergeJobPayload(data.payload as Record<string, unknown>, job.payload);
  if (JSON.stringify(next) === JSON.stringify(data.payload ?? {})) return false;
  // 읽은 뒤 처리기가 집어 갔을 수 있어 대기 상태일 때만 고침(집어 갔으면 그 작업은 옛 목록으로 이미 도는 중 — 다음 등록이 새 작업이 됨)
  const { error } = await db.from("prep_jobs").update({ payload: next }).eq("id", data.id).eq("status", "queued");
  return !error;
};
