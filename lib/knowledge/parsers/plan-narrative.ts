// 관리계획 서술 — Ⅰ(’25년도 경영평가 결과)·Ⅱ(’26년도 경영평가 변화 및 대응방향) → plan_section 조각(순수).
// 종합점검 지침(14) <지식파일_지도>의 3순위 근거(결과 총평·설명회 공유·결과 시사점·산업진흥1팀 총평·지표 변화·대응방향·지표변화 총괄표·계량지표 수정(안)·착안사항).
// 절 = 번호 머리 표(「| 1 | 제목 |」·「| 참고1 |  | 제목 |」), 조각 = 절 안 □ 소제목 또는 <경영관리>·<주요사업> 묶음. 경영관리만 다루는 조각은 track 경영관리.
// Ⅱ 끝의 「AI활용 과제관리카드 운영방안」(그림 쪽, 이 앱의 기획 자료)과 Ⅲ 이후는 넣지 않습니다.

import { makeChunk } from "../chunk.ts";
import { joinBrokenLines, normalizeText } from "../normalize.ts";
import type { LineItem } from "../source.ts";
import { tablePlainText } from "../table.ts";
import type { Check, KnowledgeChunk, ParseResult, Track } from "../types.ts";

const DOC = "plan-2607";
const DOC_LABEL = "2026 경영평가 관리계획(7월판)";
const PART_HEAD = /^#\s*(Ⅰ|Ⅱ|Ⅲ)\.\s*(.+)$/;
const SECTION_TABLE = /^\|\s*(\d+|참고\s*\d+)\s*\|(?:\s*\|)?\s*([^|]+?)\s*\|/;
const SUB_HEAD = /^(?:#+\s*)?□\s*(.+)$/;
const SIDE = /^<\s*(경영관리|주요사업)\s*>$/;
const STOP = /AI활용 과제관리카드 운영방안/;
const MAX_CHARS = 2200;

export const NARRATIVE_EXPECTED = {
  /** 절(번호·참고 머리 표) 수: Ⅰ 1~4 + 참고1~6, Ⅱ 1~2 + 참고1~3 */
  sections: 15,
};

interface Draft {
  part: "Ⅰ" | "Ⅱ";
  partTitle: string;
  section: string;
  sectionTitle: string;
  sub: string;
  page: number;
  lines: string[];
  /** 표에서 온 줄(잇지 않음) */
  tableLines: Set<number>;
}

/** kordoc 줄 → 읽는 글: 머리 기호·목록 흔적(「- - 」)·이스케이프를 걷음 */
export function cleanNarrativeLine(raw: string): string {
  return normalizeText(
    raw
      .replace(/^#+\s*/, "")
      .replace(/^-\s+-\s+/, "- ")
      .replace(/\\([`*_~\\[\]])/g, "$1"),
  );
}

const trackOf = (d: Draft): Track => (/경영관리/.test(`${d.sub} ${d.sectionTitle}`) ? "경영관리" : "주요사업");

export function parsePlanNarrative(items: LineItem[]): ParseResult {
  const drafts: Draft[] = [];
  let part: Draft["part"] | null = null;
  let partTitle = "";
  let section = "";
  let sectionTitle = "";
  let cur: Draft | null = null;
  const sections = new Set<string>();
  const open = (sub: string, page: number) => {
    cur = { part: part!, partTitle, section, sectionTitle, sub, page, lines: [], tableLines: new Set() };
    drafts.push(cur);
  };
  for (const it of items) {
    const text = it.text.trim();
    const head = it.kind === "line" ? PART_HEAD.exec(text) : null;
    if (head) {
      if (head[1] === "Ⅲ") break;
      part = head[1] as Draft["part"];
      partTitle = head[2].trim();
      section = "";
      cur = null;
      continue;
    }
    if (!part) continue;
    if (it.kind === "line" && STOP.test(text)) break;
    const sec = it.kind === "table" ? SECTION_TABLE.exec(text.split("\n")[0]) : null;
    if (sec && /^\|/.test(text) && text.split("\n").length <= 2) {
      section = sec[1].replace(/\s+/g, "");
      sectionTitle = cleanNarrativeLine(sec[2]);
      sections.add(`${part}/${section}`);
      open("", it.page);
      continue;
    }
    if (!section) continue;
    if (it.kind === "line") {
      if (/^!\[image\]/.test(text)) continue;
      const sub = SUB_HEAD.exec(text);
      const side = SIDE.exec(text);
      if (sub || side) {
        open(side ? `<${side[1]}>` : cleanNarrativeLine(sub![1]), it.page);
        continue;
      }
      const line = cleanNarrativeLine(text);
      if (line) (cur as Draft | null)?.lines.push(line);
    } else {
      // 표는 행마다 한 줄(긴 표도 조각 경계에서 나뉘게)
      const d = cur as Draft | null;
      for (const row of tablePlainText(text).split("\n")) {
        if (!row.trim() || !d) continue;
        d.tableLines.add(d.lines.length);
        d.lines.push(row.trim());
      }
    }
  }

  const chunks: KnowledgeChunk[] = [];
  const counter = new Map<string, number>();
  for (const d of drafts) {
    if (!d.lines.length) continue;
    // PDF 한 줄이 문단 하나가 된 서술은 이음(표 행은 그대로)
    const merged: string[] = [];
    let run: string[] = [];
    d.lines.forEach((l, i) => {
      if (d.tableLines.has(i)) {
        merged.push(...joinBrokenLines(run), l);
        run = [];
      } else run.push(l);
    });
    merged.push(...joinBrokenLines(run));
    d.lines = merged;
    // 긴 조각은 줄 경계에서 나눔(근거 한 조각이 AI 요청에서 잘리지 않게)
    const parts: string[][] = [[]];
    let size = 0;
    for (const l of d.lines) {
      if (size + l.length > MAX_CHARS && parts[parts.length - 1].length) {
        parts.push([]);
        size = 0;
      }
      parts[parts.length - 1].push(l);
      size += l.length;
    }
    const base = `${d.part === "Ⅰ" ? "I" : "II"}/${d.section.replace("참고", "ref")}`;
    parts.forEach((lines, i) => {
      const n = (counter.get(base) ?? 0) + 1;
      counter.set(base, n);
      const where = `${d.part} ${d.section.startsWith("참고") ? d.section : `${d.section}.`} ${d.sectionTitle}`;
      chunks.push(
        makeChunk({
          chunk_key: `${DOC}/narr/${base}/s${n}`,
          doc_id: DOC,
          unit_type: "plan_section",
          track: trackOf(d),
          business: null,
          eval_item: null,
          measure: null,
          title: `관리계획 ${where}${d.sub ? ` · ${d.sub}` : ""}${parts.length > 1 ? ` (${i + 1}/${parts.length})` : ""}`,
          context_prefix: `${DOC_LABEL} ${d.part}. ${d.partTitle} · ${where}${d.sub ? ` · ${d.sub}` : ""}`,
          blocks: lines,
          pdf_page_start: d.page,
          meta: { part: d.part, section: d.section, sub: d.sub },
        }),
      );
    });
  }
  const checks: Check[] = [
    { name: "관리계획 서술(Ⅰ·Ⅱ) 절 수", level: "error", ok: sections.size === NARRATIVE_EXPECTED.sections, expected: NARRATIVE_EXPECTED.sections, actual: sections.size },
    { name: "관리계획 서술(Ⅰ·Ⅱ) 조각", level: "warn", ok: chunks.length > 0, actual: chunks.length },
  ];
  return { chunks, checks };
}
