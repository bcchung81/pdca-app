// 과제관리카드 JSON → kordoc 모양의 마크다운(9.16 양식 15열 격자, 병합 칸 HTML 표). 입출력 없는 순수 함수.
// kordoc markdownToHwpx로 한글(HWPX) 파일을 만들고, 그 파일을 한글에서 고쳐 다시 올리면(현행화) parse.ts가 같은 카드로 읽습니다.
// 격자는 원본(260916 한글 파일의 카드 표, 59장 중 49장이 같은 모양)을 따라 「라벨 1열 + 여백 1열 + 내용 13열」로 두고,
// 칸 나눔도 원본 그대로입니다(과제 구분 3·4·3·3, 계량 구분 2·5·4·2, 계량 머리 4·5·3·1, 전략 4·5·4, 환류·성과 6·7, 월별 1·12).
// cardLayout은 칸마다 역할(role)을 달아 form.ts가 원본 서식(열 너비·테두리·채움·글꼴)과 후처리 정보를 만들게 합니다.
// write.test.ts가 59장 왕복으로 지킵니다.

import { canonicalJson } from "../fixed.ts";
import { parseNationalAgenda } from "./parse.ts";
import type { LooseJson } from "../../loose-json.ts";

const W = 13; // 내용 칸 열 수
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type ImageKey = (img: { src: string | null; kordoc: string }) => string;

export interface WriteOptions {
  /** 맨 위 묶음 표지 — 다시 올릴 때 주요사업을 알아보게. 1칸 표는 kordoc이 문단으로 되읽어서 2칸(「(주요사업1)」 | 이름)으로 둠 */
  group?: { id: string; name: string } | null;
  /** 그림 칸의 src(한글 파일에 넣을 그림 이름). 없으면 kordoc 이름 */
  imageKey?: ImageKey;
}

/** 칸의 역할 — form.ts가 원본 서식을 고르는 열쇠 */
export type CellRole =
  // 머리(과제명·부서·관리자)
  | "titleLabel"
  | "title"
  | "headLabel"
  | "headValue"
  | "headLabel2"
  | "headValue2"
  | "spacerTop"
  // 구역 라벨·여백 열
  | "label"
  | "gap"
  | "pdcaLabel"
  | "pdcaGap"
  // 내용
  | "content"
  | "ovCell"
  | "catFirst"
  | "catMid"
  | "catLast"
  | "header"
  | "underHeader"
  | "kpiData"
  | "doMain"
  | "monthGap"
  | "monthPeriod"
  | "monthItems"
  // 구역 사이 빈 행
  | "spacerLabel"
  | "spacerGap"
  | "spacer"
  // 묶음 표지·AX 붙임
  | "groupId"
  | "groupName"
  | "axBadge"
  | "axTitle"
  | "axLabel"
  | "axContent"
  | "axCheckLabel"
  | "axCheckContent"
  | "axNote";

export type Stage = "act" | "plan" | "do" | "check";

export interface LCell {
  html: string;
  colspan: number;
  rowspan: number;
  tag: "td" | "th";
  role: CellRole;
  /** PDCA 라벨의 단계(채움 색) */
  stage?: Stage;
  /** 전략 연계성 칸(국정과제·ESG·AI활용) — AI활용 항목은 원본처럼 노랗게 */
  hint?: "national" | "esg" | "ai";
}

export interface LTable {
  kind: "group" | "card" | "ax";
  rows: LCell[][];
}

export interface CardLayout {
  tables: LTable[];
}

/** n칸을 total열에 나눠 줌(앞 칸부터 1열씩 더) */
export function spread(n: number, total = W): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const extra = total % n;
  return Array.from({ length: n }, (_, i) => Math.max(1, base + (i < extra ? 1 : 0)));
}

const cell = (html: string, role: CellRole, colspan = 1, rowspan = 1, tag: "td" | "th" = "td", stage?: Stage, hint?: LCell["hint"]): LCell => ({
  html,
  role,
  colspan,
  rowspan,
  tag,
  ...(stage ? { stage } : {}),
  ...(hint ? { hint } : {}),
});

const attrs = (colspan = 1, rowspan = 1) => `${colspan > 1 ? ` colspan="${colspan}"` : ""}${rowspan > 1 ? ` rowspan="${rowspan}"` : ""}`;
const td = (c: LCell) => `<${c.tag}${attrs(c.colspan, c.rowspan)}>${c.html}</${c.tag}>`;

class Writer {
  img: ImageKey;
  constructor(img: ImageKey) {
    this.img = img;
  }

  /** 글줄 목록(글·표·그림) → 칸 안 HTML. 원본처럼 <br>로 잇습니다 */
  lines(lines: LooseJson[] | null | undefined): string {
    const out: string[] = [];
    for (const ln of lines ?? []) {
      if (typeof ln === "string") out.push(esc(ln));
      else if (ln && typeof ln === "object" && "table" in ln) out.push(this.table(ln.table));
      else if (ln && typeof ln === "object" && "image" in ln && ln.image) out.push(`<img src="${esc(this.img(ln.image))}" alt="image">`);
    }
    return out.join("<br>");
  }

  text(s: unknown): string {
    return String(s ?? "")
      .split("\n")
      .map(esc)
      .join("<br>");
  }

  table(t: LooseJson): string {
    const rows = (t?.rows ?? []).map((row: LooseJson[]) => `<tr>${row.map((c) => td(cell(this.lines(c.lines), "content", c.colspan ?? 1, c.rowspan ?? 1, c.th ? "th" : "td"))).join("")}</tr>`);
    return `<table>\n${rows.join("\n")}\n</table>`;
  }

  /** 격자(여러 칸이 좌우로 놓인 구역) → 행들. 라벨 뒤 비는 열은 한 칸으로 채움. labelRows = 라벨이 덮을 행 수(뒤에 월별 상자가 오면 더 큼) */
  grid(label: string, stage: Stage, g: LooseJson, labelRows?: number): LCell[][] {
    const rows: LooseJson[][] = g?.rows ?? [];
    const pad = Math.max(0, 14 - (g?.cols ?? W));
    return rows.map((row, i) => [
      ...(i === 0 ? [cell(label, "pdcaLabel", 1, labelRows ?? rows.length, "td", stage)] : []),
      ...(pad ? [cell("", "pdcaGap", pad)] : []),
      ...row.map((c) => cell(this.lines(c.lines), "content", c.colspan ?? 1, c.rowspan ?? 1)),
    ]);
  }
}

const spacerRow = (): LCell[] => [cell("", "spacerLabel"), cell("", "spacerGap"), cell("", "spacer", W)];
const isR1 = (t: string) => /고도화과제|신규과제|단기과제|중장기과제/.test(t);
/** 원본 칸 나눔(59장 중 대부분). 칸 수가 다르면 고르게 나눔 */
const OVERVIEW_SPANS: Record<number, number[]> = { 4: [3, 4, 3, 3], 2: [7, 6] };
const CATEGORY_SPANS: Record<number, number[]> = { 4: [2, 5, 4, 2] };
const KPI_SPANS: Record<number, number[]> = { 4: [4, 5, 3, 1] };

/** 국정과제 칸 글줄: 저장된 원문이 지금 항목과 맞으면 원문 그대로, 아니면 항목에서 다시(제목 → 표지 줄) */
function nationalLines(s: LooseJson): string[] {
  const items: LooseJson[] = s?.nationalAgenda ?? [];
  const text: string | null = s?.nationalAgendaText ?? null;
  if (text && canonicalJson(parseNationalAgenda(text.split("\n"))) === canonicalJson(items)) return text.split("\n");
  const out: string[] = [];
  for (const it of items) {
    if (it.title) out.push(String(it.title));
    for (const b of it.badges ?? []) out.push(String(b));
  }
  return out;
}

/** 카드 → 표 모델(묶음 표지 · 카드 표 · AX 붙임 표) */
export function cardLayout(card: LooseJson, opts: WriteOptions = {}): CardLayout {
  const w = new Writer(opts.imageKey ?? ((img) => img.kordoc));
  const rows: LCell[][] = [];

  // 과제명·부서·관리자
  const person = [card.manager, card.writer].filter(Boolean).join(" / ");
  const dept = card.deptText || (card.team ? `${card.department ?? ""}(${card.team})` : (card.department ?? ""));
  rows.push(
    [cell("과제명<br>(과제번호)", "titleLabel", 2, 2, "th"), cell(`${esc(card.title)} (과제번호 : ${esc(card.taskNo)})`, "title", 5, 2, "th"), cell("부서(팀)", "headLabel", 3, 1, "th"), cell(esc(dept), "headValue", 5, 1, "th")],
    [cell("관리자/작성자", "headLabel2", 3), cell(esc(person), "headValue2", 5)],
    [cell("", "spacerTop", 15)],
  );

  // 과제 개요: 과제 구분 칸(1행)과 예산·인력 칸(2행)
  const cells: string[] = card.overview?.cells ?? [];
  const ovRows = [cells.filter(isR1), cells.filter((t) => !isR1(t))].filter((r) => r.length);
  ovRows.forEach((r, i) => {
    const spans = OVERVIEW_SPANS[r.length] ?? spread(r.length);
    rows.push([...(i === 0 ? [cell("과제 개요", "label", 1, ovRows.length)] : []), cell("", "gap"), ...r.map((t, j) => cell(esc(t), "ovCell", spans[j]))]);
  });
  if (!ovRows.length) rows.push([cell("과제 개요", "label"), cell("", "gap"), cell("", "content", W)]);
  rows.push(spacerRow());

  // 계량 성과지표: 구분 상자 행 · 머리 행 · 지표 행 · 비고
  const k = card.kpi ?? {};
  const kpiRows: LCell[][] = [];
  if (k.categoriesText) {
    const segs = String(k.categoriesText)
      .split(/(?=[☑□☐])/)
      .map((x) => x.trim())
      .filter(Boolean);
    const spans = CATEGORY_SPANS[segs.length] ?? spread(segs.length);
    kpiRows.push(segs.map((x, j) => cell(esc(x), segs.length === 1 ? "content" : j === 0 ? "catFirst" : j === segs.length - 1 ? "catLast" : "catMid", spans[j])));
  }
  const cols: string[] = k.headers ? (k.columns ?? Object.keys(k.headers)) : [];
  if (cols.length) {
    const spans = KPI_SPANS[cols.length] ?? spread(cols.length);
    kpiRows.push(cols.map((c, j) => cell(esc(k.headers[c]), "header", spans[j])));
    const list: LooseJson[] = k.rows ?? [];
    // 윗행과 병합된 칸(sharedWithPrevious)은 위 칸의 rowspan으로
    const span = list.map(() => cols.map(() => 1));
    for (let i = list.length - 1; i > 0; i--)
      cols.forEach((c, j) => {
        if ((list[i].sharedWithPrevious ?? []).includes(c)) {
          span[i - 1][j] += span[i][j];
          span[i][j] = 0;
        }
      });
    list.forEach((r, i) => {
      const val = (c: string) => (c === "name" ? (r.nameRaw ?? r.name ?? "") : (r[c] ?? ""));
      kpiRows.push(cols.flatMap((c, j) => (span[i][j] ? [cell(w.text(val(c)), "kpiData", spans[j], span[i][j])] : [])));
    });
  }
  if ((k.notes ?? []).length) kpiRows.push([cell(w.lines(k.notes), "content", W)]);
  if (!kpiRows.length) kpiRows.push([cell("", "content", W)]);
  kpiRows.forEach((r, i) => rows.push([...(i === 0 ? [cell("계량 성과지표", "label", 1, kpiRows.length), cell("", "gap", 1, kpiRows.length)] : []), ...r]));
  rows.push(spacerRow());

  // 전략 연계성
  const s = card.strategy ?? {};
  const ai = s.ai ?? {};
  const aiText = `${ai.checked === true ? "☑ " : ai.checked === false ? "□ " : ""}${ai.text ?? ""}`.trim();
  rows.push(
    [cell("전략 연계성", "label", 1, 2), cell("", "gap", 1, 2), cell("국정과제(정부정책) 연계성", "header", 4), cell("ESG 연계성", "header", 5), cell("AI활용(AX 협의체 등)", "header", 4)],
    [cell(w.lines(nationalLines(s)), "underHeader", 4, 1, "td", undefined, "national"), cell(esc(s.esgText ?? ""), "underHeader", 5, 1, "td", undefined, "esg"), cell(w.text(aiText), "underHeader", 4, 1, "td", undefined, "ai")],
  );
  rows.push(spacerRow());

  // [Act] 전년도 환류
  const a = card.act ?? {};
  const actLabel = "[Act]<br>전년도 환류";
  if (!a.headers) rows.push([cell(actLabel, "pdcaLabel", 1, 1, "td", "act"), cell("", "pdcaGap"), cell(w.lines(a.selfAssessment), "content", W)]);
  else if (a.findings === null || a.findings === undefined)
    rows.push(
      [cell(actLabel, "pdcaLabel", 1, 2, "td", "act"), cell("", "pdcaGap", 1, 2), cell(esc(a.headers.self ?? "자체평가"), "header", W)],
      [cell(w.lines(a.selfAssessment), "underHeader", W)],
    );
  else
    rows.push(
      [cell(actLabel, "pdcaLabel", 1, 2, "td", "act"), cell("", "pdcaGap", 1, 2), cell(esc(a.headers.findings ?? "경영평가 지적사항"), "header", 6), cell(esc(a.headers.self ?? "’25년 추진 결과에 대한 자체평가"), "header", 7)],
      [cell(w.lines(a.findings), "underHeader", 6), cell(w.lines(a.selfAssessment), "underHeader", 7)],
    );
  rows.push(spacerRow());

  // [Plan]
  const planLabel = "[Plan]<br>조치 및 개선방향";
  if (card.plan?.grid) rows.push(...w.grid(planLabel, "plan", card.plan.grid));
  else rows.push([cell(planLabel, "pdcaLabel", 1, 1, "td", "plan"), cell("", "pdcaGap"), cell(w.lines(card.plan?.lines), "content", W)]);
  rows.push(spacerRow());

  // [Do] 추진내용 + 월별 실적 상자
  const d = card.do ?? {};
  const monthly: LooseJson[] = d.monthly ?? [];
  const doLabel = "[Do]<br>추진내용";
  if (d.grid) rows.push(...w.grid(doLabel, "do", d.grid, d.grid.rows.length + monthly.length));
  else rows.push([cell(doLabel, "pdcaLabel", 1, 1 + monthly.length, "td", "do"), cell("", "pdcaGap"), cell(w.lines(d.lines), monthly.length ? "doMain" : "content", W)]);
  for (const m of monthly) {
    const period: string[] = m.periodLines?.length ? m.periodLines : m.periodTokens?.length ? m.periodTokens : [m.period ?? ""];
    rows.push([cell("", "monthGap"), cell(period.map(esc).join("<br>"), "monthPeriod"), cell(w.lines(m.items), "monthItems", W - 1)]);
  }
  rows.push(spacerRow());

  // [Check]
  const checkLabel = "[Check]<br>성과점검";
  if (card.check?.grid) rows.push(...w.grid(checkLabel, "check", card.check.grid));
  else rows.push([cell(checkLabel, "pdcaLabel", 1, 1, "td", "check"), cell("", "pdcaGap"), cell(w.lines(card.check?.items), "content", W)]);
  rows.push(spacerRow());

  // 추진성과
  const o = card.outcome ?? {};
  if (!o.headers) rows.push([cell("추진성과", "label"), cell("", "gap"), cell(w.lines(o.quantitative), "content", W)]);
  else
    rows.push(
      [cell("추진성과", "label", 1, 2), cell("", "gap", 1, 2), cell(esc(o.headers.quantitative ?? "정량 성과"), "header", 6), cell(esc(o.headers.qualitative ?? "정성 성과(기대 효과)"), "header", 7)],
      [cell(w.lines(o.quantitative), "underHeader", 6), cell(w.lines(o.qualitative), "underHeader", 7)],
    );

  const tables: LTable[] = [];
  if (opts.group) tables.push({ kind: "group", rows: [[cell(`(${esc(opts.group.id)})`, "groupId", 1, 1, "th"), cell(esc(opts.group.name), "groupName", 1, 1, "th")]] });
  tables.push({ kind: "card", rows });

  // 붙임 · AX 연계과제: 머리 행(AX 연계과제 | 제목) + 과제 목적·항목 행 + 비고.
  // 원본은 머리 표(배지 너비)와 본문 표(라벨 너비)가 따로라 3열(라벨 | 배지 나머지 | 내용)로 두 너비를 함께 맞춤
  for (const ax of card.axAttachments ?? []) {
    const r: LCell[][] = [[cell("AX 연계과제", "axBadge", 2, 1, "th"), cell(esc(ax.title ?? ""), "axTitle", 1, 1, "th")]];
    if (ax.purpose !== null && ax.purpose !== undefined) r.push([cell("과제 목적", "axLabel"), cell(w.text(ax.purpose), "axContent", 2)]);
    for (const sec of ax.sections ?? []) {
      const check = String(sec.heading ?? "").includes("체크리스트");
      r.push([cell(esc(sec.heading), check ? "axCheckLabel" : "axLabel"), cell(w.lines(sec.items), check ? "axCheckContent" : "axContent", 2)]);
    }
    if ((ax.notes ?? []).length) r.push([cell(w.lines(ax.notes), "axNote", 3)]);
    tables.push({ kind: "ax", rows: r });
  }
  return { tables };
}

/** 표 모델 → kordoc 입력 마크다운(HTML 표) */
export function layoutMarkdown(layout: CardLayout): string {
  return `${layout.tables.map((t) => `<table>\n${t.rows.map((r) => `<tr>${r.map(td).join("")}</tr>`).join("\n")}\n</table>`).join("\n\n")}\n`;
}

export function cardToKordocMarkdown(card: LooseJson, opts: WriteOptions = {}): string {
  return layoutMarkdown(cardLayout(card, opts));
}
