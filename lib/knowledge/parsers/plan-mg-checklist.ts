// (260731) 2026년도 경영평가 관리계획(7월판) Ⅲ-2 「’26년도 평가지표별 자가진단 체크리스트」 중 경영관리 지표·혁신가점 블록.
// 주요사업 공통 자가진단(plan.ts `parseBizChecklist`)과 같은 방식(checklist_group, 구분별 묶음, 점검사항 한 줄이 인용 단위)으로 읽는다.
// 블록 하나 = 대분류·소분류 머리표 + 「1. ’25 지적사항 조치계획 자가진단」(지적 표) + 「2. ’26 고도화 착안사항 자가진단」(세부평가내용별 점검표).
// 조각: 블록마다 지적사항 조각 1개(kind=issues) + 세부평가내용 × 구분 묶음마다 1개(kind=sd_group).
// 키: plan-2607/checklist/MG-N/s<소분류번호>/issues · plan-2607/checklist/MG-N/s<소분류번호>/sd<n>/g<i> (주요사업은 plan-2607/checklist/BZ/…라 겹치지 않음).
//   소분류 번호(「(1-2)」의 1-2)를 키에 넣는 이유: 조직 및 인적자원관리(1-1)·일가정 양립(1-2)이 같은 지표 MG-9, 직무중심 보수(3-1)·보수 및 복리후생(3-2)이 같은 지표 MG-11이라 지표 id만으로는 키가 겹친다.
// 지표 이름 → MG-N은 dictionaries-mg.ts `resolveMgmtUnit`. 모르는 이름이면 추측하지 않고 던진다.
// 순수 모듈(입출력 없음).

import { makeChunk } from "../chunk.ts";
import { resolveMgmtUnit } from "../dictionaries-mg.ts";
import { DINGBAT, cellText, circledToNumber, normalizeText, splitDepartments } from "../normalize.ts";
import type { LineItem } from "../source.ts";
import { expandGrid, parseHtmlTables, parsePipeTable } from "../table.ts";
import type { Check, KnowledgeChunk, ParseResult } from "../types.ts";

const DOC = "plan-2607";
const DOC_LABEL = "2026 경영평가 관리계획(7월판)";

/**
 * 원문(plan-2607.md 1390~2237줄)을 직접 세어 확인한 값 — 새 판이 오면 원문으로 다시 확인.
 *  blocks: 머리표(<th>대분류</th>) 수 = 경영관리 13 + 혁신가점 3
 *  issueHeaderTotal: 머리표 「지적사항 N개」의 합
 *  issues: 지적 표에서 번호로 센 건수(「1<br>2」처럼 합쳐진 행은 번호 수만큼) — 머리표 합과 같아야 함
 *  sdCount: 세부평가내용 수(◇ 표지 37 + 표지 누락 4), inferredSd: ◇ 표지가 빠져 앞 번호 + 1로 추정한 수(윤리경영❸·상생협력❸·조직 및 인적자원관리❸·국정과제❸)
 *  groups: 구분 묶음(조각) 수 = 점검표 라벨 행(html 128 + 파이프 2), items: 점검사항 수 = 「예·아니오」 점검 행(html 327 + 파이프 2)
 */
export const MGMT_CHECKLIST_EXPECTED = {
  blocks: 16,
  mgmtBlocks: 13,
  bonusBlocks: 3,
  byUnit: { "MG-1": 1, "MG-2": 1, "MG-3": 1, "MG-4": 1, "MG-5": 1, "MG-6": 1, "MG-7": 1, "MG-8": 1, "MG-9": 2, "MG-10": 1, "MG-11": 2, "MG-12": 1, "MG-13": 1, "MG-14": 1 } as Record<string, number>,
  issueHeaderTotal: 70,
  issues: 70,
  sdCount: 41,
  inferredSd: 4,
  groups: 130,
  items: 329,
};

const BLOCK_HEAD = /<th>\s*대분류\s*<\/th>/;
const BIZ_START = /^\|\s*대분류\s*\|\s*주요사업\s*\|/;
const SECTION_LINE = /^[12]\.\s*’2[56]년도/;
const SD_LINE = /◇\s*세부평가내용\s*([❶-❿])\s*(.*)$/;

interface Block {
  major: string;
  bonus: boolean;
  subNo: string;
  subName: string;
  weight: string;
  unit: string;
  indicator: string;
  dept: string;
  headerIssueCount: number;
  page: number;
}

interface SdState {
  no: number;
  inferred: boolean;
  lines: string[];
  page: number;
}

function gridOf(tableText: string): string[][] {
  const t = tableText.trimStart();
  if (t.startsWith("<table")) {
    const table = parseHtmlTables(tableText)[0];
    return table ? expandGrid(table) : [];
  }
  // 파이프 표는 병합 셀을 빈 칸으로 내므로 첫 칸(구분)은 위 행 것을 이어 받음
  const rows = parsePipeTable(tableText).rows.map((r) => r.map((c) => cellText(c)));
  let prev = "";
  return rows.map((r, i) => {
    if (i === 0) return r;
    if (r[0]) prev = r[0];
    else r[0] = prev;
    return r;
  });
}

function parseBlockHead(text: string, page: number): Block {
  const table = parseHtmlTables(text)[0];
  const grid = table ? expandGrid(table) : [];
  const r0 = grid[0] ?? [];
  const r1 = grid[1] ?? [];
  const after = (row: string[], label: string) => {
    const i = row.findIndex((c) => c === label);
    return i >= 0 ? (row[i + 1] ?? "") : "";
  };
  const major = (r0[1] ?? "").replace(/^□\s*\d+\s*/, "").trim();
  const sub = r1[1] ?? "";
  const m = /^\(([\d-]+)\)\s*(.+?)\s*\(\s*([\d.]+)\s*점\s*\)$/.exec(sub);
  if (!m) throw new Error(`관리계획: 경영관리 자가진단 소분류 형식을 읽지 못했습니다 — ${sub}`);
  const res = resolveMgmtUnit(m[2]);
  if (!res.known || !res.unit) throw new Error(`관리계획: 경영관리 지표 이름을 사전에서 못 찾았습니다(사전에 더해야 함) — ${m[2]}`);
  const bonus = major === "혁신가점";
  const no = Number(res.unit.replace("MG-", ""));
  if (bonus !== no >= 12) throw new Error(`관리계획: 대분류(${major})와 지표 단위(${res.unit})가 어긋납니다 — ${sub}`);
  const issueCount = Number(/(\d+)/.exec(after(r0, "지적사항"))?.[1] ?? NaN);
  return {
    major,
    bonus,
    subNo: m[1],
    subName: m[2],
    weight: m[3],
    unit: res.unit,
    indicator: res.alias ?? m[2],
    dept: after(r1, "담당부서"),
    headerIssueCount: issueCount,
    page,
  };
}

interface IssueRow {
  numbers: number[];
  text: string;
}

function readIssues(tableText: string): IssueRow[] {
  const grid = gridOf(tableText);
  const header = grid[0] ?? [];
  const noCol = header.findIndex((h) => h === "No");
  const textCol = header.findIndex((h) => h.includes("지적사항"));
  if (noCol < 0 || textCol < 0) throw new Error("관리계획: 지적사항 표의 머리(No·지적사항)를 읽지 못했습니다");
  const out: IssueRow[] = [];
  for (const row of grid.slice(1)) {
    const text = row[textCol];
    if (!text) continue;
    // 「1<br>2」처럼 번호가 합쳐진 행은 번호 수만큼 센다(글은 쪼개지 않음 — 줄바꿈이 문장 중간에도 있어 안전하게 못 나눔)
    const numbers = (row[noCol].match(/\d+/g) ?? []).map(Number);
    if (numbers.length === 0) throw new Error(`관리계획: 지적사항 번호를 못 읽었습니다 — ${text.slice(0, 30)}`);
    out.push({ numbers, text });
  }
  return out;
}

export function parseMgmtChecklist(items: LineItem[]): ParseResult {
  const start = items.findIndex((it) => it.kind === "table" && BLOCK_HEAD.test(it.text));
  if (start < 0) throw new Error("관리계획: 경영관리 자가진단 블록 머리표(대분류)를 찾지 못했습니다");
  const endRaw = items.findIndex((it, i) => i > start && it.kind === "table" && BIZ_START.test(it.text));
  const end = endRaw < 0 ? items.length : endRaw;

  const chunks: KnowledgeChunk[] = [];
  const blocks: Block[] = [];
  const stats = { issueHeaderTotal: 0, issues: 0, sdCount: 0, inferredSd: 0, groups: 0, items: 0 };
  const perBlockIssueMismatch: string[] = [];
  const sdOrderErrors: string[] = [];

  let block: Block | null = null;
  let sd: SdState | null = null;
  let lastSdNo = 0;
  let issueSeen = false;

  const closeSd = () => {
    if (sd) throw new Error(`관리계획: 세부평가내용${DINGBAT[sd.no - 1]}(${block?.unit}) 뒤에 점검표가 없습니다`);
  };

  const baseOf = (b: Block) => ({
    doc_id: DOC,
    unit_type: "checklist_group" as const,
    track: "경영관리" as const,
    business: b.unit as `MG-${string}`,
    eval_item: null,
    measure: "비계량" as const,
    q_type: ["자가진단"],
    dept_resp: splitDepartments(b.dept),
  });
  const prefixOf = (b: Block) => `${DOC_LABEL} Ⅲ-2 지표별 자가진단 체크리스트 · 경영관리 · ${b.major} (${b.subNo}) ${b.subName}(${b.weight}점) · 담당부서: ${b.dept}`;
  const metaOf = (b: Block) => ({
    sub_no: b.subNo,
    sub_name: b.subName,
    weight: Number(b.weight),
    major: b.major,
    bonus: b.bonus,
    dept_text: b.dept,
  });

  for (let i = start; i < end; i++) {
    const it = items[i];
    if (it.kind === "table" && BLOCK_HEAD.test(it.text)) {
      closeSd();
      block = parseBlockHead(it.text, it.page);
      blocks.push(block);
      stats.issueHeaderTotal += block.headerIssueCount;
      lastSdNo = 0;
      issueSeen = false;
      continue;
    }
    if (!block) continue;

    if (it.kind === "line") {
      if (SECTION_LINE.test(it.text)) {
        closeSd();
        continue;
      }
      const m = SD_LINE.exec(it.text);
      if (m) {
        closeSd();
        sd = { no: circledToNumber(m[1])!, inferred: false, lines: m[2].trim() ? [m[2].trim()] : [], page: it.page };
        continue;
      }
      // ◇ 표지 없이 설명만 나온 세부평가내용(원문 누락) — 앞 번호 + 1로 추정
      if (!sd) sd = { no: lastSdNo + 1, inferred: true, lines: [], page: it.page };
      sd.lines.push(it.text.trim());
      continue;
    }

    // 표
    const grid = gridOf(it.text);
    const header = grid[0] ?? [];
    if (header.includes("No") && header.some((h) => h.includes("지적사항"))) {
      if (issueSeen) throw new Error(`관리계획: 한 블록에 지적사항 표가 둘 이상입니다(${block.unit} ${block.subNo})`);
      issueSeen = true;
      const rows = readIssues(it.text);
      const nums = rows.flatMap((r) => r.numbers);
      stats.issues += nums.length;
      if (block.headerIssueCount !== nums.length) perBlockIssueMismatch.push(`${block.unit} (${block.subNo}): 머리 ${block.headerIssueCount}개 / 표 ${nums.length}개`);
      const blockTexts = rows.map((r) => `${r.numbers.join("·")}. ${r.text}`);
      chunks.push(
        makeChunk({
          ...baseOf(block),
          chunk_key: `${DOC}/checklist/${block.unit}/s${block.subNo}/issues`,
          title: `'26 자가진단 · 경영관리 ${block.subName} · '25 경영평가단 지적사항 조치계획`,
          context_prefix: `${prefixOf(block)} · 1. ’25년도 경영평가단 지적사항 조치계획 자가진단(예·아니오 점검결과·반영과제는 기관이 채울 칸)`,
          blocks: blockTexts,
          pdf_page_start: it.page,
          meta: {
            ...metaOf(block),
            kind: "issues",
            issue_count: nums.length,
            issue_numbers: nums,
            merged_rows: rows.filter((r) => r.numbers.length > 1).map((r) => r.numbers),
          },
        }),
      );
      continue;
    }

    const itemCol = header.findIndex((h) => h.includes("점검사항"));
    if (itemCol < 0) throw new Error(`관리계획: 알 수 없는 표가 블록 안에 나왔습니다(${block.unit} ${block.subNo}): ${it.text.slice(0, 60)}`);
    if (!sd) throw new Error(`관리계획: 세부평가내용 없이 점검표가 나왔습니다(${block.unit} ${block.subNo})`);

    const groups: Array<{ label: string; items: string[] }> = [];
    for (const row of grid.slice(1)) {
      const label = [...new Set(row.slice(0, itemCol).filter(Boolean))].join(" ");
      const text = row[itemCol];
      if (!text) continue;
      const g = groups.at(-1);
      if (g && g.label === label) g.items.push(text);
      else groups.push({ label, items: [text] });
    }
    if (groups.length === 0) throw new Error(`관리계획: 점검사항이 빈 표입니다(${block.unit} 세부평가내용${DINGBAT[sd.no - 1]})`);
    const sdDesc = normalizeText(sd.lines.join(" "));
    const mark = DINGBAT[sd.no - 1];
    stats.sdCount += 1;
    if (sd.inferred) stats.inferredSd += 1;
    groups.forEach((g, gi) => {
      stats.items += g.items.length;
      stats.groups += 1;
      chunks.push(
        makeChunk({
          ...baseOf(block!),
          chunk_key: `${DOC}/checklist/${block!.unit}/s${block!.subNo}/sd${sd!.no}/g${gi + 1}`,
          title: `'26 자가진단 · 경영관리 ${block!.subName} · 세부평가내용${mark} ${g.label}`,
          context_prefix: `${prefixOf(block!)} · 2. ’26년도 경영평가보고서 고도화 착안사항 자가진단 · 세부평가내용${mark} ${sdDesc} · 구분: ${g.label}`,
          blocks: g.items,
          pdf_page_start: it.page,
          meta: {
            ...metaOf(block!),
            kind: "sd_group",
            sd_no: sd!.no,
            sd_desc: sdDesc,
            sd_marker_inferred: sd!.inferred,
            group_label: g.label,
            item_count: g.items.length,
          },
        }),
      );
    });
    if (sd.no !== lastSdNo + 1) sdOrderErrors.push(`${block.unit} (${block.subNo}): ❶부터 이어지지 않음 — ${lastSdNo} 다음 ${sd.no}`);
    lastSdNo = sd.no;
    sd = null;
  }
  closeSd();

  const byUnit: Record<string, number> = {};
  for (const b of blocks) byUnit[b.unit] = (byUnit[b.unit] ?? 0) + 1;
  const sortUnits = (o: Record<string, number>) => JSON.stringify(Object.entries(o).sort((a, b) => Number(a[0].slice(3)) - Number(b[0].slice(3))));
  const E = MGMT_CHECKLIST_EXPECTED;
  const eq = (name: string, expected: unknown, actual: unknown): Check => ({ name, level: "error", ok: JSON.stringify(expected) === JSON.stringify(actual), expected, actual });

  const checks: Check[] = [
    eq("관리계획 경영관리 자가진단 블록 수", E.blocks, blocks.length),
    eq("관리계획 경영관리 자가진단 경영관리 블록 수(지표 1~11)", E.mgmtBlocks, blocks.filter((b) => !b.bonus).length),
    eq("관리계획 경영관리 자가진단 혁신가점 블록 수(지표 12~14)", E.bonusBlocks, blocks.filter((b) => b.bonus).length),
    {
      name: "관리계획 경영관리 자가진단 지표 단위 분포",
      level: "error",
      ok: sortUnits(E.byUnit) === sortUnits(byUnit),
      expected: sortUnits(E.byUnit),
      actual: sortUnits(byUnit),
    },
    eq("관리계획 경영관리 자가진단 지적사항 수(머리표 합)", E.issueHeaderTotal, stats.issueHeaderTotal),
    eq("관리계획 경영관리 자가진단 지적사항 수(표 번호 수)", E.issues, stats.issues),
    {
      name: "관리계획 경영관리 자가진단 지적사항 블록별 머리표 = 표 번호 수",
      level: "error",
      ok: perBlockIssueMismatch.length === 0,
      expected: "일치",
      actual: perBlockIssueMismatch.length === 0 ? "일치" : perBlockIssueMismatch.join("; "),
    },
    eq("관리계획 경영관리 자가진단 세부평가내용 수", E.sdCount, stats.sdCount),
    {
      name: "관리계획 경영관리 자가진단 세부평가내용 번호가 블록마다 ❶부터 연속",
      level: "error",
      ok: sdOrderErrors.length === 0,
      expected: "연속",
      actual: sdOrderErrors.length === 0 ? "연속" : sdOrderErrors.join("; "),
    },
    eq("관리계획 경영관리 자가진단 ◇ 표지 누락(추정) 세부평가내용 수", E.inferredSd, stats.inferredSd),
    eq("관리계획 경영관리 자가진단 구분 묶음 수", E.groups, stats.groups),
    eq("관리계획 경영관리 자가진단 점검사항 수", E.items, stats.items),
    {
      name: "관리계획 경영관리 자가진단 조각 수(지적사항 + 구분 묶음)",
      level: "error",
      ok: chunks.length === blocks.length + stats.groups,
      expected: blocks.length + stats.groups,
      actual: chunks.length,
    },
    {
      name: "관리계획 경영관리 자가진단 모든 조각의 지표 단위가 풀림",
      level: "error",
      ok: chunks.every((c) => c.business !== null && /^MG-\d+$/.test(c.business) && c.track === "경영관리"),
      expected: "전부 MG-N·경영관리",
      actual: chunks.filter((c) => !(c.business && /^MG-\d+$/.test(c.business))).length,
    },
  ];
  return { chunks, checks };
}
