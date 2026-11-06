import "server-only";

// AI 백그라운드 작업 시작·실행(2026-11-06 — 마이그레이션 20261106100000_ai_results.sql, 순수 규칙은 lib/ai/jobs.ts·job-run.ts).
// 서버 액션은 로그인·권한·부서 화면 보기 막기·입력 검증·잠금·근거 모으기를 지금처럼 앞에서 한 뒤 startAiJob(중복 막기 → 제한 → running 행)으로 시작하고,
// launchAiJob으로 AI 호출·검증·저장을 응답 뒤 after()에 넘긴 다음 { requestId }를 바로 돌려줌. after는 그 서버 액션이 놓인 화면의 maxDuration 안에서 돎(Next after.md).
// after 안의 DB 쓰기는 시작 때 만든 사용자 권한 작업 클라이언트(lib/supabase/job-client.ts — RLS, 서비스 키 아님)로만.

import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { createJobClient } from "../supabase/job-client.ts";
import { runJob } from "./job-run.ts";
import { JOB_KINDS, type JobKind, type JobOutcome, type JobRow, busyJobMessage } from "./jobs.ts";
import { AI_LIMITS, type AiRequestStart, startAiRequest, startAiRequests } from "./request-log.ts";

type Req = Extract<AiRequestStart, { ok: true }>;

export interface AiJobStart {
  ok: true;
  /** after 안에서 쓸 사용자 권한 클라이언트 */
  db: SupabaseClient;
  /** 호출 기록(여러 안이면 안마다 — 첫 행이 작업) */
  reqs: Req[];
  requestId: number;
  kind: JobKind;
  userId: string;
  cardId: string;
}

const SESSION_GONE = "로그인이 끝났습니다. 화면을 새로 고친 뒤 다시 시도해 주세요.";

/** 이 사용자·이 카드에서 같은 묶음 작업이 도는지(본인 기록 — 결과 끝맺음과 함께 읽음) */
async function busyJob(db: SupabaseClient, userId: string, cardId: string, kind: JobKind): Promise<string | null> {
  const { data, error } = await db
    .from("ai_requests")
    .select("job, status, error, created_at, res:ai_results(ok:result->ok, message:result->>message)")
    .eq("user_id", userId)
    .eq("card_id", cardId)
    .not("job", "is", null)
    .gte("created_at", new Date(Date.now() - AI_LIMITS.staleMs).toISOString());
  if (error) console.error("[ai-job] 진행 중 작업 확인 실패", error.message);
  return busyJobMessage((data ?? []) as Array<Pick<JobRow, "job" | "status" | "error" | "created_at" | "res">>, kind);
}

/**
 * 백그라운드 작업 시작(서버 액션 안 — 권한·입력 검증 뒤): 작업 클라이언트 → 같은 카드·같은 묶음 중복 막기 → 호출 제한(1분 5회·동시 2건)·running 행.
 * n을 주면 여러 안 묶음(안마다 행 — startAiRequests)
 */
export async function startAiJob(o: { userId: string; cardId: string; kind: JobKind; mode?: string | null; n?: number }): Promise<AiJobStart | { ok: false; message: string }> {
  const db = await createJobClient();
  if (!db) return { ok: false, message: SESSION_GONE };
  const busy = await busyJob(db, o.userId, o.cardId, o.kind);
  if (busy) return { ok: false, message: busy };
  const base = { userId: o.userId, cardId: o.cardId, feature: JOB_KINDS[o.kind].feature, mode: o.mode ?? null, job: o.kind };
  let reqs: Req[];
  if (o.n) {
    const b = await startAiRequests(db, base, o.n);
    if (!b.ok) return b;
    reqs = b.reqs;
  } else {
    const r = await startAiRequest(db, base);
    if (!r.ok) return r;
    reqs = [r];
  }
  return { ok: true, db, reqs, requestId: reqs[0].id, kind: o.kind, userId: o.userId, cardId: o.cardId };
}

/**
 * 시작한 작업을 응답 뒤에 돌림(after): work가 끝나면 결과 행(ai_results) 하나, 던지면 짧은 실패 글로 결과 행 + 아직 running인 호출 기록은 error로(lib/ai/job-run.ts).
 * work 안에서는 request API(cookies·headers)·revalidatePath를 쓰지 않음 — 필요한 값은 시작에서 읽어 넘기고, 화면은 끝난 것을 보고 스스로 새로 그림
 */
export function launchAiJob(s: AiJobStart, work: () => Promise<JobOutcome>): void {
  const feature = JOB_KINDS[s.kind].feature;
  after(() =>
    runJob(work, {
      save: async (result) => {
        const { error } = await s.db.from("ai_results").insert({ request_id: s.requestId, user_id: s.userId, card_id: s.cardId, feature, result });
        return error ? error.message : null;
      },
      fail: async (message) => {
        for (const r of s.reqs) await r.finish({ status: "error", error: message });
      },
    }).then(() => undefined),
  );
}
