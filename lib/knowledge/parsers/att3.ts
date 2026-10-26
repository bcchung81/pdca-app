// (첨부3) 2025년도 경영평가 주요사업 실사 답변자료 → 질문+답변 1쌍 = 조각 1개.
// kordoc 조각 경계는 버리고, 질문·요청 머리 행과 증빙 머리 행으로 다시 자릅니다.
// 근거: docs/analysis/공통지식-5종-분석.md §1-2, §2(P1·P2·P4·P5·P6), §3-2

import { makeChunk, finalizeChunks } from "../chunk.ts";
import { businessLabel, report2025Page, resolveMetric2025 } from "../dictionaries.ts";
import { cellText, joinBrokenLines, normalizeText, pad2, stripLeaderDots } from "../normalize.ts";
import type { SourceBlock } from "../source.ts";
import { toLineItems } from "../source.ts";
import { parseHtmlTables, parsePipeTable, tablePlainText, wrapRows } from "../table.ts";
import type { TableRow } from "../table.ts";
import type { BusinessId, Check, EvalItem, KnowledgeChunk, Measure, ParseResult, Track } from "../types.ts";

const DOC = "att3-2604";
const DOC_LABEL = "2025 주요사업 실사 질문·요청 답변자료('26.4.2)";

/** 긴 답변을 나누는 기준(글자). 분석 §3-2 */
export const QA_SPLIT_CHARS = 2500;
const EVIDENCE_TEXT_MIN = 150;

interface PartInfo {
  key: string;
  name: string;
  aliases: string[];
  track: Track;
  business: BusinessId | null;
  eval_item: EvalItem | null;
  measure: Measure;
  indicator?: string;
}

export const ATT3_PARTS: PartInfo[] = [
  { key: "s1", name: "주요사업 계량지표 구성의 적합성", aliases: [], track: "주요사업", business: "BZ-4", eval_item: "지표 적합성", measure: "비계량" },
  { key: "s2", name: "주요사업 계량지표 목표의 도전성", aliases: [], track: "주요사업", business: "BZ-4", eval_item: "목표 도전성", measure: "비계량" },
  { key: "s3", name: "AI 활용을 통한 혁신(가점)", aliases: ["AI 가점"], track: "가점", business: null, eval_item: null, measure: "가점", indicator: "GA-2" },
  { key: "s4", name: "전파이용 기회 확대 사업", aliases: [], track: "주요사업", business: "BZ-1", eval_item: null, measure: "비계량" },
  { key: "s5", name: "전파기반 대국민 서비스 강화 사업", aliases: [], track: "주요사업", business: "BZ-2", eval_item: null, measure: "비계량" },
  { key: "s6", name: "ICT산업 활성화 지원 사업", aliases: [], track: "주요사업", business: "BZ-3", eval_item: null, measure: "비계량" },
];

export const ATT3_EXPECTED = { questions: 140, requests: 37 };

function partByName(name: string): PartInfo | null {
  const n = normalizeText(name);
  return ATT3_PARTS.find((p) => p.name === n || p.aliases.includes(n)) ?? null;
}

type Section = "Q" | "R";

interface TocEntry {
  part: string;
  section: Section;
  no: number;
  text: string;
  tags: string[];
  printedPage: number | null;
}

interface Content {
  text: string;
  page: number;
  table: boolean;
}

interface Unit {
  kind: "qa" | "req" | "evidence";
  part: PartInfo;
  section: Section;
  no: number;
  question: string;
  reportPage: number | null;
  pageStart: number;
  pageEnd: number;
  content: Content[];
  evidenceNo?: string;
  evidenceTitles?: string[];
  parent?: Unit;
  images: number;
}

const Q_HEADER_KINDS: Record<string, Section> = { "질문 답변자료": "Q", 요청자료: "R" };
const EVIDENCE_NO = /^증빙\s*(\d+-\d+)$/;
const REPORT_PAGE = /보고서\s*P\.?\s*(\d+)/;
/** 목차 줄 끝 인쇄 쪽: "···· 26", "· 160", "바랍니다. 37" */
const TOC_PAGE = /(?:·+\s*|\s)(\d{1,3})\s*$/;

export function parseAtt3(blocks: SourceBlock[]): ParseResult {
  const items = toLineItems(blocks);
  const toc: TocEntry[] = [];
  const units: Unit[] = [];

  let mode: "front" | "divider" | "toc" | "body" = "front";
  let part: PartInfo | null = null;
  let section: Section = "Q";
  let current: Unit | null = null; // 지금 내용을 받는 단위(질문·요청·증빙)
  let owner: Unit | null = null; // 증빙이 딸린 질문·요청
  let tocOpen: TocEntry | null = null;
  let pendingQuestion: Unit | null = null; // 머리 행 다음 행이 질문문

  const close = () => {
    current = null;
    pendingQuestion = null;
  };
  const push = (c: Content) => {
    if (!current) return;
    current.content.push(c);
    current.pageEnd = Math.max(current.pageEnd, c.page);
  };
  const startUnit = (kind: Unit["kind"], sec: Section, reportPage: number | null, page: number): Unit => {
    if (!part) throw new Error("첨부3: 부 이름보다 질문 머리가 먼저 나왔습니다");
    const u: Unit = { kind, part, section: sec, no: 0, question: "", reportPage, pageStart: page, pageEnd: page, content: [], images: 0 };
    units.push(u);
    current = u;
    return u;
  };
  const startEvidence = (no: string, title: string, reportPage: number | null, page: number) => {
    const last: Unit | null = current;
    // 같은 증빙 번호가 이어지는 쪽이면 한 단위로 묶습니다.
    if (last && last.kind === "evidence" && last.evidenceNo === no) {
      if (title && !last.evidenceTitles!.includes(title)) last.evidenceTitles!.push(title);
      last.pageEnd = Math.max(last.pageEnd, page);
      return;
    }
    const u = startUnit("evidence", section, reportPage, page);
    u.evidenceNo = no;
    u.evidenceTitles = title ? [title] : [];
    u.parent = owner ?? undefined;
  };

  for (const it of items) {
    if (it.kind === "line") {
      const text = it.text.trim();
      if (/^!\[/.test(text)) {
        if (current) (current as Unit).images += 1;
        continue;
      }
      if (/^# /.test(text)) {
        // 부 간지 제목(단일 #)
        mode = "divider";
        close();
        owner = null;
        continue;
      }
      if (/^Ⅰ\.\s*질문 답변자료$/.test(text) || /^Ⅱ\.\s*요청자료$/.test(text)) {
        mode = "body";
        close();
        tocOpen = null;
        continue;
      }
      if (mode === "toc") {
        const m = /^(\d+)\.\s+(.*)$/.exec(text);
        if (m && (!tocOpen || tocOpen.printedPage !== null || Number(m[1]) === tocOpen.no + 1)) {
          tocOpen = { part: part!.key, section, no: Number(m[1]), text: m[2], tags: [], printedPage: null };
          toc.push(tocOpen);
        } else if (tocOpen && tocOpen.printedPage === null) {
          tocOpen.text += ` ${text}`;
        }
        if (tocOpen && tocOpen.printedPage === null) {
          const end = TOC_PAGE.exec(tocOpen.text);
          if (end) tocOpen.printedPage = Number(end[1]);
        }
        continue;
      }
      if (mode === "body" && current) push({ text: text.replace(/^#{2,6}\s+/, ""), page: it.page, table: false });
      continue;
    }

    // 표
    const t = it.text.trim();
    if (t.startsWith("|")) {
      const rows = parsePipeTable(t).rows.map((r) => r.map((c) => cellText(c)));
      const first = rows[0] ?? [];
      const dividerPart = first.length === 2 && !first[0] ? partByName(first[1]) : null;
      if (dividerPart) {
        part = dividerPart;
        mode = "divider";
        close();
        owner = null;
        continue;
      }
      if (first.length === 2 && (first[0] === "Ⅰ" || first[0] === "Ⅱ") && Q_HEADER_KINDS[first[1]]) {
        section = Q_HEADER_KINDS[first[1]];
        mode = "toc";
        tocOpen = null;
        close();
        continue;
      }
      const ev = EVIDENCE_NO.exec(first[0] ?? "");
      if (ev && mode === "body") {
        startEvidence(ev[1], first[1] ?? "", numberOrNull(REPORT_PAGE.exec(first.join(" "))?.[1]), it.page);
        continue;
      }
      if (mode === "body") push({ text: t, page: it.page, table: true });
      continue;
    }

    // HTML 표: 질문 머리·증빙 머리 행에서 표를 나눕니다(P2).
    for (const table of parseHtmlTables(t)) {
      let buffer: TableRow[] = [];
      const flush = () => {
        if (buffer.length && mode === "body") push({ text: wrapRows(buffer), page: it.page, table: true });
        buffer = [];
      };
      for (const row of table.rows) {
        const cells = row.cells.map((c) => c.text);
        const headKind = cells.length >= 3 ? Q_HEADER_KINDS[cells[1]] : undefined;
        if (headKind) {
          flush();
          const p = partByName(cells[0]);
          if (p) part = p;
          section = headKind;
          mode = "body";
          const u = startUnit(headKind === "Q" ? "qa" : "req", headKind, numberOrNull(REPORT_PAGE.exec(cells[2])?.[1]), it.page);
          owner = u;
          pendingQuestion = u;
          continue;
        }
        if (pendingQuestion) {
          const q = cells.filter(Boolean).join(" ");
          const m = /^(\d+)\.\s*(.*)$/.exec(q);
          pendingQuestion.no = m ? Number(m[1]) : 0;
          pendingQuestion.question = normalizeText(m ? m[2] : q);
          pendingQuestion = null;
          continue;
        }
        const ev = EVIDENCE_NO.exec(cells[0] ?? "");
        if (ev && mode === "body") {
          flush();
          startEvidence(ev[1], cells.slice(1).find((c) => c && !REPORT_PAGE.test(c)) ?? "", numberOrNull(REPORT_PAGE.exec(cells.join(" "))?.[1]), it.page);
          continue;
        }
        buffer.push(row);
      }
      flush();
    }
  }

  return buildResult(units, toc);
}

function numberOrNull(s: string | undefined): number | null {
  return s ? Number(s) : null;
}

// ---------------------------------------------------------------------------

function tagsOf(text: string, part: PartInfo): { tags: string[]; refPage: number | null; metric: string | null; body: string } {
  const tags: string[] = [];
  let body = text.trim();
  let refPage: number | null = null;
  let metric: string | null = null;
  for (;;) {
    let m: RegExpExecArray | null;
    if ((m = /^\[(경평지적사항|국회지적사항)\]\s*/.exec(body))) {
      tags.push(m[1]);
      body = body.slice(m[0].length);
    } else if ((m = /^\(p\.\s*(\d+)\)\s*/.exec(body))) {
      tags.push("보고서쪽질문");
      refPage = Number(m[1]);
      body = body.slice(m[0].length);
    } else if ((part.key === "s1" || part.key === "s2") && !metric && (m = /^\(([^)]+)\)\s*/.exec(body))) {
      tags.push("지표질문");
      metric = m[1];
      body = body.slice(m[0].length);
    } else break;
  }
  return { tags, refPage, metric, body };
}

interface Block {
  text: string;
  table: boolean;
  size: number;
}

function contentBlocks(content: Content[]): Block[] {
  const out: Block[] = [];
  let lines: string[] = [];
  const flushLines = () => {
    for (const l of joinBrokenLines(lines)) {
      const text = normalizeText(l);
      if (text) out.push({ text, table: false, size: text.length });
    }
    lines = [];
  };
  for (const c of content) {
    // 답변 글상자(1×1 표, P6)는 본문 줄로 풉니다.
    const box = c.table && c.text.trimStart().startsWith("<table") ? singleCell(c.text) : null;
    if (box !== null) {
      lines.push(...box.split("\n"));
      continue;
    }
    if (c.table) {
      flushLines();
      const plain = tablePlainText(c.text);
      if (!plain.replace(/\s|\|/g, "")) continue; // 빈 표(그림 틀)
      out.push({ text: c.text, table: true, size: plain.length });
    } else lines.push(c.text);
  }
  flushLines();
  return out;
}

/** 칸이 하나뿐인 표면 그 칸의 글자(줄 유지), 아니면 null */
function singleCell(tableHtml: string): string | null {
  const tables = parseHtmlTables(tableHtml);
  if (tables.length !== 1) return null;
  const cells = tables[0].rows.flatMap((r) => r.cells);
  if (cells.length !== 1 || /<table/i.test(cells[0].html)) return null;
  return cellText(cells[0].html, "\n");
}

/** 긴 답변 나누기: □ 소제목 → ☑ 주장 → 블록 경계 순으로, 기준 글자 수 안에서 */
export function splitBlocks(blocks: Block[], max = QA_SPLIT_CHARS): Block[][] {
  const total = blocks.reduce((s, b) => s + b.size, 0);
  if (total <= max) return [blocks];
  const splitAt = (segs: Block[][], re: RegExp, limit: number) =>
    segs.flatMap((seg) => {
      const size = seg.reduce((s, b) => s + b.size, 0);
      if (size <= limit) return [seg];
      const out: Block[][] = [];
      for (const b of seg) {
        if (out.length === 0 || (re.test(b.text) && out.at(-1)!.length > 0)) out.push([]);
        out.at(-1)!.push(b);
      }
      return out;
    });
  let segs = splitAt([blocks], /^□/, max);
  segs = splitAt(segs, /^☑/, max);
  segs = splitAt(segs, /^/, max * 1.6);
  // 작은 조각은 앞 조각과 합칩니다.
  const merged: Block[][] = [];
  for (const seg of segs) {
    const prev = merged.at(-1);
    const size = (x: Block[]) => x.reduce((s, b) => s + b.size, 0);
    if (prev && size(prev) + size(seg) <= max) prev.push(...seg);
    else merged.push([...seg]);
  }
  return merged;
}

function buildResult(units: Unit[], toc: TocEntry[]): ParseResult {
  const chunks: KnowledgeChunk[] = [];
  const checks: Check[] = [];
  const tocIndex = new Map(toc.map((e) => [`${e.part}/${e.section}/${e.no}`, e]));
  const keyCount = new Map<string, number>();
  const unitKey = (u: Unit) => `${DOC}/${u.part.key}/${u.section}${pad2(u.no)}`;
  let unmatchedToc = 0;
  const partSplit: string[] = [];

  for (const u of units) {
    const p = u.part;
    if (u.kind !== "evidence") {
      const tocEntry = tocIndex.get(`${p.key}/${u.section}/${u.no}`);
      if (!tocEntry) unmatchedToc += 1;
      const body = tagsOf(u.question, p);
      const tocTags = tocEntry ? tagsOf(stripLeaderDots(tocEntry.text.replace(TOC_PAGE, "")), p) : null;
      const qTypes = new Set<string>([...body.tags, ...(tocTags?.tags ?? [])]);
      if (u.section === "R") qTypes.add("요청자료");
      const metricName = body.metric ?? tocTags?.metric ?? null;
      const metric = metricName ? resolveMetric2025(metricName) : null;
      const reportPage = u.reportPage ?? body.refPage ?? tocTags?.refPage ?? null;
      const range = reportPage ? report2025Page(reportPage) : null;
      const evalItem = p.eval_item ?? (range && range.business === p.business ? range.eval_item : null);
      const question = body.body || u.question;
      const blocks = contentBlocks(u.content);
      const parts = splitBlocks(blocks);
      const label = u.section === "Q" ? "질문" : "요청";
      const headline = `${label}: ${u.question}`;
      const baseKey = unitKey(u);
      const bizLabel = p.business ? businessLabel(p.business) : p.name;
      const meta = {
        part: p.key,
        part_name: p.name,
        section: u.section,
        no: u.no,
        question,
        indicator: p.indicator ?? null,
        metric_2025: metric?.name2025 ?? metricName,
        metric_2026: metric?.name2026 ?? null,
        metric_relation: metric?.relation ?? null,
        related_business: metric?.business ?? null,
        report_page_indicator: range?.indicator ?? null,
        toc_matched: Boolean(tocEntry),
        image_count: u.images,
        chars: blocks.reduce((s, b) => s + b.size, 0),
        page_basis: "pdf-start",
      };
      const common = {
        doc_id: DOC,
        track: p.track,
        business: p.business,
        eval_item: evalItem,
        measure: p.measure,
        q_type: [...qTypes],
        pdf_page_start: u.pageStart,
        pdf_page_end: u.pageEnd,
        printed_page: tocEntry?.printedPage ?? null,
        report_page_2025: reportPage,
      };
      const prefix = `${DOC_LABEL} · ${bizLabel} · ${u.section === "Q" ? "Ⅰ 질문 답변자료" : "Ⅱ 요청자료"} ${u.no}${reportPage ? ` · 보고서 P.${reportPage}` : ""}${evalItem ? ` · ${evalItem}` : ""}`;
      const title = `'25 실사 ${label} · ${p.business ? (p.business === "BZ-4" ? "공통지표" : `주요사업${p.business.slice(3)}`) : "AI 가점"} ${u.section}${u.no} · ${truncate(question, 40)}`;
      if (parts.length === 1) {
        chunks.push(
          makeChunk({
            ...common,
            chunk_key: baseKey,
            unit_type: u.section === "Q" ? "qa_pair" : "request_evidence",
            title,
            context_prefix: prefix,
            blocks: [headline, ...parts[0].map((b) => b.text)],
            meta,
          }),
        );
      } else {
        partSplit.push(`${baseKey}(${parts.length})`);
        parts.forEach((seg, i) =>
          chunks.push(
            makeChunk({
              ...common,
              chunk_key: `${baseKey}/part${i + 1}`,
              unit_type: u.section === "Q" ? "qa_part" : "request_evidence",
              title: `${title} (${i + 1}/${parts.length})`,
              context_prefix: prefix,
              blocks: [headline, ...seg.map((b) => b.text)],
              meta: { ...meta, parent_key: baseKey, part_no: i + 1, part_total: parts.length, chars: seg.reduce((s, b) => s + b.size, 0) },
            }),
          ),
        );
      }
      continue;
    }

    // 증빙 쪽
    const blocks = contentBlocks(u.content);
    const textChars = blocks.reduce((s, b) => s + b.text.replace(/<[^>]+>|\s|\|/g, "").length, 0);
    const hasText = textChars >= EVIDENCE_TEXT_MIN;
    const base = `${DOC}/${p.key}/${u.section}/ev/${u.evidenceNo}`;
    const seen = (keyCount.get(base) ?? 0) + 1;
    keyCount.set(base, seen);
    const key = seen === 1 ? base : `${base}~${seen}`;
    const titles = u.evidenceTitles!.join(" / ");
    const parent = u.parent;
    const range = u.reportPage ? report2025Page(u.reportPage) : null;
    chunks.push(
      makeChunk({
        chunk_key: key,
        doc_id: DOC,
        unit_type: "evidence_image",
        track: p.track,
        business: p.business,
        eval_item: p.eval_item ?? (range && range.business === p.business ? range.eval_item : null),
        measure: p.measure,
        q_type: ["증빙"],
        title: `'25 실사 증빙 ${u.evidenceNo} · ${truncate(titles, 50)}`,
        context_prefix: `${DOC_LABEL} · ${p.business ? businessLabel(p.business) : p.name} · 증빙 ${u.evidenceNo}${parent ? ` · ${parent.section === "Q" ? "질문" : "요청"} ${parent.no}: ${truncate(parent.question, 60)}` : ""}`,
        blocks: hasText ? [`증빙 ${u.evidenceNo} ${titles}`, ...blocks.map((b) => b.text)] : [`증빙 ${u.evidenceNo} ${titles} (그림 자료, 원문 PDF ${u.pageStart}${u.pageEnd > u.pageStart ? `–${u.pageEnd}` : ""}쪽)`],
        pdf_page_start: u.pageStart,
        pdf_page_end: u.pageEnd,
        report_page_2025: u.reportPage,
        meta: {
          part: p.key,
          section: u.section,
          evidence_no: u.evidenceNo,
          titles: u.evidenceTitles,
          parent_key: parent ? unitKey(parent) : null,
          has_text: hasText,
          image_count: u.images,
          ocr: false,
        },
      }),
    );
  }

  // 검산
  const count = (sec: Section) => units.filter((u) => u.kind !== "evidence" && u.section === sec).length;
  checks.push({ name: "첨부3 질문 수", level: "error", ok: count("Q") === ATT3_EXPECTED.questions, expected: ATT3_EXPECTED.questions, actual: count("Q") });
  checks.push({ name: "첨부3 요청 수", level: "error", ok: count("R") === ATT3_EXPECTED.requests, expected: ATT3_EXPECTED.requests, actual: count("R") });
  const tocQ = toc.filter((e) => e.section === "Q").length;
  const tocR = toc.filter((e) => e.section === "R").length;
  checks.push({ name: "첨부3 목차 문항 수", level: "error", ok: tocQ === ATT3_EXPECTED.questions && tocR === ATT3_EXPECTED.requests, expected: ATT3_EXPECTED, actual: { questions: tocQ, requests: tocR } });
  checks.push({ name: "첨부3 목차 쪽 번호", level: "warn", ok: toc.every((e) => e.printedPage !== null), actual: toc.filter((e) => e.printedPage === null).map((e) => `${e.part}/${e.section}${e.no}`) });
  checks.push({ name: "첨부3 본문 문항 ↔ 목차 대응", level: "error", ok: unmatchedToc === 0, actual: unmatchedToc, note: "부·구분·번호로 대응하지 못한 본문 문항 수" });
  const badNo = units.filter((u) => u.kind !== "evidence" && u.no === 0).length;
  checks.push({ name: "첨부3 질문 번호 없는 머리", level: "error", ok: badNo === 0, actual: badNo });
  const sequenceOk = ATT3_PARTS.every((p) =>
    (["Q", "R"] as Section[]).every((sec) => {
      const nos = units.filter((u) => u.kind !== "evidence" && u.part.key === p.key && u.section === sec).map((u) => u.no);
      return nos.every((n, i) => n === i + 1);
    }),
  );
  checks.push({ name: "첨부3 부·구분별 번호 연속", level: "error", ok: sequenceOk });
  const perPart: Record<string, string> = {};
  for (const p of ATT3_PARTS) {
    const q = units.filter((u) => u.kind === "qa" && u.part.key === p.key).length;
    const r = units.filter((u) => u.kind === "req" && u.part.key === p.key).length;
    perPart[`${p.key} ${p.name}`] = `질문 ${q} · 요청 ${r}`;
  }
  checks.push({ name: "첨부3 부별 문항", level: "warn", ok: true, actual: perPart });
  const ev = units.filter((u) => u.kind === "evidence");
  // 증빙 그림 조각은 부모 질문의 지표·관련 사업을 물려받음 — 공통지표(BZ-4) 조각의 소속 사업을 적재 때 정해 요청 때 이름으로 다시 판별하지 않게 함(lib/knowledge/common-kpi-owner.ts)
  const byKey = new Map(chunks.map((c) => [c.chunk_key, c]));
  for (const c of chunks) {
    if (c.unit_type !== "evidence_image") continue;
    const pk = typeof c.meta.parent_key === "string" ? c.meta.parent_key : null;
    const parentChunk = pk ? (byKey.get(pk) ?? chunks.find((x) => x.chunk_key.startsWith(`${pk}/part`))) : undefined;
    if (!parentChunk) continue;
    for (const k of ["related_business", "metric_2025", "metric_2026", "metric_relation"]) if (parentChunk.meta[k] != null) c.meta[k] = parentChunk.meta[k];
  }
  checks.push({ name: "첨부3 증빙 단위(연속 쪽 묶음)", level: "warn", ok: ev.length > 0, actual: { units: ev.length, with_text: chunks.filter((c) => c.unit_type === "evidence_image" && c.meta.has_text).length } });
  checks.push({ name: "첨부3 긴 답변 나눔", level: "warn", ok: true, actual: partSplit.length, note: `${QA_SPLIT_CHARS}자 초과 문항을 □·☑ 경계로 나눔` });
  const oversize = chunks.filter((c) => c.unit_type !== "evidence_image" && (c.meta.chars as number) > QA_SPLIT_CHARS * 1.6).map((c) => `${c.chunk_key}(${c.meta.chars})`);
  checks.push({ name: "첨부3 기준의 1.6배를 넘는 조각", level: "warn", ok: oversize.length === 0, actual: oversize });

  return { chunks: finalizeChunks(chunks), checks, extras: { toc } };
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

