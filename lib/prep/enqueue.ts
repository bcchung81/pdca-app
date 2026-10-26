import "server-only";

// 작업 등록(로그인 사용자 권한 — RLS가 그 대상을 쓸 수 있는 사람만 통과시키고 requested_by를 자기 이름으로 강제)과
// 서버 액션 뒤 자동 처리(kickPrep → after()). 처리는 lib/prep/run.ts, 등록 계기는 triggers.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { enqueueWith } from "./enqueue-core.ts";
import { PREP_HANDLERS } from "./handlers/index.ts";
import { prepAutoKinds } from "./policy.ts";
import { drainPrepJobs } from "./run.ts";
import { prepStore } from "./store.ts";
import type { NewJob } from "./types.ts";

/** after()가 한 번에 돌리는 시간(서버 액션이 놓인 페이지의 maxDuration 안) */
const AFTER_BUDGET_MS = 240_000;

export function enqueuePrepJobs(supabase: SupabaseClient, userId: string, jobs: NewJob[]) {
  return enqueueWith(
    async (job) => {
      const { error } = await supabase.from("prep_jobs").insert({ kind: job.kind, target: job.target, payload: job.payload ?? {}, requested_by: userId });
      return { error };
    },
    jobs,
  );
}

/** 응답을 보낸 뒤 자동 처리 종류(policy.ts)의 대기 작업을 처리한다. 서버 액션·라우트 안에서만 부른다 */
export function kickPrep(): void {
  const kinds = prepAutoKinds(process.env);
  if (kinds.length === 0) return;
  after(async () => {
    try {
      await drainPrepJobs({ store: prepStore(), handlers: PREP_HANDLERS, kinds, budgetMs: AFTER_BUDGET_MS });
    } catch (e) {
      console.error("[prep] 자동 처리 실패", e);
    }
  });
}
