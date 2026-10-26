// 경평 초안 「블록 고치기」(순수) — 과제별 초안 미리보기에서 글을 끌어 고르고 「AI 수정 요청」·「질문」을 보내면, 고른 글이 든 블록 하나만
// AI가 요청대로 다시 씁니다(초안 전체는 다시 쓰지 않음 — 사용자 결정 2026-09-27 「블록 단위」). 과제원장 드래그 수정(lib/ai/comments.ts)과 같은 쓰임새,
// 단위는 칸 경로가 아니라 블록(렌더러 data-block 표지 — section-html blockMarks).
// 코드가 맡는 일: 요청 글(블록 JSON·앞뒤 블록·높이·근거), 답 검증(한 블록·원문 없는 인용 버림 — cleanBlocks), 바뀐 칸 수, 초안에 적용.
// 모양 바꾸기(2026-10-12): 요청이 모양을 말하면 AI가 같은 내용을 다른 kind·variant로 다시 쓰고, 「다른 모양으로」는 한 번 호출로 서로 다른 모양 2~3안을 냄 —
// 쓸 수 있는 모양·근거 조건·내용 아닌 필드 보존은 lib/reports/block-shape.ts, 이 파일은 요청 글·답 검증·안 정리.
// AI 지시문은 resources/prompts/report-block/*.md(블록 필드 설명은 report-draft/schema.md의 block.*를 그대로 씀).
// 추진성과 상자(2026-10-13): 블록 목록 밖의 소항목 끝 상자(spec.results·resultBand)도 대상 번호 RESULT_INDEX(-1)로 고치기·질문 — 주요사업 v3 초안만(경영관리는 상자가 없음).
// 답은 전용 스키마(results·band·reply), 카드·막대(resultCards·resultChart)는 보여 주되 고치지 않음.

import { z } from "zod";
import { type Descriptions, type PromptSet, type PromptSpec, described, fillFrom } from "../prompts/template.ts";
import { type Block, type BlockOutput, VARIANTS, blockOutSchema, blockSignature, blockTexts, cleanBlocks, isGridTable } from "./blocks.ts";
import { type ShapeRules, MG_ONLY_SHAPES, blockShapeCode, blockShapeName, shapeAllowed, withContent } from "./block-shape.ts";
import { mgSpecHeight } from "./business-layout.ts";
import { isOwnKind } from "./diagram-hints.ts";
import { canonicalJson } from "../cards/fixed.ts";
import { PAGE_MM, blockWidth, canonicalBlock, figuresWidth, fitLayout, fitReport, hangulPerLine, resultWidth, slotOf } from "./fit.ts";
import { dropLoneSpans } from "./layout.ts";
import { SHAPES, cellRange, clampCells, shapeCode, shapeName, shapeOf } from "./frameworks.ts";
import type { ReportSectionSpec } from "./section.ts";

/** 요청 종류: 고치기(블록을 다시 씀) · 질문(답만, 초안은 그대로) */
export const BLOCK_EDIT_KINDS = { edit: "AI 수정 요청", ask: "질문" } as const;
export type BlockEditKind = keyof typeof BLOCK_EDIT_KINDS;

/** 요청 글 상한(과제원장 코멘트와 같은 크기) */
export const BLOCK_EDIT_LIMITS = { request: 2000, quote: 400 } as const;

export interface BlockEditRequest {
  blockIndex: number;
  kind: BlockEditKind;
  /** 담당자 요청 글 */
  request: string;
  /** 끌어 고른 글(이 블록 안) */
  quote: string;
}

/** 답 필드 — 설명은 resources/prompts/report-block/schema.md(블록 안 필드는 report-draft/schema.md의 block.*). options·why는 「다른 모양으로」 */
export const BLOCK_EDIT_OUT_FIELDS = ["block", "reply", "answer", "options", "why"] as const;

/** 고치기 답: 고친 블록 전체 + 무엇을 바꿨는지. desc = report-block 설명, blockDesc = report-draft 설명(블록 필드) */
export function blockEditSchema(desc?: Descriptions, blockDesc?: Descriptions) {
  const d = <T extends z.ZodType>(s: T, key: (typeof BLOCK_EDIT_OUT_FIELDS)[number]) => described(s, desc, key);
  return z.object({ block: d(blockOutSchema(blockDesc), "block"), reply: d(z.string(), "reply") });
}
/** 질문 답 */
export function blockAskSchema(desc?: Descriptions) {
  return z.object({ answer: described(z.string(), desc, "answer") });
}
/** 「다른 모양으로」 답: 같은 내용을 다른 모양으로 쓴 안(코드가 SHAPE_OPTIONS_MAX개까지 받음 — 개수는 요청 글로 알림) + 한두 줄 */
export function blockShapesSchema(desc?: Descriptions, blockDesc?: Descriptions) {
  const option = z.object({ block: described(blockOutSchema(blockDesc), desc, "block"), why: described(z.string(), desc, "why") });
  return z.object({ options: described(z.array(option), desc, "options"), reply: described(z.string(), desc, "reply") });
}
export type BlockEditOutput = z.infer<ReturnType<typeof blockEditSchema>>;
export type BlockAskOutput = z.infer<ReturnType<typeof blockAskSchema>>;
export type BlockShapesOutput = z.infer<ReturnType<typeof blockShapesSchema>>;

/** 추진성과 고치기 답 필드(주요사업만 — 설명은 report-block/schema.md, reply는 블록 고치기와 같은 설명) */
export const RESULT_EDIT_OUT_FIELDS = ["results", "band"] as const;

/** 추진성과 고치기 답: 고친 추진성과 줄 · 강조 띠(원래 없으면 빈 글) · 무엇을 바꿨는지. 한 값으로 묶는 enum·literal 없음(구조화 출력 파싱 실패 교훈) */
export function resultEditSchema(desc?: Descriptions) {
  return z.object({ results: described(z.array(z.string()), desc, "results"), band: described(z.string(), desc, "band"), reply: described(z.string(), desc, "reply") });
}
export type ResultEditOutput = z.infer<ReturnType<typeof resultEditSchema>>;

/** 블록 고치기 프롬프트 파일에 있어야 하는 절 — 경영관리(report-block-mg: 추진성과 상자가 없어 result 절 없음) */
export const BLOCK_EDIT_MG_PROMPT_SPEC: PromptSpec = { system: ["system"], request: ["edit", "ask", "shapes", "block", "evidence"], schema: BLOCK_EDIT_OUT_FIELDS };
/** 주요사업(report-block) — 경영관리 절 + 추진성과 고치기·질문(result·resultAsk)과 답 필드 */
export const BLOCK_EDIT_PROMPT_SPEC: PromptSpec = { system: ["system"], request: [...BLOCK_EDIT_MG_PROMPT_SPEC.request, "result", "resultAsk"], schema: [...BLOCK_EDIT_OUT_FIELDS, ...RESULT_EDIT_OUT_FIELDS] };

/** 추진성과 상자의 대상 번호(spec.blocks 밖 — 화면 메모·서버 요청·이력 block_index 모두 이 값) */
export const RESULT_INDEX = -1;

/** 추진성과 상자를 고치거나 물을 수 있는 초안: 주요사업 v3이고 상자에 글(추진성과 줄·강조 띠·3칸)이 있을 때 */
export function hasResultBox(spec: ReportSectionSpec): boolean {
  return spec.version === 3 && !spec.mg && Boolean(spec.results?.length || spec.resultBand || spec.resultCards?.length);
}

/** 요청 검사(서버 액션이 받는 값) — 문제면 글, 아니면 정리한 요청 */
export function readBlockEditRequest(raw: unknown, spec: ReportSectionSpec): BlockEditRequest | string {
  const r = (raw ?? {}) as Record<string, unknown>;
  const blocks = spec.blocks ?? [];
  const blockIndex = Number(r.blockIndex);
  const isResult = blockIndex === RESULT_INDEX && hasResultBox(spec);
  if (!isResult && (!Number.isInteger(blockIndex) || blockIndex < 0 || blockIndex >= blocks.length)) return "고른 글이 든 블록을 찾지 못했습니다. 화면을 새로 고친 뒤 다시 골라 주세요.";
  const kind = r.kind === "ask" ? "ask" : r.kind === "edit" ? "edit" : null;
  if (!kind) return "요청 종류가 올바르지 않습니다.";
  const request = String(r.request ?? "").trim().slice(0, BLOCK_EDIT_LIMITS.request);
  if (!request) return "요청 내용을 적어 주세요.";
  const quote = String(r.quote ?? "").trim().slice(0, BLOCK_EDIT_LIMITS.quote);
  return { blockIndex, kind, request, quote };
}

/** 앞뒤 블록 한 줄씩(라벨·종류) — AI가 이 블록의 자리를 알게 */
function around(blocks: Block[], i: number): string {
  const one = (b: Block | undefined, n: number) => (b ? `${n + 1}. [${b.label || "전폭"}] ${blockSignature([b])}` : "");
  return [one(blocks[i - 1], i - 1), `${i + 1}. [${blocks[i].label || "전폭"}] ${blockSignature([blocks[i]])} ← 이 블록`, one(blocks[i + 1], i + 1)].filter(Boolean).join(" / ");
}

/** 칸 글이 있는 블록(칸마다 줄 한도를 셈) — 구성안 글 한도(composition.ts blockLimits)와 같은 목록 */
const CELL_TEXT = new Set<Block["kind"]>(["cards", "steps", "timeline", "hub", "quotes", "voices", "stats", "compare", "qa", "table", "strategy", "pdca"]);
const cellCount = (b: Block) => (b.kind === "compare" ? b.rows.length : b.kind === "bullets" || b.kind === "case" ? b.items.length : b.kind === "chart" ? b.series.length : b.cells.length);

/** 블록 글 한도(결정론): 칸 한 줄 글자 수 · 지금 줄 수(불릿 블록은 불릿 줄 합, 칸 블록은 가장 긴 칸) · 판면 여유 · 늘 수 있는 최대 줄 수 */
export interface BlockRoom {
  unit: "line" | "cell";
  perLine: number;
  now: number;
  max: number;
  /** 예산 − 초안 어림(mm, 음수면 넘침). 경영관리 초안에 배정 쪽수가 없으면 null(여유를 셈하지 않음 — 지금 줄 수 안팎) */
  slack: number | null;
}

/**
 * 고칠 블록의 글 한도 — AI는 높이(mm)를 셈하지 못해 「줄 수를 맞췄다」면서 블록을 키웠음(1-나 연기 시험: 판면 256 → 267mm).
 * 늘 수 있는 줄 = 표준 모양(canonicalBlock)으로 지금 줄 수에서 한 줄씩 늘릴 때 높이 증가가 판면 여유 안인 만큼(넘친 초안이면 늘리지 않음).
 * 경영관리 초안(spec.mg — 2026-10-12): 주요사업 판면(module × 255mm)이 아니라 여유 = 배정 쪽(spec.mg.pages) × 판면 높이 − 경영관리 높이 어림(mgSpecHeight — 절 머리 포함, 사업 조판과 같은 셈).
 * 배정이 없으면 여유를 셈하지 않음(slack null — 지금 줄 수 안팎). 예전에는 절 여러 개 초안에 1쪽 예산을 대 늘 「넘침 — 줄을 늘리지 않음」이 갔음
 */
export function blockRoom(spec: ReportSectionSpec, index: number): BlockRoom | null {
  const b = spec.blocks?.[index];
  if (!b) return null;
  const width = blockWidth(b) - figuresWidth(b);
  const slack = spec.mg ? (spec.mg.pages && spec.mg.pages > 0 ? Math.round(spec.mg.pages * PAGE_MM.height - mgSpecHeight(spec)) : null) : budgetSlack(spec);
  const rowOf = (n: number, lines?: number) => fitReport({ sub: { title: "" }, blocks: [canonicalBlock(b.kind, b.variant, n, b.label, b.figures, lines)], results: [], module: spec.module }).rows[0]?.mm ?? 0;
  const grow = (now: number, mm: (l: number) => number) => {
    let max = now;
    while (slack !== null && slack > 0 && max < now + 4 && mm(max + 1) - mm(now) <= slack) max += 1;
    return max;
  };
  if (b.kind === "bullets" || b.kind === "case") {
    const w = width - (b.kind === "case" ? 12 : 4);
    const now = b.items.reduce((n, x) => n + fitLayout(x, w).lines, 0);
    return { unit: "line", perLine: hangulPerLine(w), now, max: grow(now, (l) => rowOf(l)), slack };
  }
  if (!CELL_TEXT.has(b.kind)) return null;
  const slot = slotOf(b, width);
  const cellLines = b.kind === "compare" ? b.rows.flatMap((r) => [r.before, r.after]) : isGridTable(b) ? b.cells.flatMap((x) => x.bullets.map((v) => [v])) : b.cells.map((x) => x.bullets);
  const now = Math.max(1, ...cellLines.map((xs) => xs.reduce((n, x) => n + fitLayout(x, slot.body).lines, 0)));
  return { unit: "cell", perLine: hangulPerLine(slot.body), now, max: grow(now, (l) => rowOf(cellCount(b), l)), slack };
}

/** 주요사업 판면 여유(예산 − 어림) */
function budgetSlack(spec: ReportSectionSpec): number {
  const fit = fitReport(spec);
  return fit.budget - fit.total;
}

/** 글 한도 한 줄(요청 글) */
export function roomText(r: BlockRoom | null): string {
  if (!r) return "칸 글 한도 없음(짧은 글 블록) — 글 길이를 크게 늘리지 않음";
  const what = r.unit === "line" ? "불릿 줄 합" : "가장 긴 칸";
  if (r.slack === null) return `한 줄 약 ${r.perLine}자 · 지금 ${what} ${r.now}줄 — 지금 줄 수 안팎`;
  const room = r.slack <= 0 ? `초안이 이미 ${-r.slack}mm 넘침 — 지금보다 줄을 늘리지 않음(줄일 수 있으면 줄임)` : r.max > r.now ? `판면 여유 ${r.slack}mm — ${r.unit === "line" ? "불릿 줄 합" : "칸마다"} 최대 ${r.max}줄까지` : `판면 여유 ${r.slack}mm로는 한 줄도 더 못 늘림 — 지금 줄 수 안에서`;
  return `한 줄 약 ${r.perLine}자 · 지금 ${what} ${r.now}줄 · ${room}`;
}

/** 블록 내용 개수(칸·행·줄·막대 — 모양을 바꿀 때 새 모양의 칸 수 어림) */
const contentCount = (b: Block) => Math.max(1, b.kind === "bullets" || b.kind === "case" ? b.items.length : b.kind === "compare" ? b.rows.length : b.kind === "chart" ? b.series.length : b.cells.length);

/**
 * 바꿀 수 있는 모양 목록(요청 글) — 모양마다 칸 수 범위와 새 모양의 칸 폭으로 센 「한 줄 약 N자」(지금 내용 개수를 그 모양 범위로 맞춘 보통 블록으로 blockRoom).
 * 경영관리 전용 표 모양은 주요사업이면 아예 적지 않음(주요사업 프롬프트에 안 보이게). 근거가 없는 이 과제만의 요소는 「쓸 수 없는 모양」에 이유와 함께
 */
export function shapeMenuText(spec: ReportSectionSpec, index: number, rules: ShapeRules): { shapes: string; blocked: string } {
  const b = spec.blocks?.[index];
  if (!b) return { shapes: "없음", blocked: "없음" };
  const cur = blockShapeCode(b);
  const ok: string[] = [];
  const no: string[] = [];
  for (const s of SHAPES) {
    if (s.code === cur || (!rules.mg && MG_ONLY_SHAPES.includes(s.code))) continue;
    const a = shapeAllowed(b, s.kind, s.variant, rules);
    if (!a.ok) {
      if (isOwnKind(s.kind)) no.push(`${s.code} ${s.name}(${a.why.split(" — ").slice(1).join(" — ") || a.why})`);
      continue;
    }
    const n = clampCells(s.kind, s.variant, contentCount(b));
    const probe: ReportSectionSpec = { ...spec, blocks: (spec.blocks ?? []).map((x, i) => (i === index ? canonicalBlock(s.kind, s.variant, n, b.label, b.figures) : x)) };
    const room = blockRoom(probe, index);
    const { min, max } = cellRange(s.kind, s.variant);
    ok.push(`${s.code} ${s.name}(${min === max ? min : `${min}~${max}`}개${room ? ` · 한 줄 약 ${room.perLine}자` : ""})`);
  }
  return { shapes: ok.join(" · ") || "없음", blocked: no.join(" · ") || "없음" };
}

/** 블록 고치기·질문 요청 글 — 근거(카드 글·첨부 전체 글·전년 절·실사 답변)는 초안과 같이 자르지 않음(넘치면 lib/ai/budget.ts가 멈춤). rules가 없으면 모양 바꾸기 없음 */
export function blockEditPrompt(p: PromptSet, spec: ReportSectionSpec, req: BlockEditRequest, evidence: { card: string; extra: string }, rules?: ShapeRules): string {
  const blocks = spec.blocks ?? [];
  const b = blocks[req.blockIndex];
  const menu = rules ? shapeMenuText(spec, req.blockIndex, rules) : { shapes: "없음 — 이 요청은 모양을 바꾸지 않음", blocked: "없음" };
  const r = (key: string, vars: Record<string, string | number> = {}) => fillFrom(p, "request", key, vars);
  return [r(req.kind, { ...headVars(spec, req.blockIndex), quote: req.quote || "(고른 글 없음 — 블록 전체)", request: req.request, ...menu }), "", r("block", { block: JSON.stringify(b) }), "", r("evidence", { card: evidence.card, extra: evidence.extra || "없음" })].join("\n");
}

/** 요청 글 머리 공통 값(소항목·블록 자리·판면·글 한도) */
function headVars(spec: ReportSectionSpec, index: number): Record<string, string | number> {
  const blocks = spec.blocks ?? [];
  const fit = fitReport(spec);
  // 이 블록만 어림한 높이(구성안 블록 높이와 같은 셈 — 라벨 행 안 막대 등은 그 행 기준)
  const row = fitReport({ sub: { title: "" }, blocks: [blocks[index]], results: [], module: spec.module }).rows[0];
  return { title: spec.sub.title, story: spec.story || "—", n: index + 1, total: blocks.length, around: around(blocks, index), fitTotal: fit.total, budget: fit.budget, rowMm: row ? Math.round(row.mm) : "—", room: roomText(blockRoom(spec, index)) };
}

/** 블록 두 개에서 바뀐 글 수(뒤 블록의 글 중 앞 블록에 없던 것) — 고른 부분 밖을 얼마나 고쳤는지 알림 */
export function changedTexts(before: Block, after: Block): number {
  return newTexts(blockTexts(before), blockTexts(after));
}

/** 뒤 글 목록 중 앞 목록에 없던 글 수(같은 글이 여럿이면 개수까지) */
function newTexts(before: string[], after: string[]): number {
  const pool = new Map<string, number>();
  for (const t of before) pool.set(t, (pool.get(t) ?? 0) + 1);
  let changed = 0;
  for (const t of after) {
    const n = pool.get(t) ?? 0;
    if (n > 0) pool.set(t, n - 1);
    else changed += 1;
  }
  return changed;
}

/** 답 블록 검증 결과(모양 바꾸기 포함) — shape = 모양이 바뀌었으면 전후 모양 코드 */
export type ShapedCheck = { ok: true; block: Block; changed: number; dropped: string[]; shape: { from: string; to: string } | null } | { ok: false; why: "content" | "kind" | "shape"; reason: string };

/**
 * 답 블록 한 개 검증(결정론, 고치기·「다른 모양으로」 공용): 블록 정리(cleanBlocks — 모르는 종류·칸 모자람·원문을 못 찾은 인용·말풍선·우수사례·정의는 버림, 표기 통일).
 * rules가 없으면 예전 그대로 같은 종류만 받음. rules가 있으면 모양이 바뀌어도 이 트랙에서 쓸 수 있고 근거 조건을 채운 모양이면 받음(shapeAllowed).
 * - 같은 종류인데 모양(variant)이 목록 밖이면 원래 모양(AI가 모양을 빠뜨린 것 — 바꾸려던 것이 아님)
 * - 표끼리 칸 쓰임이 다른 갈래(값 열 ↔ 불릿 칸)로 바꿔 정리에서 버려지면 원래 표 모양으로 한 번 더(2026-10-12 표 모양 보존과 같은 안전장치)
 * - AI는 지금 모양을 그대로 냈는데 정리가 칸 수 때문에 모양을 바꿨으면(PDCA 4칸 아님 → 단계 흐름 등) 받지 않음 — 요청하지 않은 모양 바꾸기
 * 받은 블록은 원래 블록에서 시작해 내용 필드만 바꿈(withContent — 배치 등 내용 아닌 필드 보존). 라벨은 AI가 비우면 원래 라벨
 */
export function checkBlock(before: Block, out: BlockOutput, line: (s: unknown, max?: number) => string, found: (s: string) => boolean, rules?: ShapeRules): ShapedCheck {
  const clean = (o: BlockOutput) => cleanBlocks([o], line, found);
  if (!rules) {
    // 표 모양은 칸 쓰임이 둘로 갈려(값 열 — 기본·막대·쉐브론 / 불릿 칸 — 추진실적 열·2단 라벨) AI가 모양을 빠뜨리거나 다른 갈래로 바꾸면 칸이 깨짐 — 그때는 원래 모양을 지킴(2026-10-12)
    const keepShape = before.kind === "table" && out?.kind === "table" && (!VARIANTS.table?.includes(String(out.variant)) || isGridTable({ kind: "table", variant: String(out.variant) }) !== isGridTable(before));
    const { blocks, dropped } = clean(keepShape ? { ...out, variant: before.variant } : out);
    const block = blocks[0];
    if (!block) return { ok: false, why: "content", reason: dropped[0] ?? "" };
    if (block.kind !== before.kind) return { ok: false, why: "kind", reason: `${before.kind} → ${block.kind}` };
    return done(before, block, dropped, null);
  }
  const vs = VARIANTS[before.kind];
  const sameKind = out?.kind === before.kind;
  const asked = sameKind && vs && !vs.includes(String(out.variant)) ? { ...out, variant: before.variant } : out;
  let r = clean(asked);
  if (!r.blocks.length && sameKind && before.kind === "table" && asked.variant !== before.variant) r = clean({ ...asked, variant: before.variant });
  const block = r.blocks[0];
  if (!block) return { ok: false, why: "content", reason: r.dropped[0] ?? "" };
  const from = blockShapeCode(before);
  const to = blockShapeCode(block);
  if (to === from) return done(before, block, r.dropped, null);
  if (shapeCode(String(asked.kind), String(asked.variant)) === from) return { ok: false, why: "shape", reason: `칸 수가 「${blockShapeName(before)}」 모양에 맞지 않아 「${blockShapeName(block)}」(으)로 바뀜` };
  const a = shapeAllowed(before, block.kind, block.variant, rules);
  if (!a.ok) return { ok: false, why: "shape", reason: a.why };
  return done(before, block, r.dropped, { from, to });
}

function done(before: Block, cleaned: Block, dropped: string[], shape: { from: string; to: string } | null): ShapedCheck {
  const block = withContent(before, cleaned);
  if (!block.label && before.label) block.label = before.label;
  return { ok: true, block, changed: changedTexts(before, block), dropped, shape };
}

/**
 * 고치기 답 검증: checkBlock을 거쳐 쓸 수 있는 한 블록이어야 받음. rules가 없으면 같은 종류만(예전 그대로 — 연기 시험 등),
 * rules가 있으면 요청대로 바꾼 모양도 받음(근거 없는 이 과제만의 요소·트랙 밖 모양은 이유를 알리고 거절)
 */
export function verifyBlockEdit(before: Block, out: BlockOutput, line: (s: unknown, max?: number) => string, found: (s: string) => boolean, rules?: ShapeRules): { ok: true; block: Block; changed: number; dropped: string[]; shape: { from: string; to: string } | null } | { ok: false; message: string } {
  const r = checkBlock(before, out, line, found, rules);
  if (r.ok) return r;
  if (r.why === "kind") return { ok: false, message: `AI가 블록 종류를 바꿨습니다(${r.reason}). 종류를 바꾸려면 구성안에서 고쳐 주세요.` };
  if (r.why === "shape") return { ok: false, message: `AI가 고른 모양을 쓸 수 없습니다 — ${r.reason}. 요청을 바꿔 다시 보내 주세요.` };
  return { ok: false, message: `고친 블록을 쓸 수 없습니다${r.reason ? ` — ${r.reason}` : "(칸이 모자라거나 형식이 틀림)"}. 요청을 바꿔 다시 보내 주세요.` };
}

// ---------------------------------------------------------------------------
// 「다른 모양으로」(2026-10-12): 같은 내용을 서로 다른 모양 2~3안으로 — 미리보기만(저장은 사람이 한 안을 고른 뒤 따로)

/** 안 수 상한 */
export const SHAPE_OPTIONS_MAX = 3;

export interface BlockShapesRequest {
  blockIndex: number;
  /** 덧붙인 요청 글(비어도 됨) */
  request: string;
  /** 사람이 고른 모양 코드(첫 안을 이 모양으로) — 없으면 AI가 내용 모양에 맞게 고름 */
  want: string | null;
}

/** 「다른 모양으로」 요청 검사 — 고른 모양이 지금 모양과 같거나 이 트랙·근거로 쓸 수 없으면 AI를 부르기 전에 글로 돌려줌 */
export function readBlockShapesRequest(raw: unknown, spec: ReportSectionSpec, rules: ShapeRules): BlockShapesRequest | string {
  const r = (raw ?? {}) as Record<string, unknown>;
  const blocks = spec.blocks ?? [];
  const blockIndex = Number(r.blockIndex);
  if (!Number.isInteger(blockIndex) || blockIndex < 0 || blockIndex >= blocks.length) return "고른 글이 든 블록을 찾지 못했습니다. 화면을 새로 고친 뒤 다시 골라 주세요.";
  const request = String(r.request ?? "").trim().slice(0, BLOCK_EDIT_LIMITS.request);
  const code = String(r.want ?? "").trim();
  if (!code) return { blockIndex, request, want: null };
  const info = shapeOf(code);
  if (!info) return "고른 모양을 찾지 못했습니다.";
  const before = blocks[blockIndex];
  if (code === blockShapeCode(before)) return `지금도 「${info.name}」 모양입니다 — 다른 모양을 골라 주세요.`;
  const a = shapeAllowed(before, info.kind, info.variant, rules);
  return a.ok ? { blockIndex, request, want: code } : `${a.why}.`;
}

/** 「다른 모양으로」 요청 글 — 고치기와 같은 근거·블록 JSON, 머리만 shapes 절 */
export function blockShapesPrompt(p: PromptSet, spec: ReportSectionSpec, req: BlockShapesRequest, evidence: { card: string; extra: string }, rules: ShapeRules): string {
  const b = (spec.blocks ?? [])[req.blockIndex];
  const wantName = req.want ? shapeName(req.want.split(":")[0], req.want.split(":")[1] ?? "") : "";
  const r = (key: string, vars: Record<string, string | number> = {}) => fillFrom(p, "request", key, vars);
  return [
    r("shapes", {
      ...headVars(spec, req.blockIndex),
      ...shapeMenuText(spec, req.blockIndex, rules),
      current: `${blockShapeCode(b)} ${blockShapeName(b)}`,
      count: req.want ? `1~${SHAPE_OPTIONS_MAX}` : `2~${SHAPE_OPTIONS_MAX}`,
      want: req.want ? `${req.want} ${wantName} — 첫 안은 반드시 이 모양` : "정하지 않음 — 내용 모양에 맞는 것을 고름",
      request: req.request || "(덧붙인 요청 없음)",
    }),
    "",
    r("block", { block: JSON.stringify(b) }),
    "",
    r("evidence", { card: evidence.card, extra: evidence.extra || "없음" }),
  ].join("\n");
}

/** 정리한 안 하나 — out은 AI 답 그대로(적용할 때 서버가 같은 검증을 다시 돌림 — 화면이 보낸 블록을 믿지 않음) */
export interface ShapeOption {
  code: string;
  name: string;
  block: Block;
  out: BlockOutput;
  why: string;
  changed: number;
  dropped: string[];
}

/**
 * 「다른 모양으로」 답 정리(결정론): 안마다 checkBlock(고치기와 같은 검증 — 트랙·근거 조건·원문 대조), 지금 모양과 같은 안·앞 안과 같은 모양은 버림,
 * 사람이 고른 모양이 있으면 그 안을 맨 앞으로, SHAPE_OPTIONS_MAX개까지. 버린 안은 이유 글로
 */
export function cleanShapeOptions(before: Block, out: BlockShapesOutput, line: (s: unknown, max?: number) => string, found: (s: string) => boolean, rules: ShapeRules, want: string | null = null): { options: ShapeOption[]; dropped: string[] } {
  const seen = new Set([blockShapeCode(before)]);
  const options: ShapeOption[] = [];
  const dropped: string[] = [];
  for (const o of Array.isArray(out?.options) ? out.options : []) {
    const name = o?.block?.kind ? shapeName(String(o.block.kind), String(o.block.variant ?? "")) : "안";
    const r = checkBlock(before, o.block, line, found, rules);
    if (!r.ok) {
      dropped.push(`「${name}」 안을 뺐습니다 — ${r.reason || "칸이 모자라거나 형식이 틀림"}`);
      continue;
    }
    const code = blockShapeCode(r.block);
    if (seen.has(code)) {
      dropped.push(`「${blockShapeName(r.block)}」 안은 ${code === blockShapeCode(before) ? "지금 모양과" : "앞 안과"} 모양이 같아 뺐습니다.`);
      continue;
    }
    seen.add(code);
    options.push({ code, name: blockShapeName(r.block), block: r.block, out: o.block, why: line(o.why, 160), changed: r.changed, dropped: r.dropped });
  }
  const at = want ? options.findIndex((x) => x.code === want) : -1;
  if (at > 0) options.unshift(...options.splice(at, 1));
  if (want && at < 0) dropped.unshift(`고른 모양(${shapeName(want.split(":")[0], want.split(":")[1] ?? "")}) 안이 없습니다 — 근거가 모자라거나 칸이 맞지 않았을 수 있습니다.`);
  return { options: options.slice(0, SHAPE_OPTIONS_MAX), dropped: [...dropped, ...options.slice(SHAPE_OPTIONS_MAX).map((x) => `「${x.name}」 안은 ${SHAPE_OPTIONS_MAX}안을 넘어 뺐습니다.`)] };
}

/** 초안에 블록 하나를 바꿔 넣음(사람이 고친 블록 번호를 spec.humanEdits에 남김 — 다시 만들기 전 경고). 모양이 바뀌어 짝을 잃은 「가로 반씩」 표시는 지움(layout.ts dropLoneSpans) */
export function applyBlockEdit(spec: ReportSectionSpec, index: number, block: Block): ReportSectionSpec {
  const blocks = (spec.blocks ?? []).map((b, i) => (i === index ? { ...block } : { ...b }));
  dropLoneSpans(blocks, spec.mg?.at);
  const humanEdits = [...new Set([...(spec.humanEdits ?? []), index])].sort((a, b) => a - b);
  return { ...spec, blocks, humanEdits };
}

// ---------------------------------------------------------------------------
// 추진성과 상자 고치기(2026-10-13): 대상 번호 RESULT_INDEX — 고치는 것은 추진성과 줄(results)과 강조 띠(resultBand, 원래 있을 때만)뿐

/** 추진성과 상자 중 고치는 칸(이력 before·after도 이 모양) */
export interface ResultBox {
  results: string[];
  resultBand: string;
}

/** 추진성과 줄 상한(초안 집필 정리와 같음 — section.ts verifySection cleanList(out.results, 3, 200)) · 강조 띠 글자 상한(resultExtras와 같음) */
export const RESULT_LIMITS = { lines: 3, line: 200, band: 24 } as const;

/** 초안의 지금 추진성과 칸 */
export function resultBoxOf(spec: ReportSectionSpec): ResultBox {
  return { results: [...(spec.results ?? [])], resultBand: spec.resultBand ?? "" };
}

/** 추진성과 고치기·질문 요청 글 — 머리는 result·resultAsk 절, 근거는 블록 고치기와 같은 evidence 절. 카드·막대는 보여 주되 고치지 않음 */
export function resultEditPrompt(p: PromptSet, spec: ReportSectionSpec, req: BlockEditRequest, evidence: { card: string; extra: string }): string {
  const fit = fitReport(spec);
  const extras = { chart: (spec.resultChart?.series.length ?? 0) >= 2, band: spec.resultBand || "" };
  const box = { results: spec.results ?? [], resultBand: spec.resultBand ?? "", resultCards: spec.resultCards ?? [], resultChart: spec.resultChart ?? null };
  const r = (key: string, vars: Record<string, string | number> = {}) => fillFrom(p, "request", key, vars);
  return [
    r(req.kind === "ask" ? "resultAsk" : "result", {
      title: spec.sub.title,
      story: spec.story || "—",
      fitTotal: fit.total,
      budget: fit.budget,
      perLine: hangulPerLine(resultWidth(extras)),
      lines: RESULT_LIMITS.lines,
      band: spec.resultBand ? `있음(「${spec.resultBand}」 — 고친 글은 ${RESULT_LIMITS.band}자 안)` : "없음 — 새로 만들지 않음(band는 빈 글)",
      result: JSON.stringify(box),
      quote: req.quote || "(고른 글 없음 — 추진성과 전체)",
      request: req.request,
    }),
    "",
    r("evidence", { card: evidence.card, extra: evidence.extra || "없음" }),
  ].join("\n");
}

/**
 * 추진성과 고치기 답 검증(결정론): 줄은 RESULT_LIMITS.lines줄·줄당 RESULT_LIMITS.line자까지(빈 줄 버림, 0줄이면 거절),
 * 강조 띠는 원래 있을 때만 고친 글(RESULT_LIMITS.band자 — AI가 비우면 원래 띠), 없던 띠는 만들지 않음. 바뀐 글 수는 changedTexts와 같은 셈
 */
export function verifyResultEdit(before: ResultBox, out: ResultEditOutput, line: (s: unknown, max?: number) => string): { ok: true; box: ResultBox; changed: number; dropped: string[] } | { ok: false; message: string } {
  const all = (Array.isArray(out?.results) ? out.results : []).map((x) => line(x, RESULT_LIMITS.line)).filter(Boolean);
  if (!all.length) return { ok: false, message: "고친 추진성과가 비었습니다. 요청을 바꿔 다시 보내 주세요." };
  const dropped: string[] = [];
  if (all.length > RESULT_LIMITS.lines) dropped.push(`추진성과는 ${RESULT_LIMITS.lines}줄까지라 뒤 ${all.length - RESULT_LIMITS.lines}줄을 뺐습니다.`);
  const band = line(out?.band, RESULT_LIMITS.band);
  if (!before.resultBand && band) dropped.push("없던 강조 띠는 만들지 않습니다.");
  const box: ResultBox = { results: all.slice(0, RESULT_LIMITS.lines), resultBand: before.resultBand ? band || before.resultBand : "" };
  const texts = (b: ResultBox) => [...b.results, b.resultBand].filter(Boolean);
  return { ok: true, box, changed: newTexts(texts(before), texts(box)), dropped };
}

/** 초안에 추진성과 칸을 바꿔 넣음(사람이 고친 블록 표시 humanEdits에는 넣지 않음 — 추진성과 직접 고치기와 같게). 띠가 비면 칸을 지움 */
export function applyResultEdit(spec: ReportSectionSpec, box: ResultBox): ReportSectionSpec {
  const next: ReportSectionSpec = { ...spec, results: [...box.results] };
  if (box.resultBand) next.resultBand = box.resultBand;
  else delete next.resultBand;
  return next;
}

/** 추진성과 고치기를 되돌릴 수 있는지: 그 뒤 추진성과가 또 바뀌지 않았을 때만(지금 칸 = 그 고치기의 after) */
export function resultUndoable(spec: ReportSectionSpec, after: unknown): boolean {
  return canonicalJson(resultBoxOf(spec)) === canonicalJson(after);
}
