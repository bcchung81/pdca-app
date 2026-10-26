// 붙임2 「2025년도 경영평가(주요사업) 유관기관 평가보고서 정리」 → 사례 조각(순수).
// 종합점검 지침 14 <지식파일_지도> [붙임2 구성]: 시트 1개, 열 = 구분(공통/기관/지표구성) · 기관명 · 주요사업 · 등급 · 잘한 점(성과) · 아쉬운 점(지적사항).
// 기관명은 기관의 첫 행에만 적혀 있으므로 빈 칸이면 위 행을 이어받습니다. 한국연구재단은 등급이 없습니다.
// 한국방송통신전파진흥원(KCA) 행은 사례가 아니라 '25 KCA 지적 요약이므로 사례 후보에서 뺍니다(meta.kca).
// 엑셀·한글·PDF 어느 것이든 kordoc이 표로 읽은 마크다운(HTML 표 또는 파이프 표)을 받습니다.

import { makeChunk, finalizeChunks } from "../chunk.ts";
import { cellText, compactKey, normalizeText } from "../normalize.ts";
import { expandGrid, parseHtmlTables, parsePipeTable } from "../table.ts";
import type { KnowledgeChunk } from "../types.ts";

export const PEER_DOC_ID = "peer25-biz";
export const PEER_UNIT = "peer_case";
export const PEER_TITLE = "2025년도 경영평가(주요사업) 유관기관 평가보고서 정리(붙임2)";

export interface PeerCase {
  seq: number;
  /** 구분: 공통·기관·지표구성 */
  kind: string;
  org: string;
  business: string;
  /** B+·B0·C 등(없으면 빈 글자) */
  grade: string;
  good: string;
  bad: string;
  /** 한국방송통신전파진흥원 행(사례 아님) */
  kca: boolean;
}

type Col = "kind" | "org" | "business" | "grade" | "good" | "bad";
const HEAD: Record<Col, (k: string) => boolean> = {
  kind: (k) => k === "구분",
  org: (k) => k.includes("기관"),
  business: (k) => k.includes("주요사업") || k === "사업명" || k === "사업",
  grade: (k) => k.includes("등급"),
  good: (k) => k.includes("잘한") || k === "성과" || k.startsWith("우수"),
  bad: (k) => k.includes("아쉬운") || k.includes("지적") || k.includes("미흡"),
};

/** 머리 칸 글 길이 상한(정리한 글 기준) — 표 위 설명 줄처럼 머리 낱말이 섞인 긴 문장은 머리로 보지 않음 */
const HEAD_MAX = 20;

/**
 * 머리 행 찾기: 기관·주요사업·잘한 점·아쉬운 점 중 3개 이상이 맞는 첫 행.
 * 여러 칸에 같은 글이 걸린 병합 줄(표 제목·설명 — 실제 붙임2: 「각 기관 주요사업 단위 잘한 점/아쉬운 점 + 사업별 등급」)은 건너뜀
 */
export function findHeader(grid: string[][]): { row: number; cols: Partial<Record<Col, number>> } | null {
  for (let r = 0; r < Math.min(grid.length, 12); r++) {
    if (new Set(grid[r].map((c) => c.trim()).filter(Boolean)).size < 3) continue;
    const cols: Partial<Record<Col, number>> = {};
    grid[r].forEach((cell, c) => {
      const k = compactKey(cell);
      if (k.length > HEAD_MAX) return;
      // 한 칸은 한 열에만(처음 맞는 것)
      const key = (Object.keys(HEAD) as Col[]).find((x) => cols[x] === undefined && HEAD[x](k));
      if (key) cols[key] = c;
    });
    const hits = (["org", "business", "good", "bad"] as Col[]).filter((k) => cols[k] !== undefined).length;
    if (hits >= 3 && cols.org !== undefined) return { row: r, cols };
  }
  return null;
}

/** 등급 표기 맞춤: B0·Bo·B 0 → B0, B＋ → B+, 없음·- → "" */
export function normalizeGrade(raw: string): string {
  const t = normalizeText(raw).replace(/\s+/g, "").replace(/＋/g, "+").replace(/[－–—]/g, "-");
  if (!t || /^[-·]+$/.test(t) || t === "없음" || t === "해당없음") return "";
  const m = /^([A-Ea-e])([+0oO-]?)$/.exec(t);
  if (!m) return t;
  const tail = m[2] === "o" || m[2] === "O" ? "0" : m[2];
  return `${m[1].toUpperCase()}${tail}`;
}

const isKca = (org: string) => /한국방송통신전파진흥원|^KCA$|\(KCA\)/.test(org.replace(/\s+/g, ""));

/** 격자(병합을 펼친 표) → 사례 행. 기관명·구분 빈 칸은 위 행을 이어받음 */
export function peerCasesFromGrid(grid: string[][]): { cases: PeerCase[]; problems: string[] } {
  const head = findHeader(grid);
  if (!head) return { cases: [], problems: ["머리 행(구분·기관명·주요사업·등급·잘한 점·아쉬운 점)을 찾지 못했습니다."] };
  const cell = (row: string[], k: Col) => (head.cols[k] === undefined ? "" : normalizeText(row[head.cols[k]!] ?? ""));
  const cases: PeerCase[] = [];
  const problems: string[] = [];
  let org = "";
  let kind = "";
  for (let r = head.row + 1; r < grid.length; r++) {
    const row = grid[r];
    if (row.every((c) => !c.trim())) continue;
    const orgCell = cell(row, "org");
    if (orgCell) org = orgCell;
    const kindCell = cell(row, "kind");
    if (kindCell) kind = kindCell;
    const good = cell(row, "good");
    const bad = cell(row, "bad");
    if (!good && !bad) continue;
    if (!org) {
      problems.push(`${r + 1}행: 기관명이 없어 건너뜀`);
      continue;
    }
    cases.push({ seq: cases.length + 1, kind, org, business: cell(row, "business"), grade: normalizeGrade(cell(row, "grade")), good, bad, kca: isKca(org) });
  }
  if (!cases.length) problems.push("사례 행이 없습니다(잘한 점·아쉬운 점 칸이 모두 비었음).");
  return { cases, problems };
}

/** kordoc 마크다운 속 표들 → 격자들(HTML 표·파이프 표) */
export function gridsFromMarkdown(md: string): string[][][] {
  const grids: string[][][] = parseHtmlTables(md).map((t) => expandGrid(t).map((row) => row.map((c) => cellText(c, " "))));
  // 파이프 표: 연속한 | 줄 묶음마다
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith("|")) continue;
    const block: string[] = [];
    for (; i < lines.length && lines[i].trim().startsWith("|"); i++) block.push(lines[i]);
    grids.push(parsePipeTable(block.join("\n")).rows.map((row) => row.map((c) => cellText(c.replace(/\\\|/g, "|"), " "))));
  }
  return grids;
}

/** 마크다운에서 사례 표 고르기: 머리가 맞는 표들을 이어 읽음(여러 쪽에 나뉜 표) */
export function peerCasesFromMarkdown(md: string): { cases: PeerCase[]; problems: string[] } {
  const all: PeerCase[] = [];
  const problems: string[] = [];
  let lastHead: string[] | null = null;
  for (const grid of gridsFromMarkdown(md)) {
    // 머리 없이 이어지는 표(다음 쪽)는 앞 표 머리를 붙여 읽음
    const withHead: string[][] | null = findHeader(grid) ? grid : lastHead ? [lastHead, ...grid] : null;
    if (!withHead) continue;
    const h = findHeader(withHead);
    if (!h) continue;
    lastHead = withHead[h.row];
    const res = peerCasesFromGrid(withHead);
    all.push(...res.cases);
    problems.push(...res.problems.filter((p) => !p.startsWith("사례 행이 없습니다")));
  }
  // 앞 표 마지막 기관을 다음 표가 이어받는 경우를 위해 한 번 더 채움
  let org = "";
  const cases = all.map((c, i) => {
    if (c.org) org = c.org;
    return { ...c, org: c.org || org, seq: i + 1 };
  });
  if (!cases.length) problems.unshift("붙임2 표(구분·기관명·주요사업·등급·잘한 점·아쉬운 점)를 찾지 못했습니다.");
  return { cases, problems };
}

/** 사례 → 공통 지식 조각(unit_type peer_case). 제목은 「붙임2 · 기관명 — 사업명(등급)」 */
export function peerChunks(cases: PeerCase[], docId = PEER_DOC_ID): KnowledgeChunk[] {
  return finalizeChunks(
    cases.map((c) =>
      makeChunk({
        chunk_key: `${docId}/${String(c.seq).padStart(3, "0")}`,
        doc_id: docId,
        unit_type: PEER_UNIT,
        track: "주요사업",
        business: null,
        eval_item: null,
        measure: "비계량",
        title: `붙임2 · ${c.org}${c.business ? ` — ${c.business}` : ""}${c.grade ? `(${c.grade})` : ""}`,
        context_prefix: `${PEER_TITLE} · ${c.kind || "기관"} · ${c.org}${c.kca ? " · KCA 지적 요약(사례 아님)" : ""}`,
        blocks: [c.good ? `잘한 점(성과): ${c.good}` : "", c.bad ? `아쉬운 점(지적사항): ${c.bad}` : ""],
        pdf_page_start: null,
        meta: { org: c.org, business: c.business, grade: c.grade, kind: c.kind, kca: c.kca },
      }),
    ),
  );
}

/** 적재 요약(관리 화면 표시·검산) */
export function peerSummary(cases: PeerCase[]): { rows: number; orgs: number; candidates: number; kca: number; grades: Record<string, number> } {
  const grades: Record<string, number> = {};
  for (const c of cases) grades[c.grade || "등급 없음"] = (grades[c.grade || "등급 없음"] ?? 0) + 1;
  return {
    rows: cases.length,
    orgs: new Set(cases.map((c) => c.org)).size,
    candidates: cases.filter((c) => !c.kca && c.good).length,
    kca: cases.filter((c) => c.kca).length,
    grades,
  };
}

/** 사례제안 첫 줄 머리 「기관명 — 사업명(등급)」(취합·검산에 같은 모양) */
export function peerLabel(c: { org: string; business: string; grade: string }): string {
  return `${c.org}${c.business ? ` — ${c.business}` : ""}${c.grade ? `(${c.grade})` : ""}`;
}
