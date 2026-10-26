// 현황 「이달 할 일」 줄의 보충 글 — 남은 일이 어느 본부·부서에 몰려 있는지 「A 22 · B 15 외 2곳」로(순수).

/**
 * 묶음 이름(본부·부서) 목록(항목 하나당 한 번씩)을 많은 순(같으면 가나다순) 상위 top개로 세어 적음.
 * 남은 묶음 수는 「외 N곳」. 비어 있으면 빈 글.
 */
export function spreadText(groups: string[], top = 3): string {
  const count = new Map<string, number>();
  for (const g of groups) count.set(g, (count.get(g) ?? 0) + 1);
  const sorted = [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));
  const head = sorted.slice(0, top).map(([name, n]) => `${name} ${n}`);
  const rest = sorted.length - head.length;
  return head.join(" · ") + (rest > 0 ? ` 외 ${rest}곳` : "");
}

/** 제출 시각(ISO)들 중 가장 오래된 것이 지금부터 며칠 전인지(없으면 null). 하루 미만은 0 */
export function oldestDaysAgo(isoTimes: Array<string | null | undefined>, now: Date): number | null {
  const times = isoTimes.flatMap((t) => (t ? [new Date(t).getTime()] : [])).filter((t) => !Number.isNaN(t));
  if (!times.length) return null;
  return Math.max(0, Math.floor((now.getTime() - Math.min(...times)) / 86_400_000));
}
