// 2026 경영관리 과제관리카드 외부 컨설팅 의견(xlsx) → 카드 1장 × 차수 1개 = 조각 1개(순수). 2026-11-19 사용자 결정(A3).
// 입력: kordoc가 xlsx를 읽어 만든 블록 흐름 — 시트마다 「## 시트 이름」 블록 + HTML 표 1개. 시트 「1차 컨설팅(9.7~8)」·「2차 컨설팅(11.11~12)」만 읽고
// 「데이터 차트」(주요사업 본부별 집계)는 적재하지 않음.
// 표 열: (빈 A) · 부서 · 팀 · 과제번호(「전략기획 1-1」) · 추진과제명 · 과제관리카드 보완사항(의견을 「▶」로 나눔) · 이행여부 · 그 뒤 담당자 실명 두 열.
// **담당자 실명 열은 읽지 않음** — 머리 「이행여부」 열까지만 쓰고 그 오른쪽 칸은 어디에도 옮기지 않음(개인정보).
// 글은 F열 원문 그대로 두고 「▶」 줄 나눔만 정리(의견 1개 = 인용 단위 1개). 의견은 카드 보완 관점이지 사실·숫자 근거가 아님 — 요청 때 표지(revision-note.ts CONSULT_NOTE),
// 묶음은 그 카드의 작성지원·질문·코멘트·경평 구성안·집필·블록 고치기에만(bundle.ts buildBundle의 카드별 덩이 consult — 공유 층에는 안 넣음), 숫자·인용 대조(relevantRefs·bundleRefs)에서는 뺌.
// 1차(9월)는 11-05 과제 재편(261103판 47장) 전 번호라 과제명으로 지금 카드(2차 시트 = 지금 카드)와 맞추고, 맞출 카드가 없거나 둘 이상이면 추측하지 않고
// 사람이 확정한 표(CONSULT_R1_CONFIRMED — 한 카드, CONSULT_R1_SPLIT — 나뉜 카드 전부)만 따르며, 그것도 없으면 「9월 카드 기준」으로 남김.
// 조각이 가리키는 지금 카드는 늘 목록(meta.card_ids — 대개 1개, 나뉜 과제는 여럿, 못 맞추면 빈 목록): 묶음(bundle.ts buildBundle)은 그 카드 요청에만 넣고,
// DB 읽기 정책(20261120090000 private.can_read_consult)은 성과관리팀 이상 또는 그 카드를 읽을 수 있는 사람만 읽게 함(2026-11-20 사용자 결정 — 카드별로만 참조·노출).

import { finalizeChunks, makeChunk } from "../chunk.ts";
import { cellText, compactKey, normalizeText } from "../normalize.ts";
import type { SourceBlock } from "../source.ts";
import { type ParsedTable, parseHtmlTables } from "../table.ts";
import { MGMT_INDICATORS } from "../../tracks/mgmt-units.ts";
import type { Check, KnowledgeChunk, ParseResult } from "../types.ts";
import { CONSULT_UNIT_TYPE } from "../usage.ts";

export const CONSULT_MG_DOC_ID = "consult26-mg";
export const CONSULT_MG_TITLE = "2026 경영관리 과제관리카드 외부 컨설팅 의견";

/** 차수 — 시트 이름 앞부분으로 찾음 */
export const CONSULT_ROUNDS = [
  { round: 1, sheet: "1차 컨설팅", period: "'26.9.7~8" },
  { round: 2, sheet: "2차 컨설팅", period: "'26.11.11~12" },
] as const;
/** 지금 카드(261103판)와 같은 차수 — 이 시트의 과제번호·과제명이 1차 대응의 기준 */
const CURRENT_ROUND = 2;
/** 1차 과제를 지금 카드와 못 맞췄을 때 meta.card_basis */
export const SEPT_BASIS = "9월 카드 기준";
/** 확정 표로 맞췄을 때 meta.card_basis */
export const CONFIRMED_BASIS = "사용자 확정(과제명 바뀜)";
/** 나뉜 과제 표로 맞췄을 때 meta.card_basis */
export const SPLIT_BASIS = "사용자 확정(9월 과제가 지금 카드 여럿으로 나뉨)";

/**
 * 과제명으로 못 맞춘 1차 과제 중 사람이 지금 카드로 확정한 것(1차 번호 → 지금 번호) — 2026-11-19 사용자 결정: 2차 의견이 같은 번호 카드에서 9월 의견을 이어 말해
 * 이름만 다듬어진 같은 카드로 봄. 7-1(상생·공정 과제가 지금 7-1·7-2로 나뉨)은 하나로 정할 수 없어 9월 카드 기준으로 남김
 */
export const CONSULT_R1_CONFIRMED: Record<string, string> = { "8-1": "8-1", "8-2": "8-2", "13-1": "13-1", "13-2": "13-2", "13-3": "13-3" };

/**
 * 과제명으로 못 맞춘 1차 과제 중 지금 카드 여럿으로 나뉜 것(1차 번호 → 지금 번호들) — 그 의견을 나뉜 카드 모두의 의견으로 봄(2026-11-20 사용자 결정:
 * 9월 7-1 「상생·협력 및 공정한 경제질서 확립」 → 지금 7-1 상생 기반·7-2 공정 거래)
 */
export const CONSULT_R1_SPLIT: Record<string, string[]> = { "7-1": ["7-1", "7-2"] };

/** 검산 기대값 — 원본 파일(시트 3개 중 2개)을 직접 세어 확인한 값. 새 판이 오면 원문으로 먼저 확인할 것 */
export const CONSULT_MG_EXPECTED = {
  /** 차수별 카드(행) 수 */
  cards: { 1: 44, 2: 47 } as Record<number, number>,
  /** 차수별 의견(「▶」) 수 */
  opinions: { 1: 108, 2: 266 } as Record<number, number>,
  /** 1차 과제번호(9월 카드) → 지금 번호. 과제명이 같은 2차 행으로 맞춘 결과 중 번호가 바뀐 것만(11-05 상생 과제 분리 — lib/reports/mg-outline.ts MG_CARD_EVALS 주석) */
  renumbered: { "7-2": "7-3", "7-3": "7-4", "7-4": "7-5" } as Record<string, string>,
  /** 1차 과제 중 과제명으로 못 맞춰 확정 표(CONSULT_R1_CONFIRMED)로 맞춘 것 */
  confirmed: ["8-1", "8-2", "13-1", "13-2", "13-3"],
  /** 1차 과제 중 나뉜 과제 표(CONSULT_R1_SPLIT)로 지금 카드 여럿에 맞춘 것 */
  split: ["7-1"],
  /** 1차 과제 중 과제명으로도 확정 표로도 못 맞춘 것(9월 카드 기준으로 남김) */
  unmatched: [] as string[],
};

/** 머리 행 낱말(열 순서) — 이행여부까지만. 그 오른쪽(담당자 실명 열)은 보지 않음 */
const COLS = ["부서", "팀", "과제번호", "추진과제명", "보완사항", "이행여부"] as const;
const TASK_NO = /^(.+?)\s*(\d+)-(\d+)$/;

export interface ConsultRow {
  round: number;
  /** 시트에 적힌 과제번호(「N-M」) */
  no: string;
  indicator: number;
  /** 시트의 과제번호 앞 지표명(「전략기획」) */
  indicatorName: string;
  name: string;
  dept: string[];
  team: string[];
  /** 의견(「▶」 한 개 = 한 줄, 「▶ 」로 시작) */
  opinions: string[];
  /** 「▶」 앞에 붙은 글(없으면 "") */
  lead: string;
  /** 이행여부 칸 글(대개 빔) */
  status: string;
  /** F열 원문 글(줄 나눔 정리 전 — 글 손실 검산용) */
  raw: string;
  page: number;
}

/** 시트 표 하나 → 행. 머리 행(「부서」…「이행여부」)을 찾아 그 아래 행만, 열은 머리의 「이행여부」까지만 */
export function readConsultTable(table: ParsedTable, round: number, page: number): ConsultRow[] {
  const cells = (i: number) => table.rows[i].cells;
  const headIdx = table.rows.findIndex((r) => r.cells.some((c) => cellText(c.html) === "부서"));
  if (headIdx < 0) throw new Error(`외부 컨설팅 ${round}차: 「부서」 머리 행을 찾지 못했습니다(kordoc 산출물 모양이 바뀌었는지 확인).`);
  // 머리 칸 → 열 위치(병합이 없는 표 — 칸 수가 다르면 멈춤)
  const head = cells(headIdx).map((c) => compactKey(cellText(c.html)));
  const at = COLS.map((k) => head.findIndex((h) => h.includes(compactKey(k))));
  if (at.some((i) => i < 0) || at.some((i, n) => n > 0 && i !== at[n - 1] + 1)) throw new Error(`외부 컨설팅 ${round}차: 표 머리가 예상과 다릅니다(${COLS.join("·")} 열을 차례로 찾지 못함)`);
  const out: ConsultRow[] = [];
  for (let r = headIdx + 1; r < table.rows.length; r++) {
    const row = cells(r);
    if (row.length !== head.length || row.some((c) => c.colspan !== 1 || c.rowspan !== 1)) throw new Error(`외부 컨설팅 ${round}차: ${r + 1}번째 행의 칸 모양이 머리와 다릅니다(병합 칸)`);
    // 이행여부 열까지만 읽음 — 담당자 실명 열은 건드리지 않음
    const [dept, team, noCell, name, body, status] = at.map((i) => row[i].html);
    const noText = cellText(noCell);
    if (!noText && !cellText(body)) continue; // 빈 줄
    const m = TASK_NO.exec(noText);
    if (!m) throw new Error(`외부 컨설팅 ${round}차: 과제번호 꼴이 아닙니다: ${noText}`);
    const lines = (html: string) => cellText(html, "\n").split("\n").map((s) => s.trim()).filter(Boolean);
    const raw = cellText(body, "\n");
    const [lead, ...items] = raw.split("▶");
    out.push({
      round,
      no: `${m[2]}-${m[3]}`,
      indicator: Number(m[2]),
      indicatorName: m[1].trim(),
      name: cellText(name),
      dept: lines(dept),
      team: lines(team),
      // 줄 나눔만 정리: 의견 안의 줄바꿈은 한 칸으로, 의견마다 「▶ 」로 시작
      opinions: items.map((s) => s.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean).map((s) => `▶ ${s}`),
      lead: lead.replace(/\s*\n\s*/g, " ").trim(),
      status: cellText(status),
      raw,
      page,
    });
  }
  return out;
}

/** 블록 흐름 → 차수별 행. 시트 이름 블록(「## 1차 컨설팅(9.7~8)」) 다음에 오는 HTML 표가 그 시트 표 */
export function readConsultSheets(blocks: SourceBlock[]): ConsultRow[] {
  const rows: ConsultRow[] = [];
  const seen = new Set<number>();
  let round: number | null = null;
  for (const b of blocks) {
    const text = b.text.trim();
    if (text.startsWith("#")) {
      const name = normalizeText(text.replace(/^#+\s*/, ""));
      round = CONSULT_ROUNDS.find((r) => name.startsWith(r.sheet))?.round ?? null;
      continue;
    }
    if (round === null || !text.startsWith("<table")) continue;
    const tables = parseHtmlTables(text);
    if (tables.length !== 1) throw new Error(`외부 컨설팅 ${round}차: 시트 표가 ${tables.length}개입니다(1개여야 함)`);
    if (seen.has(round)) throw new Error(`외부 컨설팅 ${round}차: 시트 표가 둘 이상입니다`);
    seen.add(round);
    rows.push(...readConsultTable(tables[0], round, b.page));
    round = null;
  }
  for (const r of CONSULT_ROUNDS) if (!seen.has(r.round)) throw new Error(`외부 컨설팅: 시트 「${r.sheet}」를 찾지 못했습니다`);
  return rows;
}

export type CardMatch = { no: string; how: "same" | "contains" } | { no: null; why: "없음" | "둘 이상"; candidates: string[] };

/**
 * 1차 과제(9월 카드)를 지금 카드(2차 시트 행)와 과제명으로 맞춤 — 같은 지표 안에서 ① 이름이 같으면(글자·숫자만 견줌) 그것, ② 아니면 한 이름이 다른 이름을 품는 것이 하나뿐일 때만.
 * 없거나 둘 이상이면 맞추지 않음(번호·글자 유사도로 짐작하지 않음)
 */
export function matchCurrentCard(old: { indicator: number; name: string }, current: ReadonlyArray<{ indicator: number; no: string; name: string }>): CardMatch {
  const pool = current.filter((c) => c.indicator === old.indicator);
  const key = compactKey(old.name);
  const same = pool.filter((c) => compactKey(c.name) === key);
  if (same.length === 1) return { no: same[0].no, how: "same" };
  if (same.length > 1) return { no: null, why: "둘 이상", candidates: same.map((c) => c.no) };
  const contains = pool.filter((c) => {
    const k = compactKey(c.name);
    return k.includes(key) || key.includes(k);
  });
  if (contains.length === 1) return { no: contains[0].no, how: "contains" };
  return { no: null, why: contains.length ? "둘 이상" : "없음", candidates: contains.map((c) => c.no) };
}

export function parseConsultMg(blocks: SourceBlock[], docId = CONSULT_MG_DOC_ID, confirmedTable: Record<string, string> = CONSULT_R1_CONFIRMED, splitTable: Record<string, string[]> = CONSULT_R1_SPLIT): ParseResult {
  const rows = readConsultSheets(blocks);
  const current = rows.filter((r) => r.round === CURRENT_ROUND);
  const chunks: KnowledgeChunk[] = [];
  const badIndicator: string[] = [];
  const lost: string[] = [];
  const leads: string[] = [];
  const renumbered: Record<string, string> = {};
  const unmatched: Array<{ no: string; name: string; why: string; candidates: string[] }> = [];
  const confirmed: string[] = [];
  const split: string[] = [];
  const confirmBad: string[] = [];
  for (const r of rows) {
    const mg = MGMT_INDICATORS.find((x) => x.no === r.indicator);
    if (!mg || compactKey(mg.name) !== compactKey(r.indicatorName)) badIndicator.push(`${r.round}차 ${r.indicatorName} ${r.no}`);
    const period = CONSULT_ROUNDS.find((x) => x.round === r.round)!.period;
    // 지금 카드 번호(목록): 2차는 시트 번호 그대로, 1차는 과제명으로 맞춘 번호 → 못 맞추면 확정 표(한 카드) → 나뉜 과제 표(카드 여럿) → 그래도 없으면 빈 목록(9월 카드 기준)
    const match = r.round === CURRENT_ROUND ? ({ no: r.no, how: "same" } as CardMatch) : matchCurrentCard(r, current);
    let nos: string[] = match.no === null ? [] : [match.no];
    let basis: string | null = match.no !== null && match.no !== r.no ? "과제명으로 맞춤" : null;
    const inSheet = (to: string) => current.some((c) => c.no === to && c.indicator === r.indicator);
    if (r.round !== CURRENT_ROUND && match.no === null) {
      if (Object.hasOwn(confirmedTable, r.no)) {
        const to = confirmedTable[r.no];
        if (inSheet(to)) {
          nos = [to];
          basis = CONFIRMED_BASIS;
          confirmed.push(r.no);
        } else confirmBad.push(`${r.no} → ${to}`);
      } else if (Object.hasOwn(splitTable, r.no)) {
        const to = splitTable[r.no];
        if (to.length > 1 && to.every(inSheet)) {
          nos = [...to];
          basis = SPLIT_BASIS;
          split.push(r.no);
        } else confirmBad.push(`${r.no} → ${to.join("·")}`);
      }
      if (!nos.length) {
        unmatched.push({ no: r.no, name: r.name, why: match.why, candidates: match.candidates });
        basis = SEPT_BASIS;
      }
    }
    if (r.round !== CURRENT_ROUND && match.no !== null && match.no !== r.no) renumbered[r.no] = match.no;
    const noLabel = !nos.length
      ? `${r.no}(${SEPT_BASIS} 번호 — 지금 카드와 못 맞춤)`
      : nos.length > 1
        ? `${nos.join("·")}(9월 카드 ${r.no} — 지금 카드 ${nos.length}개로 나뉨)`
        : nos[0] !== r.no
          ? `${nos[0]}(9월 카드 ${r.no})`
          : r.no;
    const head = `${r.indicatorName} ${noLabel} ${r.name}`;
    const blocks = [...(r.lead ? [r.lead] : []), ...r.opinions];
    if (r.lead) leads.push(`${r.round}차 ${r.no}`);
    // 글 손실 검산: 「▶」·공백·줄바꿈만 정리했으므로 글자·숫자는 원문과 같아야 함
    if (compactKey(blocks.join("")) !== compactKey(r.raw)) lost.push(`${r.round}차 ${r.no}`);
    chunks.push(
      makeChunk({
        chunk_key: `${docId}/r${r.round}/${r.no}`,
        doc_id: docId,
        unit_type: CONSULT_UNIT_TYPE,
        track: "경영관리",
        business: (mg?.id ?? null) as KnowledgeChunk["business"],
        eval_item: null,
        measure: null,
        q_type: ["외부 컨설팅"],
        title: `외부 컨설팅 ${r.round}차 · ${head}`,
        context_prefix: `외부 컨설팅 ${r.round}차(${period}) · ${head}`,
        blocks,
        pdf_page_start: r.page,
        dept_resp: r.team,
        meta: {
          round: r.round,
          period,
          // 지금 카드 번호·카드 id는 늘 목록(대개 1개, 나뉜 과제는 여럿, 못 맞추면 빈 목록) — 묶음 거름·DB 읽기 정책이 card_ids를 봄
          task_nos: nos,
          task_no_sheet: r.no,
          task_name: r.name,
          card_ids: nos.map((no) => `${mg?.group ?? `경영관리${r.indicator}`}/${no}`),
          ...(basis ? { card_basis: basis } : {}),
          ...(match.no !== null && match.how === "contains" ? { name_match: "contains" } : {}),
          opinions: r.opinions.length,
          dept: r.dept,
          team: r.team,
          ...(r.status ? { status_cell: r.status } : {}),
          page_basis: "xlsx-sheet",
        },
      }),
    );
  }

  const E = CONSULT_MG_EXPECTED;
  const count = (round: number, f: (r: ConsultRow) => number) => rows.filter((r) => r.round === round).reduce((n, r) => n + f(r), 0);
  const checks: Check[] = [
    ...CONSULT_ROUNDS.flatMap(({ round }) => [
      { name: `외부 컨설팅 ${round}차 카드 수`, level: "error" as const, ok: count(round, () => 1) === E.cards[round], expected: E.cards[round], actual: count(round, () => 1) },
      { name: `외부 컨설팅 ${round}차 의견(▶) 수`, level: "error" as const, ok: count(round, (r) => r.opinions.length) === E.opinions[round], expected: E.opinions[round], actual: count(round, (r) => r.opinions.length) },
    ]),
    { name: "외부 컨설팅 과제번호 앞 지표명이 지표 번호와 맞음", level: "error", ok: badIndicator.length === 0, expected: "모두 맞음", actual: badIndicator.length ? badIndicator : "모두 맞음" },
    { name: "외부 컨설팅 의견 글 손실 없음(「▶」·줄 나눔만 정리)", level: "error", ok: lost.length === 0, expected: "모두 같음", actual: lost.length ? lost : "모두 같음" },
    { name: "외부 컨설팅 「▶」 앞 글 없음", level: "warn", ok: leads.length === 0, expected: 0, actual: leads.length ? leads : 0, note: "있으면 그 글은 의견 앞 블록으로 둠" },
    { name: "외부 컨설팅 2차 과제번호가 겹치지 않음", level: "error", ok: new Set(current.map((r) => r.no)).size === current.length, expected: current.length, actual: new Set(current.map((r) => r.no)).size },
    {
      name: "외부 컨설팅 1차 과제 → 지금 카드 대응(과제명 + 확정 표 + 나뉜 과제 표)",
      level: "error",
      ok:
        JSON.stringify(renumbered) === JSON.stringify(E.renumbered) &&
        JSON.stringify(confirmed) === JSON.stringify(E.confirmed) &&
        JSON.stringify(split) === JSON.stringify(E.split) &&
        JSON.stringify(unmatched.map((u) => u.no)) === JSON.stringify(E.unmatched),
      expected: { renumbered: E.renumbered, confirmed: E.confirmed, split: E.split, unmatched: E.unmatched },
      actual: { renumbered, confirmed, split, unmatched },
      note: "못 맞춘 과제는 meta.card_basis = 9월 카드 기준·card_ids 빈 목록(어느 카드 요청에도 안 들어감) — 새 판이면 원문으로 확인 뒤 기대값을 고침",
    },
    { name: "외부 컨설팅 1차 확정 표·나뉜 과제 표의 대상 카드가 2차 시트(같은 지표)에 있음", level: "error", ok: confirmBad.length === 0, expected: "모두 있음", actual: confirmBad.length ? confirmBad : "모두 있음" },
  ];
  return { chunks: finalizeChunks(chunks), checks, extras: { renumbered, confirmed, split, unmatched } };
}
