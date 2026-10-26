// 작업 등록의 순수 부분: 한 건씩 넣어 보고, 같은 대상의 대기 작업이 이미 있으면(유일 위반) 건너뛰되 문서 목록은 그 작업에 합친다. 입출력은 주입받는다.

import type { NewJob } from "./types.ts";

export interface InsertResult {
  error: { code?: string; message: string } | null;
}

/**
 * 같은 (종류, 대상)의 대기 작업이 이미 있을 때 두 payload를 합친다. 매칭 작업의 docIds는 「이 문서들만」이라 대기 작업이 최신 상태를 읽는다는 가정이 안 맞는다 —
 * 문서를 연달아 올리면 첫 문서의 작업만 남아 나머지 문서가 매칭에서 빠짐. docIds는 합집합(기존 순서 먼저), 어느 쪽이든 docIds가 없으면(= 전체 문서) 전체로. 다른 키는 기존 값 유지
 */
export function mergeJobPayload(existing: Record<string, unknown> | null | undefined, incoming: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const ids = (p: Record<string, unknown> | null | undefined): string[] | null => (Array.isArray(p?.docIds) && p.docIds.length ? p.docIds.filter((d): d is string => typeof d === "string") : null);
  const { docIds: _drop, ...rest } = existing ?? {};
  void _drop;
  const a = ids(existing);
  const b = ids(incoming);
  return a && b ? { ...rest, docIds: [...new Set([...a, ...b])] } : rest;
}

/**
 * 한 건씩 넣어 본다. 대기 작업이 이미 있으면(23505) 건너뛰고, merge가 있으면 그 작업의 payload에 이번 문서 목록을 합치게 한다(true면 합침).
 * merge는 서비스 키 경로만 준다 — 사용자 권한(RLS)은 prep_jobs를 고칠 수 없다. 합침 건수 merged는 merge를 준 경우에만 돌려줌
 */
export async function enqueueWith(
  insert: (job: NewJob) => Promise<InsertResult>,
  jobs: NewJob[],
  merge?: (job: NewJob) => Promise<boolean>,
): Promise<{ queued: number; skipped: number; merged?: number }> {
  let queued = 0;
  let skipped = 0;
  let merged = 0;
  for (const job of jobs) {
    const { error } = await insert(job);
    if (!error) queued++;
    else if (error.code === "23505") {
      skipped++; // 같은 (종류, 대상)의 대기 작업이 이미 있음
      if (merge && (await merge(job))) merged++;
    } else throw new Error(`작업 등록 실패(${job.kind} ${job.target}): ${error.message}`);
  }
  return merge ? { queued, skipped, merged } : { queued, skipped };
}
