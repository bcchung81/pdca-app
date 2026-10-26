/**
 * API 요청 user 글 블록 만들기(입출력 없음 — 캐시 표지 위치를 시험하려고 `run.ts`에서 분리): 공유 덩이(표지) → 그림 → 요청 글 → 끝부분(표지 없음).
 * 요청 글 표지(cachePrompt이거나 끝부분이 있을 때)가 있으면 시스템 1 + 공유 덩이 2 + 요청 글 1 = 4개, 없으면 시스템 1 + 공유 덩이 3 = 4개로 API 한도(4)를 안 넘김.
 * 경평 집필 1차 요청(cachePrompt)과 자동 고치기 요청(끝부분)은 요청 글 블록이 바이트까지 같아 고치기가 1차 글을 캐시로 읽음
 */
export function userBlocks<M extends object>(o: { shared: string[]; prompt: string; cache: { type: "ephemeral"; ttl: "5m" | "1h" }; tail?: string; cachePrompt?: boolean; media?: M }) {
  const mark = o.cachePrompt || o.tail !== undefined;
  return [
    // 덩이 글은 모두 보내고 표지만 한도 안에서 앞 덩이에(sharedTexts는 통째로 넣기면 2개·선별 방식이면 3개까지 — 요청 글 표지가 있을 때 셋째 덩이만 표지 없음)
    ...o.shared.map((text, i) => (i < (mark ? 2 : 3) ? { type: "text" as const, text, cache_control: o.cache } : { type: "text" as const, text })),
    ...(o.media ? [o.media] : []),
    mark ? { type: "text" as const, text: o.prompt, cache_control: o.cache } : { type: "text" as const, text: o.prompt },
    ...(o.tail ? [{ type: "text" as const, text: o.tail }] : []),
  ];
}
