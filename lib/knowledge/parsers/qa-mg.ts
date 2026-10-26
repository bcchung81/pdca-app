// 2025 경영관리 실사 질문·요청 답변자료(첨부1·2, A팀·B팀) → 질문 1쌍(·요청 1건) = 조각 1개. 주요사업 att3 파서의 경영관리 짝.
// 합본 PDF를 지표 구간으로 나눈 파일 하나 = 지표 하나(평가단위 MG-N)라 지표는 문서 명세가 정한다(이름을 추측하지 않음).
// 쪽 머리 표(「<지표> | 질문 답변자료 | 보고서 P.x」 + 다음 줄 「N. [태그] 질문…」)가 질문·요청의 시작이고, 그 표는 앞 쪽의 표와 합쳐져 한 블록 안 중간에 나오기도 하므로
// 블록 글에서 머리 줄을 찾아 그 자리에서 자른다(앞 조각 표는 닫고, 새 조각 표는 열어 줌). 질문 번호가 1..마지막 번호로 이어지지 않으면 적재를 멈춘다.
// 그림(![image](…))은 저장하지 않아 글에서 뺀다(그림 수는 meta.image_count).

import { finalizeChunks, makeChunk } from "../chunk.ts";
import { pad2 } from "../normalize.ts";
import type { SourceBlock } from "../source.ts";
import { tablePlainText } from "../table.ts";
import type { Check, KnowledgeChunk, KnowledgeDocumentSpec, Measure, ParseResult, UnitId } from "../types.ts";
import { QA_SPLIT_CHARS, splitBlocks } from "./att3.ts";

/** 적재할 지표 구간 13개(첨부1 A팀 7·첨부2 B팀 6). 쪽은 합본 PDF의 쪽 — 표지쪽에서 다음 표지쪽 앞까지, 쪽 1~2(표지·전체 목차)는 뺌 */
export interface QaMgDoc {
  docId: string;
  unit: `MG-${number}`;
  team: "A" | "B";
  /** 합본 PDF 쪽 범위 */
  pages: [number, number];
  /** 표지 이름(원본 목차 표기) */
  label: string;
}

export const QA_MG_DOCS: readonly QaMgDoc[] = [
  { docId: "qa25-mg-01", unit: "MG-1", team: "A", pages: [3, 132], label: "1-(1) 전략기획" },
  { docId: "qa25-mg-02", unit: "MG-2", team: "A", pages: [133, 243], label: "1-(2) 윤리경영" },
  { docId: "qa25-mg-03", unit: "MG-3", team: "A", pages: [244, 313], label: "2-(1) 일자리 및 균등한 기회" },
  { docId: "qa25-mg-04", unit: "MG-4", team: "A", pages: [314, 404], label: "2-(2) 안전 및 재난관리" },
  { docId: "qa25-mg-05", unit: "MG-5", team: "A", pages: [405, 444], label: "2-(3) 친환경·탄소중립" },
  { docId: "qa25-mg-06", unit: "MG-6", team: "B", pages: [3, 102], label: "2-(4) 창업 및 경제활성화" },
  { docId: "qa25-mg-07", unit: "MG-7", team: "B", pages: [103, 202], label: "2-(5) 상생·협력 및 지역발전" },
  { docId: "qa25-mg-08", unit: "MG-8", team: "B", pages: [203, 298], label: "3-(1) 재무예산관리" },
  { docId: "qa25-mg-09", unit: "MG-9", team: "B", pages: [299, 440], label: "4-(1) 조직 및 인적자원관리(일·가정 양립 포함)" },
  { docId: "qa25-mg-10", unit: "MG-10", team: "B", pages: [441, 506], label: "4-(2) 노사관계" },
  { docId: "qa25-mg-11", unit: "MG-11", team: "B", pages: [507, 553], label: "4-(3) 보수 및 복리후생" },
  { docId: "qa25-mg-12", unit: "MG-12", team: "A", pages: [445, 528], label: "가점(1) 안전한 일터 조성" },
  { docId: "qa25-mg-14", unit: "MG-14", team: "A", pages: [529, 624], label: "가점(3) 국정과제 등 핵심정책 이행" },
];

/** 문서 등록부(documents.ts)에 넣는 명세 — 파일 이름은 영문, 기관 원본 이름은 original_name */
export function qaMgSpec(d: QaMgDoc): KnowledgeDocumentSpec {
  const attach = d.team === "A" ? "첨부1" : "첨부2";
  return {
    doc_id: d.docId,
    title: `2025년도 경영실적평가 경영관리 질문·요청 답변자료(${d.team}팀) — ${d.label}`,
    file_name: `${d.docId}.pdf`,
    parsed_name: d.docId,
    original_name: `(${attach} 발췌) 경영관리${d.team}팀 답변자료 ${d.label}.pdf`,
    edition: "2026. 4. 13.",
    published: "2026-04-13",
    issuer: "한국방송통신전파진흥원",
    basis_year: 2025,
    tracks: ["경영관리"],
    scope: `${attach} 경영관리${d.team}팀 체크리스트 답변자료(원본 ${d.team === "A" ? 624 : 553}쪽)의 ${d.label} 구간(원본 ${d.pages[0]}~${d.pages[1]}쪽) — 질문 답변 1쌍·요청자료 1건 = 조각 1개`,
    status: "ingest",
  };
}

const unitOfDoc = (docId: string): QaMgDoc => {
  const d = QA_MG_DOCS.find((x) => x.docId === docId);
  if (!d) throw new Error(`경영관리 실사 답변자료 문서가 아님: ${docId}`);
  return d;
};

// ---------------------------------------------------------------------------

const CELL = String.raw`<t[hd][^>]*>`;
const END = String.raw`<\/t[hd]>`;
const ANY = String.raw`(?:(?!<\/t[hd]>)[\s\S])*`;
/** HTML 표의 쪽 머리 2줄: 「[빈 칸] <지표> | 질문 답변자료·요청자료 | 보고서 P.x」 + 「[빈 칸] N. …」 — 4~9칸 표에 합쳐지면 앞에 빈 칸이 붙고 칸 폭(colspan)이 다름 */
const HEADER_HTML = new RegExp(
  String.raw`<tr>\s*(?:${CELL}${ANY}${END}\s*){1,2}?${CELL}\s*(질문 답변자료|요청자료)\s*${END}(?:\s*${CELL}\s*([^<]*?)\s*${END})?\s*<\/tr>\s*<tr>\s*(?:${CELL}\s*${END}\s*)?${CELL}([\s\S]*?)${END}\s*<\/tr>`,
  "g",
);
/** 파이프 표 머리(블록이 이 표로 시작할 때) */
const HEADER_PIPE = /^\|[^|\n]*\|\s*(질문 답변자료|요청자료)\s*\|(?:\s*([^|\n]*?)\s*\|)?[ \t]*\n(?:\|[\s|:-]*\n)?\|\s*(\d+\.[^\n]*?)(?:\s*\|)+[ \t]*(?:\n|$)/;
/** 지표 표지(쪽 1의 큰 제목) — 한 파일에 지표 안의 소구분이 둘(조직 및 인적자원관리 + 일·가정 양립)이면 표지가 둘이고 질문 번호가 다시 1부터 */
const COVER = /^#\s+(?:\d-\(\d\)|가점\(\d\))/;

const IMAGE = /!\[[^\]]*\]\([^)]*\)/g;
const plain = (s: string) => s.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

interface Piece {
  /** 질문(Q) 또는 요청(R)의 시작이면 머리 정보, 아니면 앞 단위의 내용 */
  head: { section: "Q" | "R"; reportPage: string; question: string; page: number } | null;
  text: string;
  page: number;
}

/** 블록 한 개 → 머리를 기준으로 자른 조각들(머리가 없으면 그대로 한 조각) */
export function splitAtHeaders(block: SourceBlock): Piece[] {
  const text = block.text;
  const hits: Array<{ index: number; end: number; section: "Q" | "R"; reportPage: string; question: string }> = [];
  for (const m of text.matchAll(HEADER_HTML)) hits.push({ index: m.index!, end: m.index! + m[0].length, section: m[1] === "요청자료" ? "R" : "Q", reportPage: (m[2] ?? "").trim(), question: plain(m[3]) });
  if (!hits.length) {
    const p = HEADER_PIPE.exec(text.trimStart());
    if (p) {
      const lead = text.length - text.trimStart().length;
      hits.push({ index: lead, end: lead + p[0].length, section: p[1] === "요청자료" ? "R" : "Q", reportPage: (p[2] ?? "").trim(), question: plain(p[3]) });
    }
  }
  if (!hits.length) return [{ head: null, text, page: block.page }];
  const out: Piece[] = [];
  const open = (s: string) => (s.match(/<table/g) ?? []).length - (s.match(/<\/table>/g) ?? []).length;
  const tail = (s: string) => (open(s) > 0 ? `${s}</table>` : s);
  const blank = (s: string) => !s.replace(/<\/?table>|<\/?tr>|<\/?t[hd][^>]*>|\s|\|/g, "");
  const before = text.slice(0, hits[0].index);
  if (!blank(before)) out.push({ head: null, text: tail(before), page: block.page });
  hits.forEach((h, i) => {
    const rest = text.slice(h.end, i + 1 < hits.length ? hits[i + 1].index : text.length);
    // 머리가 한 표의 중간이었으면 남은 줄들은 새 표로 이어 붙임(첫 줄이 <tr>일 때)
    const body = blank(rest) ? "" : /^\s*<tr>/.test(rest) ? tail(`<table>${rest}`) : rest;
    out.push({ head: { section: h.section, reportPage: h.reportPage, question: h.question, page: block.page }, text: body, page: block.page });
  });
  return out;
}

interface Unit {
  section: "Q" | "R";
  no: number;
  question: string;
  reportPage: string;
  tags: string[];
  refPage: number | null;
  body: string;
  pageStart: number;
  pageEnd: number;
  contents: Array<{ text: string; page: number }>;
  images: number;
}

/** 「N. [경평지적사항] (p.5) 질문…」 → 번호·태그·본문 */
export function parseQuestion(raw: string): { no: number | null; tags: string[]; refPage: number | null; body: string } {
  let body = raw.trim();
  let no: number | null = null;
  const n = /^(\d{1,3})\.\s*/.exec(body);
  if (n) {
    no = Number(n[1]);
    body = body.slice(n[0].length);
  }
  const tags: string[] = [];
  let refPage: number | null = null;
  for (;;) {
    let m: RegExpExecArray | null;
    if ((m = /^\[(경평지적사항|국회지적사항)\]\s*/.exec(body))) tags.push(m[1]);
    else if ((m = /^\(공통\)\s*/.exec(body))) tags.push("공통");
    else if ((m = /^\(p\.\s*(\d+)\)\s*/.exec(body))) {
      tags.push("보고서쪽질문");
      refPage = Number(m[1]);
    } else break;
    body = body.slice(m[0].length);
  }
  return { no, tags, refPage, body };
}

interface TocCount {
  q: number;
  r: number;
}

/** 목차(첫 질문 앞 블록들)에서 질문·요청 항목 수 — 목차 줄은 「N. 질문 … ····· 쪽」 모양 */
function tocCounts(pre: SourceBlock[]): TocCount {
  const count = { q: 0, r: 0 };
  let section: "q" | "r" = "q";
  for (const b of pre) {
    if (/요청자료/.test(b.text.slice(0, 60)) && /Ⅱ/.test(b.text.slice(0, 20))) section = "r";
    const nums = [...b.text.matchAll(/(?:^|[\s|])(\d{1,3})\.\s+(?=[^\s·])/g)].map((m) => Number(m[1]));
    for (const n of nums) count[section] = Math.max(count[section], n);
  }
  return count;
}

interface Section {
  /** 표지 제목(없으면 문서 명세의 이름) */
  label: string;
  pre: SourceBlock[];
  units: Unit[];
}

export function parseQaMg(blocks: SourceBlock[], docId: string): ParseResult {
  const d = unitOfDoc(docId);
  const checks: Check[] = [];
  const sections: Section[] = [];
  const open = (label: string): Section => {
    const sec: Section = { label, pre: [], units: [] };
    sections.push(sec);
    return sec;
  };
  let sec = open(d.label);
  let cur: Unit | null = null;
  for (const b of blocks) {
    // 둘째 이후 표지: 앞 구간을 닫고 새 구간(질문 번호가 다시 1부터)
    if (b.type === "heading" && COVER.test(b.text.trim())) {
      const label = b.text.trim().replace(/^#\s+/, "");
      sec = sec.pre.length || sec.units.length ? open(label) : Object.assign(sec, { label });
      cur = null;
      continue;
    }
    for (const piece of splitAtHeaders(b)) {
      if (piece.head) {
        const q = parseQuestion(piece.head.question);
        cur = { section: piece.head.section, no: q.no ?? -1, question: piece.head.question, reportPage: piece.head.reportPage, tags: q.tags, refPage: q.refPage, body: q.body, pageStart: piece.page, pageEnd: piece.page, contents: [], images: 0 };
        sec.units.push(cur);
      }
      const images = (piece.text.match(IMAGE) ?? []).length;
      const text = piece.text.replace(IMAGE, "").trim();
      if (!cur) {
        sec.pre.push({ ...b, text: piece.text });
        continue;
      }
      cur.images += images;
      cur.pageEnd = Math.max(cur.pageEnd, piece.page);
      if (text && text.replace(/\s|\|/g, "")) cur.contents.push({ text, page: piece.page });
    }
  }

  // 검산 1·2: 구간마다 질문·요청 번호가 1부터 끊김 없이(목차의 마지막 번호와 같음)
  const tocs: TocCount[] = [];
  sections.forEach((sc, si) => {
    const toc = tocCounts(sc.pre);
    tocs.push(toc);
    const where = sections.length > 1 ? `[${sc.label}] ` : "";
    for (const [section, label, expected] of [["Q", "질문", toc.q], ["R", "요청", toc.r]] as const) {
      const nos = sc.units.filter((u) => u.section === section).map((u) => u.no);
      const max = Math.max(0, ...nos);
      const missing = Array.from({ length: max }, (_, i) => i + 1).filter((n) => !nos.includes(n));
      const dup = nos.filter((n, i) => nos.indexOf(n) !== i);
      checks.push({ name: `${where}${label} 번호가 1~${max}로 끊김·중복 없음`, level: "error", ok: (nos.length > 0 || (section === "R" && toc.r === 0)) && missing.length === 0 && dup.length === 0 && !nos.includes(-1), expected: `1~${max}`, actual: { found: nos.length, missing, duplicated: dup } });
      checks.push({ name: `${where}${label} 수가 목차의 마지막 번호와 같음`, level: "warn", ok: expected === 0 || max === expected, expected, actual: max });
    }
    void si;
  });

  const chunks: KnowledgeChunk[] = [];
  const measure: Measure = Number(d.unit.slice(3)) >= 12 ? "가점" : "비계량";
  const docLabel = `2025 경영관리 실사 질문·요청 답변자료(${d.team}팀, '26.4.13.)`;
  let inputChars = 0;
  let chunkChars = 0;
  sections.forEach((sc, si) => {
    const short = sc.label.replace(/^\S+\s+/, "");
    for (const u of sc.units) {
      const kind = u.section === "Q" ? "질문" : "요청";
      const blocksOf = u.contents.map((c) => {
        const table = c.text.trimStart().startsWith("<table") || c.text.trimStart().startsWith("|");
        return { text: c.text, table, size: table ? tablePlainText(c.text).length : c.text.length };
      });
      inputChars += blocksOf.reduce((n, b) => n + b.size, 0);
      const parts = splitBlocks(blocksOf, QA_SPLIT_CHARS);
      const headline = `${kind} ${u.no}: ${u.question.replace(/^\d{1,3}\.\s*/, "")}`;
      const key = `${d.docId}${si ? `/s${si + 1}` : ""}/${u.section.toLowerCase()}${pad2(u.no)}`;
      const title = `'25 실사 ${kind} · ${short} ${u.section}${u.no} · ${u.body.length > 40 ? `${u.body.slice(0, 39)}…` : u.body}`;
      const prefix = `${docLabel} · ${sc.label} · ${u.section === "Q" ? "Ⅰ 질문 답변자료" : "Ⅱ 요청자료"} ${u.no}${u.reportPage && u.reportPage !== "-" ? ` · ${u.reportPage}` : ""}`;
      const meta = {
        unit: d.unit,
        team: d.team,
        section_label: sc.label,
        section: u.section,
        no: u.no,
        question: u.body,
        tags: u.tags,
        ref_page: u.refPage,
        report_page: u.reportPage === "-" ? null : u.reportPage,
        image_count: u.images,
        source_pages: d.pages,
        page_basis: "doc-page",
      };
      const common = { doc_id: d.docId, track: "경영관리" as const, business: d.unit as UnitId, eval_item: null, measure, q_type: [...u.tags, ...(u.section === "R" ? ["요청자료"] : [])], pdf_page_start: u.pageStart, pdf_page_end: u.pageEnd };
      parts.forEach((seg, i) => {
        const many = parts.length > 1;
        chunkChars += seg.reduce((n, b) => n + b.size, 0);
        chunks.push(
          makeChunk({
            ...common,
            chunk_key: many ? `${key}/part${i + 1}` : key,
            unit_type: u.section === "Q" ? (many ? "qa_part" : "qa_pair") : "request_evidence",
            title: many ? `${title} (${i + 1}/${parts.length})` : title,
            context_prefix: prefix,
            blocks: [headline, ...seg.map((b) => b.text)],
            meta: many ? { ...meta, parent_key: key, part_no: i + 1, part_total: parts.length } : meta,
          }),
        );
      });
    }
  });
  checks.push({ name: "글 손실 없음(머리·목차·그림 표시를 뺀 본문 글자 합 = 조각 글자 합)", level: "error", ok: inputChars === chunkChars, expected: inputChars, actual: chunkChars });
  checks.push({ name: "조각이 한 개 이상", level: "error", ok: chunks.length > 0, actual: chunks.length });
  const all = sections.flatMap((sc) => sc.units);
  return { chunks: finalizeChunks(chunks), checks, extras: { unit: d.unit, sections: sections.map((sc) => sc.label), questions: all.filter((u) => u.section === "Q").length, requests: all.filter((u) => u.section === "R").length, toc: tocs } };
}

/** 문서별 파서(파이프라인 PARSERS에 이름으로 등록) */
export const QA_MG_PARSERS: Record<string, (blocks: SourceBlock[]) => ParseResult> = Object.fromEntries(QA_MG_DOCS.map((d) => [d.docId, (blocks: SourceBlock[]) => parseQaMg(blocks, d.docId)]));
