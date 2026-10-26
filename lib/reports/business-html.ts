// 경평 초안 사업 단위 조판 — 쪽 묶음(sheetsOf) HTML(순수, 모든 글 이스케이프). 소항목은 과제별 초안과 같은 렌더러(sectionBodyHtml)에 머리 모드(head)만 달리 줘서 그림.
// 한 장 = 소항목이 다음 쪽으로 이어지는 쪽끼리(보통 한 쪽). 종이 높이는 쪽 수 × 판면 255mm이고, 쪽 경계·판면 끝을 선으로 긋습니다 —
// 조판은 어림 높이로 정하고 그림은 실제 글꼴로 흐르므로, 실제로 판면을 넘친 부분은 판면 끝 아래 붉은 바탕으로 보입니다.

import { withReturn } from "../nav/return-to.ts";
import { BIZ_MAP_MM, BIZ_MAP_TITLE, type BizMapRow, type BusinessItem, type BusinessLayout, type LaidPage, SUB_GAP_MM } from "./business-layout.ts";
import { PAGE_MM } from "./fit.ts";
import { sectionBodyHtml } from "./section-html.ts";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmtPages = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}쪽`;

/** 종이 안 여백(REPORT_CSS .k-paper padding 위아래 8mm)과 같은 값 */
const PAPER_PAD_MM = 8;

/** 사업 조판 화면 CSS(REPORT_CSS 뒤에 둠 — .kca-dg-doc 아래로 한정) */
export const BUSINESS_CSS = `
.kca-dg-doc .bz-sheet{position:relative;min-height:calc(var(--bz-n) * ${PAGE_MM.height}mm + ${PAPER_PAD_MM * 2}mm);
  background:linear-gradient(to bottom,#fff calc(${PAPER_PAD_MM}mm + var(--bz-n) * ${PAGE_MM.height}mm),#fbe4e1 calc(${PAPER_PAD_MM}mm + var(--bz-n) * ${PAGE_MM.height}mm))}
.kca-dg-doc .bz-line{position:absolute;left:0;right:0;height:0;border-top:1px dashed #9a9b9a;pointer-events:none;z-index:2} /* 쪽 경계·판면 끝 선과 이름표는 과제 칸 위에(뒤에 그려지는 칸에 가리지 않게) */
.kca-dg-doc .bz-line span{position:absolute;right:2mm;top:-1.2em;font:600 8pt/1.2 var(--k-f-label);color:#6b6c6b;background:#fff;padding:0 3px}
.kca-dg-doc .bz-line--end{border-top:1px dashed #c62828}
.kca-dg-doc .bz-line--end span{color:#c62828}
.kca-dg-doc .bz-no{position:absolute;left:0;right:0;bottom:2.2mm;margin:0;text-align:center;font:400 9pt/1 var(--k-f-label);color:#6b6c6b}
.kca-dg-doc .bz-piece{position:relative;scroll-margin-top:64px} /* 위에 붙은 요약 막대(약 44px)에 가리지 않게 */
.kca-dg-doc .bz-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:1.5px dashed #b9bab9;border-radius:4px;background:#f7f8f7;
  font:400 10pt/1.5 var(--k-f-label);letter-spacing:0;word-spacing:0;color:#4b4c4b;text-align:center;padding:4mm;overflow:hidden}
.kca-dg-doc .bz-empty b{font-weight:700;color:#111}
.kca-dg-doc .bz-empty a{color:#00699e;font-weight:600}
/* 대상사업 머리 지도(?map=1 — 높이 어림은 business-layout BIZ_MAP_MM과 같은 값) */
.kca-dg-doc .bz-map{border:1px solid var(--k-g4);padding:${BIZ_MAP_MM.padY}mm ${BIZ_MAP_MM.padX}mm;margin:0 0 ${BIZ_MAP_MM.gap}mm;background:#fff;
  font:400 ${BIZ_MAP_MM.pt}pt/${BIZ_MAP_MM.lh} var(--k-f-dotum);letter-spacing:var(--k-ls-dotum);word-break:keep-all;overflow-wrap:break-word;min-width:0}
.kca-dg-doc .bz-map__h{margin:0;font:700 ${BIZ_MAP_MM.headPt}pt/${BIZ_MAP_MM.headLh} var(--k-f-dotum);letter-spacing:var(--k-ls-dotum)}
.kca-dg-doc .bz-map ul{margin:0}
.kca-dg-doc .bz-map li{padding-left:${BIZ_MAP_MM.indentEm}em}
.kca-dg-doc .bz-map__no{font-weight:700}
.kca-dg-doc .bz-map__subs{color:var(--k-g5)}
`;

/** 대상사업 머리 지도 상자(모든 글 이스케이프): 머리 「추진개요」 + 실행과제마다 한 줄(번호·이름 · 소항목 「가. … · 나. …」) — 줄 글은 높이 어림(bizMapLine)과 같음 */
export function bizMapHtml(rows: BizMapRow[]): string {
  if (!rows.length) return "";
  const li = rows
    .map((r) => {
      const parts = [r.no ? `<b class="bz-map__no">${esc(r.no)}</b>` : "", r.name ? esc(r.name) : "", r.subs.length ? `<span class="bz-map__subs">${esc(r.subs.join(" · "))}</span>` : ""].filter(Boolean);
      return `<li>${parts.join(" ")}</li>`;
    })
    .join("");
  return `<div class="bz-map"><p class="bz-map__h">${esc(BIZ_MAP_TITLE)}</p><ul>${li}</ul></div>`;
}

/** 초안 없는 자리(배정 쪽수만큼 점선 빈 칸). from은 연 곳(사업 조판 화면)으로 돌아갈 주소(작성 화면 링크의 목록 아이콘) */
function emptyHtml(it: BusinessItem, from?: string | null): string {
  const where = [it.section, it.subsection].filter(Boolean).join(" · ");
  const href = withReturn(`/reports/cards/${encodeURIComponent(it.uid)}`, from);
  return `<p><b>${esc(it.taskNo)} ${esc(it.title)}</b></p>${where ? `<p>${esc(where)}</p>` : ""}<p>초안 없음 · 배정 ${fmtPages(it.pages)}</p><p><a href="${esc(href)}">작성 화면으로</a></p>`;
}

/**
 * 한 장(쪽 묶음) HTML. 걸친 소항목은 처음 조각에서 한 번만 그리고, 같은 쪽의 둘째 소항목부터는 SUB_GAP_MM 띄움.
 * 초안 없는 자리는 조판 높이(배정 쪽수 × 255mm)만큼 점선 빈 칸. from은 순수 모듈이라 인자로 받음(사업 조판 화면 주소 — 「작성 화면으로」가 돌아올 곳).
 */
export function sheetHtml(sheet: LaidPage[], layout: Pick<BusinessLayout, "items" | "sections">, from?: string | null): string {
  const n = sheet.length;
  const first = sheet[0].no;
  // 판면 넘침 안내(붉은 바탕)는 종이 안에 두지 않음 — 쪽 위 오른쪽에 두면 머리 없는 소항목 제목과 겹쳐서(2026-09-28), 화면이 쪽 보기 위에 한 번 적음
  const body = sheet
    .flatMap((p) => p.pieces)
    .filter((x) => !x.cont)
    .map((x) => {
      const it = layout.items[x.index];
      const s = layout.sections[x.index];
      const gap = x.top > 0 ? `margin-top:${SUB_GAP_MM}mm;` : "";
      const id = `bz-${esc(it.uid)}`;
      if (!it.spec) return `<div class="k-frame bz-piece bz-empty" id="${id}" style="${gap}${s.height > 0 ? `height:${s.height}mm` : ""}">${emptyHtml(it, from)}</div>`;
      return `<div class="k-frame bz-piece" id="${id}"${gap ? ` style="${gap}"` : ""}>${sectionBodyHtml(it.spec, it.unknownNumbers ?? [], { head: s.head, ...(s.mgCont ? { mgCont: s.mgCont } : {}), ...(s.map ? { bizMap: bizMapHtml(s.map) } : {}) })}</div>`;
    })
    .join("\n");
  return sheetShell(first, n, body);
}

/** 종이 껍데기: 쪽 n개 높이의 종이에 쪽 경계 선·판면 끝 선·쪽 번호를 두르고 body를 넣음(소항목 쪽 묶음 sheetHtml과 카드 밖 부분 outsideSheetHtml이 같은 모양) */
function sheetShell(first: number, n: number, body: string): string {
  const lines = [
    ...Array.from({ length: n - 1 }, (_, i) => `<div class="bz-line" style="top:calc(${PAPER_PAD_MM}mm + ${(i + 1) * PAGE_MM.height}mm)"><span>${first + i}쪽 끝 · ${first + i + 1}쪽</span></div>`),
    `<div class="bz-line bz-line--end" style="top:calc(${PAPER_PAD_MM}mm + ${n * PAGE_MM.height}mm)"><span>판면 끝(${PAGE_MM.height}mm)</span></div>`,
  ].join("");
  const no = n > 1 ? `- ${first}~${first + n - 1} -` : `- ${first} -`;
  return `<div class="kca-dg-doc"><div class="k-paper bz-sheet" style="--bz-n:${n}">${lines}${body}<p class="bz-no">${no}</p></div></div>`;
}

/**
 * 경영관리 카드 밖 장들이 놓인 쪽 묶음(앞 또는 뒤): firstPage부터 pages개 쪽 높이의 종이에 장 조각(html — unitPartChapterHtml)을 이어 씀. 쪽 번호는 지표 안 쪽 번호.
 * html은 부르는 쪽이 만든 이미 이스케이프된 조각. 쪽 수가 0이면 빈 글
 */
export function outsideSheetHtml(firstPage: number, pages: number, html: string, id?: string): string {
  if (pages <= 0) return "";
  return sheetShell(firstPage, pages, `<div class="k-frame bz-piece"${id ? ` id="${esc(id)}"` : ""}>${html}</div>`);
}
