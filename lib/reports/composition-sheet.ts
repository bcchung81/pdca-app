// 경평 초안 「구성안 판면」(와이어프레임, 결정론·순수): 구성안 블록을 높이 예산(blockBudgets, mm)대로 170mm 종이에 차례로 쌓아
// 집필 전에 짜임과 판면을 봄. 제목부·추진성과 상자는 판면 어림(compositionFit)과 같은 보통 모양 높이(frameHeight).
// 라벨 있는 블록 = 18mm 라벨 칸 + 내용(같은 라벨이 이어지면 한 행처럼), 전폭 블록 = 전폭, 행 끝 막대 = 앞 행 오른쪽 42mm 칸, 그림 자리 = 빗금 칸(figureMm).
// 배치(lib/reports/layout.ts — 2026-10-12): 단 띠 = 띠 머리 상자 + 그 아래 전폭 상자, 가로 반씩 짝 = 한 상자 안 두 칸 나란히, 배치 전폭 = 라벨 칸 없는 상자.
// mm 단위로 그려 화면 확대(zoom)와 함께 커짐. 블록 상자마다 data-block(구성안 블록 순번 — 여백 메모 자리). 모든 글은 이스케이프합니다.

import { FIGURE_LABEL, type Figure, figureMm } from "./blocks.ts";
import { shapeName } from "./frameworks.ts";
import { type Composition, RESULT_SHAPE_LABEL, blockBudgets } from "./composition.ts";
import { type HeadMode, PAGE_MM, chipTitle, frameHeight } from "./fit.ts";
import { layoutGroups } from "./layout.ts";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// 모양 이름·코드는 짜임 사전(lib/reports/frameworks.ts)에 — 예전 가져오는 곳을 위해 다시 내보냄
export { SHAPE_NAMES, shapeCode, shapeName } from "./frameworks.ts";

/** 행 끝 막대 칸 폭(렌더러 k-row2와 같은 42mm) */
const CHART_COL_MM = 42;

/** 구성안 판면 높이 조각(mm): 제목부 · 블록마다 예산 · 추진성과 상자 · 쪽 예산 */
export function sheetParts(c: Composition, module: number, head: HeadMode = "all") {
  // 갈래 칩이 있으면 제목 앞 「[값] 」까지(compositionFit과 같은 셈)
  const title = chipTitle("가".repeat(38), c.split?.chip);
  const shape = c.resultShape ?? "bullets";
  // 판면 어림(compositionFit)과 같은 보통 모양: 불릿 2줄 · 3칸 + 불릿 1줄 · 불릿 2줄 + 막대
  const results = shape === "cards" ? ["가".repeat(50)] : ["가".repeat(50), "가".repeat(50)];
  const headMm = frameHeight(title, [], 0, {}, undefined, head);
  const resultMm = frameHeight(title, results, shape === "cards" ? 3 : 0, { chart: shape === "chart" }, undefined, head) - headMm;
  return { head: headMm, result: resultMm, budgets: blockBudgets(c, module, head), budget: Math.round(module * PAGE_MM.height) };
}

const mm = (n: number) => `${Math.round(n * 10) / 10}mm`;

function figsHtml(figs: Figure[]): string {
  if (!figs.length) return "";
  return `<div class="cs-figs">${figs
    .map((f) => {
      const { w, h } = figureMm(f);
      return `<div class="cs-fig" style="width:${mm(w)};height:${mm(h)}" title="${esc(`${FIGURE_LABEL[f.kind]} 자리 — ${f.desc}`)}"><span>${FIGURE_LABEL[f.kind]}</span></div>`;
    })
    .join("")}</div>`;
}

function bodyHtml(b: Composition["blocks"][number], budget: number): string {
  const unit = b.kind === "compare" ? "행" : b.kind === "bullets" || b.kind === "case" ? "줄" : b.kind === "chart" ? "막대" : "칸";
  const kind = `<p class="cs-kind">${esc(shapeName(b.kind, b.variant))}<span> · ${unit} ${b.cells}${budget ? ` · 약 ${Math.round(budget)}mm` : ""}</span></p>`;
  const purpose = b.purpose ? `<p class="cs-purpose">${esc(b.purpose)}</p>` : "";
  return `<div class="cs-body"><div class="cs-text">${kind}${purpose}</div>${figsHtml(b.figures ?? [])}</div>`;
}

/**
 * 블록 상자들(주요사업·경영관리 공용): idx = 그릴 블록 순번(경영관리는 한 절의 블록), budgets = 블록마다 높이 예산(없으면 경영관리 — 상자마다 최소 12mm, 라벨은 이어져도 다시 적음).
 * 묶음은 렌더러와 같은 layoutGroups — 배치가 없는 구성안은 예전과 같은 상자(라벨 행·이어진 라벨·행 끝 막대)
 */
function boxesHtml(all: Composition["blocks"], idx: number[], budgets: number[] | null): string[] {
  const out: string[] = [];
  const blocks = idx.map((i) => all[i]);
  const size = (budget: number) => (budgets ? `height:${mm(Math.max(8, budget || 0))}` : "min-height:12mm");
  for (const g of layoutGroups(blocks)) {
    if (g.type === "stage") out.push(`<div class="cs-stage"><span>${esc(g.label)}</span></div>`);
    const labeled = g.type === "row";
    for (let k = 0; k < g.units.length; k++) {
      const u = g.units[k].map((x) => idx[x]);
      const cont = Boolean(budgets) && labeled && k > 0;
      const label = labeled ? `<div class="cs-label">${cont ? "" : esc(g.label)}</div>` : "";
      const cls = `cs-box${labeled ? "" : " cs-box--full"}${cont ? " cs-cont" : ""}`;
      if (u.length === 2) {
        // 가로 반씩 짝: 한 상자 안 두 칸(높이는 둘 중 큰 예산 — blockBudgets가 둘에 같은 값을 줌)
        out.push(`<div class="${cls} cs-pairbox" style="${size(Math.max(...u.map((j) => budgets?.[j] ?? 0)))}">${label}<div class="cs-pair">${u.map((j) => `<div class="cs-half" data-block="${j}">${bodyHtml(all[j], budgets?.[j] ?? 0)}</div>`).join("")}</div></div>`);
        continue;
      }
      const i = u[0];
      // 행 끝 막대(앞 블록과 라벨이 같은 막대 — 예산 0): 앞 행 오른쪽 42mm 칸으로 붙음
      const nx = g.units[k + 1];
      const chart = budgets && labeled && nx?.length === 1 && all[idx[nx[0]]].kind === "chart" && !budgets[idx[nx[0]]] ? idx[nx[0]] : null;
      const chartHtml = chart !== null ? `<div class="cs-chart" data-block="${chart}">${bodyHtml(all[chart], 0)}</div>` : "";
      out.push(`<div class="${cls}" data-block="${i}" style="${size(budgets?.[i] ?? 0)}">${label}${bodyHtml(all[i], budgets?.[i] ?? 0)}${chartHtml}</div>`);
      if (chart !== null) k++;
    }
  }
  return out;
}

/** 구성안 판면 HTML(.kca-dg-doc 종이 안 — 화면이 REPORT_CSS·SHEET_CSS와 함께 넣음) */
export function compositionSheetHtml(c: Composition, module: number, head: HeadMode = "all"): string {
  const p = sheetParts(c, module, head);
  const heads = head === "all" ? "대상사업 상자 · 실행과제 띠 · 소항목 제목(가.)" : head === "task" ? "실행과제 띠 · 소항목 제목(가.)" : "소항목 제목(가.)";
  // 제목부도 블록처럼 옅은 점선 상자(머리 모드가 task·sub면 그 높이만큼만), 글은 상자 안
  const out: string[] = [`<div class="cs-head" style="height:${mm(p.head)}"><span class="cs-kind">${heads}</span><span class="cs-note">제목부 약 ${Math.round(p.head)}mm</span></div>`];
  out.push(...boxesHtml(c.blocks, c.blocks.map((_, i) => i), p.budgets));
  const shape = RESULT_SHAPE_LABEL[c.resultShape ?? "bullets"];
  out.push(
    `<div class="cs-box cs-result" style="height:${mm(p.result)}"><div class="cs-label">추진성과</div><div class="cs-body"><div class="cs-text"><p class="cs-kind">${esc(shape)}<span> · 약 ${Math.round(p.result)}mm</span></p>${c.results ? `<p class="cs-purpose">${esc(c.results)}</p>` : ""}</div></div></div>`,
  );
  out.push(`<div class="cs-end" style="top:${mm(p.budget)}" aria-hidden="true"><span>판면 끝(${p.budget}mm)</span></div>`);
  return `<div class="kca-dg-doc"><div class="k-paper"><div class="k-frame cs-sheet" aria-label="구성안 판면(블록 높이 예산)">${out.join("")}</div></div></div>`;
}

/**
 * 경영관리 구성안 판면(와이어프레임): 판면 어림·높이 예산이 없어(R4 보류) 블록마다 보통 높이(12mm 이상, 글에 맞춤)로 쌓고,
 * 절이 바뀔 때마다 평가내용·대주제·절 머리 상자를 끼움. 블록 상자마다 data-block(구성안 블록 순번 — 여백 메모 자리)
 */
export function mgSheetHtml(c: Composition): string {
  const out: string[] = [];
  const parts = c.mg?.parts ?? [];
  let ev = -1;
  let th = "";
  for (const part of parts) {
    const heads: string[] = [];
    if (part.evalNo !== ev) heads.push(`평가내용 ${part.evalNo}. ${part.evalTitle || ""}`);
    if (part.evalNo !== ev || `${part.evalNo}.${part.themeNo}` !== th) heads.push(`대주제 ${part.themeNo}. ${part.themeTitle || ""}`);
    ev = part.evalNo;
    th = `${part.evalNo}.${part.themeNo}`;
    if (part.mark) heads.push(`${part.mark}. ${chipTitle(part.title, part.chip)}`);
    const story = part.story ? ` · ${part.story}` : "";
    out.push(`<div class="cs-head" data-part="${esc(part.key)}">${heads.map((h, i) => `<span class="cs-kind">${esc(h.trim())}${i === heads.length - 1 ? `<span>${esc(story)}</span>` : ""}</span>`).join("")}</div>`);
    out.push(...boxesHtml(c.blocks, c.blocks.flatMap((b, i) => (b.at === part.key ? [i] : [])), null));
  }
  return `<div class="kca-dg-doc"><div class="k-paper"><div class="k-frame cs-sheet" aria-label="구성안 판면(경영관리 — 평가내용·대주제·절)">${out.join("")}</div></div></div>`;
}

/** 구성안 판면 모양(REPORT_CSS의 .kca-dg-doc·.k-paper·.k-frame 위에 얹음) — 회색조, mm 단위 */
export const SHEET_CSS = `
.kca-dg-doc .cs-sheet{position:relative;font-family:var(--k-f-label);font-weight:400;letter-spacing:0;word-spacing:0;color:#3b3c3b}
.kca-dg-doc .cs-head{display:flex;flex-direction:column;justify-content:center;gap:0.5mm;min-width:0;overflow:hidden;padding:1mm 2mm;border:0.3mm dashed #b9bab9;background:#f7f7f7}
.kca-dg-doc .cs-head + .cs-box{border-top-width:0.3mm}
.kca-dg-doc .cs-note{font:400 8.5pt/1.3 var(--k-f-label);color:#6b6c6b}
.kca-dg-doc .cs-box{position:relative;display:flex;min-width:0;overflow:hidden;border:0.3mm solid #b9bab9;border-top-width:0;background:#fbfbfb}
.kca-dg-doc .cs-label{flex:0 0 18mm;display:flex;align-items:center;justify-content:center;padding:1mm;text-align:center;word-break:keep-all;background:#eeefee;border-right:0.3mm solid #b9bab9;font:600 9pt/1.3 var(--k-f-label);color:#3b3c3b}
.kca-dg-doc .cs-cont > .cs-label{border-top:0}
.kca-dg-doc .cs-body{flex:1 1 auto;min-width:0;display:flex;gap:2mm;padding:1.5mm 2mm}
.kca-dg-doc .cs-text{flex:1 1 auto;min-width:0}
.kca-dg-doc .cs-kind{margin:0;font:600 9pt/1.35 var(--k-f-label);color:#1b1760}
.kca-dg-doc .cs-kind span{font-weight:400;color:#6b6c6b}
.kca-dg-doc .cs-purpose{margin:0.8mm 0 0;font:400 9pt/1.45 var(--k-f-label);color:#3b3c3b;word-break:keep-all;overflow-wrap:anywhere}
.kca-dg-doc .cs-figs{flex:0 0 auto;display:flex;gap:1.5mm;align-items:flex-start}
.kca-dg-doc .cs-fig{flex:0 0 auto;display:flex;align-items:center;justify-content:center;border:0.3mm dashed #9a9b9a;background:repeating-linear-gradient(45deg,#f1f1f1 0 1.5mm,#e3e3e3 1.5mm 3mm);font:600 8pt/1.2 var(--k-f-label);color:#6b6c6b}
.kca-dg-doc .cs-chart{flex:0 0 ${CHART_COL_MM}mm;min-width:0;display:flex;border-left:0.3mm dashed #b9bab9;background:#f4f4f4}
.kca-dg-doc .cs-result{border-top-width:0.5mm;border-top-color:#7e7f7e;background:#f4f4f4}
.kca-dg-doc .cs-result .cs-label{background:#dcdddc}
.kca-dg-doc .cs-end{position:absolute;left:-3mm;right:-3mm;height:0;border-top:0.4mm dashed #c62828;pointer-events:none}
.kca-dg-doc .cs-stage{display:flex;margin-top:1.5mm;border-bottom:0.5mm solid #4b4c4b}
.kca-dg-doc .cs-stage span{padding:0.4mm 5mm 0.4mm 2mm;background:#4b4c4b;color:#fff;font:600 9pt/1.3 var(--k-f-label);clip-path:polygon(0 0,calc(100% - 2.5mm) 0,100% 100%,0 100%)}
.kca-dg-doc .cs-stage + .cs-box{border-top-width:0.3mm}
.kca-dg-doc .cs-pair{flex:1 1 auto;min-width:0;display:flex;gap:1mm}
.kca-dg-doc .cs-half{flex:1 1 0;min-width:0;display:flex;border-left:0.3mm dashed #b9bab9}
.kca-dg-doc .cs-half:first-child{border-left:0}
.kca-dg-doc .cs-end span{position:absolute;right:0;top:0.6mm;padding:0 1mm;font:600 8pt/1 var(--k-f-label);color:#c62828;background:rgba(255,255,255,0.85)}
`;
