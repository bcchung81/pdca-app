// 2025년도 경영실적평가 지적사항 시정조치 계획(첨부, '26.10.7) → 지적 1행(지적사항 + 조치계획 쌍) = 조각 1개.
// 구성: 「[기관 경영평가]」·「[기관장 경영계약 이행실적 평가]」 구역 아래 「□ 지표명 : X」 제목마다 지적사항 | 조치계획 표가 하나씩 있음.
// 단위 풀이: 경영관리 지표(MG-n, lib/tracks/mgmt-units.ts) · 주요사업(BZ-2·3) · 공통지표(BZ-4 — 행 끝줄의 지표명을 지표 사전으로 풀어 소속 사업 related_business 기록) ·
// 기관장 이사회(카드와 무관 — 검색 전용 meta.search_only). 조치계획은 기관이 약속한 계획이며 이행 실적이 아님(요청 때 표지 — revision-note.ts).
// 조치계획 칸이 위아래 두 행에 걸쳐 합쳐진 곳(공통지표 3곳)은 두 행 모두에 같은 조치계획을 적고 meta.plan_shared_with에 한 묶음임을 남김.

import { finalizeChunks, makeChunk } from "../chunk.ts";
import { businessLabel, businessShort, resolveBusiness, resolveMetric2025 } from "../dictionaries.ts";
import { cellText, compactKey, pad2 } from "../normalize.ts";
import type { SourceBlock } from "../source.ts";
import { expandGrid, parseHtmlTables, parsePipeTable } from "../table.ts";
import { MGMT_INDICATORS, type MgmtIndicator } from "../../tracks/mgmt-units.ts";
import type { BusinessId, Check, KnowledgeChunk, ParseResult } from "../types.ts";

export const CORRECTIVE_DOC_ID = "corr25-2610";

/** 검산 기대값 — 원문(5쪽, 표 7개)을 직접 세어 확인한 값. 새 판이 오면 원문으로 먼저 확인할 것 */
export const CORRECTIVE_EXPECTED = {
  rows: 56,
  perUnit: { "MG-1": 5, "MG-3": 6, "MG-12": 2, "BZ-2": 14, "BZ-3": 7, "BZ-4": 18, CEO: 4 } as Record<string, number>,
  /** 공통지표 18행의 소속 사업(지표 6개 × 사업 3개) */
  commonOwners: { "BZ-1": 6, "BZ-2": 6, "BZ-3": 6 } as Record<string, number>,
  /** 조치계획 칸이 위 행과 합쳐진 행 수 */
  sharedPlanRows: 3,
};

const REGION_LINE = /^\[(.+)\]$/;
const INDICATOR_LINE = /^□\s*지표명\s*:\s*(.+)$/;
const CEO_REGION = /기관장/;

interface Unit {
  /** 조각 키·세는 단위 이름 */
  key: string;
  track: "경영관리" | "주요사업";
  business: BusinessId | `MG-${number}` | null;
  mg?: MgmtIndicator;
}

/** 구역·지표명 → 단위. 풀 수 없으면 던짐(새 지표가 오면 조용히 빠지지 않게) */
function resolveUnit(region: string, indicator: string): Unit {
  if (CEO_REGION.test(region)) return { key: "CEO", track: "경영관리", business: null };
  const key = compactKey(indicator);
  if (key.includes(compactKey("계량지표 구성의 적합성"))) return { key: "BZ-4", track: "주요사업", business: "BZ-4" };
  const biz = resolveBusiness(indicator);
  if (biz) return { key: biz, track: "주요사업", business: biz };
  const mg = MGMT_INDICATORS.find((m) => key.startsWith(compactKey(m.name)));
  if (mg) return { key: mg.id, track: "경영관리", business: mg.id as `MG-${number}`, mg };
  throw new Error(`시정조치 계획: 지표명을 단위로 풀 수 없습니다: ${indicator}`);
}

/** 칸 글 → 줄들(글머리·빈 줄 제외). 한 칸에 문단이 여럿이면 줄이 여럿 */
function cellLines(html: string): string[] {
  return cellText(html, "\n")
    .split("\n")
    .map((l) => l.replace(/^[·\s]+/, "").trim())
    .filter(Boolean);
}

/** 라벨 + 줄들 → 인용 단위 글. 한 줄이면 「라벨: 글」, 여러 줄이면 줄마다 글머리 */
function labeled(label: string, lines: string[]): string {
  return lines.length === 1 ? `${label}: ${lines[0]}` : `${label}:\n${lines.map((l) => `· ${l}`).join("\n")}`;
}

interface RawRow {
  findingHtml: string;
  planHtml: string;
  /** 조치계획 칸을 이 행이 직접 가짐(false면 위 행의 칸이 합쳐져 내려온 것) */
  ownsPlan: boolean;
}

/** 표 한 개 → 지적 행들(머리 행 제외). 파이프 표와 병합이 있는 HTML 표 둘 다 */
function tableRows(text: string): RawRow[] {
  const t = text.trimStart();
  if (t.startsWith("|")) {
    const rows = parsePipeTable(t).rows;
    if (rows[0]?.[0] !== "지적사항" || rows[0]?.[1] !== "조치계획") throw new Error(`시정조치 계획: 표 머리가 「지적사항 | 조치계획」이 아닙니다: ${rows[0]?.join(" | ")}`);
    return rows.slice(1).map((r) => {
      if (r.length !== 2) throw new Error(`시정조치 계획: 표 행의 칸 수가 2가 아닙니다(${r.length}): ${r.join(" | ").slice(0, 60)}`);
      return { findingHtml: r[0], planHtml: r[1], ownsPlan: true };
    });
  }
  const table = parseHtmlTables(t)[0];
  if (!table) throw new Error("시정조치 계획: 표를 읽을 수 없습니다");
  const head = table.rows[0]?.cells.map((c) => c.text) ?? [];
  if (head[0] !== "지적사항" || head[1] !== "조치계획") throw new Error(`시정조치 계획: 표 머리가 「지적사항 | 조치계획」이 아닙니다: ${head.join(" | ")}`);
  const grid = expandGrid(table);
  let planHtml = "";
  return table.rows.slice(1).map((row, i) => {
    const ownsPlan = row.cells.length >= 2;
    if (ownsPlan) planHtml = row.cells[1].html;
    else if (row.cells.length !== 1) throw new Error(`시정조치 계획: 표 행의 칸 수가 이상합니다(${row.cells.length}) — ${grid[i + 1]?.join(" | ").slice(0, 60)}`);
    return { findingHtml: row.cells[0].html, planHtml, ownsPlan };
  });
}

export function parseCorrective(blocks: SourceBlock[], docId = CORRECTIVE_DOC_ID): ParseResult {
  const chunks: KnowledgeChunk[] = [];
  const checks: Check[] = [];
  let region = "";
  let indicator = "";
  const counts: Record<string, number> = {};
  const owners: Record<string, number> = {};
  let sharedPlanRows = 0;
  let emptyCells = 0;
  const unresolvedMetric: string[] = [];

  for (const block of blocks) {
    const text = block.text.trim();
    if (text.startsWith("|") || text.startsWith("<table")) {
      if (!/지적사항/.test(text.slice(0, 80))) continue; // 제목 글상자 같은 표
      if (!indicator) throw new Error("시정조치 계획: 지표명보다 지적표가 먼저 나왔습니다");
      const unit = resolveUnit(region, indicator);
      const sub = /\((㉮[^)]+)\)/.exec(indicator)?.[1] ?? null;
      const bonus = /\(혁신가점\)/.test(indicator);
      const firstOfPlan: string[] = []; // 같은 조치계획 묶음의 첫 행 키
      for (const raw of tableRows(text)) {
        let findingLines = cellLines(raw.findingHtml);
        const planLines = cellLines(raw.planHtml);
        // 공통지표 행은 지적 칸 끝줄에 소속 지표 이름이 적혀 있음 — 글에서 떼어 내 meta·제목으로
        let metric: ReturnType<typeof resolveMetric2025> = null;
        if (unit.key === "BZ-4") {
          const tag = findingLines[findingLines.length - 1] ?? "";
          metric = resolveMetric2025(tag);
          if (!metric) unresolvedMetric.push(tag);
          else findingLines = findingLines.slice(0, -1);
        }
        if (!findingLines.length || !planLines.length) emptyCells += 1;
        const n = (counts[unit.key] = (counts[unit.key] ?? 0) + 1);
        const chunkKey = `${docId}/${unit.key}/${pad2(n)}`;
        if (raw.ownsPlan) firstOfPlan.push(chunkKey);
        else sharedPlanRows += 1;
        const planOwner = firstOfPlan[firstOfPlan.length - 1];
        if (metric?.business) owners[metric.business] = (owners[metric.business] ?? 0) + 1;

        const where = unit.mg ? `경영관리 지표 ${unit.mg.no} ${unit.mg.name}` : unit.key === "CEO" ? "기관장 경영계약 이행실적 평가" : businessLabel(unit.business as BusinessId);
        const short = unit.mg ? `지표${unit.mg.no} ${unit.mg.name}` : unit.key === "CEO" ? "기관장 이사회" : businessShort(unit.business as BusinessId);
        const tail = metric ? ` · ${metric.name2025}` : "";
        chunks.push(
          makeChunk({
            chunk_key: chunkKey,
            doc_id: docId,
            unit_type: "corrective_action",
            track: unit.track,
            business: unit.business,
            eval_item: null,
            measure: null,
            q_type: ["시정조치계획"],
            title: `'25 지적 시정조치 계획 · ${short} ${n}번${tail}`,
            context_prefix: `2025 경영실적평가 지적사항 시정조치 계획('26.10.7) · ${where}${sub ? ` ${sub}` : ""}${tail} · ${n}번`,
            blocks: [labeled("지적사항", findingLines), labeled("조치계획", planLines)],
            pdf_page_start: block.page,
            meta: {
              region,
              section_title: indicator,
              finding_no: n,
              ...(unit.mg ? { indicator_no: unit.mg.no } : {}),
              ...(sub ? { sub_indicator: sub } : {}),
              ...(bonus ? { bonus: true } : {}),
              plan_shared_with: planOwner !== chunkKey ? planOwner : null,
              metric_tag: metric?.tag ?? null,
              metric_2025: metric?.name2025 ?? null,
              metric_2026: metric?.name2026 ?? null,
              metric_relation: metric?.relation ?? null,
              related_business: unit.key === "BZ-4" ? (metric?.business ?? null) : null,
              // 기관장 이사회 지적은 과제 카드와 무관 — 화면 검색에만 나오고 AI 근거·매칭·닮은 순에서는 빠짐(사용자 결정 2026-10-07)
              ...(unit.key === "CEO" ? { search_only: true } : {}),
              page_basis: "hwp-layout",
            },
          }),
        );
      }
      continue;
    }
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      const r = REGION_LINE.exec(line);
      if (r) region = r[1].trim();
      const k = INDICATOR_LINE.exec(line);
      if (k) indicator = k[1].trim();
    }
  }

  checks.push({ name: "시정조치 계획 지적 행 수", level: "error", ok: chunks.length === CORRECTIVE_EXPECTED.rows, expected: CORRECTIVE_EXPECTED.rows, actual: chunks.length });
  checks.push({
    name: "시정조치 계획 단위별 행 수",
    level: "error",
    ok: JSON.stringify(sortKeys(counts)) === JSON.stringify(sortKeys(CORRECTIVE_EXPECTED.perUnit)),
    expected: CORRECTIVE_EXPECTED.perUnit,
    actual: counts,
  });
  checks.push({
    name: "시정조치 계획 공통지표 행의 소속 사업",
    level: "error",
    ok: JSON.stringify(sortKeys(owners)) === JSON.stringify(sortKeys(CORRECTIVE_EXPECTED.commonOwners)) && unresolvedMetric.length === 0,
    expected: CORRECTIVE_EXPECTED.commonOwners,
    actual: unresolvedMetric.length ? { ...owners, "지표 사전에 없는 이름": unresolvedMetric } : owners,
    note: "지표 이름이 사전(dictionaries.ts METRICS_2025)에 없으면 소속을 몰라 요청 때 어느 사업에도 안 들어감",
  });
  checks.push({ name: "시정조치 계획 지적·조치계획 칸이 빈 행 없음", level: "error", ok: emptyCells === 0, expected: 0, actual: emptyCells });
  checks.push({
    name: "시정조치 계획 조치계획이 위 행과 합쳐진 행 수",
    level: "warn",
    ok: sharedPlanRows === CORRECTIVE_EXPECTED.sharedPlanRows,
    expected: CORRECTIVE_EXPECTED.sharedPlanRows,
    actual: sharedPlanRows,
    note: "합쳐진 행은 같은 조치계획을 두 행 모두에 적고 meta.plan_shared_with로 묶음을 표시",
  });
  const ceo = chunks.filter((c) => c.chunk_key.includes("/CEO/"));
  checks.push({ name: "시정조치 계획 기관장 행은 모두 검색 전용", level: "error", ok: ceo.length > 0 && ceo.every((c) => c.meta.search_only === true), expected: "모두 search_only", actual: ceo.map((c) => c.meta.search_only ?? false) });

  return { chunks: finalizeChunks(chunks), checks };
}

function sortKeys(o: Record<string, number>): Array<[string, number]> {
  return Object.entries(o).sort(([a], [b]) => a.localeCompare(b));
}
