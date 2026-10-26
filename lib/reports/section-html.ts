// 보고서 소항목 spec → HTML(결정론, 순수). 모든 글은 이스케이프하고, 카드에 없는 숫자는 붉은 점선으로 표시합니다.
// 클래스는 lib/reports/section-css.ts(2025 최종본 실측 회색조 도식 표본)와 같습니다. 제목 수준: 실행과제 h4 · 소항목 h5.

import { fitTextLines } from "./fit-dom.ts";
import { REPORT_CSS, REPORT_STYLE } from "./section-css.ts";
import { type Block, FIGURE_LABEL, type Figure, type FigurePos, figureMm, isPanelCompare, ladderGroups, tableBars } from "./blocks.ts";
import { TABLE_SHAPE_MM, blockWidth, resultRowHeadMm, soloWidth, tableRowHeadMm } from "./fit.ts";
import { layoutGroups } from "./layout.ts";
import { type Diagram, type LadderRow, type MiniChart, type ReportSectionSpec, numberTokens } from "./section.ts";

/** 칸 사이 기호 칸(카드 묶음 ✚·▶·시기 흐름 ▶) — grid 열 템플릿에 끼우는 글(REPORT_STYLE.join.gapMm, fit.ts slotOf와 같은 값) */
const JOIN_GAP = ` ${REPORT_STYLE.join.gapMm}mm `;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 글 표시 모음: 모르는 숫자(붉은 점선) + 근거 약한 문장(옅은 점선 — 화면 미리보기만, lib/reports/ground.ts) */
type Marks = Set<string> & { weak?: Set<string> };
const marksOf = (unknownNumbers: string[], weak: string[] = []): Marks => Object.assign(new Set(unknownNumbers), { weak: new Set(weak) });

/** 글 → 이스케이프 + 모르는 숫자 표시 + 채울 자료 자리표시 + 강조(**…** → 굵게, AI가 핵심 수치·결과 어구에 붙임) + 위첨자(^{…}) + 근거 약함 */
function txt(s: string, unknown: Marks): string {
  const h = sup(emph(needs(marked(s, unknown))));
  return unknown.weak?.has(s) ? `<span class="k-weak" title="근거 글과 겹치는 말이 적은 문장 — 원자료로 확인(신호, 판정 아님)">${h}</span>` : h;
}

/** 이스케이프한 글의 ^{…} → 위첨자(2025 추진성과 비교 「’24년100국 → ’25년200국」의 시점·기존/개선 — 짝이 없는 표기는 그대로) */
const sup = (h: string) => h.replace(/\^\{([^{}]{1,120}?)\}/g, '<sup class="k-sup">$1</sup>');

/** 이스케이프한 글의 【확인: …】 → 노란 칸(올해 값이 근거에 없어 담당자가 채울 자리 — lib/reports/actuals.ts) */
const needs = (h: string) => h.replace(/【확인:\s*([^】]{1,200})】/g, '<span class="k-need" title="담당자 확인 — 채울 자료">$1</span>');

/** 이스케이프한 글의 **…** → <b>(짝이 없는 **는 걷음) */
const emph = (h: string) => h.replace(/\*\*([^*]+?)\*\*/g, "<b>$1</b>").replace(/\*\*/g, "");

function marked(s: string, unknown: Marks): string {
  if (!unknown.size) return esc(s);
  let out = "";
  let last = 0;
  const toks = numberTokens(s);
  let from = 0;
  for (const t of toks) {
    const i = s.indexOf(t, from);
    if (i < 0) continue;
    out += esc(s.slice(last, i));
    out += unknown.has(t) ? `<span class="k-unv" title="카드에 없는 숫자 — 원자료로 확인">${esc(t)}</span>` : esc(t);
    last = i + t.length;
    from = last;
  }
  return out + esc(s.slice(last));
}

const ul = (items: string[], u: Marks, path?: string) => (items.length ? `<ul>${items.map((x, i) => `<li>${tx(x, u, path && `${path}.${i}`)}</li>`).join("")}</ul>` : "");

/**
 * 고치기 표지(과제별 초안 화면에서만 — sectionHtml editMarks, 2026-09-28 「과제원장처럼 두 번 눌러 고치기」): 글 조각을
 * <span class="k-t" data-t="초안 JSON 경로" data-raw="원래 글">로 감쌈. 원래 글은 **강조**·【확인】·^{위첨자}·숫자 표시를 걷기 전 표기.
 * 배열을 이어 그린 칸(협업 역할·전후 비교 패널)은 data-j에 이음 기호. 꺼져 있으면 출력이 예전과 같음(내려받기·사업 조판·테스트)
 */
let EDIT = false;
function tx(s: string, u: Marks, path?: string, join?: string, raw = s): string {
  const h = txt(s, u);
  return EDIT && path ? `<span class="k-t" data-t="${path}"${join ? ` data-j="${esc(join)}"` : ""} data-raw="${esc(raw)}">${h}</span>` : h;
}

const CHEVRON = `<svg viewBox="0 0 12 26" aria-hidden="true"><path d="M1 1 L11 13 L1 25" fill="none" stroke="#7e7f7e" stroke-width="2"/></svg>`;
const ARROW = `<svg viewBox="0 0 20 60" aria-hidden="true"><path d="M2 20 L12 20 L12 10 L19 30 L12 50 L12 40 L2 40 Z" fill="#b9bab9"/></svg>`;

const BRACE = `<svg class="k-brace" viewBox="0 0 640 9" preserveAspectRatio="none" aria-hidden="true"><path d="M2 0 Q2 5 12 5 H310 Q318 5 320 9 Q322 5 330 5 H628 Q638 5 638 0" fill="none" stroke="#9a9b9a" stroke-width="1.2"/></svg>`;
const LINK = `<div class="k-ctx__link" aria-hidden="true"><svg viewBox="0 0 20 100" preserveAspectRatio="none"><path d="M0 10 H10 V100 M20 10 H10" fill="none" stroke="#7e7f7e" stroke-width="1" vector-effect="non-scaling-stroke"/><path d="M6 92 L10 100 L14 92" fill="none" stroke="#7e7f7e" stroke-width="1" vector-effect="non-scaling-stroke"/></svg></div>`;

/** 막대 높이용 수(“3천만원”처럼 한글 단위가 섞이면 앞 숫자만 — 막대는 상대 높이일 뿐, 값 글은 원문 그대로 적음) */
const barValue = (v: string) => Number((v.match(/\d[\d,]*(?:\.\d+)?/)?.[0] ?? "0").replace(/,/g, ""));

/** 행 오른쪽 막대(결정론 SVG): 값 → 높이, 마지막 막대 진하게, 배지(근거에 있을 때만)는 제목 줄 끝 */
export function miniChartHtml(c: MiniChart): string {
  const w = 150;
  const h = 104;
  const top = 22;
  const base = h - 16;
  const n = c.series.length;
  const vals = c.series.map((s) => (/【확인:/.test(s.value) ? 0 : barValue(s.value)));
  const max = Math.max(...vals, 1);
  const slot = (w - 20) / n;
  const bw = Math.min(26, slot * 0.5);
  const bars = c.series
    .map((s, i) => {
      const cx = 10 + slot * i + slot / 2;
      // 값이 자리표시(【확인: …】)면 막대 높이를 알 수 없음 — 점선 빈 막대 + 「확인」(자리표시 글 속 연도가 값으로 읽혀 낮은 막대가 되던 것)
      if (/【확인:/.test(s.value)) {
        const bh = (base - top - 12) * 0.55;
        return `<rect x="${(cx - bw / 2).toFixed(1)}" y="${(base - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="#fff1b8" stroke="#c79a00" stroke-width="0.8" stroke-dasharray="2 1.5"/><text x="${cx.toFixed(1)}" y="${(base - bh - 3).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="#8a6500">확인</text><text x="${cx.toFixed(1)}" y="${base + 11}" text-anchor="middle" font-size="8.5" fill="#333">${esc(s.label)}</text>`;
      }
      const bh = Math.max(2, (base - top - 12) * (vals[i] / max));
      const y = base - bh;
      return `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${i === n - 1 ? "#7e7f7e" : "#d7d8d7"}"/><text x="${cx.toFixed(1)}" y="${(y - 3).toFixed(1)}" text-anchor="middle" font-size="9.5" font-weight="700">${esc(s.value)}</text><text x="${cx.toFixed(1)}" y="${base + 11}" text-anchor="middle" font-size="8.5" fill="#333">${esc(s.label)}</text>`;
    })
    .join("");
  const alt = `${c.title ? `${c.title}: ` : ""}${c.series.map((s) => `${s.label} ${s.value}`).join(", ")}${c.badge ? ` (${c.badge})` : ""}`.replace(/\*\*/g, "");
  // 증감 배지는 제목 줄 끝에(막대 값 글과 겹치지 않게)
  const badge = c.badge ? `<span class="k-chart__badge" aria-hidden="true">${esc(c.badge)}</span>` : "";
  const head = c.title || c.badge ? `<figcaption>${esc(c.title)}${badge}</figcaption>` : "";
  return `<figure class="k-chart">${head}<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(alt)}" font-family="KoPubWorld돋움체, Noto Sans KR, sans-serif"><line x1="6" y1="${base}" x2="${w - 6}" y2="${base}" stroke="#7e7f7e" stroke-width="0.8"/>${bars}</svg></figure>`;
}

/** 칸 사이 ✚로 잇는 행(2025: 현황 및 문제점·추진배경의 병렬 문제) */
const JOIN_LABELS = new Set(["현황 및 문제점", "추진배경"]);

/** v3 블록을 옛 도식 모양으로 그릴 때의 고치기 표지 경로: 블록 경로(title·rows·cells) · 단계 제목이 칸 head 그대로인지(tag를 이어 붙였으면 표지 안 함) */
interface DiagramPaths {
  block: string;
  headOk?: boolean[];
}

function diagramHtml(d: Diagram, u: Marks, label = "", pp?: DiagramPaths): string {
  const at = (rest: string) => (pp ? `${pp.block}.${rest}` : undefined);
  const title = d.title ? `<p class="k-dg-title">${tx(d.title, u, at("title"))}</p>` : "";
  switch (d.type) {
    case "before_after":
      return `${title}<table class="k-ba"><colgroup><col style="width:15%"><col style="width:39%"><col style="width:6%"><col style="width:40%"></colgroup><thead><tr><th scope="col">구 분</th><th scope="col">기 존</th><th class="k-ba__arrow" aria-hidden="true"></th><th scope="col" class="k-ba__after">개 선</th></tr></thead><tbody>${d.rows
        .map((r, i) => `<tr><th scope="row">${tx(r.key, u, at(`rows.${i}.key`))}</th><td class="k-ba__b">${ul(r.before, u, at(`rows.${i}.before`))}</td>${i === 0 ? `<td class="k-ba__arrow" rowspan="${d.rows.length}">${ARROW}</td>` : ""}<td class="k-ba__a">${ul(r.after, u, at(`rows.${i}.after`))}</td></tr>`)
        .join("")}</tbody></table>`;
    case "process_flow":
      return `${title}<ol class="k-proc" style="grid-template-columns:repeat(${d.steps.length},1fr)">${d.steps
        .map((s, i) => `<li><div class="k-proc__h"><span class="k-num">${i + 1}</span>${tx(s.title, u, pp?.headOk?.[i] ? at(`cells.${i}.head`) : undefined)}</div><div class="k-proc__b">${ul(s.bullets, u, at(`cells.${i}.bullets`))}</div>${s.note ? `<div class="k-proc__r">${tx(s.note, u, at(`cells.${i}.note`))}</div>` : ""}</li>`)
        .join("")}</ol>`;
    case "timeline": {
      const cols = d.steps.map(() => "1fr").join(JOIN_GAP);
      return `${title}<ol class="k-tl" style="grid-template-columns:${cols}">${d.steps
        .map(
          (s, i) =>
            `${i ? `<li class="k-tl__sep" aria-hidden="true">${CHEVRON}</li>` : ""}<li class="k-tl__item"${i === d.steps.length - 1 ? ' aria-current="step"' : ""}><div class="k-tl__h">${tx(s.title, u, at(`cells.${i}.head`))}${i === d.steps.length - 1 ? '<span class="sr">(당해연도)</span>' : ""}</div><div class="k-tl__b">${ul(s.bullets, u, at(`cells.${i}.bullets`))}${s.note ? `<p><b>${tx(s.note, u, at(`cells.${i}.note`))}</b></p>` : ""}</div></li>`,
        )
        .join("")}</ol>`;
    }
    case "card_grid": {
      const cards = d.steps.slice(0, 4).map((s) => `<div class="k-card"><div class="k-card__h">${txt(s.title, u)}</div><div class="k-card__b">${ul(s.bullets, u)}</div>${s.note ? `<div class="k-card__f">${txt(s.note, u)}</div>` : ""}</div>`);
      if (JOIN_LABELS.has(label) && cards.length > 1)
        return `${title}<div class="k-cards k-cards--join" style="grid-template-columns:${cards.map(() => "minmax(0,1fr)").join(JOIN_GAP)}">${cards.join('<div class="k-join" aria-hidden="true">✚</div>')}</div>`;
      return `${title}<div class="k-cards" style="grid-template-columns:repeat(${cards.length},minmax(0,1fr))">${cards.join("")}</div>`;
    }
    case "action_table":
      return `${title}<table class="k-act"><thead><tr><th scope="col">추진 노력</th><th scope="col" class="k-act__r">추진 성과</th></tr></thead><tbody>${d.actions
        .map((a) => `<tr><td>${txt(a.effort, u)}</td><td>${txt(a.result, u)}</td></tr>`)
        .join("")}</tbody></table>`;
    default:
      return "";
  }
}

const MARKER_HTML: Record<string, string> = {
  BP: '<span class="mk mk--bp" aria-label="우수사례(BP)">BP</span>',
  지적개선: '<span class="mk mk--dark">지적개선</span>',
  신규: '<span class="mk mk--new">신규</span>',
  AI: '<span class="mk mk--dark">AI</span>',
};

function rowHtml(r: LadderRow, u: Marks): string {
  const main = `${ul(r.bullets, u)}${r.diagram.type !== "none" ? diagramHtml(r.diagram, u, r.label) : ""}`;
  const body = r.chart ? `<div class="k-row2"><div>${main}</div>${miniChartHtml(r.chart)}</div>` : main;
  return `<tr><th scope="row">${esc(r.label)}</th><td>${body}</td></tr>`;
}

const ladder = (rows: LadderRow[], u: Marks, caption: string) => (rows.length ? `<table class="k-ladder"><caption class="sr">${esc(caption)}</caption><tbody>${rows.map((r) => rowHtml(r, u)).join("")}</tbody></table>` : "");

// ---------------------------------------------------------------------------
// v3 블록 목록

const PERSON = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="14" r="8" fill="#b9bab9"/><path d="M5 38 C6 26 34 26 35 38 Z" fill="#b9bab9"/></svg>';
const HANDS = '<svg viewBox="0 0 30 22" aria-hidden="true"><path d="M3 8 H24 M19 3 L25 8 L19 13" fill="none" stroke="#7e7f7e" stroke-width="2"/><path d="M27 15 H6 M11 10 L5 15 L11 20" fill="none" stroke="#7e7f7e" stroke-width="2"/></svg>';
const tagChip = (t: string, u: Marks) => (t ? `<span class="k-tag">${txt(t, u)}</span>` : "");

/** 라벨: 「Step 1 …」「’24년 …」「1단계 …」는 앞을 칩으로 */
function labelHtml(label: string): string {
  const m = /^(Step\s?\d+|’\d\d년~?|\d{4}년~?|\d단계)\s*(.*)$/.exec(label);
  return m ? `<span class="k-tag">${esc(m[1])}</span>${m[2] ? `<br>${esc(m[2])}` : ""}` : esc(label);
}

/** 그림 자리표시: 크기만큼 빗금 칸 + 종류 칩 + 간단 서술(무엇을 보여줄 그림인지 — 담당자가 채움) */
function figHtml(f: Figure, cls = ""): string {
  const { w, h } = figureMm(f);
  // 높이는 등급 높이 ~ 1.6배(옆 글이 길어도 세로로 길게 늘지 않게)
  return `<figure class="k-fig${f.kind === "logo" ? " k-fig--logo" : ""}${cls ? ` ${cls}` : ""}" style="width:${w}mm;min-height:${h}mm;max-height:${Math.round(h * 1.6)}mm" aria-label="${FIGURE_LABEL[f.kind]} 자리 — ${esc(f.desc)}"><span class="k-fig__kind">${FIGURE_LABEL[f.kind]}</span><figcaption class="k-fig__desc">${esc(f.desc)}</figcaption></figure>`;
}
const figsAt = (b: Block, pos: FigurePos) => (b.figures ?? []).filter((f) => f.pos === pos);
/** 글 앞 동그라미 번호(①·❶·➀·➊) — 전후 비교 패널은 렌더러가 번호를 붙이므로 AI가 쓴 번호는 걷음(「① ① 단독 측정」 겹침, 2026-09-27 화면 확인) */
const LEAD_NUM = /^\s*[\u2460-\u2473\u2776-\u277F\u2780-\u2793]\s*/;

/** 블록 옆 그림(2025: 현황 양옆·칸 옆·구성 삽화·지도) — 왼쪽은 앞, 나머지는 뒤. skip은 블록 안에서 따로 그린 자리 */
function withSideFigures(b: Block, html: string, skip: FigurePos[] = []): string {
  const figs = (b.figures ?? []).filter((f) => !skip.includes(f.pos));
  if (!figs.length) return html;
  const left = figs.filter((f) => f.pos === "left").map((f) => figHtml(f)).join("");
  const right = figs.filter((f) => f.pos !== "left").map((f) => figHtml(f)).join("");
  return `<div class="k-figrow">${left}<div class="k-figrow__main">${html}</div>${right}</div>`;
}

/** 블록 하나(그림 자리표시 포함): 전후 비교 패널·우수사례는 블록 안에서, 협업 구조의 가운데 로고는 가운데 칸 안에서, 그 밖은 옆에. width = 놓인 폭(mm — 가로 반씩 짝·짝 없는 half만 줌, 없으면 blockWidth) */
export function blockHtml(b: Block, u: Marks, bp?: string, width?: number): string {
  const core = blockCore(b, u, bp, width);
  if (isPanelCompare(b) || b.kind === "case") return core;
  return withSideFigures(b, core, b.kind === "hub" ? ["center"] : []);
}

function cellCard(c: Block["cells"][number], u: Marks, cp?: string): string {
  return `<div class="k-card"><div class="k-card__h">${tagChip(c.tag, u)}${tx(c.head, u, cp && `${cp}.head`)}</div><div class="k-card__b">${ul(c.bullets, u, cp && `${cp}.bullets`)}</div>${c.note ? `<div class="k-card__f">${tx(c.note, u, cp && `${cp}.note`)}</div>` : ""}</div>`;
}

type At = (rest: string) => string | undefined;

/**
 * 추진실적 열 표(table:result — 2025 경영관리 MG-3·5·11·13의 「본문 칸 옆 어두운 추진실적 칸」): 왼쪽 행(행 머리가 하나라도 있으면 행 머리 열 + 추진내용 불릿),
 * 오른쪽 한 칸(모든 행에 걸침) = 머리 「추진실적」 + 큰 수치(series value)·뜻(label) + 결과 줄(text). 열 폭은 판면 어림(fit.ts slotOf)과 같은 값
 */
function resultTableHtml(b: Block, u: Marks, at: At, w: number): string {
  const right = (TABLE_SHAPE_MM.result / w) * 100;
  const rh = b.cells.some((c) => c.head) ? (resultRowHeadMm(w) / w) * 100 : 0;
  const res = `<td class="k-res__r" rowspan="${b.cells.length}"><p class="k-res__h">추진실적</p>${b.series
    .map((x, i) => `<p class="k-res__v">${tx(x.value, u, at(`series.${i}.value`))}</p>${x.label ? `<p class="k-res__l">${tx(x.label, u, at(`series.${i}.label`))}</p>` : ""}`)
    .join("")}${b.text ? `<p class="k-res__t">${tx(b.text, u, at("text"))}</p>` : ""}</td>`;
  return `<table class="k-tbl k-tbl--res"><colgroup>${rh ? `<col style="width:${rh.toFixed(2)}%">` : ""}<col><col style="width:${right.toFixed(2)}%"></colgroup><tbody>${b.cells
    .map((c, i) => `<tr>${rh ? `<th scope="row">${tx(c.head, u, at(`cells.${i}.head`))}</th>` : ""}<td class="k-res__b">${ul(c.bullets, u, at(`cells.${i}.bullets`))}</td>${i === 0 ? res : ""}</tr>`)
    .join("")}</tbody></table>`;
}

/**
 * 2단 라벨 표(table:ladder — 2025 MG-13·14의 「큰 라벨 칸 안 하위 라벨 + 내용」): 큰 라벨(head — 이어진 같은 글·빈 글은 한 칸, blocks.ts ladderGroups)
 * · 하위 라벨(tag — 하나라도 있을 때 열) · 내용 불릿. 열 폭은 판면 어림(fit.ts slotOf)과 같은 값
 */
function ladderTableHtml(b: Block, u: Marks, at: At, w: number): string {
  const sub = b.cells.some((c) => c.tag);
  const big = ((TABLE_SHAPE_MM.ladderBig / w) * 100).toFixed(2);
  const subW = ((TABLE_SHAPE_MM.ladderSub / w) * 100).toFixed(2);
  const rows: string[] = [];
  for (const g of ladderGroups(b.cells)) {
    for (let i = g.start; i < g.start + g.rows; i++) {
      const c = b.cells[i];
      const bigTh = i === g.start ? `<th scope="rowgroup" class="k-lad__g"${g.rows > 1 ? ` rowspan="${g.rows}"` : ""}>${tx(g.head, u, at(`cells.${i}.head`))}</th>` : "";
      rows.push(`<tr>${bigTh}${sub ? `<th scope="row" class="k-lad__s">${tx(c.tag, u, at(`cells.${i}.tag`))}</th>` : ""}<td class="k-lad__b">${ul(c.bullets, u, at(`cells.${i}.bullets`))}</td></tr>`);
    }
  }
  return `<table class="k-tbl k-tbl--lad"><colgroup><col style="width:${big}%">${sub ? `<col style="width:${subW}%">` : ""}<col></colgroup><tbody>${rows.join("")}</tbody></table>`;
}

function blockCore(b: Block, u: Marks, bp?: string, width?: number): string {
  // 고치기 표지 경로(bp = blocks.N — 과제별 초안 화면만)
  const at = (rest: string) => (bp ? `${bp}.${rest}` : undefined);
  // 표 열 폭을 셀 놓인 폭(fit.ts slotOf와 같은 값)
  const w = width ?? blockWidth(b);
  const title = b.title && !["define", "case"].includes(b.kind) ? `<p class="k-dg-title">${tx(b.title, u, at("title"))}</p>` : "";
  switch (b.kind) {
    case "bullets":
      return `${title}${ul(b.items, u, at("items"))}`;
    case "cards": {
      const cards = b.cells.slice(0, 4).map((c, i) => cellCard(c, u, at(`cells.${i}`)));
      if (b.variant === "vs" && cards.length === 2) return `${title}<div class="k-cards k-cards--vs">${cards[0]}<div class="k-vs" aria-label="대비">VS</div>${cards[1]}</div>`;
      const join = b.variant === "plus" ? "✚" : b.variant === "arrow" ? "▶" : "";
      if (join && cards.length > 1)
        return `${title}<div class="k-cards k-cards--join" style="grid-template-columns:${cards.map(() => "minmax(0,1fr)").join(JOIN_GAP)}">${cards.join(`<div class="k-join" aria-hidden="true">${join}</div>`)}</div>`;
      return `${title}<div class="k-cards" style="grid-template-columns:repeat(${cards.length},minmax(0,1fr))">${cards.join("")}</div>`;
    }
    case "compare":
      if (isPanelCompare(b)) {
        // 2025 As-Is/To-Be 모양: 항목마다 번호(기존 ➀➁➂ · 개선 ➊➋➌), 구분 칩은 있을 때만
        // diag(진단 ▶ 처방 짝 — 2026-10-13): 같은 마크업에 꼬리표만 「현황·문제」 ▶ 「추진방향」(행마다 문제 ➀ ↔ 방향 ➊)
        const NUM = ["➀➁➂➃➄", "➊➋➌➍➎"];
        const diag = b.variant === "diag";
        const TAG = diag ? ["현황·문제", "추진방향"] : ["As-Is", "To-Be"];
        const LEAD_TAG = diag ? /^(현황\s*[·･ㆍ및]?\s*문제점?|추진\s?방향)\s*[:：-]?\s*/ : /^(As-?Is|To-?Be)\s*[:：-]?\s*/i;
        // 그림: 왼쪽 = As-Is 패널 안, 오른쪽 = To-Be 패널 안, 가운데 = 두 패널 사이(화살표 자리 — 2025 1-1 가·1-2 나)
        const inPanel = (pos: FigurePos) => figsAt(b, pos).map((f) => figHtml(f)).join("");
        const side = (to: boolean) =>
          `<section class="k-panel${to ? " k-panel--to" : ""}"><div class="k-panel__h"><span class="k-tag${to ? " k-tag--dark" : ""}">${TAG[to ? 1 : 0]}</span>${tx((b.items[to ? 1 : 0] ?? "").replace(LEAD_TAG, ""), u, at(`items.${to ? 1 : 0}`), undefined, b.items[to ? 1 : 0] ?? "")}</div><div class="k-panel__b"><ol class="k-panel__list">${b.rows
            .map((r, i) => `<li><span class="k-panel__no" aria-hidden="true">${[...NUM[to ? 1 : 0]][i] ?? ""}</span>${r.key ? `<span class="k-tag">${tx(r.key, u, at(`rows.${i}.key`))}</span>` : ""}${tx((to ? r.after : r.before).join(" / ").replace(LEAD_NUM, ""), u, at(`rows.${i}.${to ? "after" : "before"}`), " / ", (to ? r.after : r.before).join(" / "))}</li>`)
            .join("")}</ol>${inPanel(to ? "right" : "left")}</div></section>`;
        const center = figsAt(b, "center")[0];
        const mid = center ? `<div class="k-panels__mid">${figHtml(center)}</div>` : `<div class="k-panels__arr" aria-hidden="true">${ARROW}</div>`;
        return `${title}<div class="k-panels"${center ? ` style="grid-template-columns:minmax(0,1fr) ${figureMm(center).w + 4}mm minmax(0,1fr)"` : ""}>${side(false)}${mid}${side(true)}</div>`;
      }
      return diagramHtml({ type: "before_after", title: b.title, rows: b.rows, steps: [], actions: [] }, u, "", bp ? { block: bp } : undefined);
    case "steps":
      if (b.variant === "zigzag" && b.cells.length === 4) {
        const area = ["1/1", "3/1", "3/3", "1/3"];
        // 칸 제목 앞 「Step N」·「N단계」는 단계 칩과 겹치므로 뗌
        const li = b.cells.map((c, i) => `<li style="grid-area:${area[i]}"><div class="k-zig__h"><b>${i + 1}단계</b><span>${tx(c.head.replace(/^(Step\s?\d+|\d단계)\s*/, ""), u, at(`cells.${i}.head`), undefined, c.head)}</span></div><div class="k-zig__b">${ul(c.bullets, u, at(`cells.${i}.bullets`))}${c.note ? `<p class="k-zig__r">${tx(c.note, u, at(`cells.${i}.note`))}</p>` : ""}</div></li>`);
        return `${title}<ol class="k-zig">${li.join("")}<li aria-hidden="true" class="k-zig__arr" style="grid-area:2/1">▼</li><li aria-hidden="true" class="k-zig__arr" style="grid-area:3/2">▶</li><li aria-hidden="true" class="k-zig__arr" style="grid-area:2/3">▲</li></ol>`;
      }
      // 단계 번호 칩이 차례를 보이므로 칸 제목 앞 「Step N」·「N단계」는 뗌
      // 칸 제목은 tag를 이어 붙이지 않고 head만 그릴 때만 고치기 표지(이어 붙인 제목은 어느 칸을 고칠지 모호함)
      return diagramHtml(
        { type: "process_flow", title: b.title, rows: [], steps: b.cells.map((c) => ({ title: [c.tag.replace(/^(Step\s?\d+|\d단계)$/, ""), c.head.replace(/^(Step\s?\d+|\d단계)\s*/, "")].filter(Boolean).join(" "), bullets: c.bullets, note: c.note })), actions: [] },
        u,
        "",
        bp ? { block: bp, headOk: b.cells.map((c) => !c.tag.replace(/^(Step\s?\d+|\d단계)$/, "") && !/^(Step\s?\d+|\d단계)\s*/.test(c.head)) } : undefined,
      );
    case "timeline":
      if (b.variant === "dots")
        return `${title}<div class="k-dots"><ol class="k-dots__items" style="grid-template-columns:repeat(${b.cells.length},1fr)">${b.cells
          .map((c, i) => `<li${i === b.cells.length - 1 ? ' aria-current="step"' : ""}><span class="k-dots__yr">${tx(c.head, u, at(`cells.${i}.head`))}</span><span class="k-dots__dot" aria-hidden="true"></span>${c.bullets.map((x, k) => `<p class="k-dots__t">${tx(x, u, at(`cells.${i}.bullets.${k}`))}</p>`).join("")}${c.note ? `<span class="k-dots__n">${tx(c.note, u, at(`cells.${i}.note`))}</span>` : ""}</li>`)
          .join("")}</ol></div>`;
      return diagramHtml({ type: "timeline", title: b.title, rows: [], steps: b.cells.map((c) => ({ title: c.head, bullets: c.bullets, note: c.note })), actions: [] }, u, "", bp ? { block: bp } : undefined);
    case "hub": {
      const [center, ...nodes] = b.cells;
      const node = (c: Block["cells"][number], i: number) => `<section class="k-hub__node"><h6 class="k-hub__name">${tx(c.head, u, at(`cells.${i}.head`))}</h6><p class="k-hub__role">${tx(c.bullets.join(" / "), u, at(`cells.${i}.bullets`), " / ")}</p></section>`;
      // 가운데 칸 그림(기관 로고 묶음 — 2025 협업 구조 가운데)
      const logos = figsAt(b, "center");
      const mid = `<section class="k-hub__node k-hub__node--center"><h6 class="k-hub__name">${tx(center.head, u, at("cells.0.head"))}</h6>${logos.length ? `<div class="k-hub__logos">${logos.map((f) => figHtml(f)).join("")}</div>` : ""}${ul(center.bullets, u, at("cells.0.bullets"))}</section>`;
      if (nodes.length === 2) return `${title}<div class="k-hub">${node(nodes[0], 1)}<div class="k-hub__link">${HANDS}</div>${mid}<div class="k-hub__link">${HANDS}</div>${node(nodes[1], 2)}</div>`;
      return `${title}<div class="k-hub k-hub--list">${mid}<div class="k-hub__link">${HANDS}</div><table class="k-hub__list"><tbody>${nodes.map((c, i) => `<tr><th scope="row">${tx(c.head, u, at(`cells.${i + 1}.head`))}</th><td>${ul(c.bullets, u, at(`cells.${i + 1}.bullets`))}</td></tr>`).join("")}</tbody></table></div>`;
    }
    case "voices":
      return `${title}<div class="k-voice" style="grid-template-columns:repeat(${Math.min(2, b.cells.length)},1fr)">${b.cells
        .map((c, i) => `<figure><div class="k-voice__who">${PERSON}<span>${c.head ? tx(c.head, u, at(`cells.${i}.head`)) : txt("현장", u)}</span></div><blockquote>“${tx(c.bullets[0] ?? "", u, c.bullets.length ? at(`cells.${i}.bullets.0`) : undefined)}”</blockquote></figure>`)
        .join("")}</div>`;
    case "define":
      return `<aside class="k-dfn"><h6 class="k-dfn__tab">${tx(b.title, u, at("title"))}</h6><div class="k-dfn__body">${b.text ? `<p>${tx(b.text, u, at("text"))}</p>` : ""}${
        b.items.length ? `<div class="k-chips">${b.items.map((x, i) => `<span class="k-chip">${tx(x, u, at(`items.${i}`))}</span>`).join('<span class="k-arr" aria-hidden="true">→</span>')}</div>` : ""
      }</div></aside>`;
    case "band":
      return `<div class="k-band">${b.label ? `<div class="k-band__l">${esc(b.label)}</div>` : ""}<div class="k-band__t">▶ ${tx(b.text, u, at("text"))} ◀</div></div>`;
    case "banner":
      return `<p class="k-banner">${tx(b.text, u, at("text"))}</p>${BRACE}`;
    case "quotes":
      return `<div class="k-ctx${b.cells.length === 1 ? " k-ctx--one" : ""}">${b.cells
        .map((c, i) => `<section class="k-ctx__box" aria-label="${esc(c.tag || "인용")}"><h6 class="k-ctx__head">${tagChip(c.tag, u)}${tx(c.head, u, at(`cells.${i}.head`))}</h6><ul class="k-ctx__body"><li>“${tx(c.bullets[0] ?? "", u, c.bullets.length ? at(`cells.${i}.bullets.0`) : undefined)}”${c.note ? `<span class="k-small">(${tx(c.note.replace(/^\(|\)$/g, ""), u, at(`cells.${i}.note`), undefined, c.note)})</span>` : ""}</li></ul></section>`)
        .join(LINK)}</div>`;
    case "case": {
      // 「공모명 | 2025년 …」처럼 라벨이 있는 줄은 라벨 칩 + 글(2025 우수사례 상자 모양)
      // 라벨이 있는 줄은 라벨 칩과 글을 한 칸으로 표지(원래 글 「라벨 | 내용」 그대로 고침)
      const item = (x: string, i: number) => {
        const m = /^([^|:：]{1,8}?)\s*[|:：]\s+(.+)$/.exec(x);
        const inner = m ? `<span class="k-tag">${txt(m[1], u)}</span>${txt(m[2], u)}` : txt(x, u);
        return `<li${m ? ' class="k-case__kv"' : ""}>${EDIT && bp ? `<span class="k-t" data-t="${bp}.items.${i}" data-raw="${esc(x)}">${inner}</span>` : inner}</li>`;
      };
      // 그림(수상·보도 사진)은 상자 오른쪽 칸(2025 1-1 가·1-2 나)
      const fig = (b.figures ?? [])[0];
      return `<aside class="k-case${fig ? "" : " k-case--nofig"}"${fig ? ` style="grid-template-columns:minmax(0,1fr) ${figureMm(fig).w}mm"` : ""}><div class="k-case__h"><span class="k-case__tab">${esc(b.label || "우수사례")}</span><span class="k-case__title">${tx(b.title, u, at("title"))}</span></div><div class="k-case__b"><ul>${b.items.map(item).join("")}</ul></div>${fig ? figHtml(fig, "k-case__figslot") : ""}</aside>`;
    }
    case "chart":
      return miniChartHtml({ title: b.title, series: b.series, badge: b.badge });
    case "subhead":
      return `<p class="k-subh">${tx(b.text, u, at("text"))}</p>`;
    case "qa":
      // Q&A 상자(2025 1-2 가 「왜 …?」): 쌍마다 Q 표지 + 질문(돋움 굵게), A 표지 + 답 불릿
      return `${title}<dl class="k-qa">${b.cells
        .map((c, i) => `<dt><span class="k-qa__m" aria-hidden="true">Q</span><span>${tx(c.head, u, at(`cells.${i}.head`))}</span></dt><dd><span class="k-qa__m k-qa__m--a" aria-hidden="true">A</span>${ul(c.bullets, u, at(`cells.${i}.bullets`))}</dd>`)
        .join("")}</dl>`;
    case "table": {
      if (b.variant === "result") return `${title}${resultTableHtml(b, u, at, w)}`;
      if (b.variant === "ladder") return `${title}${ladderTableHtml(b, u, at, w)}`;
      // 수치 표(2025 복원지수·등급·로드맵·점검 비교 표): 머리 줄 = items(첫째 = 행 머리 열), 행마다 head = 행 머리·bullets = 값 열
      // 행 머리 열 폭은 판면 어림(fit.ts slotOf)과 같은 규칙. 쉐브론 머리(chevron)는 값 열 머리를 단계 화살표로, 막대 표(bars)는 값 옆에 막대(tableBars — 같은 행·같은 단위끼리)
      const head = (tableRowHeadMm(w) / w) * 100;
      const each = ((100 - head) / (b.items.length - 1)).toFixed(2);
      const chev = b.variant === "chevron";
      const cls = chev ? "k-tbl k-tbl--chev" : b.variant === "bars" ? "k-tbl k-tbl--bars" : "k-tbl";
      const th = (x: string, i: number) => (chev && i > 0 ? `<th scope="col" class="k-chev${i === b.items.length - 1 ? " k-chev--last" : ""}"><span>${tx(x, u, at(`items.${i}`))}</span></th>` : `<th scope="col">${tx(x, u, at(`items.${i}`))}</th>`);
      const row = (c: Block["cells"][number], i: number) => {
        const bars = b.variant === "bars" ? tableBars(c.bullets) : [];
        return c.bullets
          .map((x, k) => {
            const v = x ? tx(x, u, at(`cells.${i}.bullets.${k}`)) : "";
            const w = bars[k];
            return w == null ? `<td>${v}</td>` : `<td><span class="k-barc"><span class="k-barc__v">${v}</span><span class="k-barc__t" aria-hidden="true"><span class="k-barc__b" style="width:${w}%"></span></span></span></td>`;
          })
          .join("");
      };
      return `${title}<table class="${cls}"><colgroup><col style="width:${head.toFixed(2)}%">${b.items
        .slice(1)
        .map(() => `<col style="width:${each}%">`)
        .join("")}</colgroup><thead><tr>${b.items.map(th).join("")}</tr></thead><tbody>${b.cells
        .map((c, i) => `<tr><th scope="row">${tx(c.head, u, at(`cells.${i}.head`))}</th>${row(c, i)}</tr>`)
        .join("")}</tbody></table>`;
    }
    case "strategy": {
      // 전략체계도(2025 경영관리 평가내용 첫 「전략수립」 대주제): 왼쪽 층 이름 열(있을 때) + 목표 띠 → 열 머리(전략목표) → 과제 → 지표 행. 층 이름은 행 순서대로 하나씩
      const n = b.cells.length;
      let r = 0;
      const th = () => {
        const i = r++;
        return b.items.length ? `<th scope="row">${b.items[i] ? tx(b.items[i], u, at(`items.${i}`)) : ""}</th>` : "";
      };
      const rows: string[] = [];
      if (b.text) rows.push(`<tr class="k-strat__top">${th()}<td colspan="${n}">${tx(b.text, u, at("text"))}</td></tr>`);
      rows.push(`<tr class="k-strat__head">${th()}${b.cells.map((c, i) => `<td>${tagChip(c.tag, u)}${tx(c.head, u, at(`cells.${i}.head`))}</td>`).join("")}</tr>`);
      rows.push(`<tr class="k-strat__body">${th()}${b.cells.map((c, i) => `<td>${ul(c.bullets, u, at(`cells.${i}.bullets`))}</td>`).join("")}</tr>`);
      if (b.cells.some((c) => c.note)) rows.push(`<tr class="k-strat__foot">${th()}${b.cells.map((c, i) => `<td>${c.note ? tx(c.note, u, at(`cells.${i}.note`)) : ""}</td>`).join("")}</tr>`);
      return `${title}<table class="k-strat"><tbody>${rows.join("")}</tbody></table>`;
    }
    case "pdca": {
      // P·D·C·A 순환(2025 경영관리 PDCA 체계 도식·생애주기 순환): 4칸 사이 ▶, 칸 머리 = 단계 표지(비우면 P·D·C·A) + 단계 이름, 아래 환류 띠
      const DEF = ["P", "D", "C", "A"];
      const cells = b.cells.slice(0, 4).map(
        (c, i) =>
          `<div class="k-card"><div class="k-card__h"><span class="k-pdca__m">${esc((c.tag || DEF[i]).slice(0, 2))}</span>${tx(c.head, u, at(`cells.${i}.head`))}</div><div class="k-card__b">${ul(c.bullets, u, at(`cells.${i}.bullets`))}</div>${c.note ? `<div class="k-card__f">${tx(c.note, u, at(`cells.${i}.note`))}</div>` : ""}</div>`,
      );
      return `${title}<div class="k-pdca">${cells.join('<div class="k-join" aria-hidden="true">▶</div>')}${b.text ? `<p class="k-pdca__fb">↺ ${tx(b.text, u, at("text"))}</p>` : ""}</div>`;
    }
    case "stats":
      // 핵심 수치 띠(2025 「유형 24종·제원 63종 | 검증 신뢰도 97% | 수도권 약 3만국」): 칸마다 수치(크게) + 설명
      return `${title}<div class="k-stats" style="grid-template-columns:repeat(${b.cells.length},minmax(0,1fr))">${b.cells
        .map((c, i) => `<div class="k-stat">${c.tag ? `<span class="k-tag">${tx(c.tag, u, at(`cells.${i}.tag`))}</span>` : ""}<p class="k-stat__v">${tx(c.head, u, at(`cells.${i}.head`))}</p>${c.bullets[0] ? `<p class="k-stat__d">${tx(c.bullets[0], u, at(`cells.${i}.bullets.0`))}</p>` : ""}${c.note ? `<p class="k-stat__n">${tx(c.note, u, at(`cells.${i}.note`))}</p>` : ""}</div>`)
        .join("")}</div>`;
  }
}

/** 짝 없는 태그(깊이를 바꾸지 않음) */
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

/**
 * 조각 HTML의 맨 위 요소마다 속성을 더함(블록 하나가 제목 문단 + 도식처럼 여러 요소일 때 모두 — 화면이 블록 상자를 이 요소들의 합으로 잼).
 * 이 렌더러 출력만 받음: 글은 모두 이스케이프되어 태그 밖에 「<」가 없고, 속성 값에 「>」가 없음. svg 안 「<path …/>」 같은 스스로 닫는 태그는 깊이를 바꾸지 않음
 */
export function markRoots(html: string, attr: string): string {
  let depth = 0;
  return html.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g, (all, close: string, tag: string, rest: string, self: string) => {
    if (close) {
      depth = Math.max(0, depth - 1);
      return all;
    }
    const top = depth === 0;
    if (!self && !VOID_TAGS.has(tag.toLowerCase())) depth++;
    return top ? `<${tag} ${attr}${rest}${self}>` : all;
  });
}

/** 단 띠 이름: 「Step 1 …」「’24년 …」「1단계 …」는 앞을 칩으로(사다리 라벨과 같은 규칙, 줄바꿈 없이 한 줄) */
function stageLabelHtml(label: string): string {
  const m = /^(Step\s?\d+|’\d\d년~?|\d{4}년~?|\d단계)\s*(.*)$/.exec(label);
  return m ? `<span class="k-tag">${esc(m[1])}</span>${esc(m[2])}` : esc(label);
}

/**
 * v3 본문: 라벨 있는 연속 블록 = 사다리 표(같은 라벨은 한 행, 행 끝 막대는 오른쪽), 라벨 없는·전폭 블록 = 그대로.
 * 배치(lib/reports/layout.ts — 2026-10-12): 단 띠 = 띠 머리(.k-stage) + 그 아래 전폭 블록, 가로 반씩 짝 = 두 블록을 .k-pair 두 칸에 나란히(사다리 행 칸·전폭·단 띠 어디서든).
 * 배치 필드가 없는 블록 목록은 예전과 바이트까지 같은 출력.
 * marks를 켜면 행마다 첫 요소에 data-fit-row(판면 어림 fitReport rows와 같은 번호)를 담 — 행별 실측용(개발 도구만, 속성이라 배치는 그대로).
 * blockMarks를 켜면 블록마다 맨 위 요소에 data-block(spec.blocks 순번 — 사다리 행 안 블록·행 옆 막대도 각자)을 담 — 과제별 초안 화면의 여백 메모 자리(속성이라 배치는 그대로)
 */
function blocksBody(blocks: Block[], u: Marks, caption: string, marks = false, blockMarks = false, offset = 0): string {
  const out: string[] = [];
  let rows: Array<{ label: string; units: number[][]; n: number }> = [];
  let n = 0;
  const mark = (i: number) => (marks ? ` data-fit-row="${i}"` : "");
  // offset: 경영관리 절마다 나눠 그릴 때 spec.blocks 안의 첫 순번(경로·data-block이 전체 순번을 가리키게)
  // width: 가로 반씩 짝이면 반 폭, 짝 없는 half면 그릇 폭(blockWidth는 짝이 있다고 보고 셈) — 그 밖은 블록이 스스로 셈(예전 그대로)
  const one = (j: number, width?: number) => {
    const b = blocks[j];
    const i = j + offset;
    const html = blockHtml(b, u, `blocks.${i}`, width ?? (b.span !== undefined ? soloWidth(b) : undefined));
    return blockMarks ? markRoots(html, `data-block="${i}"`) : html;
  };
  // 단위: 블록 하나 또는 가로 반씩 짝(각 칸은 블록 하나 — 블록이 제목 문단 + 도식처럼 여러 요소여도 한 칸에)
  const unit = (us: number[]) => (us.length === 1 ? one(us[0]) : `<div class="k-pair">${us.map((j) => `<div class="k-pair__c">${one(j, blockWidth(blocks[j]))}</div>`).join("")}</div>`);
  const flush = () => {
    if (!rows.length) return;
    const tr = rows.map((r) => {
      const flat = r.units.flat();
      const last = flat.at(-1)!;
      const single = r.units.every((x) => x.length === 1);
      const withChart = single && flat.length > 1 && blocks[last].kind === "chart";
      const main = withChart ? flat.slice(0, -1) : flat;
      const body = single ? main.map((j) => one(j)).join("") : r.units.map(unit).join("");
      const cell = withChart ? `<div class="k-row2"><div>${body}</div>${one(last)}</div>` : body;
      return `<tr${mark(r.n)}><th scope="row">${labelHtml(r.label)}</th><td>${cell}</td></tr>`;
    });
    out.push(`<table class="k-ladder"><caption class="sr">${esc(caption)}</caption><tbody>${tr.join("")}</tbody></table>`);
    rows = [];
  };
  for (const g of layoutGroups(blocks)) {
    // 사다리 행(이어진 같은 라벨은 이미 한 묶음) — 이어진 행들은 한 표로(전폭·단 띠를 만나면 표를 닫음)
    if (g.type === "row") {
      rows.push({ label: g.label, units: g.units, n: n++ });
      continue;
    }
    flush();
    if (g.type === "stage") {
      out.push(`<p class="k-stage"${mark(n)}><span class="k-stage__l">${stageLabelHtml(g.label)}</span></p>`);
      for (const us of g.units) out.push(unit(us));
      n++;
      continue;
    }
    const html = unit(g.units[0]);
    out.push(marks ? html.replace(/^<([a-z0-9]+)/i, `<$1${mark(n)}`) : html);
    n++;
  }
  flush();
  return out.join("\n");
}

/** 추진성과 상자. mark = 바깥 div에 data-result(과제별 초안 화면 — 끌어 고르기 대상, data-block과 다른 표지) */
function resultHtml(spec: ReportSectionSpec, u: Marks, mark = false): string {
  const cards = spec.resultCards ?? [];
  const chart = spec.resultChart && spec.resultChart.series.length >= 2 ? spec.resultChart : null;
  if (!cards.length && !spec.results.length && !chart) return "";
  const main = `${
    cards.length ? `<div class="k-rcards" style="grid-template-columns:repeat(${cards.length},minmax(0,1fr))">${cards.map((c, i) => `<div class="k-rcard"><p class="k-rcard__h">${c.tag ? `[${esc(c.tag)}] ` : ""}${tx(c.headline, u, `resultCards.${i}.headline`)}</p><p class="k-rcard__f">${tx(c.figure, u, `resultCards.${i}.figure`)}</p></div>`).join("")}</div>` : ""
  }${ul(spec.results, u, "results")}`;
  // 곁들임: 막대(불릿 오른쪽 42mm — 2025 1-1 다), 강조 띠(상자 오른쪽 끝 칩 — 2025 1-2 다 「C → B」 향상!)
  const body = chart ? `<div class="k-row2"><div>${main}</div>${miniChartHtml(chart)}</div>` : main;
  const band = spec.resultBand ? `<p class="k-result__band">${tx(spec.resultBand, u, "resultBand")}</p>` : "";
  return `<div${mark ? " data-result" : ""} class="k-result${band ? " k-result--band" : ""}"><div class="k-result__label">추진성과</div><div class="k-result__body${cards.length ? " k-result__body--cards" : ""}${chart ? " k-result__body--chart" : ""}">${body}</div>${band}</div>`;
}

/**
 * 그리기 선택: marks = 행별 실측 표지(개발 도구), weak = 근거 약한 문장(화면 미리보기만 — 내려받기에는 넣지 않음, 사용자 결정 2026-09-27),
 * head = 머리 생략(사업 단위 조판에서 앞 소항목과 대상사업·실행과제가 같을 때): all(기본) · task(대상사업 상자 뺌) · sub(대상사업·실행과제 띠 뺌)
 */
export interface SectionHtmlOptions {
  marks?: boolean;
  /** 블록마다 data-block(spec.blocks 순번) — 과제별 초안 화면만(내려받기·기본 출력은 그대로) */
  blockMarks?: boolean;
  /** 추진성과 상자에 data-result(2026-10-13 — 과제별 초안 화면의 끌어 고르기 「AI 수정 요청」·「질문」 대상, 대상 번호 -1). data-block이 아니라서 블록 표지를 쓰는 다른 화면(검토 코멘트·구성안 메모)은 받지 않음 */
  resultMark?: boolean;
  weak?: string[];
  head?: "all" | "task" | "sub";
  /** 두 번 눌러 고치기 표지(글 조각마다 data-t·data-raw) — 과제별 초안 화면에서 고칠 수 있을 때만. v3 블록 목록 초안만 */
  editMarks?: boolean;
  /** 경영관리 사업 조판: 앞 과제 마지막 절과 같은 평가내용이면 첫 평가내용 상자를, 같은 대주제면 첫 대주제 띠도 그리지 않음(lib/reports/business-layout.ts) */
  mgCont?: { eval: boolean; theme: boolean };
  /** 사업 조판 대상사업 머리 지도(미리 그린 HTML — lib/reports/business-html.ts bizMapHtml): 대상사업 상자 바로 뒤에 끼움(head all일 때만) */
  bizMap?: string;
}

/** 소항목 본문 HTML(.kca-dg-doc 안에 넣는 조각) — v3은 블록 목록, v1·v2는 제목 → 인용 상자 → 추진배경 행 → 메시지 띠 → 나머지 행 → 우수사례 → 추진성과 */
export function sectionBodyHtml(spec: ReportSectionSpec, unknownNumbers: string[] = [], opts: SectionHtmlOptions = {}): string {
  // 고치기 표지는 v3 블록 목록 초안만(렌더가 동기라 이 호출 동안만 켜고 끔)
  EDIT = Boolean(opts.editMarks) && spec.version === 3 && Array.isArray(spec.blocks);
  try {
    return sectionBodyInner(spec, unknownNumbers, opts);
  } finally {
    EDIT = false;
  }
}

function sectionBodyInner(spec: ReportSectionSpec, unknownNumbers: string[], opts: SectionHtmlOptions): string {
  const u = marksOf(unknownNumbers, opts.weak);
  const head = opts.head ?? "all";
  const bizHtml = head === "all" ? `<p class="k-biz"><span class="k-biz__no">대상사업${spec.business.no}</span><span>${esc(spec.business.name)}</span></p>${opts.bizMap ? `\n${opts.bizMap}` : ""}` : "";
  const taskHtml = head !== "sub" ? `<h4 class="k-task"><span class="k-task__no">${esc(spec.task.no)}</span><span class="k-task__t">${esc(spec.task.title)}</span>${spec.task.bp ? MARKER_HTML.BP : ""}</h4>` : "";
  if (spec.version === 3 && spec.blocks && spec.mg) return mgBody(spec, spec.blocks, spec.mg, u, opts);
  if (spec.version === 3 && spec.blocks) {
    return [
      bizHtml,
      taskHtml,
      `<h5 class="k-sub">${esc(spec.sub.mark)}. ${chipHtml(spec.sub.chip)}${tx(spec.sub.title, u, "sub.title")}${spec.sub.markers.map((m) => MARKER_HTML[m] ?? "").join("")}</h5>`,
      blocksBody(spec.blocks, u, spec.caption || `${spec.sub.title} 추진 내용`, opts.marks, opts.blockMarks),
      resultHtml(spec, u, opts.resultMark),
    ]
      .filter(Boolean)
      .join("\n");
  }
  const caption = spec.caption || `${spec.sub.title} 추진 내용`;
  const ctx = spec.context ?? [];
  const context = ctx.length
    ? `<div class="k-ctx${ctx.length === 1 ? " k-ctx--one" : ""}">${ctx
        .map((c) => `<section class="k-ctx__box" aria-label="${esc(c.chip || "인용")}"><h6 class="k-ctx__head" style="margin:0">${c.chip ? `<span class="k-tag">${esc(c.chip)}</span>` : ""}${txt(c.title, u)}</h6><ul class="k-ctx__body"><li>“${txt(c.quote, u)}”${c.cite ? `<span class="k-small">(${txt(c.cite.replace(/^\(|\)$/g, ""), u)})</span>` : ""}</li></ul></section>`)
        .join(LINK)}</div>`
    : "";
  // 메시지 띠는 추진배경 행 다음(없으면 사다리 앞)
  const span = spec.banner ? Math.max(0, spec.rows.findIndex((r) => r.label === "추진배경") + 1) : spec.rows.length;
  const banner = spec.banner ? `<p class="k-banner">${txt(spec.banner, u)}</p>${BRACE}` : "";
  const cases = (spec.cases ?? [])
    .map((c) => `<aside class="k-case k-case--nofig"><div class="k-case__h"><span class="k-case__tab">${esc(c.tab || "우수사례")}</span><span class="k-case__title">${txt(c.title, u)}</span></div><div class="k-case__b">${ul(c.items, u)}</div></aside>`)
    .join("");
  const cards = spec.resultCards ?? [];
  const result =
    cards.length || spec.results.length
      ? `<div class="k-result"><div class="k-result__label">추진성과</div><div class="k-result__body${cards.length ? " k-result__body--cards" : ""}">${
          cards.length ? `<div class="k-rcards" style="grid-template-columns:repeat(${cards.length},minmax(0,1fr))">${cards.map((c) => `<div class="k-rcard"><p class="k-rcard__h">${c.tag ? `[${esc(c.tag)}] ` : ""}${txt(c.headline, u)}</p><p class="k-rcard__f">${txt(c.figure, u)}</p></div>`).join("")}</div>` : ""
        }${ul(spec.results, u)}</div></div>`
      : "";
  return [
    bizHtml,
    taskHtml,
    `<h5 class="k-sub">${esc(spec.sub.mark)}. ${txt(spec.sub.title, u)}${spec.sub.markers.map((m) => MARKER_HTML[m] ?? "").join("")}</h5>`,
    context,
    ladder(spec.rows.slice(0, span), u, caption),
    banner,
    ladder(spec.rows.slice(span), u, caption),
    cases,
    result,
  ]
    .filter(Boolean)
    .join("\n");
}

/** 제목 앞 갈래 칩 글자(「[값] 」 — KCA 2025 □ 단 [키워드] 표기, 새 CSS 없음 · lib/reports/split-axes.ts). 칩이 없으면 빈 글(예전 출력 그대로) */
const chipHtml = (chip?: string) => (chip ? `${esc(`[${chip}]`)} ` : "");

/**
 * 경영관리 초안 본문(lib/reports/mg-draft.ts — 설계 2026-10-09): 평가내용 상자(주요사업 대상사업 상자 모양) → 대주제 띠(실행과제 띠 모양) → 절 제목(가.) →
 * 그 절의 블록(같은 렌더러 — 경로·data-block은 spec.blocks 전체 순번). 마커(지적개선·신규·BP)는 첫 대주제 띠에. 새 CSS 없음(주요사업 출력 그대로).
 * 지적개선은 spec.mg.finding(카드 지적 행과 가장 겹치는 절 — mg-draft.ts mgFindingParts, 2026-10-15)이 있으면 그 절의 대주제 띠에(대주제마다 한 번) — 없으면 예전처럼 첫 자리
 */
function mgBody(spec: ReportSectionSpec, blocks: Block[], mg: NonNullable<ReportSectionSpec["mg"]>, u: Marks, opts: SectionHtmlOptions): string {
  const out: string[] = [];
  let ev = -1;
  let th = "";
  const order = [...(spec.task.bp ? ["BP"] : []), ...spec.sub.markers];
  const findThemes = new Set(mg.parts.filter((p) => mg.finding?.includes(p.key)).map((p) => `${p.evalNo}.${p.themeNo}`));
  const moved = findThemes.size > 0 && order.includes("지적개선");
  // 다음에 그리는 띠나 절 제목에 붙일 마커(처음 = 첫 자리 몫 — 옮긴 지적개선은 그 대주제에 들어설 때 더함). 그린 뒤 비움
  const pend = new Set(order.filter((m) => !(moved && m === "지적개선")));
  const done = new Set<string>();
  const enter = (t: string) => {
    if (moved && findThemes.has(t) && !done.has(t)) {
      pend.add("지적개선");
      done.add(t);
    }
  };
  const take = () => {
    const h = order.filter((m) => pend.has(m)).map((m) => MARKER_HTML[m] ?? "").join("");
    pend.clear();
    return h;
  };
  // 사업 조판에서 앞 과제에 이어질 때: 첫 절의 평가내용 상자·대주제 띠를 이미 그린 것으로 둠(마커는 다음에 그리는 띠나 절 제목에)
  const p0 = mg.parts[0];
  if (p0 && opts.mgCont?.eval) ev = p0.evalNo;
  if (p0 && opts.mgCont?.eval && opts.mgCont.theme) {
    th = `${p0.evalNo}.${p0.themeNo}`;
    enter(th);
  }
  for (const p of mg.parts) {
    if (p.evalNo !== ev) {
      ev = p.evalNo;
      th = "";
      out.push(`<p class="k-biz"><span class="k-biz__no">평가내용${p.evalNo}</span><span>${esc(p.evalTitle)}</span></p>`);
    }
    const t = `${p.evalNo}.${p.themeNo}`;
    if (t !== th) {
      th = t;
      enter(t);
      out.push(`<h4 class="k-task"><span class="k-task__no">${p.themeNo}</span><span class="k-task__t">${esc(p.themeTitle)}</span>${take()}</h4>`);
    }
    if (p.mark) out.push(`<h5 class="k-sub">${esc(p.mark)}. ${chipHtml(p.chip)}${esc(p.title)}${take()}</h5>`);
    const idx = mg.at.flatMap((k, i) => (k === p.key ? [i] : []));
    if (!idx.length) continue;
    const from = idx[0];
    const to = idx.at(-1)! + 1;
    out.push(blocksBody(blocks.slice(from, to), u, p.title || p.themeTitle || spec.caption, opts.marks, opts.blockMarks, from));
  }
  return out.join("\n");
}

/** 화면·내려받기 공용: 종이(170mm 판면) 안 소항목 */
export function sectionHtml(spec: ReportSectionSpec, unknownNumbers: string[] = [], opts: SectionHtmlOptions = {}): string {
  return `<div class="kca-dg-doc"><div class="k-paper"><div class="k-frame">${sectionBodyHtml(spec, unknownNumbers, opts)}</div></div></div>`;
}

/**
 * 견본 그림(구성안 화면의 틀 갤러리·도식 고르기 — lib/reports/frameworks.ts): 블록 목록만 본문과 같은 렌더러로(제목·추진성과 없이).
 * 칸 글은 부르는 쪽이 보통 모양(fit.ts canonicalBlock)으로 채움 — 화면이 작게 줄여 모양만 보임
 */
export function blocksSampleHtml(blocks: Block[]): string {
  return `<div class="kca-dg-doc"><div class="k-paper"><div class="k-frame">${blocksBody(blocks, marksOf([]), "")}</div></div></div>`;
}

/** 내려받기용 HTML 문서(글꼴 파일·외부 링크 없이 한 파일) */
export function sectionDocument(spec: ReportSectionSpec, unknownNumbers: string[] = [], meta: { year: number; generatedAt: string; model: string } = { year: 2026, generatedAt: "", model: "" }, opts: Pick<SectionHtmlOptions, "marks"> = {}): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(`${meta.year}년도 경영실적보고서 초안 — ${spec.card.taskNo} ${spec.card.title}`)}</title>
<style>
body{margin:0;background:#e9eae9;padding:24px 16px 48px}
.meta{max-width:220mm;margin:0 auto 12px;font:13px/1.6 "맑은 고딕","Malgun Gothic",sans-serif;color:#333}
.wrap{display:flex;justify-content:center}
${REPORT_CSS}
</style>
</head>
<body>
<p class="meta">${esc(`${meta.year}년도 경영실적보고서${spec.mg ? `(경영관리) ${spec.mg.indicator} 초안` : "(주요사업) 평가내용2 소항목 초안"} · 과제관리카드 ${spec.card.taskNo} · ${meta.model ? `AI 초안(${meta.model})` : "초안"}${meta.generatedAt ? ` · ${meta.generatedAt}` : ""}${unknownNumbers.length ? ` · 붉은 점선 = 카드에 없는 숫자(확인 필요)` : ""}`)}</p>
<div class="wrap">${sectionHtml(spec, unknownNumbers, opts)}</div>
<script>/* 자간 맞춤(1~2글자 넘친 칸 글을 한 줄로) */(document.fonts ? document.fonts.ready : Promise.resolve()).then(function () { (${fitTextLines.toString()})(document); });</script>
</body>
</html>
`;
}
