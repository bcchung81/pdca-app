// 2025년도 경영실적보고서(경영관리, KCA 작성) 지표별 PDF 14개 → 절(가.·나.) 단위 조각. 주요사업 report25.ts의 경영관리 짝이며 경평 초안의 「과거 실적·작성 방식」 근거입니다.
// 보고서 하나 = 지표 하나(평가단위 MG-N)라 지표는 문서 명세가 정한다(이름을 추측하지 않음).
//
// 원문 흐름(kordoc): 표지(가중치·평가방법·지표정의·세부평가내용·담당자 표) → [Ⅰ. 지표관리 방향(1-(1)만)] → Ⅰ. 지적사항 조치실적 → Ⅱ. 전년 대비 주요 추진실적(평가내용마다 표)
//  → Ⅲ. 세부평가내용별 2025년도 추진실적 및 성과(평가내용 띠 → 대주제 상자 「| | N | | 제목 |」 → 「### 가. 제목 마커」 → 본문) → Ⅳ. 성과분석 및 환류(대주제 1 주요 성과분석 = 가. 계량·나. 비계량, 대주제 2 향후 개선계획).
// 로마 숫자는 지표마다 다르므로(1-(1)만 한 칸씩 밀림) 장은 제목 글로 판별한다. 가점 지표 5-(1)~(3)은 「##」 장 제목이 없고 표지 다음에 평가내용 띠가 바로 나오므로,
// 표지 상태에서 평가내용 띠를 만나면 「세부평가내용별」 장으로 본다.
//
// 조각: ① 「세부평가내용별」 장의 「### 가.」 절 1개 = report_section 1개 ② 그 밖은 report_chapter(표지·지표관리 방향·지적사항 조치실적·전년 대비 평가내용별·성과분석 가/나/향후 개선계획,
//   「세부평가내용별」 안에서 가.가 없는 대주제 본문이나 가.보다 앞선 대주제 도입 글도 한 조각). 쪽 머리·꼬리·옆 탭·그림 표시·담당자 표(개인정보)는 조각에 넣지 않는다.

import { finalizeChunks, makeChunk } from "../chunk.ts";
import { decodeEntities, flattenHtmlTables, unescapeMarkdown } from "../rich-text.ts";
import { type SourceBlock, toLineItems } from "../source.ts";
import { parsePipeTable } from "../table.ts";
import type { Check, KnowledgeChunk, KnowledgeDocumentSpec, Measure, ParseResult, UnitId } from "../types.ts";

export interface RptMgDoc {
  docId: string;
  unit: `MG-${number}`;
  /** 지표 짧은 이름(조각 제목·머리말에 씀) */
  name: string;
  /** 지표 이름(원본 목차 표기) */
  label: string;
  /** 기관 원본 파일 이름 */
  original: string;
}

export const RPT_MG_DOCS: readonly RptMgDoc[] = [
  { docId: "rpt25-mg-01", unit: "MG-1", name: "전략기획", label: "1-(1) 전략기획", original: "1-(1) 전략기획_260304_03시★★.pdf" },
  { docId: "rpt25-mg-02", unit: "MG-2", name: "윤리경영", label: "1-(2) 윤리경영", original: "1-(2) 윤리경영_260304_03시★★.pdf" },
  { docId: "rpt25-mg-03", unit: "MG-3", name: "일자리 및 균등한 기회", label: "2-(1) 일자리 및 균등한 기회", original: "2-(1) 일자리 및 균등한 기회_260304_03시★★.pdf" },
  { docId: "rpt25-mg-04", unit: "MG-4", name: "안전 및 재난관리", label: "2-(2) 안전 및 재난관리", original: "2-(2) 안전 및 재난관리_260304_03시★★.pdf" },
  { docId: "rpt25-mg-05", unit: "MG-5", name: "친환경·탄소중립", label: "2-(3) 친환경·탄소중립", original: "2-(3) 친환경·탄소중립_260304_03시★★.pdf" },
  { docId: "rpt25-mg-06", unit: "MG-6", name: "창업 및 경제활성화", label: "2-(4) 창업 및 경제활성화", original: "2-(4) 창업 및 경제활성화_260304_03시★★.pdf" },
  { docId: "rpt25-mg-07", unit: "MG-7", name: "상생·협력 및 지역발전", label: "2-(5) 상생·협력 및 지역발전", original: "2-(5) 상생_협력 및 지역발전_260304_03시★★.pdf" },
  { docId: "rpt25-mg-08", unit: "MG-8", name: "재무예산관리", label: "3-(1) 재무예산관리", original: "3-(1) 재무예산관리_260304_03시★★.pdf" },
  { docId: "rpt25-mg-09", unit: "MG-9", name: "조직 및 인적자원관리", label: "4-(1) 조직 및 인적자원관리", original: "4-(1) 조직 및 인적자원관리_260304_03시★★.pdf" },
  { docId: "rpt25-mg-10", unit: "MG-10", name: "노사관계", label: "4-(2) 노사관계", original: "4-(2) 노사관계_260304_03시★★.pdf" },
  { docId: "rpt25-mg-11", unit: "MG-11", name: "보수 및 복리후생", label: "4-(3) 보수 및 복리후생", original: "4-(3) 보수 및 복리후생_260304_03시★★.pdf" },
  { docId: "rpt25-mg-12", unit: "MG-12", name: "안전한 일터 조성", label: "5-(1) 공공기관 혁신 노력과 성과 — 안전한 일터 조성", original: "5-(1) 공공기관 혁신 노력과 성과_안전한 일터 조성_260304_03시★★.pdf" },
  { docId: "rpt25-mg-13", unit: "MG-13", name: "AI활용 혁신", label: "5-(2) 공공기관 혁신 노력과 성과 — AI활용 혁신", original: "5-(2) 공공기관 혁신 노력과 성과_AI활용 혁신_260304_03시★★.pdf" },
  { docId: "rpt25-mg-14", unit: "MG-14", name: "국정과제 이행", label: "5-(3) 공공기관 혁신 노력과 성과 — 국정과제 이행", original: "5-(3) 공공기관 혁신 노력과 성과_국정과제 이행_260304_03시★★.pdf" },
];

/** 문서 등록부(documents.ts)에 넣는 명세 — 파일 이름은 영문, 기관 원본 이름은 original_name */
export function rptMgSpec(d: RptMgDoc): KnowledgeDocumentSpec {
  return {
    doc_id: d.docId,
    title: `2025년도 경영실적보고서(경영관리) — ${d.label}`,
    file_name: `${d.docId}.pdf`,
    parsed_name: d.docId,
    original_name: d.original,
    edition: "260304_03시 판",
    published: "2026-03-04",
    issuer: "한국방송통신전파진흥원",
    basis_year: 2025,
    tracks: ["경영관리"],
    scope: `KCA 작성 2025년도 경영실적보고서(경영관리) ${d.label} — 세부평가내용별 장의 절(가.·나.) 1개 = report_section, 그 밖의 장·도입 글은 report_chapter`,
    status: "ingest",
  };
}

/**
 * 검산: 지표별 「### 가.」 절 수. kordoc과 다른 경로(pdftotext)로 센 값을 쪽 글로 확인한 값(가점 12~14는 해당 없음).
 * 확인 결과는 docs/design/knowledge.md의 「전년도 경영실적보고서」 줄에 적음.
 */
export const RPT_MG_EXPECTED_SECTIONS: Readonly<Record<string, { sections: number; pdf: number; why?: string }>> = {
  "rpt25-mg-01": { sections: 10, pdf: 10 },
  "rpt25-mg-02": { sections: 11, pdf: 11 },
  "rpt25-mg-03": { sections: 9, pdf: 9 },
  "rpt25-mg-04": { sections: 16, pdf: 16 },
  "rpt25-mg-05": { sections: 9, pdf: 9 },
  // 평가내용 3 대주제 2의 「가.·나.·다.」 제목이 도식 표의 칸들로 쪼개져 나와(kordoc) 절로 나눌 수 없음 — 그 글은 대주제 본문 조각(detail_theme)에 그대로 들어 있음
  "rpt25-mg-06": { sections: 8, pdf: 11, why: "평가내용3 대주제2의 가·나·다 제목이 도식 표 칸으로 쪼개져 나옴 — 대주제 본문 조각에 포함" },
  "rpt25-mg-07": { sections: 18, pdf: 18 },
  "rpt25-mg-08": { sections: 17, pdf: 17 },
  "rpt25-mg-09": { sections: 19, pdf: 19 },
  "rpt25-mg-10": { sections: 15, pdf: 15 },
  "rpt25-mg-11": { sections: 4, pdf: 4 },
};

const unitOfDoc = (docId: string): RptMgDoc => {
  const d = RPT_MG_DOCS.find((x) => x.docId === docId);
  if (!d) throw new Error(`경영관리 전년 보고서 문서가 아님: ${docId}`);
  return d;
};

// ---------------------------------------------------------------------------

const MARKER_RE = /\s+(신규|AI|지적개선|BP|B\.P)(?=(\s+(신규|AI|지적개선|BP|B\.P))*\s*$)/g;
const oneLine = (s: string) => s.replace(/<\/?u>/g, "").replace(/\s+/g, " ").trim();
const clean = (s: string) => oneLine(unescapeMarkdown(decodeEntities(s)).replace(/\*\*/g, "").replace(/!\[[^\]]*\]\([^)]*\)/g, ""));
const squash = (s: string) => s.replace(/\s+/g, "");
/** 제목 칸의 줄바꿈 표시(표 칸 안 <br>이 「 / 」로 옴)를 공백으로 */
const titleOf = (s: string) => oneLine(s.replace(/\s\/\s/g, " "));

type Chapter = "cover" | "direction" | "findings" | "prior" | "detail" | "outcome";

/** 장 제목 글 → 장(로마 숫자는 지표마다 달라 쓰지 않음). 모르는 제목이면 null */
export function chapterOfHeading(title: string): Chapter | null {
  const t = squash(title);
  if (t.includes("지표관리방향")) return "direction";
  if (t.includes("지적사항조치실적")) return "findings";
  if (t.includes("전년대비주요추진실적")) return "prior";
  if (t.includes("세부평가내용별")) return "detail";
  if (t.includes("성과분석및환류")) return "outcome";
  return null;
}

/** 옆 탭 글자(쪽마다 반복, 띄어쓰기가 흐트러져 나옴) — 표 밖 한 줄이 이것이면 본문이 아님 */
const SIDE_TABS = new Set(["경영전략", "안전및책임경영", "조직운영및관리", "재무성과관리", "혁신노력과성과"]);

/** 표 → 줄 글(칸은 「 | 」, 칸 안 줄바꿈은 「 / 」) — 빈 칸만 있는 줄은 뺌 */
export function tableLines(text: string): string[] {
  const t = text.trimStart();
  const rows = t.startsWith("|")
    ? parsePipeTable(t).rows.map((r) => r.map((c) => clean(c.replace(/<br\s*\/?>/gi, " / "))).filter(Boolean).join(" | "))
    : flattenHtmlTables(t)
        .split("\n")
        .map((l) => l.split("|").map((c) => c.trim()).filter(Boolean).join(" | "));
  return rows.map((r) => clean(r)).filter((r) => r && !/^[|\s]*$/.test(r));
}

/** 쪽 꼬리표 → 인쇄 쪽 번호(「| ∙ | 107 |」 홀수 쪽, 「| 108 | ∙ 2025년도 경영실적보고서 |」 짝수 쪽) */
function printedPageOf(flat: string): number | null {
  const t = flat.replace(/\s+/g, " ").trim();
  const m = /^∙\s*\|\s*(\d{1,3})$/.exec(t) ?? /^(\d{1,3})\s*\|\s*∙\s*2025년도 경영실적보고서$/.exec(t);
  return m ? Number(m[1]) : null;
}

/** 쪽 머리 표(지표 이름 한 칸짜리 2열 표 「|  | 보수 및 복리후생 |」·「Ⅰ. 경영관리」·「Ⅲ. 혁신가점」·「성과 분석」 옆 탭) */
function isRunningHead(text: string, lines: string[]): boolean {
  if (lines.length === 0) return false;
  const flat = lines.join(" ");
  if (lines.length === 1 && /^[ⅠⅡⅢⅣⅤ]\.\s*(경영관리|혁신가점)$/.test(flat)) return true;
  if (lines.length === 1 && squash(flat) === "성과분석" && !text.trimStart().startsWith("|")) return true;
  if (text.trimStart().startsWith("|")) {
    const rows = parsePipeTable(text.trimStart()).rows;
    const cells = rows.flat().filter(Boolean);
    return rows.every((r) => r.length === 2 && r[0] === "") && cells.length === 1 && cells[0].length <= 40 && !/[∙]/.test(cells[0]);
  }
  return false;
}

/** 담당자 표(직위·성명·연락처·E-mail) — 개인정보라 조각에 넣지 않음 */
function isContactTable(lines: string[]): boolean {
  const head = squash(lines.slice(0, 2).join(" "));
  return /직위.*성명/.test(head) || /연락처.*e-?mail/i.test(head) || /성명.*(연락처|e-?mail)/i.test(head);
}

interface Line {
  text: string;
  page: number;
}

interface Section {
  mark: string;
  title: string;
  markers: string[];
  lines: Line[];
  page: number;
}

interface Unit {
  chapter: Chapter;
  evalNo: number | null;
  evalTitle: string;
  /** 대주제 상자의 번호(상자가 없으면 null — 조각을 만들 때 순번을 매김) */
  themeNo: number | null;
  themeTitle: string;
  themeMarkers: string[];
  /** 가.보다 앞선(또는 가.가 없는 대주제의) 글 */
  lines: Line[];
  sections: Section[];
}

function splitMarkers(raw: string): { title: string; markers: string[] } {
  const markers = [...raw.matchAll(MARKER_RE)].map((m) => m[1].replace("B.P", "BP"));
  return { title: oneLine(raw.replace(MARKER_RE, "")), markers };
}

export function parseReport25Mg(blocks: SourceBlock[], docId: string): ParseResult {
  const d = unitOfDoc(docId);
  const unitId = d.unit as UnitId;
  const measure: Measure = Number(d.unit.slice(3)) >= 12 ? "가점" : "비계량";
  const printed = new Map<number, number>();
  const units: Unit[] = [];
  const unknownChapters: string[] = [];
  // 열린 대주제 단위와 절(클로저에서 바꾸므로 객체에 담아 TS 흐름 좁힘을 피함)
  const st: { chapter: Chapter; cur: Unit; sec: Section | null } = { chapter: "cover", cur: { chapter: "cover", evalNo: null, evalTitle: "", themeNo: null, themeTitle: "", themeMarkers: [], lines: [], sections: [] }, sec: null };
  let inputChars = 0;
  const dropped = { chrome: 0, contact: 0, tab: 0, image: 0 };

  const open = (ch: Chapter, patch: Partial<Unit> = {}) => {
    st.cur = { chapter: ch, evalNo: null, evalTitle: "", themeNo: null, themeTitle: "", themeMarkers: [], lines: [], sections: [], ...patch };
    st.sec = null;
    units.push(st.cur);
  };
  const enter = (ch: Chapter) => {
    st.chapter = ch;
    open(ch);
  };
  const push = (text: string, page: number) => {
    if (!text) return;
    inputChars += squash(text).length;
    const target = st.sec ? st.sec.lines : st.cur.lines;
    target.push({ text, page });
  };
  units.push(st.cur);

  // 옆 탭은 글자마다 줄이 바뀌어(「경\n영\n전\n략」) 한 블록으로 나오므로 줄로 펴기 전에 블록째 뺌
  const body = blocks.filter((b) => {
    if (!SIDE_TABS.has(squash(b.text))) return true;
    dropped.tab++;
    return false;
  });
  for (const it of toLineItems(body)) {
    if (it.kind === "table") {
      const lines = tableLines(it.text);
      if (!lines.length) continue;
      const flat = lines.join(" ");
      const pp = printedPageOf(flat);
      if (pp !== null) {
        printed.set(it.page, pp);
        dropped.chrome++;
        continue;
      }
      if (isRunningHead(it.text, lines)) {
        dropped.chrome++;
        continue;
      }
      if (isContactTable(lines)) {
        dropped.contact++;
        continue;
      }
      // 평가내용 띠(「| 평가내용 N | | 제목 |」)와 대주제 상자(「| | N | | 제목 |」) — 한 줄짜리 표
      const ev = lines.length === 1 ? /^평가내용\s*(\d+)\s*\|\s*(.+)$/.exec(flat) : null;
      if (ev) {
        if (st.chapter === "cover") enter("detail");
        if (st.chapter === "prior" || st.chapter === "detail") {
          open(st.chapter, { evalNo: Number(ev[1]), evalTitle: titleOf(ev[2]) });
          continue;
        }
      }
      const th = lines.length === 1 && (st.chapter === "detail" || st.chapter === "outcome") ? /^(\d{1,2})\s*\|\s*(.+)$/.exec(flat) : null;
      if (th && isThemeBox(it.text)) {
        const { title, markers } = splitMarkers(titleOf(th[2]));
        open(st.chapter, { evalNo: st.cur.evalNo, evalTitle: st.cur.evalTitle, themeNo: Number(th[1]), themeTitle: title, themeMarkers: markers });
        continue;
      }
      // 절 제목이 표의 첫 칸으로 나온 경우(표 한 개가 절 전체 — 「<table><tr><th>가. 제목 마커</th></tr> …」): 그 칸을 절 제목으로 하고 나머지 줄은 절 본문으로
      const hs = st.chapter === "detail" || st.chapter === "outcome" ? /^<table>\s*<tr><th[^>]*>\s*([가-하])\.\s/.exec(it.text.trimStart()) : null;
      const first = hs ? /^([가-하])\.\s*(.+)$/.exec(lines[0]) : null;
      if (first) {
        const { title, markers } = splitMarkers(first[2]);
        st.sec = { mark: first[1], title, markers, lines: [], page: it.page };
        st.cur.sections.push(st.sec);
        for (const l of lines.slice(1)) push(l, it.page);
        continue;
      }
      for (const l of lines) push(l, it.page);
      continue;
    }
    const text = it.text.trim();
    if (/^!\[/.test(text) && !clean(text)) {
      dropped.image++;
      continue;
    }
    const hm = /^(#{1,6})\s*(.*)$/.exec(text);
    if (hm && hm[1].length <= 2) {
      const ch = chapterOfHeading(hm[2]);
      if (ch) {
        enter(ch);
        continue;
      }
      unknownChapters.push(clean(hm[2]));
    }
    if (!hm && SIDE_TABS.has(squash(text))) {
      dropped.tab++;
      continue;
    }
    if (hm && hm[1].length >= 3 && (st.chapter === "detail" || st.chapter === "outcome")) {
      const lm = /^([가-하])\.\s*(.+)$/.exec(clean(hm[2]));
      if (lm) {
        const { title, markers } = splitMarkers(clean(lm[2]));
        st.sec = { mark: lm[1], title, markers, lines: [], page: it.page };
        st.cur.sections.push(st.sec);
        continue;
      }
    }
    const line = clean(hm ? hm[2] : text);
    if (line) push(line, it.page);
  }

  // ---- 조각 만들기 ----
  const pageOf = (page: number): number | undefined => printed.get(page);
  const printedPagesOf = (ls: Line[]): number[] => {
    const out: number[] = [];
    for (const p of [...new Set(ls.map((l) => l.page))]) {
      const v = pageOf(p);
      if (v !== undefined && !out.includes(v)) out.push(v);
    }
    return out;
  };
  const used = new Set<string>();
  const uniq = (key: string) => {
    let k = key;
    for (let n = 2; used.has(k); n++) k = `${key}-${n}`;
    used.add(k);
    return k;
  };
  const prefix = (extra: string, pages: number[]) =>
    `2025년도 경영실적보고서(경영관리) · ${d.name}${extra ? ` · ${extra}` : ""}${pages.length ? ` (p.${pages[0]}${pages.length > 1 ? `~${pages.at(-1)}` : ""})` : ""}`;

  const chunks: KnowledgeChunk[] = [];
  let outChars = 0;
  const sectionRows: Array<{ evalNo: number; themeNo: number; mark: string; chars: number }> = [];
  const themeSeq: Array<{ evalNo: number; themeNo: number }> = [];
  const lastTheme = new Map<number, number>();

  const emit = (c: {
    key: string;
    unit_type: "report_section" | "report_chapter";
    title: string;
    context: string;
    lines: Line[];
    fallback?: string;
    eval_item: "집행" | null;
    meta: Record<string, unknown>;
  }) => {
    const pages = printedPagesOf(c.lines);
    const raw = c.lines.map((l) => l.text);
    outChars += squash(raw.join("")).length;
    chunks.push(
      makeChunk({
        chunk_key: uniq(`${d.docId}/${unitId}/${c.key}`),
        doc_id: d.docId,
        unit_type: c.unit_type,
        track: "경영관리",
        business: unitId,
        eval_item: c.eval_item,
        measure,
        title: c.title,
        context_prefix: prefix(c.context, pages),
        blocks: raw.length ? raw : [c.fallback ?? c.title],
        pdf_page_start: c.lines[0]?.page ?? null,
        pdf_page_end: c.lines.at(-1)?.page,
        report_page_2025: pages[0] ?? null,
        meta: { unit: d.unit, ...c.meta, printed_pages: pages },
      }),
    );
  };

  for (const u of units) {
    const all = [...u.lines, ...u.sections.flatMap((s) => s.lines)];
    if (!all.length && !u.sections.length) continue;
    const evalLabel = u.evalNo !== null ? `평가내용 ${u.evalNo}` : "";
    if (u.chapter === "cover") {
      emit({ key: "cover", unit_type: "report_chapter", title: `2025 보고서 ${d.name} 표지(가중치·평가방법·지표정의·세부평가내용)`, context: "표지", lines: u.lines, eval_item: null, meta: { chapter: "cover" } });
    } else if (u.chapter === "direction") {
      emit({ key: "direction", unit_type: "report_chapter", title: `2025 보고서 ${d.name} 지표관리 방향`, context: "지표관리 방향", lines: u.lines, eval_item: null, meta: { chapter: "direction" } });
    } else if (u.chapter === "findings") {
      emit({ key: "findings", unit_type: "report_chapter", title: `2025 보고서 ${d.name} 2024년도 지적사항 조치실적`, context: "2024년도 경영실적평가 지적사항 조치실적", lines: u.lines, eval_item: null, meta: { chapter: "findings" } });
    } else if (u.chapter === "prior") {
      const no = u.evalNo ?? 0;
      emit({
        key: `prior/${no}`,
        unit_type: "report_chapter",
        title: `2025 보고서 ${d.name} 전년 대비 주요 추진실적${evalLabel ? ` ${evalLabel}` : ""}`,
        context: `전년 대비 주요 추진실적${evalLabel ? ` · ${evalLabel}` : ""}${u.evalTitle ? ` · ${u.evalTitle}` : ""}`,
        lines: u.lines,
        eval_item: null,
        meta: { chapter: "prior", eval_no: u.evalNo, eval_title: u.evalTitle },
      });
    } else {
      // detail·outcome — 대주제 번호: 상자가 있으면 그 번호, 없으면 같은 평가내용 안의 앞 번호 + 1
      const ev = u.evalNo ?? 0;
      const themeNo = u.themeNo ?? (lastTheme.get(ev) ?? 0) + 1;
      lastTheme.set(ev, themeNo);
      themeSeq.push({ evalNo: ev, themeNo });
      const themeCtx = u.themeTitle ? `대주제 ${themeNo} ${u.themeTitle}` : `대주제 ${themeNo}`;
      if (u.chapter === "outcome") {
        // 성과분석 및 환류: 가. 계량·나. 비계량이 각각 한 조각, 가.가 없는 대주제(향후 개선계획)는 대주제 본문 한 조각
        if (u.lines.length) {
          emit({
            key: `outcome/${themeNo}/${u.sections.length ? "intro" : "body"}`,
            unit_type: "report_chapter",
            title: `2025 보고서 ${d.name} 성과분석 및 환류 ${u.themeTitle || `대주제 ${themeNo}`}`,
            context: `성과분석 및 환류 · ${themeCtx}`,
            lines: u.lines,
            eval_item: null,
            meta: { chapter: "outcome", theme_no: themeNo, theme_title: u.themeTitle },
          });
        }
        for (const s of u.sections) {
          emit({
            key: `outcome/${themeNo}/${s.mark}`,
            unit_type: "report_chapter",
            title: `2025 보고서 ${d.name} 성과분석 및 환류 ${s.mark}. ${s.title}`,
            context: `성과분석 및 환류 · ${themeCtx} · ${s.mark}. ${s.title}`,
            lines: s.lines,
            fallback: s.title,
            eval_item: null,
            meta: { chapter: "outcome", theme_no: themeNo, theme_title: u.themeTitle, mark: s.mark, title: s.title },
          });
        }
        continue;
      }
      const evalCtx = `${evalLabel}${u.evalTitle ? ` · ${u.evalTitle}` : ""}`;
      if (u.lines.length) {
        const hasSections = u.sections.length > 0;
        emit({
          key: `${ev}/${themeNo}/${hasSections ? "intro" : "body"}`,
          unit_type: "report_chapter",
          title: `2025 보고서 ${d.name} ${evalLabel} ${u.themeTitle ? `대주제 ${themeNo} ${u.themeTitle}` : `대주제 ${themeNo}`}${hasSections ? " 도입" : ""}`.replace(/\s+/g, " "),
          context: `${evalCtx} · ${themeCtx}${hasSections ? " · 가.보다 앞선 글" : ""}`,
          lines: u.lines,
          eval_item: null,
          meta: { chapter: "detail_theme", eval_no: u.evalNo, eval_title: u.evalTitle, theme_no: themeNo, theme_title: u.themeTitle, theme_markers: u.themeMarkers, has_sections: hasSections },
        });
      }
      for (const s of u.sections) {
        sectionRows.push({ evalNo: ev, themeNo, mark: s.mark, chars: s.lines.map((l) => l.text).join("").length });
        emit({
          key: `${ev}/${themeNo}/${s.mark}`,
          unit_type: "report_section",
          title: `2025 보고서 ${d.name} ${evalLabel} ${s.mark}. ${s.title}`.replace(/\s+/g, " "),
          context: `${evalCtx} · ${themeCtx} · ${s.mark}. ${s.title}`,
          lines: s.lines,
          fallback: s.title,
          eval_item: "집행",
          meta: { chapter: "detail", eval_no: u.evalNo, eval_title: u.evalTitle, theme_no: themeNo, theme_title: u.themeTitle, theme_markers: u.themeMarkers, mark: s.mark, title: s.title, markers: s.markers },
        });
      }
    }
  }

  // ---- 검산 ----
  const sections = chunks.filter((c) => c.unit_type === "report_section");
  const detailEvals = [...new Set(units.filter((u) => u.chapter === "detail" && u.evalNo !== null).map((u) => u.evalNo!))];
  const expectedSections = RPT_MG_EXPECTED_SECTIONS[d.docId];
  const checks: Check[] = [];
  if (expectedSections !== undefined) {
    checks.push({ name: `${d.docId} 절(가.) 수`, level: "error", ok: sections.length === expectedSections.sections, expected: expectedSections.sections, actual: sections.length, note: expectedSections.why ? `pdftotext로 센 값 ${expectedSections.pdf} — ${expectedSections.why}` : undefined });
  }
  checks.push({ name: `${d.docId} 세부평가내용별 장이 있고 절이 하나 이상`, level: "error", ok: units.some((u) => u.chapter === "detail") && sections.length > 0, actual: sections.length });
  checks.push({
    name: `${d.docId} 평가내용 번호가 1부터 끊김 없이`,
    level: "error",
    ok: detailEvals.length > 0 && detailEvals.every((n, i) => n === i + 1),
    expected: `1~${detailEvals.length}`,
    actual: detailEvals,
  });
  const gaps = [...new Set(themeSeq.map((t) => t.evalNo))].flatMap((ev) => {
    const nos = themeSeq.filter((t) => t.evalNo === ev).map((t) => t.themeNo);
    return nos.every((n, i) => n === i + 1) ? [] : [`평가내용 ${ev}: ${nos.join(",")}`];
  });
  checks.push({ name: `${d.docId} 대주제 번호가 평가내용마다 1부터 끊김 없이`, level: "warn", ok: gaps.length === 0, actual: gaps });
  checks.push({ name: `${d.docId} 글 손실 없음(쪽 머리·꼬리·옆 탭·그림 표시·담당자 표를 뺀 글자 합 = 조각 글자 합)`, level: "error", ok: inputChars === outChars, expected: inputChars, actual: outChars });
  const thin = sectionRows.filter((s) => s.chars < 150);
  checks.push({ name: `${d.docId} 절마다 본문 150자 이상`, level: "warn", ok: thin.length === 0, actual: thin.map((s) => `평가내용${s.evalNo} 대주제${s.themeNo} ${s.mark}(${s.chars}자)`) });
  const noPage = chunks.filter((c) => !c.report_page_2025 && c.meta.chapter !== "cover");
  checks.push({ name: `${d.docId} 조각마다 인쇄 쪽 번호(표지 제외)`, level: "warn", ok: noPage.length === 0, actual: noPage.map((c) => c.chunk_key) });
  const leaked = chunks.filter((c) => /직\s*위\s*\|\s*성\s*명|연락처\s*\|\s*E-?mail|[\w.-]+@kca\.kr/i.test(c.text));
  checks.push({ name: `${d.docId} 담당자 표(성명·연락처·E-mail) 글이 조각에 없음`, level: "error", ok: leaked.length === 0, actual: leaked.map((c) => c.chunk_key) });
  checks.push({ name: `${d.docId} 모르는 장 제목 없음`, level: "error", ok: unknownChapters.length === 0, actual: unknownChapters });
  checks.push({ name: `${d.docId} 조각이 한 개 이상`, level: "error", ok: chunks.length > 0, actual: chunks.length });

  return {
    chunks: finalizeChunks(chunks),
    checks,
    extras: { unit: d.unit, sections: sections.length, chapters: chunks.length - sections.length, evals: detailEvals.length, dropped, printedPages: printed.size },
  };
}

/** 대주제 상자 모양 판정: 파이프 표 한 줄 [빈 칸, 번호, 빈 칸, 제목] (병합 칸이 있는 HTML 표로 나오면 한 줄 글 모양만 봄) */
function isThemeBox(text: string): boolean {
  const t = text.trimStart();
  if (!t.startsWith("|")) return true;
  const rows = parsePipeTable(t).rows;
  return rows.length === 1 && rows[0].length === 4 && rows[0][0] === "" && /^\d{1,2}$/.test(rows[0][1]) && rows[0][2] === "";
}

/** 문서별 파서(파이프라인 PARSERS에 이름으로 등록) */
export const RPT_MG_PARSERS: Record<string, (blocks: SourceBlock[]) => ParseResult> = Object.fromEntries(RPT_MG_DOCS.map((d) => [d.docId, (blocks: SourceBlock[]) => parseReport25Mg(blocks, d.docId)]));
