// 동시 실행 풀(순수 — 화면·스크립트 공용, 2026-10-10 개선 계획 B5). 월간 일괄 점검이 한 건씩(과제당 6~7분, 59장 ≈ 6.5시간)이라 동시 2건으로.
// 동시 수는 AI 동시 실행 제한(lib/ai/request-log.ts AI_LIMITS.running)과 같아야 함 — 넘으면 서버가 「이미 N건」으로 거절(시험이 같음을 지킴).

export const BATCH_CONCURRENCY = 2;

/**
 * items를 limit건씩 동시에 worker로 처리. 결과는 입력 순서대로(시작하지 못했거나 던진 자리는 undefined).
 * opts.stopped()가 참이면 새 일을 시작하지 않음(도는 일은 끝까지). 던진 일은 opts.onError로 넘기고 다른 일은 계속
 */
export async function runPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  opts: { stopped?: () => boolean; onError?: (e: unknown, index: number) => void } = {},
): Promise<Array<R | undefined>> {
  const out: Array<R | undefined> = items.map(() => undefined);
  let next = 0;
  const lane = async () => {
    while (next < items.length && !opts.stopped?.()) {
      const i = next++;
      try {
        out[i] = await worker(items[i], i);
      } catch (e) {
        opts.onError?.(e, i);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
  return out;
}
