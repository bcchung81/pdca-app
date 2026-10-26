// 「'25년도 경영평가 중간보고서 지적사항 현황_경영관리(참고3, mid25-mg)」 → 지적 1행 = 조각 1개.
// 주요사업 쪽 붙임5(midreport-biz.ts)와 같은 골격. 근거: docs/analysis/공통지식-5종-분석.md P13·§3, docs/plan/경영관리-트랙확장-설계.md §4.3
//
// 문서 모양: 머리에 '24·'25 지표별 배점·지적건수 요약표 1개 → 지표 절 16개(제목표 + 지적표 「No·지적사항·책임부서·협업부서」).
// 함정(P13): 「일자리 및 균등한 기회」·「안전 및 재난관리」 제목표가 자기 지적표 뒤에 나옴(원본 글상자 기준점 문제) →
//   제목이 가까운 표에 붙는다고 보지 않고, 제목 순서 = 표 순서(k번째 제목 ↔ k번째 지적표)로 잇고 요약표 건수로 검산한다.
//   (제목을 앞에서부터 붙이면 윤리경영 11행·일자리 4행·안전 0행으로 틀어짐 — 요약표는 3·8·4.)

import { makeChunk, finalizeChunks } from "../chunk.ts";
import { resolveMgmtUnit } from "../dictionaries-mg.ts";
import { cellText, compactKey, pad2, splitDepartments } from "../normalize.ts";
import type { SourceBlock } from "../source.ts";
import { parseHtmlTables, parsePipeTable } from "../table.ts";
import type { Check, KnowledgeChunk, ParseResult, UnitId } from "../types.ts";
import { MGMT_INDICATORS } from "../../tracks/mgmt-units.ts";

/** 원문(요약표·지적표·세평 태그)에서 직접 센 값 */
export const MIDREPORT_MG_EXPECTED = {
  rows: 70,
  sections: 16,
  /** 지표 단위별 행 수 = 요약표 '25 지적건수(MG-9 = 조직 6 + 일·가정 3, MG-11 = 직무중심 3 + 합리적 보수 3) */
  perUnit: {
    "MG-1": 5, "MG-2": 3, "MG-3": 8, "MG-4": 4, "MG-5": 6, "MG-6": 5, "MG-7": 5, "MG-8": 5,
    "MG-9": 9, "MG-10": 3, "MG-11": 6, "MG-12": 2, "MG-13": 7, "MG-14": 2,
  } as Record<string, number>,
  /** 요약표 소계·합계: 경영관리(MG-1~11) 59 · 가점(MG-12~14) 11 · 주요사업 48 → 합계 118 */
  mgmtTotal: 59,
  bonusTotal: 11,
  grandTotal: 118,
  reviewTags: 56,
  /** 본문이 같은 행 쌍(뒤 행이 앞 행의 복제) — 실제 파일로 확인한 값 */
  duplicates: 0,
};

const TITLE = /<th rowspan="2">\s*([^<]+?)\s*<\/th>/;
const NO_CELL = /^(\d+)(?:\s*<br>\s*\((.+?)\))?$/;

interface SummaryRow {
  name: string;
  count: number;
}

/** 요약표에서 '25년도 지적건수(말단 지표만). 부모 행 아래 ①② 하위 행이 있으면 부모는 합계라 뺀다 */
function readSummary(text: string): { leaves: Array<{ unit: string | null; known: boolean; name: string; count: number }>; mgmtTotal: number | null; grandTotal: number | null } {
  const table = parseHtmlTables(text)[0];
  const rows: SummaryRow[] = [];
  const totals: Array<{ label: string; count: number }> = [];
  for (const r of table.rows.slice(2)) {
    const cells = r.cells.map((c) => c.text.trim());
    if (cells.length < 3) continue;
    const [name, , countText] = cells.slice(-3);
    // 하위 행의 건수는 「(6)」처럼 괄호로 적혀 있고, 없으면 「-」
    const bare = countText.replace(/[()\s]/g, "");
    const count = /^\d+$/.test(bare) ? Number(bare) : 0;
    if (!name) continue; // 가점 표의 빈 행
    if (/^(소\s*계|합\s*계)$/.test(name)) totals.push({ label: name.replace(/\s/g, ""), count });
    else rows.push({ name, count });
  }
  const leaves: Array<{ unit: string | null; known: boolean; name: string; count: number }> = [];
  let parent: { unit: string | null; known: boolean } | null = null;
  rows.forEach((row, i) => {
    const sub = /^[①②③]/.test(row.name);
    const next = rows[i + 1]?.name ?? "";
    if (/^\d+\./.test(row.name)) {
      parent = null;
      return;
    }
    if (!sub && /^[①②③]/.test(next)) {
      // 하위 행이 있는 부모 — 이름으로 단위를 풀어 두고 합계는 세지 않음
      parent = resolveMgmtUnit(row.name);
      return;
    }
    if (sub) {
      const p: { unit: string | null; known: boolean } = parent ?? resolveMgmtUnit(row.name);
      leaves.push({ unit: p.unit, known: p.known, name: row.name, count: row.count });
      return;
    }
    parent = null;
    const r = resolveMgmtUnit(row.name);
    leaves.push({ unit: r.unit, known: r.known, name: row.name, count: row.count });
  });
  return { leaves, mgmtTotal: totals.find((t) => t.label === "소계")?.count ?? null, grandTotal: totals.find((t) => t.label === "합계")?.count ?? null };
}

const unitName = (unit: string | null) => MGMT_INDICATORS.find((m) => m.id === unit)?.name ?? "공통(카드 없음)";

export function parseMidreportMg(blocks: SourceBlock[], docId = "mid25-mg"): ParseResult {
  const checks: Check[] = [];
  let summaryText: string | null = null;
  const titles: string[] = [];
  const tables: Array<{ block: SourceBlock; titlesBefore: number }> = [];

  for (const block of blocks) {
    const t = block.text;
    if (t.includes("지적건수") && t.trimStart().startsWith("<table")) {
      summaryText = t;
      continue;
    }
    const title = TITLE.exec(t);
    if (title && t.trimStart().startsWith("<table")) {
      titles.push(cellText(title[1]));
      continue;
    }
    if (t.trimStart().startsWith("| No |")) tables.push({ block, titlesBefore: titles.length });
  }
  if (titles.length !== tables.length) throw new Error(`참고3: 절 제목 ${titles.length}개와 지적표 ${tables.length}개가 맞지 않습니다`);

  // P13 — 제목 순서 = 표 순서. 자기 제목이 표 앞에 없는 표(제목이 뒤로 밀린 절)를 기록
  const displaced: string[] = [];
  tables.forEach((t, k) => {
    if (t.titlesBefore !== k + 1) displaced.push(titles[k]);
  });

  const chunks: KnowledgeChunk[] = [];
  const sections: Array<{ title: string; unit: string | null; known: boolean; rows: number }> = [];
  const unitSeq = new Map<string, number>();
  const firstByText = new Map<string, string>();
  let duplicates = 0;
  let reviewTags = 0;
  let numberingOk = true;

  tables.forEach(({ block }, k) => {
    const sectionTitle = titles[k];
    const resolved = resolveMgmtUnit(sectionTitle);
    const unit = resolved.unit;
    let sectionRows = 0;
    for (const row of parsePipeTable(block.text).rows) {
      if (row[0] === "No") continue;
      const [noCell, findingCell, respCell = "", coopCell = ""] = row;
      const no = NO_CELL.exec(noCell.trim());
      if (!no) throw new Error(`참고3: No 칸을 읽을 수 없습니다: ${noCell}`);
      const findingNo = Number(no[1]);
      const reviewTag = no[2] ?? null;
      if (reviewTag) reviewTags += 1;
      sectionRows += 1;
      if (findingNo !== sectionRows) numberingOk = false;
      const text = cellText(findingCell);

      // 키의 번호는 지표 단위 안 순번 — 한 지표에 절이 둘(MG-9·MG-11)이면 절마다 1부터 다시 시작해 겹치므로 이어 셈
      const unitKey = unit ?? "common";
      const seq = (unitSeq.get(unitKey) ?? 0) + 1;
      unitSeq.set(unitKey, seq);
      const chunkKey = `${docId}/${unitKey}/${pad2(seq)}`;

      const dupKey = compactKey(text);
      const duplicateOf = firstByText.get(dupKey) ?? null;
      if (duplicateOf) duplicates += 1;
      else firstByText.set(dupKey, chunkKey);

      const unitLabel = unit ? `${unit} ${unitName(unit)}` : "공통(카드 없는 항목)";
      chunks.push(
        makeChunk({
          chunk_key: chunkKey,
          doc_id: docId,
          unit_type: "finding_row",
          track: "경영관리",
          business: unit as UnitId | null,
          eval_item: null,
          measure: "비계량",
          q_type: ["중간보고서지적"],
          title: `'25 중간보고서 지적 · ${sectionTitle} ${findingNo}번${reviewTag ? ` · ${reviewTag}` : ""}`,
          context_prefix: `2025 경영실적 중간보고서 지적사항('26.5.19) 경영관리 · ${unitLabel} · ${sectionTitle} · ${findingNo}번${reviewTag ? ` · ${reviewTag}` : ""}`,
          blocks: [text],
          pdf_page_start: block.page,
          dept_resp: splitDepartments(respCell),
          dept_coop: splitDepartments(coopCell),
          meta: {
            finding_no: findingNo,
            section_title: sectionTitle,
            review_tag: reviewTag,
            duplicate_of: duplicateOf,
            page_basis: "hwp-layout",
          },
        }),
      );
    }
    sections.push({ title: sectionTitle, unit, known: resolved.known, rows: sectionRows });
  });

  const perUnit: Record<string, number> = {};
  for (const c of chunks) if (c.business) perUnit[c.business] = (perUnit[c.business] ?? 0) + 1;
  const E = MIDREPORT_MG_EXPECTED;

  checks.push({ name: "참고3 지적 행 수", level: "error", ok: chunks.length === E.rows, expected: E.rows, actual: chunks.length });
  checks.push({ name: "참고3 절(제목표·지적표) 수", level: "error", ok: sections.length === E.sections, expected: E.sections, actual: sections.length });
  checks.push({
    name: "참고3 지표별 행 수",
    level: "error",
    ok: Object.keys({ ...E.perUnit, ...perUnit }).every((k) => perUnit[k] === E.perUnit[k]),
    expected: E.perUnit,
    actual: perUnit,
  });
  const bonus = (["MG-12", "MG-13", "MG-14"] as const).reduce((s, k) => s + (perUnit[k] ?? 0), 0);
  checks.push({
    name: "참고3 경영관리·가점 소계",
    level: "error",
    ok: chunks.length - bonus === E.mgmtTotal && bonus === E.bonusTotal,
    expected: { 경영관리: E.mgmtTotal, 가점: E.bonusTotal },
    actual: { 경영관리: chunks.length - bonus, 가점: bonus },
  });

  if (summaryText) {
    const s = readSummary(summaryText);
    const fromSummary: Record<string, number> = {};
    for (const l of s.leaves) if (l.unit) fromSummary[l.unit] = (fromSummary[l.unit] ?? 0) + l.count;
    const unknown = s.leaves.filter((l) => !l.known).map((l) => l.name);
    const noCardCount = s.leaves.filter((l) => !l.unit && l.known).reduce((n, l) => n + l.count, 0);
    checks.push({
      name: "참고3 요약표 대조(지표별 건수)",
      level: "error",
      ok: unknown.length === 0 && Object.keys({ ...fromSummary, ...perUnit }).every((k) => fromSummary[k] === perUnit[k]) && noCardCount === 0,
      expected: fromSummary,
      actual: perUnit,
      note: unknown.length ? `사전에 없는 요약표 이름: ${unknown.join(", ")}` : "제목이 뒤로 밀린 절은 제목 순서로 잇고 이 대조로 검산",
    });
    checks.push({
      name: "참고3 요약표 합계(경영관리 소계·합계 118)",
      level: "error",
      ok: s.mgmtTotal === chunks.length - bonus && s.grandTotal === E.grandTotal,
      expected: { 소계: s.mgmtTotal, 합계: s.grandTotal },
      actual: { 경영관리: chunks.length - bonus, 주요사업_붙임5_별도: E.grandTotal - chunks.length },
      note: "합계 118 = 경영관리 59 + 주요사업 48(붙임5) + 가점 11",
    });
  } else {
    checks.push({ name: "참고3 요약표 대조", level: "error", ok: false, note: "머리의 요약표를 찾지 못함" });
  }

  const bad = sections.filter((s) => !s.known);
  checks.push({
    name: "참고3 모든 절의 지표 단위 풀림",
    level: "error",
    ok: bad.length === 0 && chunks.every((c) => c.business !== null),
    actual: sections.filter((s) => !s.unit).map((s) => s.title),
    note: bad.length ? `사전에 더해야 할 이름: ${bad.map((b) => b.title).join(", ")}` : "단위가 없는 절은 카드 없는 항목(business null)",
  });
  checks.push({ name: "참고3 절별 번호 연속", level: "error", ok: numberingOk });
  checks.push({
    name: "참고3 원본 중복 행",
    level: "warn",
    ok: duplicates === E.duplicates,
    expected: E.duplicates,
    actual: duplicates,
    note: "본문이 같은 행은 둘 다 적재하고 meta.duplicate_of로 표시",
  });
  checks.push({ name: "참고3 세평 태그 행 수", level: "warn", ok: reviewTags === E.reviewTags, expected: E.reviewTags, actual: reviewTags });
  checks.push({
    name: "참고3 제목이 뒤로 밀린 절(P13 교정)",
    level: "warn",
    ok: true,
    actual: displaced,
    note: "제목 순서 = 표 순서로 이었고 위 요약표 대조로 검산함",
  });

  return { chunks: finalizeChunks(chunks), checks };
}
