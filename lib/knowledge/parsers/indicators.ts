// 과제관리카드 작성 안내(2026. 5. 27. 배포)의 지표 붙임 3종 → 조각. 지침 09 「전략연계_점검」의 근거:
//   카드 붙임3 '25 주요사업 성과지표 Pool(지침의 붙임4) · 카드 붙임1 '26~'30 중장기 목표지표(지침의 붙임3) · 카드 붙임2 '24~'26 기관장 성과지표(지침의 붙임2)
// 파일 번호와 지침 번호가 달라 조각 제목은 번호가 아니라 문서 이름으로 적습니다.
// 대표 계량지표(카드 붙임4)는 관리계획 붙임2 '26 편람 주요사업 범주(plan-2607/handbook26)와 같은 내용이라 따로 적재하지 않습니다.

import { makeChunk, finalizeChunks } from "../chunk.ts";
import { BUSINESSES } from "../dictionaries.ts";
import { cellLines } from "../rich-text.ts";
import { type LineItem, type SourceBlock, toLineItems } from "../source.ts";
import { expandGrid, parseHtmlTables } from "../table.ts";
import type { BusinessId, Check, KnowledgeChunk, ParseResult } from "../types.ts";

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚㉛㉜㉝㉞㉟";
const circledNo = (s: string): number | null => {
  const i = CIRCLED.indexOf(s.trim()[0] ?? "");
  return i >= 0 ? i + 1 : null;
};
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const htmlTables = (items: LineItem[]) => items.filter((i) => i.kind === "table" && i.text.trimStart().startsWith("<table"));

// ---------------------------------------------------------------------------
// '25 주요사업 성과지표 Pool(카드 붙임3)

export const POOL_DOC_ID = "pool25-biz";
/** 검산: 사업별 지표 수(제목 「(22개 : 계량 12개, 비계량 10개)」와 같음) */
export const POOL_EXPECTED = { total: 71, bySection: [22, 22, 27], quant: [12, 13, 16] } as const;
const POOL_BUSINESS: BusinessId[] = ["BZ-1", "BZ-2", "BZ-3"];

interface PoolRow {
  section: number;
  no: number;
  name: string;
  kind: "계량" | "비계량";
  goal?: string;
  scores?: { policy: string; smart: string; esg: string; total: string };
  change?: string;
  fields: Array<[string, string]>;
  page: number | null;
}

export function parsePool(blocks: SourceBlock[]): ParseResult {
  const items = toLineItems(blocks);
  const rows = new Map<string, PoolRow>();
  const headings: Array<{ section: number; name: string; total: number; quant: number; qual: number }> = [];
  const sectionNames: string[] = [];
  const row = (section: number, no: number) => {
    const key = `${section}/${no}`;
    if (!rows.has(key)) rows.set(key, { section, no, name: "", kind: "계량", fields: [], page: null });
    return rows.get(key)!;
  };
  let section = 0;
  for (const it of items) {
    if (it.kind === "line") {
      const m = /^\*\*([①②③])\*\*\s*(.+)$/.exec(it.text);
      if (!m) continue;
      section = CIRCLED.indexOf(m[1]) + 1;
      const c = /\((\d+)개\s*:\s*계량\s*(\d+)개\s*,\s*비계량\s*(\d+)개\)/.exec(m[2]);
      const name = oneLine(m[2].replace(/\(.*$/, ""));
      if (c) headings.push({ section, name, total: Number(c[1]), quant: Number(c[2]), qual: Number(c[3]) });
      sectionNames[section] ??= name;
      continue;
    }
    if (!section || !it.text.trimStart().startsWith("<table")) continue;
    for (const t of parseHtmlTables(it.text)) {
      const grid = expandGrid(t);
      const head = grid[0]?.map(oneLine) ?? [];
      if (head.includes("성과목표") && head.includes("성과지표")) {
        // 사업별 총괄표: 성과목표 | 성과지표(번호·이름·계/비) | 전략·정책 | SMART | ESG | 합계 | 전년 대비
        for (const g of grid.slice(1)) {
          const cell = oneLine(g[1] ?? "");
          const no = circledNo(cell);
          if (!no) continue;
          const r = row(section, no);
          r.name ||= oneLine(cell.slice(1).replace(/\s*(계|비)$/, ""));
          r.kind = /\s비$/.test(cell) ? "비계량" : "계량";
          r.goal = oneLine(g[0] ?? "");
          r.scores = { policy: oneLine(g[2] ?? ""), smart: oneLine(g[3] ?? ""), esg: oneLine(g[4] ?? ""), total: oneLine(g[5] ?? "") };
          r.change = oneLine(g[6] ?? "");
        }
        continue;
      }
      // 지표 정의표: 첫 행 「① 이름 / 계량」, 이어서 정의·목표·측정산식 및 변수 …
      const first = t.rows[0]?.cells ?? [];
      const title = first.length === 1 ? oneLine(first[0].text) : "";
      const no = circledNo(title);
      if (!no) continue;
      const r = row(section, no);
      const kind = /비계량$/.test(title) ? "비계량" : /계량$/.test(title) ? "계량" : null;
      r.name = oneLine(title.slice(1).replace(/\s*(비계량|계량)$/, ""));
      if (kind) r.kind = kind;
      r.page ??= it.page;
      for (const tr of t.rows.slice(1)) {
        if (tr.cells.length < 2) continue;
        const label = oneLine(tr.cells[0].text).replace(/\s/g, "");
        const value = cellLines(tr.cells.slice(1).map((c) => c.html).join("<br>"));
        if (label && value) r.fields.push([label === "측정산식및변수" ? "측정산식 및 변수" : label, value]);
      }
    }
  }

  const list = [...rows.values()].sort((a, b) => a.section - b.section || a.no - b.no);
  const chunks: KnowledgeChunk[] = list.map((r) => {
    const business = POOL_BUSINESS[r.section - 1];
    const bizName = sectionNames[r.section] ?? "";
    const blocks = r.fields.map(([k, v]) => `${k}: ${v}`);
    if (r.scores) blocks.push(`Pool 평가 점수: 전략·정책 ${r.scores.policy} · SMART ${r.scores.smart} · ESG ${r.scores.esg} · 합계 ${r.scores.total}${r.change ? ` · 전년 대비 ${r.change}` : ""}`);
    return makeChunk({
      chunk_key: `${POOL_DOC_ID}/${business}/${String(r.no).padStart(2, "0")}`,
      doc_id: POOL_DOC_ID,
      unit_type: "pool_indicator",
      track: "주요사업",
      business,
      eval_item: null,
      measure: r.kind,
      title: `성과지표 Pool · ${CIRCLED[r.no - 1]} ${r.name}(${r.kind})`,
      context_prefix: `'25 주요사업 성과지표 Pool · ${bizName}${r.goal ? ` · 성과목표: ${r.goal}` : ""}`,
      blocks: blocks.length ? blocks : [`${r.name}(${r.kind})`],
      pdf_page_start: r.page,
      meta: { section: r.section, no: r.no, name: r.name, kind: r.kind, goal: r.goal ?? null, scores: r.scores ?? null, change: r.change ?? null },
    });
  });

  const checks: Check[] = [];
  checks.push({ name: "Pool 지표 수", level: "error", ok: list.length === POOL_EXPECTED.total, expected: POOL_EXPECTED.total, actual: list.length });
  POOL_EXPECTED.bySection.forEach((n, i) => {
    const got = list.filter((r) => r.section === i + 1);
    const h = headings.find((x) => x.section === i + 1);
    checks.push({ name: `Pool ${i + 1}번 사업 지표 수(제목의 개수와 같음)`, level: "error", ok: got.length === n && h?.total === n, expected: n, actual: { rows: got.length, heading: h?.total ?? null } });
    checks.push({ name: `Pool ${i + 1}번 사업 계량 지표 수`, level: "error", ok: got.filter((r) => r.kind === "계량").length === POOL_EXPECTED.quant[i], expected: POOL_EXPECTED.quant[i], actual: got.filter((r) => r.kind === "계량").length });
  });
  const noDef = list.filter((r) => !r.fields.some(([k]) => k === "정의"));
  checks.push({ name: "Pool 지표마다 정의 칸", level: "error", ok: noDef.length === 0, actual: noDef.map((r) => `${r.section}/${r.no}`) });
  const noScore = list.filter((r) => !r.scores);
  checks.push({ name: "Pool 지표마다 총괄표 점수", level: "error", ok: noScore.length === 0, actual: noScore.map((r) => `${r.section}/${r.no}`) });
  return { chunks: finalizeChunks(chunks), checks };
}

// ---------------------------------------------------------------------------
// '26~'30 중장기 경영목표 과제별 목표지표(카드 붙임1)

export const GOAL_DOC_ID = "goal30-2605";
/** 검산: 전략과제 수·목표지표 수(원문 표 행 수) */
export const GOAL_EXPECTED = { groups: 12, indicators: 63 } as const;
const YEARS = ["'26", "'27", "'28", "'29", "'30"];

export function parseGoals(blocks: SourceBlock[]): ParseResult {
  const groups = new Map<string, { code: string; page: number; rows: Array<{ name: string; unit: string; targets: string[] }> }>();
  for (const it of htmlTables(toLineItems(blocks))) {
    for (const t of parseHtmlTables(it.text)) {
      for (const g of expandGrid(t)) {
        const code = oneLine(g[0] ?? "");
        const name = oneLine(g[1] ?? "");
        if (!/^[ⅠⅡⅢⅣⅤ]+-\d+$/.test(code) || !/^\d+\)/.test(name)) continue;
        if (!groups.has(code)) groups.set(code, { code, page: it.page, rows: [] });
        groups.get(code)!.rows.push({ name, unit: oneLine(g[2] ?? ""), targets: g.slice(3, 8).map(oneLine) });
      }
    }
  }
  const list = [...groups.values()];
  const chunks = list.map((g) =>
    makeChunk({
      chunk_key: `${GOAL_DOC_ID}/${g.code}`,
      doc_id: GOAL_DOC_ID,
      unit_type: "goal_indicator",
      track: "주요사업",
      business: null,
      eval_item: null,
      measure: null,
      title: `중장기 목표지표 · 전략과제 ${g.code}(지표 ${g.rows.length}개)`,
      context_prefix: `'26~'30 중장기 경영목표 과제별 목표지표 · 전략과제 ${g.code}`,
      blocks: g.rows.map((r) => `${r.name}(${r.unit}) — ${r.targets.map((v, i) => `${YEARS[i]} ${v}`).join(" · ")}`),
      pdf_page_start: g.page,
      meta: { code: g.code, indicators: g.rows },
    }),
  );
  const count = list.reduce((n, g) => n + g.rows.length, 0);
  const checks: Check[] = [
    { name: "중장기 전략과제 수", level: "error", ok: list.length === GOAL_EXPECTED.groups, expected: GOAL_EXPECTED.groups, actual: list.length },
    { name: "중장기 목표지표 수", level: "error", ok: count === GOAL_EXPECTED.indicators, expected: GOAL_EXPECTED.indicators, actual: count },
  ];
  return { chunks: finalizeChunks(chunks), checks };
}

// ---------------------------------------------------------------------------
// '24~'26 기관장 성과계획서 성과지표(카드 붙임2) — 경영성과계획서 총괄 요약표

export const CEO_DOC_ID = "ceo24-2605";
/** 검산: 성과목표 4개 × 성과지표 A·B·C */
export const CEO_EXPECTED = { goals: 4, indicators: 12 } as const;

export function parseCeoIndicators(blocks: SourceBlock[]): ParseResult {
  const goals: Array<{ no: number; name: string; page: number; rows: string[] }> = [];
  for (const it of htmlTables(toLineItems(blocks))) {
    for (const t of parseHtmlTables(it.text)) {
      for (const tr of t.rows) {
        const cells = tr.cells.map((c) => cellLines(c.html));
        const first = oneLine(cells[0] ?? "");
        const goal = /^▪\s*성과목표\s*(\d+)\s*:\s*(.+)$/.exec(first);
        if (goal && cells.length === 1) {
          goals.push({ no: Number(goal[1]), name: oneLine(goal[2]), page: it.page, rows: [] });
          continue;
        }
        if (!/^ㅇ\s*성과지표/.test(first) || !goals.length) continue;
        // 칸 안 줄바꿈은 인쇄 줄넘김이라 빈칸으로 잇고, 하위 지표(B-1·C-2)·보조지표 줄만 「 / 」로 나눔
        const join = (c: string) => c.split("\n").map((l) => l.trim()).filter(Boolean).reduce((a, l) => (!a ? l : /^([A-Z]-\d|\(\s*보조지표)/.test(l) ? `${a} / ${l}` : `${a} ${l}`), "");
        const [name, method, target, ...years] = cells.map(join);
        const yearText = years.length >= 3 ? ` · '24 ${years[0]} · '25 ${years[1]} · '26 ${years[2]}` : years.length ? ` · 연도별 ${years.join(" · ")}` : "";
        goals.at(-1)!.rows.push(`${name.replace(/^ㅇ\s*/, "")} — 측정 ${method} · 성과목표치 ${target}${yearText}`);
      }
    }
  }
  const chunks = goals.map((g) =>
    makeChunk({
      chunk_key: `${CEO_DOC_ID}/goal-${g.no}`,
      doc_id: CEO_DOC_ID,
      unit_type: "ceo_indicator",
      track: "주요사업",
      business: null,
      eval_item: null,
      measure: null,
      title: `기관장 성과지표 · 성과목표 ${g.no} ${g.name}`,
      context_prefix: `'24~'26 기관장 경영성과계획서 총괄 요약표 · 성과목표 ${g.no}: ${g.name}`,
      blocks: g.rows,
      pdf_page_start: g.page,
      meta: { goal_no: g.no, goal: g.name, indicators: g.rows.length },
    }),
  );
  const count = goals.reduce((n, g) => n + g.rows.length, 0);
  const checks: Check[] = [
    { name: "기관장 성과목표 수", level: "error", ok: goals.length === CEO_EXPECTED.goals, expected: CEO_EXPECTED.goals, actual: goals.length },
    { name: "기관장 성과지표 수", level: "error", ok: count === CEO_EXPECTED.indicators, expected: CEO_EXPECTED.indicators, actual: count },
  ];
  return { chunks: finalizeChunks(chunks), checks };
}

/** 사업 번호 → 이름('26) — 조각 머리말용 */
export function businessName(id: BusinessId): string {
  return BUSINESSES.find((b) => b.id === id)?.name2026 ?? id;
}
