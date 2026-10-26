// 2025년도 준정부 경영관리 체크리스트 핵심공통항목 KCA 작성본(참고2, xlsx) → 섹션(구분) 단위 조각(순수).
// 용도: 종합점검 지침 13 정합성 1(수치 대조)에서 「대조용」으로만 씀 — 판정 기준이 아님(meta.role = "cross_check").
// 입력: kordoc가 xlsx를 읽어 만든 블록 흐름(시트 「안내문」 표 + 시트 「경영관리 핵심공통항목 양식」 파이프 표 1개).
// 양식 표: 첫 열은 빈 열(A), 이어서 구분 · 2024년도 실적 · 2025년도 실적 · 경영실적보고서 해당 페이지 · 작성시 참고사항 · 비고1(단위) · 비고2.
// 행의 종류 — 섹션 행(「1-(1) 전략기획」·「일반 현황」·「정책가점 (1) …」), 소항목 머리 행(「대외기관 평가」처럼 값 칸이 모두 빈 행), 데이터 행(값 칸이 하나라도 있는 행).
// 값은 `O / 4`·`525 / 332 / 193`처럼 문자열 복합형이라 쪼개거나 계산하지 않고 칸 글 그대로 둠(지침 13이 단위까지 대조).

import { finalizeChunks, makeChunk } from "../chunk.ts";
import { resolveMgmtUnit } from "../dictionaries-mg.ts";
import { cellText, compactKey } from "../normalize.ts";
import type { SourceBlock } from "../source.ts";
import { parsePipeTable } from "../table.ts";
import { MGMT_INDICATORS } from "../../tracks/mgmt-units.ts";
import type { Check, KnowledgeChunk, ParseResult } from "../types.ts";

export const CORE_ITEMS_DOC_ID = "core25-mg";
export const CORE_ITEMS_TITLE = "2025년도 준정부 경영관리 체크리스트 핵심공통항목 KCA 작성본(참고2)";

/** 검산 기대값 — 원문 파일(시트 2개, 양식 표 342행)을 직접 세어 확인한 값. 새 판이 오면 원문으로 먼저 확인할 것 */
export const CORE_ITEMS_EXPECTED = {
  /** 섹션 수: 일반 현황 1 + 지표 섹션 12 + 정책가점 2 */
  sections: 15,
  /** 데이터 행 수(값 칸이 하나라도 있는 행) */
  dataRows: 285,
  /** 소항목 머리 행 수(「대외기관 평가」·「주요 실적」처럼 값 칸이 모두 빈 행) */
  subheads: 38,
  /** 섹션 코드 → 단위(null = 경영관리 트랙 공통). 4-1a·4-1b는 둘 다 지표 9(조직 및 인적자원관리 / 일·가정 양립) */
  units: {
    general: null,
    "1-1": "MG-1",
    "1-2": "MG-2",
    "2-1": "MG-3",
    "2-2": "MG-4",
    "2-3": "MG-5",
    "2-4": "MG-6",
    "2-5": "MG-7",
    "3-1": "MG-8",
    "4-1a": "MG-9",
    "4-1b": "MG-9",
    "4-2": "MG-10",
    "5-2": "MG-11",
    "bonus-1": "MG-12",
    "bonus-3": "MG-14",
  } as Record<string, string | null>,
  /** 섹션별 데이터 행 수 */
  rowsPerSection: {
    general: 7,
    "1-1": 7,
    "1-2": 18,
    "2-1": 34,
    "2-2": 26,
    "2-3": 18,
    "2-4": 16,
    "2-5": 20,
    "3-1": 39,
    "4-1a": 21,
    "4-1b": 23,
    "4-2": 10,
    "5-2": 16,
    "bonus-1": 17,
    "bonus-3": 13,
  } as Record<string, number>,
};

/** 양식 표의 열(첫 빈 열 다음부터). 머리 칸 글은 파일에 적힌 그대로 쓰고, 여기 낱말로 열이 맞는지만 확인 */
const COLS = ["구분", "2024년도", "2025년도", "페이지", "참고사항", "비고1", "비고2"] as const;

const SECTION = /^(?:(\d+)-\((\d+)\)(?:\(([가-힣])\))?|정책가점\s*\((\d+)\)|일반\s*현황)/;

interface Section {
  code: string;
  title: string;
  /** 소항목 묶음: 이름(없으면 "") + 데이터 행들 */
  groups: Array<{ name: string; rows: string[][] }>;
}

/** 섹션 행 글 → 섹션 코드(영문·숫자·하이픈). 섹션이 아니면 null */
export function sectionCode(label: string): string | null {
  const m = SECTION.exec(label.trim());
  if (!m) return null;
  if (m[1]) return `${m[1]}-${m[2]}${m[3] ? ({ 가: "a", 나: "b" } as Record<string, string>)[m[3]] ?? `x${m[3].charCodeAt(0).toString(16)}` : ""}`;
  if (m[4]) return `bonus-${m[4]}`;
  return "general";
}

const escapeCell = (s: string) => s.replace(/\|/g, "\\|");
const mdRow = (cells: string[]) => `| ${cells.map(escapeCell).join(" | ")} |`;

export function parseCoreItems(blocks: SourceBlock[], docId = CORE_ITEMS_DOC_ID): ParseResult {
  // 양식 표: 「구분」 머리가 있는 파이프 표(안내문 시트는 HTML 표라 걸리지 않음)
  const tableBlock = blocks.find((b) => b.text.trimStart().startsWith("|") && /\|\s*구분\s*\|/.test(b.text.slice(0, 1500)));
  if (!tableBlock) throw new Error("핵심공통항목: 「구분」 머리가 있는 양식 표를 찾지 못했습니다(kordoc 산출물 모양이 바뀌었는지 확인).");
  const rows = parsePipeTable(tableBlock.text).rows.map((r) => r.map((c) => cellText(c, " ")));

  const headIdx = rows.findIndex((r) => r[1] === "구분");
  const head = rows[headIdx];
  const headOk = head && head.length === COLS.length + 1 && COLS.every((k, i) => compactKey(head[i + 1]).includes(compactKey(k)));
  if (!headOk) throw new Error(`핵심공통항목: 표 머리가 예상과 다릅니다: ${head?.join(" | ")}`);
  const org = /기관명\s*:\s*(.+)/.exec(rows[0]?.join(" ") ?? "")?.[1]?.trim() ?? null;

  const sections: Section[] = [];
  let subheads = 0;
  let footnote: string | null = null;
  let emptyValueRows = 0;
  for (const r of rows.slice(headIdx + 1)) {
    if (r.length !== COLS.length + 1) throw new Error(`핵심공통항목: 표 행의 칸 수가 ${COLS.length + 1}이 아닙니다(${r.length}): ${r.join(" | ").slice(0, 60)}`);
    const label = r[1];
    const values = r.slice(2);
    if (!label && values.every((v) => !v)) continue; // 빈 줄
    if (label.startsWith("*") && values.every((v) => !v)) {
      footnote = label.replace(/^\*\s*/, "").trim();
      continue;
    }
    const code = sectionCode(label);
    if (code && values.every((v) => !v)) {
      sections.push({ code, title: label, groups: [] });
      continue;
    }
    const sec = sections[sections.length - 1];
    if (!sec) throw new Error(`핵심공통항목: 섹션 행보다 앞에 항목이 나왔습니다: ${label.slice(0, 40)}`);
    if (values.every((v) => !v)) {
      sec.groups.push({ name: label, rows: [] }); // 소항목 머리
      subheads += 1;
      continue;
    }
    if (!sec.groups.length) sec.groups.push({ name: "", rows: [] });
    sec.groups[sec.groups.length - 1].rows.push(r.slice(1));
    if (!r[2] || !r[3]) emptyValueRows += 1;
  }

  const headLabels = head.slice(1);
  const chunks: KnowledgeChunk[] = [];
  const unresolved: string[] = [];
  const unitOf: Record<string, string | null> = {};
  const rowsOf: Record<string, number> = {};
  for (const sec of sections) {
    let unit: string | null = null;
    if (sec.code !== "general") {
      const res = resolveMgmtUnit(sec.title);
      if (!res.known) unresolved.push(sec.title);
      unit = res.unit;
    }
    unitOf[sec.code] = unit;
    const dataRows = sec.groups.reduce((n, g) => n + g.rows.length, 0);
    rowsOf[sec.code] = dataRows;
    const mg = MGMT_INDICATORS.find((m) => m.id === unit);
    const where = unit ? `경영관리 지표 ${mg?.no ?? ""} ${mg?.name ?? ""}`.trim() : "경영관리 공통";
    // 소항목 머리가 있으면 그 이름을 앞줄로, 표마다 머리 행을 되풀이해 블록 하나만 인용해도 열 뜻이 읽히게 함
    const blockTexts = sec.groups
      .filter((g) => g.rows.length)
      .map((g) => [g.name ? `[${g.name}]` : "", [mdRow(headLabels), mdRow(headLabels.map(() => "---")), ...g.rows.map(mdRow)].join("\n")].filter(Boolean).join("\n"));
    chunks.push(
      makeChunk({
        chunk_key: `${docId}/${sec.code}`,
        doc_id: docId,
        unit_type: "core_item",
        track: "경영관리",
        business: unit as KnowledgeChunk["business"],
        eval_item: null,
        measure: null,
        q_type: ["핵심공통항목"],
        title: `핵심공통항목 '25 · ${sec.title}`,
        context_prefix: `${CORE_ITEMS_TITLE} · ${sec.title} · ${where} · 정합성 1 수치 대조용(판정 기준 아님)`,
        blocks: blockTexts,
        pdf_page_start: tableBlock.page,
        meta: {
          role: "cross_check",
          section_code: sec.code,
          section_title: sec.title,
          rows: dataRows,
          subheads: sec.groups.filter((g) => g.name).map((g) => g.name),
          ...(unit ? { indicator_no: mg?.no ?? null } : {}),
          org,
          ...(footnote ? { sheet_note: footnote } : {}),
          page_basis: "xlsx-sheet",
        },
      }),
    );
  }

  const E = CORE_ITEMS_EXPECTED;
  const totalRows = Object.values(rowsOf).reduce((a, b) => a + b, 0);
  const checks: Check[] = [
    { name: "핵심공통항목 섹션 수", level: "error", ok: chunks.length === E.sections, expected: E.sections, actual: chunks.length },
    { name: "핵심공통항목 데이터 행 수", level: "error", ok: totalRows === E.dataRows, expected: E.dataRows, actual: totalRows },
    { name: "핵심공통항목 섹션별 데이터 행 수", level: "error", ok: JSON.stringify(sortKeys(rowsOf)) === JSON.stringify(sortKeys(E.rowsPerSection)), expected: E.rowsPerSection, actual: rowsOf },
    { name: "핵심공통항목 소항목 머리 행 수", level: "warn", ok: subheads === E.subheads, expected: E.subheads, actual: subheads },
    {
      name: "핵심공통항목 섹션 이름이 지표 사전에서 풀림",
      level: "error",
      ok: unresolved.length === 0 && JSON.stringify(sortKeys(unitOf)) === JSON.stringify(sortKeys(E.units)),
      expected: E.units,
      actual: unresolved.length ? { ...unitOf, "사전에 없는 이름": unresolved } : unitOf,
      note: "새 이름이면 dictionaries-mg.ts ALIASES에 먼저 더함",
    },
    { name: "핵심공통항목 두 해 값 칸이 모두 찬 행", level: "warn", ok: emptyValueRows === 0, expected: 0, actual: emptyValueRows, note: "한 해만 비어 있는 행 수 — 원본 양식이 그러면 정상" },
  ];
  return { chunks: finalizeChunks(chunks), checks, extras: { footnote, org } };
}

function sortKeys(o: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(o).sort(([a], [b]) => a.localeCompare(b));
}
