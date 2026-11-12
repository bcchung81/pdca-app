// 경영관리 초안의 「주요사업 경평 초안(참고)」 선택 규칙(순수 — 화면 components/reports/draft-workbench.tsx가 씀)

/** 첫 주요사업 초안 선택: 지난 초안의 biz → 없으면 저장된 구성안 sources.biz → 없으면 빈 선택(후보에 있는 것만).
 *  구성안 biz를 안 이으면 집필 요청의 off(b:)로 구성안에서 고른 주요사업이 지워짐 */
export function initialBiz(p: { used?: { biz?: string[] } | null; outlineBiz?: string[]; biz?: Array<{ id: string }> }): string[] {
  const ids = p.used?.biz?.length ? p.used.biz : (p.outlineBiz ?? []);
  const cands = new Set((p.biz ?? []).map((b) => b.id));
  return ids.filter((id) => cands.has(id));
}

/**
 * 서버에 보낼 뺀 열쇠(pickOf의 off): 뺀 c:·r: + 고르지 않은 주요사업 후보 b:<id>
 * + 저장된 biz(지난 초안·구성안) 중 지금 후보 목록에 없는 것(초안 삭제·보관 — 쓸 수 없음)도 함께 보내 다음 요청에서 빠지게
 */
export function offKeysOf(off: Iterable<string>, cands: Array<{ id: string }>, picked: Set<string>, saved: string[] = []): string[] {
  const have = new Set(cands.map((b) => b.id));
  const gone = [...new Set(saved)].filter((id) => !have.has(id));
  return [...off, ...cands.filter((b) => !picked.has(b.id)).map((b) => `b:${b.id}`), ...gone.map((id) => `b:${id}`)];
}

/** 「약 n만 자」(1만 자 미만은 「약 n천 자」, 1천 자 미만·0은 「n자」 — 0에 「약 1천 자」를 내지 않음) */
export const approxChars = (n: number) => (n >= 10_000 ? `약 ${(n / 10_000).toFixed(1)}만 자` : n >= 1000 ? `약 ${Math.round(n / 1000)}천 자` : `${Math.max(0, Math.round(n))}자`);

/** 「주요사업3 5-가」 → { group: "3", no: "5-가" } — 다른 주요사업의 같은 번호를 가르려고 묶음 번호를 함께 보임(형식이 다르면 group 빈 값) */
export function bizNoParts(taskId: string): { group: string; no: string } {
  const m = /^주요사업(\d+)\s+(.+)$/.exec(taskId);
  return m ? { group: m[1], no: m[2] } : { group: "", no: taskId };
}
