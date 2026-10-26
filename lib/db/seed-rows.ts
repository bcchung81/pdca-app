// Supabase 적재 행 만들기(입출력 없음). scripts/db/seed.ts와 마이그레이션 테스트가 같이 씁니다.
// 입력: seed/cards/260916(카드 59장·원본 양식 조각), resources/knowledge/_chunks(적재 결과)

import { BUSINESSES, businessByCardGroup } from "../knowledge/dictionaries.ts";
import type { FindingLink, TaskMapRow } from "../knowledge/link.ts";
import type { IngestedDocument } from "../knowledge/pipeline.ts";
import type { KnowledgeChunk } from "../knowledge/types.ts";
import { scopeRowsFromLinks, type LinkRow } from "../prep/scope.ts";
import { MGMT_INDICATORS } from "../tracks/mgmt-units.ts";

export interface RawCard {
  id: string;
  group: string;
  taskNo: string;
  title: string;
  department?: string;
  team?: string;
  [key: string]: unknown;
}

export interface SeedInput {
  edition: string;
  cards: RawCard[];
  /** 카드 ID → 원본 양식 조각 HTML */
  originalHtml: Map<string, string>;
  documents?: IngestedDocument[];
  chunks?: KnowledgeChunk[];
  links?: FindingLink[];
  taskMap?: TaskMapRow[];
}

export interface SeedRows {
  teams: Array<{ name: string; hq: string | null }>;
  evalUnits: Array<{ id: string; track: string; card_group: string | null; name: string; name_2025: string | null; sort: number }>;
  /** team_id는 쓸 때 team_name으로 찾아 넣습니다 */
  cards: Array<{ id: string; eval_unit_id: string; task_no: string; title: string; team_name: string | null; hq: string | null; edition: string; data: RawCard; original_html: string | null }>;
  documents: Array<Record<string, unknown>>;
  chunks: KnowledgeChunk[];
  /** 과제 대응표 규칙 행 — 지적 연결을 (과제, 조각) 단위로 합친 것(card_knowledge_scope) */
  scope: Array<Record<string, unknown>>;
  taskMap: Array<Record<string, unknown>>;
}

/**
 * 원본 카드에 잘못 적힌 본부 표기 → 바른 표기(사용자 확인 2026-09-30). 부서(teams.hq)에만 적용하고
 * 카드 본문·cards.hq는 원본 그대로 둡니다. 다시 적재해도 부서 표기가 되돌아가지 않게 하는 용도.
 */
export const HQ_CORRECTIONS: Readonly<Record<string, string>> = { 방송미디어부: "방송미디어본부" };

export function buildSeedRows(input: SeedInput): SeedRows {
  // 부서: 카드의 팀. 같은 팀이 두 본부로 적힌 경우(원본 오기)는 더 많이 쓰인 본부로
  const hqCount = new Map<string, Map<string, number>>();
  for (const c of input.cards) {
    if (!c.team) continue;
    const m = hqCount.get(c.team) ?? new Map<string, number>();
    m.set(c.department ?? "", (m.get(c.department ?? "") ?? 0) + 1);
    hqCount.set(c.team, m);
  }
  const teams = [...hqCount.entries()]
    .map(([name, m]) => {
      const hq = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0] || null;
      return { name, hq: hq ? (HQ_CORRECTIONS[hq] ?? hq) : null };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  const evalUnits: SeedRows["evalUnits"] = BUSINESSES.map((b, i) => ({
    id: b.id,
    track: "주요사업",
    card_group: b.cardGroup,
    name: b.name2026,
    name_2025: b.name2025,
    sort: i + 1,
  }));
  // 경영관리 지표(MG-n)를 가리키는 공통 지식 조각이 있으면 그 지표의 평가단위 행도 함께 — knowledge_chunks.business가 eval_units를 참조함(경영관리 카드를 올리는 scripts/db/mgmt-cards.ts와 같은 값)
  const mgmtUsed = new Set<string>((input.chunks ?? []).map((c) => c.business).filter((b): b is NonNullable<typeof b> => typeof b === "string" && b.startsWith("MG-")));
  for (const m of MGMT_INDICATORS.filter((x) => mgmtUsed.has(x.id))) evalUnits.push({ id: m.id, track: "경영관리", card_group: m.group, name: m.name, name_2025: null, sort: m.no });

  const cards = input.cards.map((c) => {
    const unit = businessByCardGroup(c.group);
    if (!unit) throw new Error(`카드 묶음을 평가 단위로 풀 수 없습니다: ${c.group}`);
    return {
      id: c.id,
      eval_unit_id: unit,
      task_no: c.taskNo,
      title: c.title,
      team_name: c.team ?? null,
      hq: c.department ?? null,
      edition: input.edition,
      data: c,
      original_html: input.originalHtml.get(c.id) ?? null,
    };
  });

  const documents = (input.documents ?? []).map((d) => ({
    doc_id: d.doc_id,
    title: d.title,
    file_name: d.file_name,
    edition: d.edition,
    published: d.published,
    issuer: d.issuer,
    basis_year: d.basis_year,
    tracks: d.tracks,
    scope: d.scope,
    status: d.status,
    supersedes: d.supersedes ?? null,
    sha256: d.sha256,
    parser_version: d.parser_version,
    chunk_count: d.chunk_count,
    unit_counts: d.unit_counts,
    checks: d.checks,
  }));

  const links: LinkRow[] = (input.links ?? []).map((l) => ({
    card_id: l.card_id,
    finding_index: l.finding_index,
    chunk_key: l.chunk_key,
    finding_no: l.finding_no ?? 0,
    card_finding: l.card_finding,
    method: "finding_3gram",
    score: l.score,
    basis: l.basis || null,
    rank: l.rank,
    status: l.status,
  }));
  const scope = scopeRowsFromLinks(links).map((r) => ({ ...r }));

  const taskMap = (input.taskMap ?? []).map((r) => {
    const group = r.card_id.split("/")[0];
    const unit = businessByCardGroup(group);
    const hasTask = r.status !== "대응 없음" && r.best_task_no;
    return {
      card_id: r.card_id,
      plan_task_key: hasTask && unit ? `plan-2607/tasks/${unit}/${r.best_task_no}` : null,
      report2025_task: null,
      draft_status: r.status,
      score: r.score,
      status: "draft",
    };
  });

  return { teams, evalUnits, cards, documents, chunks: input.chunks ?? [], scope, taskMap };
}

