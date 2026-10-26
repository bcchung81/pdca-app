// 2025년도 경영실적보고서(주요사업) 최종본 → 평가내용2 소항목(가.·나.) 조각. 경평 초안 과제별 초안의 「과거 실적·작성 방식」 근거입니다.
// 원문 흐름(kordoc): 「| 평가내용 2 | … ‘사업명’ 사업 추진계획이 … |」 → 「| 대상사업N |  | 이름 |」 → (대상사업 개요 표) → 실행과제(「### N-M」 + 앞 글상자 제목, 또는 「## N-M 제목」) → 「### 가. 제목 마커」 → 본문 표·글(「### 1 …」 같은 소제목 포함) → 다음 가./N-M.
// 평가내용2의 정형 쪽(「### 3」 생산성·공공성, 「### 4」 환류)과 평가내용1·3·4는 과제 소항목이 아니므로 뺍니다.

import { finalizeChunks, makeChunk } from "../chunk.ts";
import { resolveBusiness } from "../dictionaries.ts";
import { flattenHtmlTables } from "../rich-text.ts";
import { type SourceBlock, toLineItems } from "../source.ts";
import { parsePipeTable } from "../table.ts";
import type { BusinessId, Check, ParseResult } from "../types.ts";

export const RPT25_DOC_ID = "rpt25-biz";
/** 검산: 평가내용2 소항목 수(PDF 글꼴로 따로 센 값 — KoPub돋움 Bold 14pt 「가.」 제목 62개) */
export const RPT25_EXPECTED = { subs: 62 } as const;

const MARKER_RE = /\s+(신규|AI|지적개선|BP|B\.P)(?=(\s+(신규|AI|지적개선|BP|B\.P))*\s*$)/g;
const oneLine = (s: string) => s.replace(/<\/?u>/g, "").replace(/\s+/g, " ").trim();

interface Sub {
  business: BusinessId;
  businessName: string;
  target: { no: number; name: string };
  task: { no: string; title: string };
  mark: string;
  title: string;
  markers: string[];
  pages: number[];
  lines: string[];
}

/** 쪽 머리·꼬리·옆 탭(본문이 아님) */
function isChrome(text: string): boolean {
  const t = oneLine(text);
  return (
    /^Ⅱ\.\s*주요사업$/.test(t) ||
    /^\d{2,3}\s*\|?\s*∙?\s*2025년도 경영실적보고서\s*\|?$/.test(t) ||
    /^\|?\s*\d{2,3}\s*\|\s*∙\s*2025년도 경영실적보고서\s*\|?$/.test(t) ||
    /^∙\s*\|\s*\d{2,3}$/.test(t) ||
    /한국방송통신전파진흥원\s*∙?\s*\d{2,3}\s*\|?$/.test(t) ||
    /^주\s*요\s*사\s*업\s*[ⅠⅡⅢ]?$/.test(t) ||
    /^[주요사업ⅠⅡⅢ]$/.test(t) ||
    /^[가-힣 ]+ 사업$/.test(t)
  );
}

/** 표 → 줄 글(칸은 「 | 」, 칸 안 줄바꿈은 「 / 」) — 빈 칸만 있는 줄은 뺌 */
function tableLines(text: string): string[] {
  const t = text.trimStart();
  const rows = t.startsWith("|")
    ? parsePipeTable(t).rows.map((r) => r.map((c) => c.replace(/<br\s*\/?>/gi, " / ").trim()).filter(Boolean).join(" | "))
    : flattenHtmlTables(t).split("\n").map((l) => l.replace(/(\s*\|\s*)+$/g, "").replace(/^(\s*\|\s*)+/g, "").replace(/(\s*\|\s*){2,}/g, " | ").trim());
  return rows.map((r) => oneLine(r.replace(/<\/?u>/g, ""))).filter((r) => r && !/^[|\s]*$/.test(r));
}

/** 꼬리에서 인쇄 쪽 번호(「119 | ∙ 2025년도 경영실적보고서」·「한국방송통신전파진흥원 ∙ 147」) */
function printedPageOf(text: string): number | null {
  const t = oneLine(text);
  // 짝수 쪽 「119 | ∙ 2025년도 경영실적보고서」, 홀수 쪽 「∙ | 147」(기관 로고는 그림)
  const m = /^\|?\s*(\d{2,3})\s*\|\s*∙\s*2025년도 경영실적보고서/.exec(t) ?? /^∙\s*\|\s*(\d{2,3})$/.exec(t) ?? /한국방송통신전파진흥원\s*∙?\s*(\d{2,3})/.exec(t);
  return m ? Number(m[1]) : null;
}

export function parseReport25(blocks: SourceBlock[]): ParseResult {
  const subs: Sub[] = [];
  const printed = new Map<number, number>();
  let inEval2 = false;
  let business: BusinessId | null = null;
  let businessName = "";
  let target: Sub["target"] | null = null;
  let task: Sub["task"] | null = null;
  // 바로 앞 글(실행과제 「### N-M」 제목은 그 앞 글상자·줄)
  let prev = "";
  let cur: Sub | null = null;

  for (const it of toLineItems(blocks)) {
    if (it.kind === "table") {
      const lines = tableLines(it.text);
      const flat = lines.join(" ");
      const pp = printedPageOf(flat);
      if (pp) printed.set(it.page, pp);
      const ev = /평가내용\s*(\d)/.exec(lines[0] ?? "");
      if (ev && lines.length === 1) {
        inEval2 = ev[1] === "2";
        const name = /[‘'](.+?)[’']\s*사업/.exec(flat)?.[1] ?? "";
        const b = name ? resolveBusiness(name) : null;
        if (b) {
          business = b;
          businessName = name;
        }
        cur = null;
        task = null;
        continue;
      }
      const tg = /^대상사업\s*(\d)\s*\|\s*(.+)$/.exec(flat);
      if (tg && lines.length === 1) {
        target = { no: Number(tg[1]), name: oneLine(tg[2]) };
        cur = null;
        task = null;
        continue;
      }
      // 번호 절 상자(「3 | 사업 추진활동의 생산성…」 같은 평가내용 정형 절) — 과제 소항목이 끝남
      if (lines.length === 1 && /^\d\s*\|\s*[가-힣]/.test(flat)) {
        task = null;
        cur = null;
        continue;
      }
      if (isChrome(flat)) continue;
      prev = lines.length === 1 ? flat : "";
      if (cur) cur.lines.push(...lines.filter((l) => !isChrome(l)));
      if (cur && !cur.pages.includes(it.page)) cur.pages.push(it.page);
      continue;
    }
    const text = it.text.trim();
    const heading = /^#{1,6}\s*(.+)$/.exec(text)?.[1]?.trim();
    if (heading && inEval2) {
      // 실행과제: 「### 1-1」(제목은 바로 앞 글상자) 또는 「## 1-3 제목」
      const tm = /^(\d-\d)(?:\s+(.+))?$/.exec(heading);
      if (tm) {
        task = { no: tm[1], title: oneLine((tm[2] ?? prev).replace(MARKER_RE, "")) };
        cur = null;
        continue;
      }
      if (/^\d$/.test(heading)) {
        // 평가내용2의 정형 절(3 생산성·공공성, 4 환류) — 과제 소항목 아님
        task = null;
        cur = null;
        continue;
      }
      const sm = /^([가-하])\.\s*(.+)$/.exec(heading);
      if (sm && task && target && business) {
        const markers = [...sm[2].matchAll(MARKER_RE)].map((m) => m[1].replace("B.P", "BP"));
        cur = { business, businessName, target, task, mark: sm[1], title: oneLine(sm[2].replace(MARKER_RE, "")), markers, pages: [it.page], lines: [] };
        subs.push(cur);
        continue;
      }
    }
    if (isChrome(text) || /^!\[/.test(text)) continue;
    if (!heading) prev = oneLine(text);
    if (!cur) continue;
    const line = oneLine((heading ?? text).replace(/\*\*/g, "").replace(/!\[[^\]]*\]\([^)]*\)/g, ""));
    if (line) cur.lines.push(line);
    if (!cur.pages.includes(it.page)) cur.pages.push(it.page);
  }

  const chunks = subs.map((s) => {
    const pages = s.pages.map((p) => printed.get(p)).filter((p): p is number => typeof p === "number");
    const pp = pages.length ? `p.${pages[0]}${pages.length > 1 ? `~${pages.at(-1)}` : ""}` : "";
    return makeChunk({
      chunk_key: `${RPT25_DOC_ID}/${s.business}/${s.task.no}/${s.mark}`,
      doc_id: RPT25_DOC_ID,
      unit_type: "report_section",
      track: "주요사업",
      business: s.business,
      eval_item: "집행",
      measure: "비계량",
      title: `2025 보고서 ${s.task.no} ${s.mark}. ${s.title}`,
      context_prefix: `2025년도 경영실적보고서(주요사업) 평가내용2 · ${s.businessName} · 대상사업${s.target.no} ${s.target.name} · ${s.task.no} ${s.task.title}${pp ? ` (${pp})` : ""}`,
      blocks: s.lines.length ? s.lines : [s.title],
      pdf_page_start: s.pages[0],
      pdf_page_end: s.pages.at(-1),
      report_page_2025: pages[0] ?? null,
      meta: { target_no: s.target.no, target_name: s.target.name, task_no: s.task.no, task_title: s.task.title, mark: s.mark, title: s.title, markers: s.markers, printed_pages: pages },
    });
  });

  const byBiz = (b: BusinessId) => subs.filter((s) => s.business === b).length;
  const checks: Check[] = [
    { name: "2025 보고서 평가내용2 소항목 수", level: "error", ok: subs.length === RPT25_EXPECTED.subs, expected: RPT25_EXPECTED.subs, actual: `${subs.length} (주요사업1 ${byBiz("BZ-1")} · 2 ${byBiz("BZ-2")} · 3 ${byBiz("BZ-3")})` },
    // 표 한 행이 한 줄이라 줄 수는 적을 수 있음(여러 칸 행) — 글자 수로 봄
    { name: "소항목마다 본문 글(150자 이상)", level: "error", ok: subs.every((s) => s.lines.join("").length >= 150), actual: subs.filter((s) => s.lines.join("").length < 150).map((s) => `${s.business} ${s.task.no} ${s.mark}(${s.lines.join("").length}자)`) },
    { name: "소항목마다 실행과제 제목", level: "error", ok: subs.every((s) => s.task.title), actual: subs.filter((s) => !s.task.title).map((s) => `${s.business} ${s.task.no}`) },
    { name: "소항목마다 인쇄 쪽", level: "warn", ok: chunks.every((c) => c.report_page_2025), actual: chunks.filter((c) => !c.report_page_2025).map((c) => c.chunk_key) },
  ];
  return { chunks: finalizeChunks(chunks), checks };
}
