// 붙임5. 2025년도 경영평가 중간보고서 지적사항 현황(주요사업) → 지적 1행 = 조각 1개.
// 근거: docs/analysis/공통지식-5종-분석.md §1-3, §3-3

import { makeChunk, finalizeChunks } from "../chunk.ts";
import { businessLabel, businessShort, resolveBusiness, resolveMetric2025 } from "../dictionaries.ts";
import { cellText, compactKey, pad2, splitDepartments } from "../normalize.ts";
import type { SourceBlock } from "../source.ts";
import { parsePipeTable } from "../table.ts";
import type { BusinessId, Check, KnowledgeChunk, ParseResult } from "../types.ts";

export const MIDREPORT_BIZ_EXPECTED = {
  rows: 48,
  perSection: { "BZ-1": 10, "BZ-2": 14, "BZ-3": 8, "BZ-4": 16 } as Record<BusinessId, number>,
  duplicates: 1,
};

const SECTION_TITLE = /rowspan="2">\s*(\d)\.\s*([^<]+?)\s*<\/th>/;
const NO_CELL = /^(\d+)(?:\s*<br>\s*\((.+?)\s*지표\))?$/;

export function parseMidreportBiz(blocks: SourceBlock[], docId = "mid25-biz"): ParseResult {
  const chunks: KnowledgeChunk[] = [];
  const checks: Check[] = [];
  let section: { no: number; title: string; business: BusinessId } | null = null;
  const firstByText = new Map<string, string>();
  let duplicates = 0;

  for (const block of blocks) {
    const title = SECTION_TITLE.exec(block.text);
    if (title) {
      const no = Number(title[1]);
      const name = cellText(title[2]);
      const business = no === 4 ? "BZ-4" : resolveBusiness(name);
      if (!business) throw new Error(`붙임5: 절 이름을 주요사업으로 풀 수 없습니다: ${name}`);
      section = { no, title: name, business };
      continue;
    }
    if (!block.text.trimStart().startsWith("| No |")) continue;
    if (!section) throw new Error("붙임5: 절 제목보다 지적표가 먼저 나왔습니다");

    for (const row of parsePipeTable(block.text).rows) {
      if (row[0] === "No") continue;
      const [noCell, findingCell, respCell = "", coopCell = ""] = row;
      const no = NO_CELL.exec(noCell.trim());
      if (!no) throw new Error(`붙임5: No 칸을 읽을 수 없습니다: ${noCell}`);
      const findingNo = Number(no[1]);
      const text = cellText(findingCell);
      const metric = no[2] ? resolveMetric2025(no[2]) : null;
      if (no[2] && !metric) throw new Error(`붙임5: 계량지표 태그를 사전에서 찾을 수 없습니다: ${no[2]}`);
      const b = section.business;
      const chunkKey = `${docId}/${b}/${pad2(findingNo)}`;

      const dupKey = compactKey(text);
      const duplicateOf = firstByText.get(dupKey) ?? null;
      if (duplicateOf) duplicates += 1;
      else firstByText.set(dupKey, chunkKey);

      chunks.push(
        makeChunk({
          chunk_key: chunkKey,
          doc_id: docId,
          unit_type: "finding_row",
          track: "주요사업",
          business: b,
          eval_item: null,
          measure: "비계량",
          q_type: ["중간보고서지적"],
          title: `'25 중간보고서 지적 · ${businessShort(b)} ${findingNo}번${metric ? ` · ${metric.name2025}` : ""}`,
          context_prefix: `2025 경영실적 중간보고서 지적사항('26.5.18) · ${businessLabel(b)}${metric ? ` · ${metric.name2025}` : ""} · ${findingNo}번`,
          blocks: [text],
          pdf_page_start: block.page,
          dept_resp: splitDepartments(respCell),
          dept_coop: splitDepartments(coopCell),
          meta: {
            section_no: section.no,
            section_title_2025: section.title,
            finding_no: findingNo,
            metric_tag: metric?.tag ?? null,
            metric_2025: metric?.name2025 ?? null,
            metric_2026: metric?.name2026 ?? null,
            metric_relation: metric?.relation ?? null,
            related_business: metric?.business ?? null,
            duplicate_of: duplicateOf,
            page_basis: "hwp-layout",
          },
        }),
      );
    }
  }

  const perSection: Record<string, number> = {};
  for (const c of chunks) perSection[c.business!] = (perSection[c.business!] ?? 0) + 1;
  checks.push({ name: "붙임5 지적 행 수", level: "error", ok: chunks.length === MIDREPORT_BIZ_EXPECTED.rows, expected: MIDREPORT_BIZ_EXPECTED.rows, actual: chunks.length });
  checks.push({
    name: "붙임5 절별 행 수",
    level: "error",
    ok: Object.entries(MIDREPORT_BIZ_EXPECTED.perSection).every(([k, v]) => perSection[k] === v),
    expected: MIDREPORT_BIZ_EXPECTED.perSection,
    actual: perSection,
  });
  checks.push({
    name: "붙임5 원본 중복 행",
    level: "warn",
    ok: duplicates === MIDREPORT_BIZ_EXPECTED.duplicates,
    expected: MIDREPORT_BIZ_EXPECTED.duplicates,
    actual: duplicates,
    note: "3절 4·5행 본문이 같음(원본 오류로 보임). 둘 다 적재하고 meta.duplicate_of로 표시",
  });
  const numbering = Object.keys(perSection).every((b) => {
    const nos = chunks.filter((c) => c.business === b).map((c) => c.meta.finding_no as number);
    return nos.every((n, i) => n === i + 1);
  });
  checks.push({ name: "붙임5 절별 번호 연속", level: "error", ok: numbering });

  return { chunks: finalizeChunks(chunks), checks };
}
