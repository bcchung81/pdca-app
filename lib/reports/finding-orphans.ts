// C3 소관 카드 없는 '25 지적(순수, 경영관리) — '25 평가위원 지적 원문이 그 지표 어느 카드의 「지적 및 개선방안」 행과도 안 겹치는 경우.
// 경영관리는 지적의 소관을 각 카드의 「지적 및 개선방안」 행으로 정하므로(lib/ai/inspect-mg.ts mgSiblingsOf) 카드가 빠뜨린 지적은 소관이 없어짐.
// 판정은 「지적사항 조치실적」(unit-parts-mg.ts buildFindingsPart)의 unmatched와 같은 글자 3자 묶음 포함도·같은 문턱(LINK_RULES.candidate)이라 두 화면이 어긋나지 않음 —
// 다만 여기서는 「가장 가까운 카드와 점수」까지 냄. 주요사업은 지적 연결표가 따로 있어 대상이 아님.

import { compareTaskNo } from "../cards/view.ts";
import { LINK_RULES } from "../knowledge/link.ts";
import { containment } from "../knowledge/similarity.ts";
import { realFindingLines } from "./findings.ts";
import type { OriginalFinding, UnitCard } from "./unit-parts-mg.ts";

export interface OrphanFinding {
  unit: string;
  finding: OriginalFinding;
  /** 가장 닮은 카드(과제번호)와 그 점수 — 카드에 지적 행이 하나도 없으면 null */
  nearest: { cardId: string; taskNo: string; score: number } | null;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** '25 지적 원문 가운데 어느 활성 카드의 지적 행과도 포함도가 문턱(LINK_RULES.candidate 0.25) 이상이 아닌 것 */
export function orphanFindings(unit: string, findings25: OriginalFinding[], cards: Array<Pick<UnitCard, "id" | "taskNo" | "status" | "data">>): OrphanFinding[] {
  const rows = cards
    .filter((c) => c.status === "active")
    .sort((a, b) => compareTaskNo(a.taskNo, b.taskNo))
    .flatMap((c) => {
      const list: unknown[] = Array.isArray(c.data?.findings?.rows) ? c.data.findings.rows : [];
      return list.map((r) => realFindingLines((r as { finding?: unknown } | null)?.finding).join(" ")).filter(Boolean).map((text) => ({ cardId: c.id, taskNo: c.taskNo, text }));
    });
  const out: OrphanFinding[] = [];
  for (const f of findings25) {
    let best: { cardId: string; taskNo: string; score: number } | null = null;
    for (const r of rows) {
      const score = containment(r.text, f.text, 3);
      if (!best || score > best.score) best = { cardId: r.cardId, taskNo: r.taskNo, score };
    }
    if (!best || best.score < LINK_RULES.candidate) out.push({ unit, finding: f, nearest: best && { ...best, score: round(best.score) } });
  }
  return out;
}
