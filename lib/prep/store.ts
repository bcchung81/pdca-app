import "server-only";

// 처리기 저장소 구현: 서비스 키(RLS 우회)로 prep_jobs를 잡고 끝맺으며, 쓸 수 있는 표를 tables.ts의 목록으로 한정한다.
// 작업을 등록할 때(enqueue.ts)는 로그인 사용자 권한(RLS)이 확인하고 requested_by를 남긴다 — 여기서는 등록하지 않는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../supabase/admin.ts";
import { STUCK_LIMIT_MS, reclaimState } from "./queue.ts";
import type { PrepFinish, PrepStore, ReadTable } from "./run.ts";
import { assertPrepTable, type PrepMode } from "./tables.ts";
import type { PrepJob, PrepKind } from "./types.ts";

const JOB_COLS = "id, kind, target, payload, status, attempts, requested_by";

export function prepStore(db: SupabaseClient = createAdminClient()): PrepStore {
  const jobs = () => db.from("prep_jobs");
  return {
    async claim(kinds: PrepKind[], exclude: number[] = []) {
      let q = jobs().select(JOB_COLS).eq("status", "queued").in("kind", kinds).order("created_at").order("id").limit(5);
      if (exclude.length) q = q.not("id", "in", `(${exclude.join(",")})`);
      const { data, error } = await q;
      if (error) throw new Error(`작업 조회 실패: ${error.message}`);
      for (const cand of data ?? []) {
        // 조건부 갱신으로 원자적으로 잡는다 — 다른 처리기가 먼저 잡았으면 0행
        const { data: got, error: e2 } = await jobs()
          .update({ status: "running", started_at: new Date().toISOString(), attempts: cand.attempts + 1 })
          .eq("id", cand.id)
          .eq("status", "queued")
          .select(JOB_COLS);
        if (e2) throw new Error(`작업 잡기 실패: ${e2.message}`);
        if (got?.length) return got[0] as PrepJob;
      }
      return null;
    },

    async finish(id: number, result: PrepFinish) {
      const ended = result.status !== "queued";
      const patch: Record<string, unknown> = {
        status: result.status,
        error: result.error ?? null,
        finished_at: ended ? new Date().toISOString() : null,
        started_at: ended ? undefined : null,
      };
      if (result.progress) patch.progress = result.progress;
      const { error } = await jobs().update(patch).eq("id", id);
      if (error) throw new Error(`작업 끝맺기 실패: ${error.message}`);
    },

    async reclaimStuck(now: Date) {
      const before = new Date(now.getTime() - STUCK_LIMIT_MS).toISOString();
      const { data, error } = await jobs().select("id, attempts").eq("status", "running").lt("started_at", before);
      if (error) throw new Error(`멈춘 작업 조회 실패: ${error.message}`);
      let back = 0;
      for (const row of data ?? []) {
        // 시도 횟수 상한이면 실패로 닫음(시간 초과로 죽는 작업이 끝없이 다시 돌지 않게)
        if (reclaimState(Number(row.attempts ?? 0)) === "failed") {
          await jobs().update({ status: "failed", error: `시간 초과로 ${row.attempts}번 멈춤 — 더 시도하지 않음`, finished_at: now.toISOString() }).eq("id", row.id).eq("status", "running");
          continue;
        }
        const { error: e2 } = await jobs().update({ status: "queued", started_at: null }).eq("id", row.id).eq("status", "running");
        if (!e2) back++;
        // 같은 대상의 대기 작업이 이미 있으면(유일 위반) 멈춘 쪽은 실패로 닫는다
        else if (e2.code === "23505") await jobs().update({ status: "failed", error: "멈춘 작업 — 같은 대상의 대기 작업이 이미 있어 닫음", finished_at: now.toISOString() }).eq("id", row.id);
        else throw new Error(`멈춘 작업 되돌리기 실패: ${e2.message}`);
      }
      return back;
    },

    async countQueued(kinds: PrepKind[]) {
      const { count, error } = await jobs().select("id", { count: "exact", head: true }).eq("status", "queued").in("kind", kinds);
      if (error) throw new Error(`대기 작업 세기 실패: ${error.message}`);
      return count ?? 0;
    },

    table(name: string, mode: PrepMode) {
      assertPrepTable(name, mode);
      const t = db.from(name);
      // 읽기는 select만 열어 줌 — 읽기 전용 표를 실수로 고치지 못하게
      return mode === "write" ? t : ({ select: t.select.bind(t) } as ReadTable);
    },

    reader() {
      const from = (name: string) => {
        assertPrepTable(name, "read");
        const t = db.from(name);
        return { select: t.select.bind(t) };
      };
      return { from } as unknown as SupabaseClient;
    },
  } as PrepStore;
}
