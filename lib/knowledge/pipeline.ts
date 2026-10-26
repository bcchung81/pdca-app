// 적재 파이프라인(입출력 없음). CLI(scripts/knowledge/ingest.ts)와 테스트가 같이 씁니다.

import { KNOWLEDGE_DOCUMENTS } from "./documents.ts";
import type { FindingLink, MidFinalPair, TaskLite, TaskMapRow } from "./link.ts";
import { findingTargets, linkCardFindings, mapMidToFinal, mapTasksToCards, toCardLite } from "./link.ts";
import { parseAtt3 } from "./parsers/att3.ts";
import { parseAx } from "./parsers/ax.ts";
import { parseCoreItems } from "./parsers/core-items.ts";
import { parseCorrective } from "./parsers/corrective.ts";
import { parseCeoIndicators, parseGoals, parsePool } from "./parsers/indicators.ts";
import { parseMidreportBiz } from "./parsers/midreport-biz.ts";
import { parseMidreportMg } from "./parsers/midreport-mg.ts";
import { parsePlan } from "./parsers/plan.ts";
import { QA_MG_PARSERS } from "./parsers/qa-mg.ts";
import { parseReport25 } from "./parsers/report25.ts";
import { RPT_MG_PARSERS } from "./parsers/report25-mg.ts";
import { ruleScopeChecks } from "./scope-check.ts";
import type { SourceBlock } from "./source.ts";
import { loadKordocChunks } from "./source.ts";
import type { Check, KnowledgeChunk, KnowledgeDocumentSpec, ParseResult } from "./types.ts";

export const PARSER_VERSION = "knowledge-ingest/0.1.0";

const PARSERS: Record<string, (blocks: SourceBlock[]) => ParseResult> = {
  "plan-2607": parsePlan,
  "att3-2604": parseAtt3,
  "mid25-biz": (blocks) => parseMidreportBiz(blocks),
  "pool25-biz": parsePool,
  "goal30-2605": parseGoals,
  "ceo24-2605": parseCeoIndicators,
  "ax26-2605": parseAx,
  "rpt25-biz": parseReport25,
  "corr25-2610": (blocks) => parseCorrective(blocks),
  "mid25-mg": (blocks) => parseMidreportMg(blocks),
  "core25-mg": (blocks) => parseCoreItems(blocks),
  ...QA_MG_PARSERS,
  ...RPT_MG_PARSERS,
};

export interface IngestDocInput {
  spec: KnowledgeDocumentSpec;
  sha256: string | null;
  /** kordoc <이름>.chunks.json 내용 */
  kordoc: unknown;
}

export interface IngestedDocument extends KnowledgeDocumentSpec {
  sha256: string | null;
  parser_version: string;
  chunk_count: number;
  unit_counts: Record<string, number>;
  checks: Check[];
}

export interface IngestOutput {
  documents: IngestedDocument[];
  deferred: KnowledgeDocumentSpec[];
  chunks: Record<string, KnowledgeChunk[]>;
  checks: Check[];
  links: FindingLink[];
  unlinked: Array<{ card_id: string; card_finding: string; best: number }>;
  midFinal: MidFinalPair[];
  taskMap: TaskMapRow[];
  orphanTasks: TaskLite[];
}

/** 카드 지적 연결 회귀 표본(분석 §5-4 시험 결과) */
export const LINK_REGRESSION: Array<{ card: string; expect: string | null; minScore: number }> = [
  { card: "주요사업1/1-가", expect: "mid25-biz/BZ-1/03", minScore: 0.6 },
  { card: "주요사업1/2-가", expect: null, minScore: 0.9 },
  { card: "주요사업2/4-가", expect: "mid25-biz/BZ-2/06", minScore: 0.6 },
  { card: "주요사업3/2-나", expect: "mid25-biz/BZ-3/03", minScore: 0.9 },
  { card: "주요사업3/1-다", expect: "mid25-biz/BZ-4/16", minScore: 0.7 },
];

export function runIngest(inputs: IngestDocInput[], rawCards: unknown[]): IngestOutput {
  const documents: IngestedDocument[] = [];
  const chunks: Record<string, KnowledgeChunk[]> = {};
  const checks: Check[] = [];
  const extras: Record<string, Record<string, unknown> | undefined> = {};

  for (const input of inputs) {
    const parser = PARSERS[input.spec.doc_id];
    if (!parser) throw new Error(`파서가 없는 문서: ${input.spec.doc_id}`);
    const result = parser(loadKordocChunks(input.kordoc));
    chunks[input.spec.doc_id] = result.chunks;
    extras[input.spec.doc_id] = result.extras;
    const unit_counts: Record<string, number> = {};
    for (const c of result.chunks) unit_counts[c.unit_type] = (unit_counts[c.unit_type] ?? 0) + 1;
    documents.push({ ...input.spec, sha256: input.sha256, parser_version: PARSER_VERSION, chunk_count: result.chunks.length, unit_counts, checks: result.checks });
    checks.push(...result.checks.map((c) => ({ ...c, name: `[${input.spec.doc_id}] ${c.name}` })));
  }

  const all = Object.values(chunks).flat();
  checks.push(...ruleScopeChecks(all));
  const cards = rawCards.map((c) => toCardLite(c as Record<string, unknown>));

  // 중간 → 최종 이력 대응. 대응이 있으면 중간 행에 dedup_group(최종 조각 키)을 둡니다.
  const midFinal = mapMidToFinal(all);
  for (const pair of midFinal) {
    const row = all.find((c) => c.chunk_key === pair.mid_key)!;
    row.meta.final_match = pair.final_key ? { chunk_key: pair.final_key, finding_no: pair.final_no, score: pair.score } : null;
    row.meta.dedup_group = pair.final_key ? `${pair.final_key}#${pair.final_no}` : null;
  }
  const matched = midFinal.filter((p) => p.final_key).length;
  checks.push({ name: "[link] 중간보고서 행 ↔ 최종 평가보고서 지적 대응", level: "warn", ok: matched > 0, actual: `${matched}/${midFinal.length}`, note: "대응 없는 행은 최종에서 빠졌거나 표현이 크게 바뀐 지적" });

  // 카드 지적사항 ↔ 지적
  const midToFinal = new Map(midFinal.filter((p) => p.final_key).map((p) => [p.mid_key, `${p.final_key}#${p.final_no}`]));
  const { links, unlinked } = linkCardFindings(cards, findingTargets(all), midToFinal);
  const withFindings = new Set(cards.filter((c) => c.findings.length).map((c) => c.id));
  const cardsWithItems = new Set([...links.map((l) => l.card_id), ...unlinked.map((u) => u.card_id)]);
  const autoCards = new Set(links.filter((l) => l.status === "auto").map((l) => l.card_id));
  checks.push({
    name: "[link] 카드 지적사항 자동 연결",
    level: "warn",
    ok: autoCards.size >= 21,
    expected: "내용 있는 카드 24장 중 21장 이상(분석 시험값)",
    actual: { cards_with_findings_cell: withFindings.size, cards_with_finding_text: cardsWithItems.size, cards_auto_linked: autoCards.size },
  });
  for (const r of LINK_REGRESSION) {
    const top = links.filter((l) => l.card_id === r.card).sort((a, b) => b.score - a.score);
    const hit = r.expect ? top.find((l) => l.chunk_key === r.expect) : top[0];
    checks.push({
      name: `[link] 회귀 표본 ${r.card}`,
      level: "error",
      ok: Boolean(hit && hit.score >= r.minScore && hit.status === "auto"),
      expected: `${r.expect ?? "최고점"} ≥ ${r.minScore}`,
      actual: hit ? `${hit.chunk_key}#${hit.finding_no} ${hit.score}` : "연결 없음",
    });
  }

  // '26 과제 목록 ↔ 카드
  const tasks = ((extras["plan-2607"]?.tasks as TaskLite[] | undefined) ?? []).map((t) => ({ ...t }));
  const { rows: taskMap, orphanTasks } = mapTasksToCards(cards, tasks);
  const byStatus: Record<string, number> = {};
  for (const r of taskMap) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  checks.push({ name: "[link] 과제 대응표 초안(7월 목록 ↔ 9월 카드)", level: "warn", ok: true, actual: { cards: taskMap.length, ...byStatus, "7월 목록에만 있는 과제": orphanTasks.length } });

  const deferred = KNOWLEDGE_DOCUMENTS.filter((d) => d.status === "deferred");
  return { documents, deferred, chunks, checks, links, unlinked, midFinal, taskMap, orphanTasks };
}
