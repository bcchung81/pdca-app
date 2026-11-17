// 저장소 파일 지우기 결과 확인(2026-11-18 웹 취약점 낮음 보완 — 근거 T4 A09·T2-F1). 행을 지운 뒤 부르는 저장소 지우기가
// 실패하거나 일부만 지워지면 서버 로그 한 줄(JSON, kind = storage_remove_failed)을 남깁니다. 화면에 돌려주는 결과는 바꾸지 않습니다(행은 이미 지워짐).
// remove는 권한이 없거나 파일이 없으면 오류 없이 빈 목록을 주므로 지운 수도 셉니다. 남은 파일은 pnpm storage:prune-orphans가 정리합니다.

/** storage-js remove의 결과 모양(쓰는 것만) */
export interface RemoveResult {
  data: unknown[] | null;
  error: { message: string } | null;
}

/** remove를 가진 저장소 클라이언트(서버 Supabase 클라이언트) */
export interface RemoveClient {
  storage: { from(bucket: string): { remove(paths: string[]): PromiseLike<RemoveResult> } };
}

/** 지우기 결과가 모자라면 로그 한 줄(JSON), 다 지웠으면 null. 경로는 앞 5개만(저장소 키 — uid·uuid·번호뿐) */
export function removeFailLine(where: string, bucket: string, paths: string[], r: RemoveResult, now = Date.now()): string | null {
  const removed = r.data?.length ?? 0;
  if (!r.error && removed >= paths.length) return null;
  return JSON.stringify({
    t: new Date(now).toISOString(),
    kind: "storage_remove_failed",
    where,
    bucket,
    asked: paths.length,
    removed,
    paths: paths.slice(0, 5),
    ...(r.error ? { message: r.error.message.slice(0, 300) } : {}),
  });
}

/** 지우고 결과를 확인함 — 던지지 않고 지운 수를 돌려줌(모자라면 console.error 한 줄) */
export async function removeObjects(db: RemoveClient, bucket: string, paths: string[], where: string): Promise<number> {
  if (!paths.length) return 0;
  let r: RemoveResult;
  try {
    r = await db.storage.from(bucket).remove(paths);
  } catch (e) {
    r = { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
  }
  const line = removeFailLine(where, bucket, paths, r);
  if (line) console.error(line);
  return r.data?.length ?? 0;
}
