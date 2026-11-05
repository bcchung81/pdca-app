// 카드 전용 자료 지우기 잠금(입출력 없음): 확정(제출·승인)한 보고서 초안이 근거로 쓴 자료는 지우지 못함.
// DB 정책(private.card_material_locked, 20261104100000)과 같은 규칙 — 서버 액션은 이것으로 먼저 거절하고 목록의 삭제 단추를 끔.

export const MATERIAL_LOCKED_MSG = "확정된 보고서의 근거 자료라 지울 수 없습니다 — 보고서 확정을 풀면 지울 수 있습니다.";

/** 초안 한 행에서 근거 칸만(spec.sources·outline.sources.card — PostgREST json 경로로 읽은 값이라 모양을 믿지 않음) */
export interface DraftSourceRow {
  year: number;
  sources: unknown;
  outlineCard: unknown;
}

/** 초안 한 행이 근거로 쓴 카드 전용 자료 id */
export function draftMaterialIds(row: Pick<DraftSourceRow, "sources" | "outlineCard">): string[] {
  const fromSpec = Array.isArray(row.sources) ? row.sources.filter((s) => s && s.kind === "card" && typeof s.id === "string").map((s) => s.id as string) : [];
  const fromOutline = Array.isArray(row.outlineCard) ? row.outlineCard.filter((id): id is string => typeof id === "string") : [];
  return [...fromSpec, ...fromOutline];
}

/** 잠긴 연도(그 카드 보고서가 제출·승인인 연도)의 초안이 근거로 쓴 자료 id */
export function lockedMaterialIds(drafts: DraftSourceRow[], lockedYears: ReadonlySet<number>): Set<string> {
  return new Set(drafts.filter((d) => lockedYears.has(d.year)).flatMap(draftMaterialIds));
}
