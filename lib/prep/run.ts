// 작업 대기열을 비우는 처리기: 대기 작업을 하나씩 잡아 종류별 처리기로 돌린다.
// 저장소(PrepStore)와 처리기를 주입받아 입출력이 없다 — 서버 액션 뒤 after()·라우트·로컬 스크립트가 같은 함수를 부른다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { stateAfterError } from "./queue.ts";
import type { PrepJob, PrepKind } from "./types.ts";

export interface PrepFinish {
  status: "done" | "failed" | "queued";
  error?: string;
  progress?: Record<string, unknown>;
}

/** 처리기가 만지는 저장소. 구현(store.ts)은 쓸 표를 한정한다 */
export interface PrepStore {
  /** 대기 작업 하나를 원자적으로 잡는다(오래된 순). exclude는 이번 드레인에서 다시 잡지 않을 작업 */
  claim(kinds: PrepKind[], exclude?: number[]): Promise<PrepJob | null>;
  finish(id: number, result: PrepFinish): Promise<void>;
  /** 실행 중인 채 오래된 작업을 대기로 되돌린다. 되돌린 건수 */
  reclaimStuck(now: Date): Promise<number>;
  countQueued(kinds: PrepKind[]): Promise<number>;
  /** 읽기: 한정 목록 안의 표에서 select만 열어 줌(고치기·지우기는 타입에도 런타임에도 없음). 목록 밖 표는 던진다 */
  table(name: string, mode: "read"): ReadTable;
  /** 쓰기: 쓸 수 있는 표(PREP_WRITE_TABLES)만. 읽기 전용 표·목록 밖 표는 던진다 */
  table(name: string, mode: "write"): WriteTable;
  /** 기존 조회 함수(loadBundleChunks 등)에 넘길 select 전용 클라이언트 — from(표).select(...)만 있음 */
  reader(): SupabaseClient;
}

export type WriteTable = ReturnType<SupabaseClient["from"]>;
export type ReadTable = Pick<WriteTable, "select">;

export interface PrepHandlerCtx {
  store: PrepStore;
  job: PrepJob;
}
export type PrepHandler = (ctx: PrepHandlerCtx) => Promise<{ progress?: Record<string, unknown> } | void>;

export interface DrainOptions {
  store: PrepStore;
  handlers: Partial<Record<PrepKind, PrepHandler>>;
  /** 이번에 돌릴 종류(처리기가 있는 것만 잡음) */
  kinds: PrepKind[];
  /** 이 시간이 지나면 다음 작업을 잡지 않음(진행 중인 작업은 끝까지) */
  budgetMs: number;
  maxJobs?: number;
  now?: () => number;
}

export interface DrainResult {
  done: number;
  failed: number;
  requeued: number;
  reclaimed: number;
  /** 아직 대기 중인 작업 수 */
  left: number;
}

const MESSAGE_MAX = 500;

export async function drainPrepJobs(opts: DrainOptions): Promise<DrainResult> {
  const now = opts.now ?? Date.now;
  const start = now();
  const kinds = opts.kinds.filter((k) => opts.handlers[k]);
  const result: DrainResult = { done: 0, failed: 0, requeued: 0, reclaimed: 0, left: 0 };
  if (kinds.length === 0) return result;

  result.reclaimed = await opts.store.reclaimStuck(new Date(start));
  const retried: number[] = [];
  const max = opts.maxJobs ?? Number.POSITIVE_INFINITY;

  while (result.done + result.failed + result.requeued < max && now() - start < opts.budgetMs) {
    const job = await opts.store.claim(kinds, retried);
    if (!job) break;
    try {
      const out = await opts.handlers[job.kind]!({ store: opts.store, job });
      await opts.store.finish(job.id, { status: "done", progress: out?.progress });
      result.done++;
    } catch (e) {
      const status = stateAfterError(job.attempts);
      await opts.store.finish(job.id, { status, error: (e instanceof Error ? e.message : String(e)).slice(0, MESSAGE_MAX) });
      if (status === "queued") {
        retried.push(job.id);
        result.requeued++;
      } else result.failed++;
    }
  }
  result.left = await opts.store.countQueued(kinds);
  return result;
}
