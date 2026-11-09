// 경평 초안 갈래 점검 C1~C3(순수, 2026-11-09 — docs/plan/경평초안-프레임워크-확장-계획.md P2). 주요사업 집필 verifySection·다시 점검 recheckSection이 부름.
// 글은 고치지 않고 경고 한 줄씩만 냄 — 자동 고치기 사유(shouldFix·composeIssues)·점수에는 넣지 않음. 앞머리 등급은 warning-levels.ts WARNING_HEADS.
//  C1 「번호 일치」(참고): ⑰ 핵심키워드 연결형 — 개요 칸(❶❷❸ + 키워드)과 뒤 블록 라벨·행 머리, ④ 현장 목소리형 — 말풍선 → 다음 표 행 1:1,
//     ① 단계 전개형 — 단계 칸 이름과 뒤 블록의 같은 번호 머리(교육 자료 교16 「단계 이름 = 세부 실적 이름」)
//  C2 「갈래 수」(참고): ⑱ 문제·원인별 해결형 — 원인 칸 수 = 조치 표 행 수 = 추진성과 갈래 수
//  C3 「로드맵 계획」(막힘): 로드맵 표(table:roadmap)의 계획 열 수치가 추진성과·결과 줄에 실적처럼 다시 나옴 — 틀과 상관없이
// C1·C2는 소항목의 주 틀(spec.story)이 대상 틀일 때만 봄. 경영관리 초안(spec.mg)은 보지 않음.

import { PLAN_BAR } from "./actuals.ts";
import { type Block, type BlockCell, roadmapCols } from "./blocks.ts";
import { planMarker, refMonthOf, resultLines } from "./result-plan.ts";
import type { ReportSectionSpec } from "./section.ts";

// ---------------------------------------------------------------------------
// 번호 표지

/** 번호 표지 갈래: 흰 동그라미(①·➀ — 같은 모양이라 한 갈래)·검은 동그라미(❶·➊)·단계(Step N·N단계). 갈래가 다른 번호는 서로 대조하지 않음(갈래 행 안의 하위 단계 ①②③을 개요 ❶❷❸과 섞지 않게) */
type Family = "white" | "black" | "step";

/** 머리 글의 번호 표지 — n = 번호(1부터), mark = 표지 글자 그대로, rest = 표지 뒤 글(키워드). 표지가 없으면 null */
export function markerOf(text: string): { n: number; family: Family; mark: string; rest: string } | null {
  const t = text.trim();
  const cp = t.codePointAt(0) ?? 0;
  const circled = (from: number, size: number, family: Family) => (cp >= from && cp < from + size ? { n: cp - from + 1, family, mark: String.fromCodePoint(cp), rest: t.slice(1).trim() } : null);
  const hit = circled(0x2460, 20, "white") ?? circled(0x2780, 10, "white") ?? circled(0x2776, 10, "black") ?? circled(0x278a, 10, "black");
  if (hit) return hit;
  const step = /^(?:step\s?(\d{1,2})|(\d{1,2})\s?단계)(?![\d가-힣])\s*[.:)]?\s*/i.exec(t);
  return step ? { n: Number(step[1] ?? step[2]), family: "step", mark: step[0].trim().replace(/[.:)]$/, ""), rest: t.slice(step[0].length).trim() } : null;
}

/** 칸의 번호 표지: 머리에 없으면 칩(tag — 「Step 1」)의 번호 + 머리 글(키워드) */
function cellMarker(c: BlockCell) {
  const head = markerOf(c.head);
  if (head) return head;
  const tag = markerOf(c.tag);
  return tag ? { ...tag, rest: tag.rest || c.head.trim() } : null;
}

/** 키워드 비교용 글: 괄호 속을 걷고 빈칸·문장부호를 뺌 */
const keyOf = (s: string) => s.replace(/\([^)]*\)|（[^）]*）/g, "").replace(/[\s·・･,.:;!?()（）[\]「」『』“”"'‘’\-–—~∼/]/g, "");

/** 같은 키워드: 둘 중 하나가 비었거나(번호만 적음) 한쪽이 다른 쪽을 품음(라벨은 10자 안팎이라 개요 키워드를 줄여 씀) */
export function sameKeyword(a: string, b: string): boolean {
  const x = keyOf(a);
  const y = keyOf(b);
  return !x || !y || x.includes(y) || y.includes(x);
}

interface Mark {
  n: number;
  family: Family;
  mark: string;
  rest: string;
}

/** 블록 하나의 번호 머리: 라벨·행 머리(rows[].key)·칸 머리(cells[].head·칩) */
function blockMarks(b: Block): Mark[] {
  const out: Mark[] = [];
  const add = (m: Mark | null) => {
    if (m) out.push(m);
  };
  add(markerOf(b.label));
  for (const r of b.rows) add(markerOf(r.key));
  for (const c of b.cells) add(cellMarker(c));
  return out;
}

const blockName = (b: Block) => b.label || b.title || "개요";
const cut = (s: string, n = 14) => (s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * 개요 칸 번호 ↔ 뒤 블록 번호 머리 대조. full = 번호 빠짐·개요에 없는 번호도 봄(⑰), 아니면 같은 번호의 키워드만(① — 뒤 블록이 단계를 다시 부르지 않는 초안이 흔함)
 */
function overviewIssue(blocks: Block[], isOverview: (b: Block) => boolean, full: boolean, fix: string): string | null {
  // 라벨에 번호가 붙은 블록은 갈래 행(그 안 칸 번호는 하위 단계)이라 개요가 아님
  const at = blocks.findIndex((b) => isOverview(b) && !markerOf(b.label) && b.cells.filter((c) => cellMarker(c)).length >= 2);
  if (at < 0) return null;
  const head = blocks[at].cells.map(cellMarker).filter((m): m is Mark => m !== null);
  const family = head[0].family;
  const own = new Map<number, Mark>();
  for (const m of head) if (m.family === family && !own.has(m.n)) own.set(m.n, m);
  const later = blocks.slice(at + 1).flatMap(blockMarks).filter((m) => m.family === family);
  const parts: string[] = [];
  for (const [n, m] of own) {
    const refs = later.filter((x) => x.n === n);
    if (!refs.length) {
      if (full) parts.push(`${m.mark}${m.rest ? ` 「${cut(m.rest)}」` : ""}이(가) 뒤 블록에 없음`);
    } else if (!refs.some((x) => sameKeyword(m.rest, x.rest))) parts.push(`${m.mark} 「${cut(m.rest)}」 ↔ 뒤 「${cut(refs[0].rest)}」`);
  }
  if (full) {
    // 개요에 없는 번호는 뒤 블록 라벨(갈래 행)만 봄 — 갈래 행 안 칸의 하위 단계 번호(①②③④)를 갈래로 잘못 세지 않게
    const labels = blocks.slice(at + 1).map((b) => markerOf(b.label)).filter((m): m is Mark => m !== null && m.family === family);
    const extra = [...new Map(labels.filter((x) => !own.has(x.n)).map((x) => [x.n, x])).values()];
    if (extra.length) parts.push(`${extra.map((x) => x.mark).join("")}는 개요에 없음`);
  }
  if (!parts.length) return null;
  return `번호 일치: 「${cut(blockName(blocks[at]))}」의 번호·이름과 뒤 블록이 어긋남 — ${parts.slice(0, 4).join(" · ")} — ${fix}`;
}

/** ④ 말풍선 → 바로 다음 전후 비교(행)·표(칸 행)가 1:1인가(목소리가 둘 이상일 때만) — 구성안의 칸 수 점검(composition.ts 「목소리–해법」)을 초안 글의 번호까지 넓힘 */
function voiceIssues(blocks: Block[]): string[] {
  const out: string[] = [];
  blocks.forEach((b, i) => {
    const next = blocks[i + 1];
    if (b.kind !== "voices" || b.cells.length < 2 || !next || (next.kind !== "compare" && next.kind !== "table")) return;
    const heads = next.kind === "compare" ? next.rows.map((r) => r.key) : next.cells.map((c) => c.head);
    if (!heads.length) return;
    if (heads.length !== b.cells.length) {
      out.push(`번호 일치: 말풍선 ${b.cells.length}개와 다음 「${cut(blockName(next))}」 ${heads.length}행이 1:1이 아닙니다 — 목소리마다 해법 행 하나로 맞춥니다.`);
      return;
    }
    const voice = b.cells.map(cellMarker);
    const fixes = heads.map(markerOf);
    if (voice.some((m) => !m)) return; // 말풍선에 번호를 안 단 초안은 칸 수만 봄
    // 번호 값만 맞춤(①과 ➊처럼 표지 모양만 다른 것은 같은 번호로 봄 — 바로 다음 블록이라 하위 단계와 섞일 일이 없음)
    const same = voice.every((m, k) => fixes[k]?.n === m!.n);
    if (!same) out.push(`번호 일치: 말풍선 ${voice.map((m) => m!.mark).join("")}과 다음 「${cut(blockName(next))}」 행 머리 ${fixes.map((m) => m?.mark ?? "(번호 없음)").join("")}의 번호가 다릅니다 — 목소리와 같은 번호로 해법 행을 잇습니다.`);
  });
  return out;
}

/** C1 번호·머리 이름 일치(참고) */
export function numberLinkWarnings(spec: ReportSectionSpec): string[] {
  const blocks = spec.blocks ?? [];
  if (spec.mg || !blocks.length) return [];
  if (spec.story === "핵심키워드 연결형") {
    const w = overviewIssue(blocks, (b) => b.kind !== "voices", true, "개요 칸의 번호·키워드와 갈래 행 라벨을 같게 맞춥니다");
    return w ? [w] : [];
  }
  if (spec.story === "단계 전개형") {
    const w = overviewIssue(blocks, (b) => b.kind === "steps" || b.kind === "timeline", false, "단계 이름과 세부 실적 이름을 같게 맞춥니다");
    return w ? [w] : [];
  }
  if (spec.story === "현장 목소리형") return voiceIssues(blocks);
  return [];
}

// ---------------------------------------------------------------------------
// C2 원인 = 조치 = 성과 갈래 수

/** 조치 블록 라벨(「원인별 조치」는 원인 낱말이 있어도 조치 쪽) */
const ACTION_LABEL = /조치|대응|해결|대책/;
const filled = (c: BlockCell) => Boolean(c.head.trim() || c.bullets.some((x) => x.trim()));

/** 조치 표의 행 수: 전후 비교(diag 등)는 rows, 표는 cells(행). 행이 없으면 null */
function actionRows(b: Block): number | null {
  const n = b.kind === "compare" ? b.rows.length : b.kind === "table" ? b.cells.filter(filled).length : 0;
  return n > 0 ? n : null;
}

/** C2(참고): ⑱ 문제·원인별 해결형 — 원인 칸(라벨 원인·문제인 첫 칸 블록, 없으면 첫 cards) · 그 뒤 조치 표(라벨 조치·대응·해결·대책, 없으면 첫 표·전후 비교) · 추진성과(3칸이면 칸 수, 아니면 불릿 수) */
export function branchCountWarning(spec: ReportSectionSpec): string | null {
  const blocks = spec.blocks ?? [];
  if (spec.mg || spec.story !== "문제·원인별 해결형") return null;
  let ci = blocks.findIndex((b) => /원인|문제/.test(b.label) && !ACTION_LABEL.test(b.label) && b.cells.some(filled));
  if (ci < 0) ci = blocks.findIndex((b) => b.kind === "cards" && b.cells.some(filled));
  if (ci < 0) return null;
  const cause = blocks[ci];
  const rest = blocks.slice(ci + 1);
  const action = rest.find((b) => ACTION_LABEL.test(b.label) && actionRows(b) !== null) ?? rest.find((b) => (b.kind === "table" || b.kind === "compare") && actionRows(b) !== null);
  const results = (spec.resultCards ?? []).length >= 2 ? (spec.resultCards ?? []).length : spec.results.filter((x) => x.trim()).length;
  const counts: Array<[number, string]> = [[cause.cells.filter(filled).length, `원인 ${cause.cells.filter(filled).length}개(「${cut(blockName(cause))}」)`]];
  if (action) counts.push([actionRows(action)!, `조치 ${actionRows(action)}행(「${cut(blockName(action))}」)`]);
  if (results) counts.push([results, `추진성과 ${results}갈래`]);
  if (counts.length < 2 || counts.every(([n]) => n === counts[0][0])) return null;
  return `갈래 수: ${counts.map(([, s]) => s).join("·")}가 다릅니다 — 원인마다 조치 한 행·성과 한 갈래로 맞춥니다(근거에 없는 갈래는 지어내지 않음)`;
}

// ---------------------------------------------------------------------------
// C3 로드맵 계획 열

interface Figure {
  num: string;
  unit: string;
  at: number;
  end: number;
  raw: string;
}

/** 글의 수치(수 + 단위 첫 글자). 한 자리 정수·연월일(’27·2027년·27년·11월)은 뺌 — 열 머리 연도·건수 1~9는 대조하지 않음(section.ts numberTokens와 같은 결) */
export function figuresOf(text: string): Figure[] {
  const out: Figure[] = [];
  for (const m of text.matchAll(/(?<![’'‘\d.,])(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s?(%|[가-힣]{1,2})?/g)) {
    const num = `${m[1].replace(/,/g, "")}${m[2] ?? ""}`;
    const unit = (m[3] ?? "").slice(0, 1);
    if (!m[2] && m[1].length === 1) continue;
    if (/[년월일]/.test(unit)) continue;
    out.push({ num, unit, at: m.index, end: m.index + m[0].length, raw: m[0].trim() });
  }
  return out;
}

/** 같은 수치: 수가 같고 단위 첫 글자가 같거나 한쪽에 단위가 없음 */
const sameFigure = (a: Figure, b: Figure) => a.num === b.num && (a.unit === b.unit || !a.unit || !b.unit);

/**
 * C3(막힘): 로드맵 표의 계획 열(roadmapCols의 plan 열 + 머리에 목표·계획·예상·전망이 든 열 — PLAN_BAR) 값의 수치가
 * 추진성과·결과 줄(result-plan.ts resultLines + 다른 블록 칸의 결과 줄 note)에 실적처럼 나오면 한 줄. 같은 로드맵의 계획 아닌 열에도 있는 수치는 빼고,
 * 그 수치 앞뒤 8자에 목표·계획 낱말(PLAN_BAR)이 있거나 줄에 계획 표지(planMarker — 예정·할 계획·아직 안 온 시점)가 있으면 계획이라 밝힌 줄로 봄
 */
export function roadmapPlanWarning(spec: ReportSectionSpec, today?: string): string | null {
  const blocks = spec.blocks ?? [];
  const roads = blocks.filter((b) => b.kind === "table" && b.variant === "roadmap");
  if (spec.mg || !roads.length) return null;
  const others = blocks.filter((b) => !roads.includes(b));
  const lines = [...new Set([...resultLines({ ...spec, blocks: others }), ...others.flatMap((b) => b.cells.map((c) => c.note.trim()))].filter(Boolean))];
  const ref = refMonthOf(today);
  const hitFigures = new Map<string, string>();
  const hitLines: string[] = [];
  const planHeads: string[] = [];
  let name = "";
  for (const b of roads) {
    const { plan } = roadmapCols(b.items, b.year);
    const cols = b.items.slice(1).map((h, k) => plan[k] || PLAN_BAR.test(h));
    if (!cols.some(Boolean)) continue;
    const planFigs = b.cells.flatMap((c) => c.bullets.flatMap((v, k) => (cols[k] ? figuresOf(v) : [])));
    const restFigs = [...b.cells.flatMap((c) => [c.head, ...c.bullets.filter((_, k) => !cols[k])]), b.title, b.text].flatMap(figuresOf);
    const own = planFigs.filter((f) => !restFigs.some((r) => sameFigure(f, r)));
    if (!own.length) continue;
    for (const line of lines) {
      if (planMarker(line, ref)) continue;
      let hit = false;
      for (const f of figuresOf(line)) {
        if (!own.some((p) => sameFigure(p, f))) continue;
        if (PLAN_BAR.test(line.slice(Math.max(0, f.at - 8), f.end + 8))) continue;
        hitFigures.set(`${f.num}${f.unit}`, f.raw);
        hit = true;
      }
      if (hit && !hitLines.includes(line)) hitLines.push(line);
    }
    if (hitLines.length && !name) {
      name = blockName(b);
      planHeads.push(...b.items.slice(1).filter((_, k) => cols[k]));
    }
  }
  if (!hitLines.length) return null;
  const figs = [...hitFigures.values()].slice(0, 4).join("·");
  const shown = hitLines.slice(0, 2).map((l) => `「${cut(l, 30)}」`).join(" / ");
  return `로드맵 계획: 「${cut(name)}」 표의 계획 열(${planHeads.map((h) => cut(h, 10)).join("·")}) 수치 ${figs}가 실적 줄에 실적처럼 나옴(${shown}) — 올해 확인한 실적만 쓰거나 계획·목표라고 밝혀 주세요`;
}

/** 집필·다시 점검에 넣는 갈래 점검 경고 전부(C1·C2 참고, C3 막힘). 해당 없으면 빈 배열 */
export function branchWarnings(spec: ReportSectionSpec, today?: string): string[] {
  return [...numberLinkWarnings(spec), branchCountWarning(spec), roadmapPlanWarning(spec, today)].filter((x): x is string => Boolean(x));
}
