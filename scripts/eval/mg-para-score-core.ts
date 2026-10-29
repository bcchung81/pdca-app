// 경영관리 경평 초안 절(문단)별 채점 — 순수 부분(입출력·AI 호출 없음). 기준은 docs/plan/경평초안-문단품질-루프.md 채점표 A·B·C·D + docs/plan/경평초안-원장채움-수정.md 채점표 v2의 E.
// 점수 = 통과 항목 / 전체 항목. 절 항목(A1~A4·B1~B6·C1~C3·E3·E4)은 절마다, 전체 항목(C4·C5·D1~D5·E1·E2·E5)은 초안마다 한 번 셈.
// v2: A5(칸 채우기)는 E4로 옮김(겹침 제거). E1·E5는 2025 기준값(baseline — mg-fill-baseline.ts)이 있을 때만 셈.
import { z } from "zod";
import { type Block, blockBullets, blockTexts, isGridTable } from "../../lib/reports/blocks.ts";
import { needsIn, stripNeeds } from "../../lib/reports/actuals.ts";
import { hollowBoxes, plainText } from "../../lib/reports/fit.ts";
import { isDateOnly } from "../../lib/reports/text-shape.ts";

export interface ScoreItem {
  id: string;
  pass: boolean;
  detail: string;
}
export type Group = "A" | "B" | "C" | "D" | "E";

/** 채점에 필요한 초안 모양(spec.blocks · spec.mg.at · spec.mg.parts) */
export interface ScoreSpec {
  blocks: Block[];
  at: string[];
  parts: Array<{ key: string; title: string; themeTitle: string; mark: string }>;
}
/** 앱이 저장하는 경고(.meta.json)와 구성안(.outline.json)에서 쓰는 칸 */
export interface ScoreMeta {
  warnings: string[];
  unknownNumbers: unknown[];
  outlineWarnings: string[];
}

export interface SectionScore {
  key: string;
  title: string;
  /** 이 절 블록의 spec.blocks 위치 */
  blockIndexes: number[];
  items: ScoreItem[];
}
export interface CardScore {
  sections: SectionScore[];
  /** 초안 전체 항목(C4·C5·D1~D5) */
  overall: ScoreItem[];
}

const groupOf = (id: string): Group => id[0] as Group;
const short = (s: string, n = 24) => (s.length > n ? `${s.slice(0, n)}…` : s);
const blockName = (b: Block) => b.label || b.kind;
const plain = (s: string) => plainText(s).trim();

// ───────────── A. 서술 충실 ─────────────

/**
 * 구체어 규칙(A4): ① 숫자 ② 「」·‘’·“”·"" 묶음 ③ 영문 대문자로 시작하는 낱말(AI·API·JSON 같은 약어와 영문 고유명사).
 * 한글 고유명사는 판별하지 않음(사전 없이 가리면 추측이 되므로 위 셋만).
 */
export const CONCRETE = /\d|「[^」]+」|‘[^’]+’|“[^”]+”|"[^"]+"|\b[A-Z][A-Za-z0-9]*\b/;

/** A1·A2 불릿 — 추진성과 라벨 블록과 수치 표(값 칸)는 뺌, 인용·말풍선 원문도 뺌(blockBullets) */
function proseBullets(blocks: Block[]): string[] {
  return blocks.filter((b) => b.label !== "추진성과" && !isGridTable(b)).flatMap(blockBullets).map(plain).filter(Boolean);
}

/** A4가 보는 블록 글(라벨·제목은 뺌 — 제목의 인용부호만으로 통과하지 않게) */
function bodyTexts(b: Block): string[] {
  return [b.text, ...b.items, ...b.cells.flatMap((c) => [c.head, c.tag, ...c.bullets, c.note]), ...b.rows.flatMap((r) => [r.key, ...r.before, ...r.after]), ...b.series.map((s) => `${s.label} ${s.value}`), b.badge].map(plain).filter(Boolean);
}

function aItems(blocks: Block[]): ScoreItem[] {
  const bullets = proseBullets(blocks);
  const avg = bullets.length ? bullets.reduce((n, t) => n + [...t].length, 0) / bullets.length : 0;
  const short10 = bullets.filter((t) => [...t].length <= 10);
  const dates = blocks.flatMap(blockBullets).filter(isDateOnly);
  const noConcrete = blocks.filter((b) => b.kind !== "bullets" && b.label !== "추진배경" && !bodyTexts(b).some((t) => CONCRETE.test(t)));
  return [
    { id: "A1", pass: !bullets.length || avg >= 20, detail: bullets.length ? `불릿 ${bullets.length}개 평균 ${avg.toFixed(1)}자(기준 20자 이상)` : "대상 불릿 없음" },
    { id: "A2", pass: short10.length <= bullets.length * 0.1, detail: `10자 이하 ${short10.length}/${bullets.length}개${short10.length ? ` — ${short10.slice(0, 3).map((t) => `「${short(t)}」`).join("·")}` : ""}` },
    { id: "A3", pass: !dates.length, detail: dates.length ? `날짜만 불릿 ${dates.length}개 — ${dates.slice(0, 3).map((t) => `「${short(t)}」`).join("·")}` : "없음" },
    { id: "A4", pass: !noConcrete.length, detail: noConcrete.length ? `구체어 없는 블록: ${noConcrete.map(blockName).join("·")}` : "모든 블록에 구체어 있음" },
  ];
}

// ───────────── C. 틀·구조·시각화 ─────────────

const UNIQUE_KINDS = ["hub", "case", "quotes", "voices", "define", "chart", "compare", "pdca", "strategy", "qa"];
const C1_EXEMPT = ["bullets", "table", "chart", "subhead"];

function cItems(blocks: Block[]): ScoreItem[] {
  const seen = new Map<string, number>();
  for (const b of blocks) if (!C1_EXEMPT.includes(b.kind)) seen.set(b.kind, (seen.get(b.kind) ?? 0) + 1);
  const dup = [...seen].filter(([, n]) => n > 1).map(([k]) => k);
  const visual = blocks.filter((b) => b.kind !== "bullets" && b.kind !== "subhead");
  const unique = blocks.filter((b) => UNIQUE_KINDS.includes(b.kind));
  return [
    { id: "C1", pass: !dup.length, detail: dup.length ? `같은 도식 반복: ${dup.join("·")}` : "반복 없음" },
    { id: "C2", pass: visual.length >= 2, detail: `시각 블록 ${visual.length}개(2개 이상)` },
    { id: "C3", pass: unique.length >= 1, detail: unique.length ? `이 과제만의 요소: ${[...new Set(unique.map((b) => b.kind))].join("·")}` : "이 과제만의 요소 없음" },
  ];
}

const shapeOf = (b: Block) => `${b.kind}:${b.variant}`;

/** C4 — bullets·subhead·band·banner를 뺀 블록의 서로 다른 kind:variant 수 ≥ 그 블록 수의 1/2 */
function c4(blocks: Block[]): ScoreItem {
  const counted = blocks.filter((b) => !["bullets", "subhead", "band", "banner"].includes(b.kind));
  const kinds = new Set(counted.map(shapeOf));
  return { id: "C4", pass: kinds.size >= counted.length / 2, detail: `서로 다른 모양 ${kinds.size}종 / 대상 블록 ${counted.length}개(절반 이상)` };
}

/** C5 — 앱이 뺀 블록 0(구성안 블록 수 > 초안 블록 수, 「막대:」·「뺐습니다」 경고) · 구성안 경고(「구성안:」 앞머리) 없음 */
function c5(meta: ScoreMeta, planBlocks: number | null, draftBlocks: number): ScoreItem {
  const dropped = meta.warnings.filter((w) => w.startsWith("막대:") || /뺐습니다/.test(w));
  const plan = [...meta.warnings, ...meta.outlineWarnings].filter((w) => w.startsWith("구성안:"));
  const lost = planBlocks !== null && planBlocks > draftBlocks ? planBlocks - draftBlocks : 0;
  const why = [dropped.length && `뺀 블록 경고 ${dropped.length}건`, lost && `구성안 ${planBlocks}블록 → 초안 ${draftBlocks}블록`, plan.length && `구성안 경고 ${plan.length}건(${short(plan[0], 40)})`].filter(Boolean);
  return { id: "C5", pass: !why.length, detail: why.length ? why.join(" · ") : "구성안 그대로" };
}

// ───────────── D. 근거·형식 ─────────────

function dItems(blocks: Block[], meta: ScoreMeta, sections: number): ScoreItem[] {
  const count = (head: string) => meta.warnings.filter((w) => w.startsWith(head)).length;
  const needs = blocks.reduce((n, b) => n + blockTexts(b).reduce((m, t) => m + needsIn(t).length, 0), 0);
  const avg = sections ? needs / sections : 0;
  return [
    { id: "D1", pass: meta.unknownNumbers.length === 0, detail: `없는 숫자 ${meta.unknownNumbers.length}개` },
    { id: "D2", pass: count("실적 칸") === 0, detail: `「실적 칸」 경고 ${count("실적 칸")}건` },
    { id: "D3", pass: count("글 모양") === 0, detail: `「글 모양」 경고 ${count("글 모양")}건` },
    { id: "D4", pass: count("분량") === 0, detail: `「분량」 경고 ${count("분량")}건` },
    { id: "D5", pass: avg <= 1, detail: `【확인】 ${needs}개 / 절 ${sections}개 = 절당 ${avg.toFixed(2)}` },
  ];
}

// ───────────── E. 성과·밀도 (v2) ─────────────

/**
 * 수량 토큰 — 단위가 붙은 수(건·개·개소·명·%·점·종·편·회·곳·배·만·억·천·항목·단계·「년 연속」·시간·일·원·社).
 * 「N월 M일」 날짜와 ’25.11 같은 시점 표기는 먼저 빼고, 「6개월」은 개월이라 뺌. 2025 기준값 측정(mg-fill-baseline.ts)과 초안 채점이 같은 함수를 씀.
 */
const QTY_RE = /(\d[\d,]*(?:\.\d+)?)\s*(%p?|퍼센트|개소|개(?!월)|건|명|점(?!검)|종|편|회|곳|배|만|억|천|항목|단계|년\s*연속|시간|일|원|社)/g;
const QTY_DATES = /\d{1,2}월\s*\d{1,2}일|[’']\d{2}(?:\.\d{1,2}){0,2}\.?|\b\d{1,2}\.\s?\d{1,2}\.(?!\d)/g;

export function qtyTokens(text: string): string[] {
  return [...stripNeeds(String(text ?? "")).replace(QTY_DATES, " ").matchAll(QTY_RE)].map((m) => m[0]);
}
/** 같은 수량인지 비교하는 열쇠 — 쉼표·빈칸을 걷고 단위는 첫 글자로 묶음(개소=개, 년 연속=년) */
export function qtyKey(tok: string): string {
  const m = /^(\d[\d,]*(?:\.\d+)?)\s*(.*)$/.exec(tok.trim());
  return m ? `${m[1].replace(/,/g, "")}${m[2].replace(/\s+/g, "").replace("퍼센트", "%").slice(0, 1)}` : tok;
}
/** 성과 줄 — 수량 토큰이나 전환(→·↑↓·⇒)·Zero 표기가 든 줄 */
export const isPerfLine = (line: string) => qtyTokens(line).length > 0 || /[→↑↓⇒]|\bZero\b/.test(stripNeeds(line));

/** 닫는 「추진성과」 라벨 블록의 줄: 불릿 + 칸(칸 불릿, 없으면 머리) + 전후 행 */
export function closingLines(blocks: Block[]): string[] {
  return blocks
    .filter((b) => b.label === "추진성과")
    .flatMap((b) => [...b.items, ...b.cells.map((c) => (c.bullets.length ? c.bullets.join(" ") : c.head)), ...b.rows.map((r) => `${r.key} ${r.before.join(" ")} → ${r.after.join(" ")}`)])
    .map(plain)
    .filter(Boolean);
}

/** 2025 보고서 기준값(mg-fill-baseline.ts 산출) — 지표 id(MG-N)별 */
export interface Baseline {
  metrics: Record<string, { qtyPerPage: number | null; perfPerSection: number | null }>;
}

export interface ScoreOptions {
  baseline?: Baseline | null;
  /** 지표 id(MG-N) — baseline 열쇠 */
  metric?: string | null;
  /** 초안 쪽 수 어림(높이 어림 mm ÷ 판면 높이) */
  pages?: number | null;
  /** 원장 올해 성과 줄(정량 성과 칸 + 월별 실적) — 없으면 E2를 셈하지 않음 */
  ledger?: string[] | null;
}

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- 카드 JSON(모양이 열려 있음)

const ITEM_HEAD = /^[∙·•\-－○◦▪□■◆※*]/;
const cellText = (c: Json) => (Array.isArray(c?.lines) ? c.lines.join(" ") : typeof c?.text === "string" ? c.text : "").trim();

/**
 * E2의 원장 성과 줄(2026-10-29 범위 확정):
 *  ① 카드 정량 성과 칸(outcome.quantitative) 전체 — 글머리 없는 줄은 앞 항목에 붙이고, 「예정·예상·목표」가 든 항목만 뺌
 *  ② 월별 실적(do.monthly[].items) — 글 항목은 그대로, 표 항목(item.table.rows)은 머리 행(th) 글에 「예정」이 든 열을 뺀 칸 글
 * (actuals.ts outcomeActualItems(wide)는 증감 낱말·시점 조건이 있어 좁아서 쓰지 않음)
 */
export function ledgerLines(card: Json): string[] {
  const out: string[] = [];
  const quant: string[] = [];
  for (const raw of Array.isArray(card?.outcome?.quantitative) ? card.outcome.quantitative : []) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const line = raw.trim().replace(/‘(?=\d{2})/g, "’");
    if (quant.length && !ITEM_HEAD.test(line)) quant[quant.length - 1] += ` ${line}`;
    else quant.push(line);
  }
  out.push(...quant.filter((l) => !/예정|예상|목표/.test(l)));
  for (const m of Array.isArray(card?.do?.monthly) ? card.do.monthly : []) {
    for (const it of Array.isArray(m?.items) ? m.items : []) {
      if (typeof it === "string") {
        out.push(it);
        continue;
      }
      const planCols = new Set<number>();
      for (const row of Array.isArray(it?.table?.rows) ? it.table.rows : []) {
        let col = 0;
        for (const c of Array.isArray(row) ? row : []) {
          const span = Math.max(1, Number(c?.colspan) || 1);
          if (c?.th) {
            if (/예정/.test(cellText(c))) for (let k = 0; k < span; k++) planCols.add(col + k);
          } else if (!planCols.has(col) && cellText(c)) out.push(cellText(c));
          col += span;
        }
      }
    }
  }
  return out;
}

export const E1_RATIO = 0.7;
export const E2_RATIO = 0.8;
const PLAN_WORD = /예정|계획/g;

function eSection(blocks: Block[], at: string[]): ScoreItem[] {
  const plans = blocks.flatMap(bodyTexts).reduce((n, t) => n + (t.match(PLAN_WORD)?.length ?? 0), 0);
  const hollow = hollowBoxes(blocks, at);
  return [
    { id: "E3", pass: plans <= 1, detail: `본문 「예정·계획」 ${plans}곳(1곳 이하)` },
    { id: "E4", pass: !hollow.length, detail: hollow.length ? `빈 칸 ${hollow.length}곳: ${hollow.slice(0, 4).map((x) => `[${x.where}] ${x.used}/${x.most}줄`).join(" · ")}` : "빈 칸 없음" },
  ];
}

function eOverall(blocks: Block[], o: ScoreOptions, sections: number): ScoreItem[] {
  const out: ScoreItem[] = [];
  const draftText = blocks.flatMap(blockTexts).join("\n");
  const base = (o.metric && o.baseline?.metrics[o.metric]) || null;
  if (base?.qtyPerPage != null && o.pages && o.pages > 0) {
    const n = qtyTokens(draftText).length;
    const per = n / o.pages;
    const need = base.qtyPerPage * E1_RATIO;
    out.push({ id: "E1", pass: per >= need, detail: `쪽당 수량 토큰 ${per.toFixed(1)}개(${n}개 / 약 ${o.pages.toFixed(2)}쪽) — 2025 ${base.qtyPerPage.toFixed(1)}의 70% = ${need.toFixed(1)} 이상` });
  }
  if (o.ledger) {
    const want = new Set(o.ledger.flatMap(qtyTokens).map(qtyKey));
    const have = new Set(qtyTokens(draftText).map(qtyKey));
    const used = [...want].filter((k) => have.has(k)).length;
    const miss = [...want].filter((k) => !have.has(k));
    out.push({ id: "E2", pass: !want.size || used / want.size >= E2_RATIO, detail: want.size ? `원장 수량 ${want.size}개 중 ${used}개 사용(${((used / want.size) * 100).toFixed(0)}%, 80% 이상)${miss.length ? ` — 미사용 ${miss.slice(0, 6).join("·")}` : ""}` : "원장 수량 토큰 없음" });
  }
  // E5 — 기준값(2025 절 평균 = 성과 줄 합 ÷ 추진성과 행 수)과 같은 집계: 초안의 닫는 추진성과 성과 줄 합 ÷ 초안 절 수.
  // 2025·경영관리는 중간 절이 추진성과 없이 끝나고 대주제 마지막 절이 닫는 관례라 절마다 보면 구조상 실패하므로 초안 전체 항목 하나로 봄
  if (base?.perfPerSection != null && sections > 0) {
    const perf = closingLines(blocks).filter(isPerfLine).length;
    const per = perf / sections;
    out.push({ id: "E5", pass: per >= base.perfPerSection, detail: `닫는 추진성과 성과 줄 ${perf}개 / 절 ${sections}개 = 절당 ${per.toFixed(2)}(2025 절 평균 ${base.perfPerSection.toFixed(2)} 이상)` });
  }
  return out;
}

// ───────────── 카드 하나 ─────────────

export function scoreCard(spec: ScoreSpec, meta: ScoreMeta, planBlocks: number | null = null, opts: ScoreOptions = {}): CardScore {
  const sections: SectionScore[] = spec.parts.map((p) => {
    const blockIndexes = spec.blocks.flatMap((_, i) => (spec.at[i] === p.key ? [i] : []));
    const blocks = blockIndexes.map((i) => spec.blocks[i]);
    return { key: p.key, title: p.title || p.themeTitle, blockIndexes, items: [...aItems(blocks), ...cItems(blocks), ...eSection(blocks, blockIndexes.map((i) => spec.at[i]))] };
  });
  const overall = [c4(spec.blocks), c5(meta, planBlocks, spec.blocks.length), ...dItems(spec.blocks, meta, spec.parts.length), ...eOverall(spec.blocks, opts, spec.parts.length)];
  return { sections, overall };
}

// ───────────── B. CLI 심사 ─────────────

export const JUDGE_IDS = ["B1", "B2", "B3", "B4", "B5", "B6"] as const;
export const JudgeAnswer = z.object({
  items: z.array(z.object({ id: z.string(), pass: z.boolean(), quote: z.string(), why: z.string() })),
  core: z.string(),
});
export type JudgeAnswer = z.infer<typeof JudgeAnswer>;

export const judgeJsonSchema = {
  type: "object",
  properties: {
    items: { type: "array", items: { type: "object", properties: { id: { type: "string", enum: [...JUDGE_IDS] }, pass: { type: "boolean" }, quote: { type: "string" }, why: { type: "string" } }, required: ["id", "pass", "quote", "why"], additionalProperties: false } },
    core: { type: "string" },
  },
  required: ["items", "core"],
  additionalProperties: false,
};

/** 심사 답을 B1~B6 항목으로: 6개가 정확히 한 번씩 있어야 함(아니면 null — 재시도). 근거 인용이 빈 「예」는 「아니오」 */
export function judgeItems(raw: unknown): ScoreItem[] | null {
  const p = JudgeAnswer.safeParse(raw);
  if (!p.success) return null;
  const by = new Map(p.data.items.map((i) => [i.id, i]));
  if (p.data.items.length !== JUDGE_IDS.length || JUDGE_IDS.some((id) => !by.has(id))) return null;
  return JUDGE_IDS.map((id) => {
    const i = by.get(id)!;
    const quoted = i.quote.trim().length > 0;
    const core = id === "B5" ? ` · 핵심: ${p.data.core.trim()}` : "";
    return { id, pass: i.pass && quoted, detail: `${i.pass && !quoted ? "(근거 인용 없음 → 아니오) " : ""}${i.why.trim()}${i.quote.trim() ? ` — 「${short(i.quote.trim(), 60)}」` : ""}${core}` };
  });
}

/** 심사 실패(재시도 뒤에도) — 점수에서 빼지 않고 실패로 셈 */
export const judgeFailed = (why: string): ScoreItem[] => JUDGE_IDS.map((id) => ({ id, pass: false, detail: `심사 실패 — ${short(why, 80)}` }));

/** 심사 요청에 넣는 절 블록 평문(블록마다 [라벨] 종류:모양) */
export function sectionPlainText(blocks: Block[]): string {
  return blocks
    .map((b, i) => {
      const rows = b.rows.flatMap((r) => [`${r.key}: 전 ${r.before.join(" / ")} → 후 ${r.after.join(" / ")}`]);
      const cells = b.cells.map((c, k) => `  ${k + 1}) ${[c.head, c.tag].filter(Boolean).join(" ")}${c.bullets.length ? `: ${c.bullets.map(plain).join(" / ")}` : ""}${c.note ? ` (${plain(c.note)})` : ""}`);
      const lines = [b.title && `제목: ${plain(b.title)}`, b.text && plain(b.text), ...b.items.map((t) => `- ${plain(t)}`), ...cells, ...rows, ...b.series.map((s) => `${s.label}: ${s.value}`), b.badge && `표지: ${b.badge}`].filter(Boolean);
      return `### 블록 ${i + 1} [${b.label || "전폭"}] ${shapeOf(b)}\n${lines.join("\n")}`;
    })
    .join("\n\n");
}

// ───────────── 합계·보고서 ─────────────

export interface Subtotal {
  pass: number;
  total: number;
}
export interface Totals {
  A: Subtotal;
  B: Subtotal;
  C: Subtotal;
  D: Subtotal;
  E: Subtotal;
  all: Subtotal;
}

/** 소계 — judged가 false면 B는 항목 자체가 없으므로 0/0 */
export function totalsOf(sections: Array<{ items: ScoreItem[] }>, overall: ScoreItem[]): Totals {
  const t: Totals = { A: { pass: 0, total: 0 }, B: { pass: 0, total: 0 }, C: { pass: 0, total: 0 }, D: { pass: 0, total: 0 }, E: { pass: 0, total: 0 }, all: { pass: 0, total: 0 } };
  for (const i of [...sections.flatMap((s) => s.items), ...overall]) {
    for (const k of [groupOf(i.id), "all"] as const) {
      t[k].total++;
      if (i.pass) t[k].pass++;
    }
  }
  return t;
}

const pct = (s: Subtotal) => (s.total ? `${s.pass}/${s.total} (${((s.pass / s.total) * 100).toFixed(1)}%)` : "—");

export interface CardReport {
  card: string;
  sections: SectionScore[];
  overall: ScoreItem[];
}

export function scoreMarkdown(cards: CardReport[], judged: boolean): string {
  const out = ["# 경영관리 경평 초안 절별 채점", "", judged ? "B(CLI 심사) 포함." : "B(CLI 심사) 없음 — 결정론 A·C·D·E만.", "", "| 카드 | A | B | C | D | E | 합계 |", "|---|---|---|---|---|---|---|"];
  const fails: string[] = [];
  for (const c of cards) {
    const t = totalsOf(c.sections, c.overall);
    out.push(`| ${c.card} | ${pct(t.A)} | ${pct(t.B)} | ${pct(t.C)} | ${pct(t.D)} | ${pct(t.E)} | ${pct(t.all)} |`);
    for (const s of c.sections) for (const i of s.items) if (!i.pass) fails.push(`- ${i.id} ${c.card} 절 ${s.key}「${short(s.title, 20)}」 — ${i.detail}`);
    for (const i of c.overall) if (!i.pass) fails.push(`- ${i.id} ${c.card} 전체 — ${i.detail}`);
  }
  out.push("", "## 실패 항목", "", ...(fails.length ? fails : ["- 없음"]), "");
  return out.join("\n");
}
