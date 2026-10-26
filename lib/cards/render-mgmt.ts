// 경영관리 과제관리카드 렌더러 — 칸 8개(과제명·부서·관리자/작성자 · 과제개요 · 전년도 환류 · 지적 및 개선방안 · 추진내용 · 계량 성과지표 · 추진성과)를 양식 순서대로 그리고
// 글줄·칸마다 JSON 경로(data-p)를 답니다. 화면은 원본 한글 배치(cards.layout)로 그리는 것이 원칙(금기 3)이고, 이 렌더러는 ① 편집 칸 목록(경로·글)을 뽑아 원본 배치와 잇고
// ② 배치가 없을 때의 임시 보기(`original_html`)를 만드는 데 씁니다. 줄·표·체크 상자·계량 성과지표·추진내용·추진성과는 주요사업 렌더러의 부품을 그대로 씁니다.

import { Ctx, type RenderOptions, esc, plainLabel, renderDo, renderKpi, renderLines, renderOutcome, renderOverview, sec } from "./render.ts";
import type { LooseJson } from "../loose-json.ts";

type Json = LooseJson;

function renderHeader(x: Ctx, c: Json): string {
  const tno = c.taskNo
    ? `<span class="kc-tno"${x.fixed("과제번호는 카드를 가리키는 값이라 바꿀 수 없습니다")}>(과제번호 : ${esc(c.indicatorName ? `${c.indicatorName} ${c.taskNo}` : c.taskNo)})</span>`
    : "";
  const form = x.fixed("양식 고정 칸입니다");
  const person = esc(c.manager || "") + (c.writer ? ` / ${esc(c.writer)}` : "");
  return (
    '<table class="kc-hdr" aria-label="과제 기본정보">' +
    '<colgroup><col style="width:84px"><col><col style="width:108px"><col style="width:31%"></colgroup>' +
    `<tbody><tr><td class="kc-k" rowspan="2"${form}>과제명<br>(과제번호)</td>` +
    `<td class="kc-t" rowspan="2"><span class="kc-tt"${x.ed("title")}>${esc(c.title)}</span> ${tno}</td>` +
    `<td class="kc-l"${form}>부서<small>(팀)</small></td><td class="kc-v"${x.ed("deptText")}>${esc(c.deptText || c.department || "")}</td></tr>` +
    `<tr><td class="kc-l"${form}>관리자/작성자</td><td class="kc-v"${x.ed("@person")}>${person}</td></tr></tbody></table>`
  );
}

/** 짝 칸 표(머리 두 칸 + 행마다 [왼쪽 글줄 | 오른쪽 글줄]) — 전년도 환류(자체평가|개선방안)·지적 및 개선방안(지적|개선방안) */
function pairTable(x: Ctx, key: "feedback" | "findings", sides: [string, string], labels: [string, string], sec_: Json): string {
  const hd = sec_?.headers ?? {};
  const rows: Json[] = sec_?.rows ?? [];
  const head =
    '<table class="kc-frm kc-two"><colgroup><col style="width:50%"><col style="width:50%"></colgroup>' +
    `<thead><tr><th scope="col"${x.ed(`${key}.headers.${sides[0]}`)}>${esc(hd[sides[0]] || labels[0])}</th><th scope="col"${x.ed(`${key}.headers.${sides[1]}`)}>${esc(hd[sides[1]] || labels[1])}</th></tr></thead><tbody>`;
  const body = rows.length
    ? rows.map((r, i) => `<tr><td>${renderLines(x, r[sides[0]] ?? [], `${key}.rows.${i}.${sides[0]}`)}</td><td>${renderLines(x, r[sides[1]] ?? [], `${key}.rows.${i}.${sides[1]}`)}</td></tr>`).join("")
    : '<tr><td colspan="2">&nbsp;</td></tr>';
  return `${head}${body}</tbody></table>`;
}

/** 경영관리 카드의 구역 하나를 그림(현행화의 블록 비교용 — 편집 표시 없음). 카드 한 장 전체는 renderMgmtCard */
export type MgmtPart = "header" | "overview" | "feedback" | "findings" | "do" | "kpi" | "outcome";

/** 구역마다 그린 글 조각 — renderMgmtCard와 renderMgmtPart가 같은 곳에서 뽑아 쓴다 */
function mgmtPieces(x: Ctx, c: Json): Record<MgmtPart, () => string> {
  return {
    header: () => renderHeader(x, c),
    overview: () => sec(plainLabel("과제 개요"), renderOverview(x, c.overview)),
    feedback: () => sec(plainLabel("전년도<br>환류"), pairTable(x, "feedback", ["self", "plan"], ["’25년 자체평가", "’26년 개선방안"], c.feedback)),
    findings: () => sec(plainLabel("지적 및<br>개선방안"), pairTable(x, "findings", ["finding", "plan"], ["’25년 지적사항", "’26년 개선방안"], c.findings)),
    do: () => sec(plainLabel("추진내용"), renderDo(x, c.do), "kc-pad"),
    kpi: () => sec(plainLabel("계량<br>성과지표"), renderKpi(x, c.kpi)),
    outcome: () => sec(plainLabel("추진성과"), renderOutcome(x, c.outcome)),
  };
}

export function renderMgmtPart(c: Json, part: MgmtPart): string {
  // 현행화 비교에서 「추진내용」은 월별 실적 상자를 뺀 글(월별 실적은 따로 비교 — 주요사업 renderPart("do")와 같음)
  const card = part === "do" ? { ...c, do: { ...c.do, monthly: [] } } : c;
  return mgmtPieces(new Ctx(false, false, undefined), card)[part]();
}

export function renderMgmtCard(c: Json, opts: RenderOptions = {}): string {
  const x = new Ctx(Boolean(opts.editable), Boolean(opts.selectable), opts.locked);
  const p = mgmtPieces(x, c);
  const body = [p.header(), p.overview(), p.feedback(), p.findings(), p.do(), p.kpi(), p.outcome()];
  return `<div class="kca-card" data-card-id="${esc(c.id)}" lang="ko">\n<article class="kc-card" aria-label="${esc(`${c.taskNo} ${c.title}`)}">${body.join("")}</article>\n</div>\n`;
}
