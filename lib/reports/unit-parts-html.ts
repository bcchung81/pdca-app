// 경영관리 지표 단위 카드 밖 부분 → 미리보기 HTML(결정론, 순수 — 모든 글 이스케이프). 종이 위 장 순서: 표지 표 → 지적사항 조치실적 3열 표 →
// 전년 대비 주요 추진실적(평가내용 띠 + 3열 표) → 성과분석 및 환류(계량·비계량·향후 개선계획 표). Ⅲ(세부평가내용별)은 과제별 초안 자리라 그리지 않음.
// 장 제목·열 이름·연도는 unit-parts-mg.ts unitPartsLabels 한 곳. 클래스는 보고서 CSS(REPORT_CSS — 띠 k-biz·대주제 k-task·절 k-sub·표 k-t·자리표시 k-need)를 쓰고
// 새 모양만 UNIT_PARTS_CSS(section-css.ts)에. 달성률·비고 쪽은 그릴 때 계산한 값(kpiRate·findingRemark)을 씀. 비어 있는 AI 칸은 점선 빈 칸으로.

import { type CoverPart, type FindingsPart, type OutcomePart, type PriorPart, type UnitPartsMg, kpiRate, unitPartsLabels } from "./unit-parts-mg.ts";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 글 한 조각: 이스케이프 + 【확인: …】 → 노란 칸(보고서 렌더러와 같은 k-need) */
const tx = (s: string) => esc(String(s ?? "")).replace(/【확인:\s*([^】]{1,200})】/g, '<span class="k-need" title="담당자 확인 — 채울 자료">$1</span>');

/** 비어 있는 칸(AI·사람이 채울 자리) */
const EMPTY = '<span class="k-up-empty" title="아직 비어 있는 칸 — AI 문장 채우기 또는 사람이 씀">채울 칸</span>';

/** 불릿 칸: 비어 있으면 빈 칸 표시 */
const bullets = (items: string[]) => (items.length ? `<ul>${items.map((x) => `<li>${tx(x)}</li>`).join("")}</ul>` : EMPTY);

const cols = (widths: number[]) => `<colgroup>${widths.map((w) => `<col style="width:${w}%">`).join("")}</colgroup>`;
const head = (names: string[]) => `<thead><tr>${names.map((n) => `<th scope="col">${esc(n)}</th>`).join("")}</tr></thead>`;

export interface UnitPartsHtmlOptions {
  /** 지적 행 id → 비고(「p.74」 — findingRemark로 그릴 때 계산한 값). 없으면 빈 칸 */
  remarks?: Record<string, string>;
  /** 화면 표시(「원문 다름」 꼬리표) — 내려받기·조판에서는 끔 */
  marks?: boolean;
}

function coverHtml(p: CoverPart, labels: ReturnType<typeof unitPartsLabels>): string {
  const L = labels.cover;
  const many = p.code.components.length > 1;
  const comps = p.code.components.map((c) => {
    const criteria = c.criteria.length ? `<ul>${c.criteria.map((x, i) => `<li>${String(i + 1).padStart(2, "0")} ${tx(x)}</li>`).join("")}</ul>` : EMPTY;
    const weight = c.weight !== null ? `${c.weight}점` : "【확인: 가중치】";
    return `${many ? `<p class="k-up-cap">${esc(p.code.indicator)} · ${esc(c.label)}</p>` : ""}<table class="k-t k-up k-up--cover">${cols([16, 34, 16, 34])}<tbody><tr><th scope="row">${esc(L.method)}</th><td class="c">${esc(c.method)}</td><th scope="row">${esc(L.weight)}</th><td class="c">${tx(weight)}${c.weightBasis ? `<br><span class="k-small">(${esc(c.weightBasis)})</span>` : ""}</td></tr><tr><th scope="row">${esc(L.definition)}</th><td colspan="3">${c.definition ? tx(c.definition) : EMPTY}</td></tr><tr><th scope="row">${esc(L.criteria)}</th><td colspan="3">${criteria}${c.note ? `<p class="k-small">${tx(c.note)}</p>` : ""}</td></tr></tbody></table>`;
  });
  const contacts = p.human.contacts.length ? p.human.contacts.map((r) => `<tr>${[r.role, r.name, r.phone, r.email].map((x) => `<td class="c">${x ? esc(x) : EMPTY}</td>`).join("")}</tr>`).join("") : `<tr>${L.contacts.map(() => `<td class="c">${EMPTY}</td>`).join("")}</tr>`;
  return `<p class="k-biz"><span class="k-biz__no">${esc(p.code.indicator)}</span></p>${comps.join("")}<table class="k-t k-up">${cols([20, 20, 25, 35])}${head(L.contacts)}<tbody>${contacts}</tbody></table>`;
}

function findingsHtml(p: FindingsPart, labels: ReturnType<typeof unitPartsLabels>, opts: UnitPartsHtmlOptions): string {
  const L = labels.findings;
  const body = p.rows.length
    ? p.rows
        .map((r) => {
          const flag = opts.marks && r.code.differs ? `<span class="k-up-flag" title="카드 지적 행 글이 '25 평가위원 지적 원문과 많이 다름 — 원문과 대조">원문 다름</span>` : "";
          return `<tr><td>${bullets(r.code.finding)}${flag}</td><td>${bullets(r.ai.actions)}</td><td class="c">${esc(opts.remarks?.[r.id] ?? "")}</td></tr>`;
        })
        .join("")
    : `<tr><td colspan="3" class="c">${EMPTY}</td></tr>`;
  return `<h3 class="k-up-ch">${esc(L.title)}</h3><table class="k-t k-up">${cols([44, 44, 12])}${head(L.cols)}<tbody>${body}</tbody></table>`;
}

function priorHtml(p: PriorPart, labels: ReturnType<typeof unitPartsLabels>): string {
  const L = labels.prior;
  const evals = p.rows.map(
    (r) =>
      `<p class="k-biz"><span class="k-biz__no">${esc(L.evalLabel(r.code.evalNo))}</span><span>${esc(r.code.title)}</span></p><table class="k-t k-up">${cols([34, 33, 33])}${head(L.cols)}<tbody><tr><td>${bullets(r.human.upTo)}</td><td>${bullets(r.ai.now)}</td><td>${bullets(r.ai.effect)}</td></tr></tbody></table>`,
  );
  return `<h3 class="k-up-ch">${esc(L.title)}</h3>${evals.join("")}`;
}

function outcomeHtml(p: OutcomePart, labels: ReturnType<typeof unitPartsLabels>): string {
  const L = labels.outcome;
  const K = L.kpiCols;
  const on = p.kpi.filter((k) => k.human.checked);
  const kpiRows = on.length
    ? on
        .map((k) => {
          const actual = k.code.actual.trim();
          return `<tr><td class="c">${esc(k.code.name)}${k.code.unit ? `<span class="k-small">(${esc(k.code.unit)})</span>` : ""}</td><td class="n">${tx(k.code.prev)}</td><td class="n">${tx(k.code.target)}</td><td class="n">${actual ? tx(actual) : tx("【확인: 실적 미입력】")}</td><td class="n">${actual ? tx(kpiRate(k).text) : ""}</td><td>${bullets(k.ai.analysis)}</td></tr>`;
        })
        .join("")
    : `<tr><td colspan="6" class="c">${EMPTY}</td></tr>`;
  const kpi = `<table class="k-t k-up">${cols([20, 11, 11, 11, 10, 37])}<thead><tr><th scope="col" rowspan="2">${esc(K.name)}</th><th scope="col" rowspan="2">${esc(K.prev)}</th><th scope="colgroup" colspan="3">${esc(K.year)}</th><th scope="col" rowspan="2">${esc(K.analysis)}</th></tr><tr><th scope="col">${esc(K.target)}</th><th scope="col">${esc(K.actual)}</th><th scope="col">${esc(K.rate)}</th></tr></thead><tbody>${kpiRows}</tbody></table>`;
  const qual = `<table class="k-t k-up">${cols([24, 38, 38])}${head(L.qualCols)}<tbody>${p.qual.map((r) => `<tr><td class="c">${esc(r.human.label)}</td><td>${bullets(r.ai.result)}</td><td>${bullets(r.ai.analysis)}</td></tr>`).join("")}</tbody></table>`;
  const plan = `<table class="k-t k-up">${cols([24, 38, 38])}${head(L.planCols)}<tbody>${p.plan.map((r) => `<tr><td class="c">${esc(r.human.label)}</td><td>${bullets(r.ai.self)}</td><td>${bullets(r.ai.plan)}</td></tr>`).join("")}</tbody></table>`;
  const theme = (no: number, title: string) => `<h4 class="k-task"><span class="k-task__no">${no}</span><span class="k-task__t">${esc(title)}</span></h4>`;
  return `<h3 class="k-up-ch">${esc(L.title)}</h3>${theme(1, L.theme1)}<h5 class="k-sub">${esc(L.kpiTitle)}</h5>${kpi}<h5 class="k-sub">${esc(L.qualTitle)}</h5>${qual}${theme(2, L.theme2)}${plan}`;
}

/** 장(부분) 하나의 조각 — 없는 부분이면 빈 글. 사업 조판(R5d)이 장마다 쪽에 끼울 때 씀 */
export function unitPartChapterHtml(p: UnitPartsMg, key: "cover" | "findings" | "prior" | "outcome", opts: UnitPartsHtmlOptions = {}): string {
  const labels = unitPartsLabels(p.year, p.unit);
  if (key === "cover") return p.cover ? coverHtml(p.cover, labels) : "";
  if (key === "findings") return p.findings ? findingsHtml(p.findings, labels, opts) : "";
  if (key === "prior") return p.prior ? priorHtml(p.prior, labels) : "";
  return p.outcome ? outcomeHtml(p.outcome, labels) : "";
}

/** 종이 안 본문(.k-frame 안에 넣는 조각) — 있는 부분만 장 순서대로 */
export function unitPartsBodyHtml(p: UnitPartsMg, opts: UnitPartsHtmlOptions = {}): string {
  return (["cover", "findings", "prior", "outcome"] as const).map((k) => unitPartChapterHtml(p, k, opts)).filter(Boolean).join("\n");
}

/** 화면 미리보기: 종이(170mm 판면) 안 카드 밖 부분. CSS는 REPORT_CSS + UNIT_PARTS_CSS를 함께 둠 */
export function unitPartsHtml(p: UnitPartsMg, opts: UnitPartsHtmlOptions = {}): string {
  return `<div class="kca-dg-doc"><div class="k-paper"><div class="k-frame">${unitPartsBodyHtml(p, opts)}</div></div></div>`;
}
