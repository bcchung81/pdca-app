// 경평 초안 「구성안」(순수) — 재료표 → 구성안 → 사람 승인 → 집필의 가운데 단계(구현 계획 2단계, 2026-09-27 로드맵 P2).
// 한 번의 AI 호출이 자료 해석·짜임·집필을 한꺼번에 하던 것을 나눠, 사람이 짜임을 보고 고친 뒤 집필합니다.
// 사람이 고칠 수 있는 것(2026-09-28 사용자 결정 — 9.27 「새 블록·새 글 없음」을 바꿈): 블록 순서·빼기·더하기·복제, 도식(AI 추천·대안·짜임 사전 전체 —
// 근거 없는 이 과제만의 요소는 막음), 라벨·목적·칸 수·재료·블록 메모, 이야기 틀, 그림 자리(빼기·종류), 추진성과 모양, 메모.
// 사람이 쓴 라벨·목적·메모는 집필에 주는 지시일 뿐 근거가 아님(숫자 대조·원문 대조는 그대로).
// 코드가 맡는 일: 구성안 정리·재료 원문 대조, 블록 목록의 판면 어림(fit.ts canonicalBlock — 칸을 채운 보통 모양), 블록마다 높이 예산,
// 집필 요청 글(승인된 구성안), 집필 초안이 구성안 짜임을 따랐는지. AI 지시문은 resources/prompts/report-outline/*.md·report-draft/request.md plan.*

import { z } from "zod";
import { type Descriptions, type PromptSet, type PromptSpec, described, fillFrom } from "../prompts/template.ts";
import { BLOCK_KINDS, type Block, type BlockKind, FIGURE_KINDS, FIGURE_LABEL, FIGURE_POS, FIGURE_SIZES, type Figure, MAIN_STORIES, type MainStory, STORIES, type Story, VARIANTS, cleanFigures, isGridTable, isPanelCompare } from "./blocks.ts";
import { type HeadMode, PAGE_MM, blockAreaMm, blockWidth, canonicalBlock, figuresWidth, fitLayout, fitReport, hangulPerLine, isBoxBlock, slotOf, stageHeadMm } from "./fit.ts";
import { type BlockLayout, type BlockSpan, LAYOUT_LABEL, dropLoneSpans, layoutFields, layoutGroups } from "./layout.ts";
import { type Availability, BIZ_RETIRED_SHAPES, BIZ_RETIRED_WHY, SHAPES, clampCells, defaultCells, frameworkOf, matchName, shapeAvailability, shapeCode, shapeName, storyLabel } from "./frameworks.ts";
import { bizVarietyIssue, isOwnKind } from "./diagram-hints.ts";
import { type SiblingCard, type SiblingLayout, cleanLine, numberTokens, quoteFoundIn, readSection } from "./section.ts";
import type { MgOutlineMeta } from "./mg-types.ts";
import type { OutlineFrame } from "./framework-pick.ts";
import { type SplitSibling, cleanSplit, matchAxis } from "./split-axes.ts";
import type { LooseJson } from "../loose-json.ts";

type Json = LooseJson;

/** 재료 종류: 사실·수치·원문 인용·사례(수상·보도)·자료 필요(근거에 없어 담당자가 채울 것) */
export const MATERIAL_KINDS = ["fact", "figure", "quote", "case", "need"] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];
export const MATERIAL_LABEL: Record<MaterialKind, string> = { fact: "사실", figure: "수치", quote: "인용", case: "사례", need: "자료 필요" };

export interface Material {
  /** m1, m2 … (블록이 가리키는 번호) */
  id: string;
  kind: MaterialKind;
  /** 재료 한 줄(사실·수치는 근거에 적힌 그대로) */
  text: string;
  /** 시점(’25년·’26.8 등) */
  when: string;
  /** 어디서(카드 칸·첨부 이름·전년 절·평가 근거) */
  source: string;
  /** 근거 원문 구절(자료 필요는 빈 글) */
  quote: string;
  /** 앱이 근거 원문에서 구절을 찾았는지 */
  found: boolean;
}

export interface PlanBlock {
  kind: BlockKind;
  variant: string;
  /** 왼쪽 라벨(이야기 단계 이름) — 비면 전폭 */
  label: string;
  /** 이 블록이 보여 줄 것 한 줄 */
  purpose: string;
  /** 칸·행·줄 수(종류마다 — 칸 도식은 칸 수, 전후 비교는 행 수, 불릿은 줄 수) */
  cells: number;
  /** 담을 재료 번호 */
  materials: string[];
  figures: Figure[];
  /** 담당자 메모(이 블록에 바라는 점 — 집필 요청에 그대로) */
  memo?: string;
  /** 사람이 더했거나 고친 블록(집필 요청에 「담당자가 고른 블록」, 다시 만들기 전 확인) */
  by?: "human";
  /** AI가 처음 추천한 모양(사람이 바꿔도 남음 — 「AI 추천」 칩·근거 조건). 사람이 더한 블록은 없음 */
  ai?: { kind: BlockKind; variant: string };
  /** AI가 함께 낸 대안 모양 0~2개와 이유 */
  alts?: PlanAlt[];
  /** 경영관리: 이 블록이 놓이는 절 열쇠(Composition.mg.parts[].key) — 주요사업은 없음 */
  at?: string;
  /** 배치(lib/reports/layout.ts — 2026-10-12): 없음 = 라벨 사다리, full = 전폭, stage = 단 띠. 집필 초안 블록으로 그대로 옮김(applyPlanLayout) */
  layout?: BlockLayout;
  /** 폭: half = 다음 블록과 가로 반씩(짝이 없으면 정리 때 지움) */
  span?: BlockSpan;
}

/** 블록 대안 모양(같은 재료로 그릴 수 있는 다른 도식) */
export interface PlanAlt {
  kind: BlockKind;
  variant: string;
  why: string;
}

/** 추진성과 모양(주 모양 하나 — 위첨자 비교·강조 띠는 곁들임): 불릿 1~3개 · 3칸 · 불릿 + 막대 */
export const RESULT_SHAPES = ["bullets", "cards", "chart"] as const;
export type ResultShape = (typeof RESULT_SHAPES)[number];
export const RESULT_SHAPE_LABEL: Record<ResultShape, string> = { bullets: "불릿", cards: "3칸", chart: "불릿 + 막대" };

export interface Composition {
  version: 1;
  /** 핵심 메시지 한 문장 */
  message: string;
  /** 평가 논점 2~3 */
  points: string[];
  /** 주 틀(뼈대). 옛 구성안은 「섞음」일 수 있음 */
  story: Story | "";
  /** 보조 틀(한 행·한 블록만 빌려 오는 틀 — 2026-10-09 섞음 대신). 없으면 주 틀 하나 */
  subStory?: MainStory;
  /** 이 틀을 고른 이유 */
  storyWhy: string;
  /** 차선 틀과 이유 */
  alternative: string;
  blocks: PlanBlock[];
  /** 추진성과 방향 한 줄 */
  results: string;
  /** 추진성과 모양(이 기능 전 구성안은 없음 → 불릿) */
  resultShape?: ResultShape;
  materials: Material[];
  /** 사람 메모(다시 만들기·집필에 함께 보냄) */
  memo: string;
  /** 만들 때의 쪽 모듈(판면 어림·높이 예산 — 화면이 다시 셈) */
  module?: number;
  /** 만들 때의 머리 모드(사업 단위 조판 — 목차 순서로 앞 과제와 같은 대상사업·실행과제면 머리를 뺀 예산). 이 기능 전 구성안은 없음 = all */
  head?: HeadMode;
  /** 만들 때 쓴 근거(카드 전용 자료·보고서 추가자료 id·전년 절 키) — 승인 뒤 집필이 같은 근거를 씀 */
  sources?: { card: string[]; report: string[]; prior: string[] };
  /** 경영관리: 평가내용 → 대주제 → 절 골격(블록은 PlanBlock.at으로 절에 놓임, lib/reports/mg-outline.ts). 주요사업은 없음 */
  mg?: MgOutlineMeta;
  /** 만들 때 담당자가 고른 짜임(이야기 틀·구성 패턴·2025 예시 절·요청 글 — lib/reports/framework-pick.ts, 2026-10-12). 고르지 않았거나 이 기능 전 구성안은 없음 */
  frame?: OutlineFrame;
  /**
   * 갈래 축·칩(lib/reports/split-axes.ts — 2026-10-13): 같은 실행과제 형제 카드(가·나·다)를 나누는 축과 이 소항목이 맡는 값. 칩은 소항목 제목 앞 「[값] 」으로 그림
   * (집필 때 코드가 spec.sub.chip으로 옮김). 축이 없으면 필드 없음(이 기능 전 구성안 포함). chip은 빈 글일 수 있음(축만 정함). 경영관리는 mg.axis·절 chip
   */
  split?: { axis: string; chip: string };
  /**
   * 성과 축(2026-10-14 — 과제 목표의 축, 예: 과제명 「… 규정준수 및 업무효율 제고」의 규정준수·업무효율)과 그 축을 보여 줄 재료 번호.
   * 집필 요청 글에 「성과 축: 업무효율 ← m3·m7」로 넘겨 축마다 재료를 쓰게 함(planPrompt). 없으면 필드 없음(이 기능 전 구성안 포함). 경영관리 구성안은 아직 안 씀
   */
  axes?: PerfAxis[];
}

/** 성과 축 하나: 축 이름(12자 안)과 재료 번호(재료표 안의 것만) */
export interface PerfAxis {
  axis: string;
  materials: string[];
}

// ---------------------------------------------------------------------------
// AI 답 스키마(구조는 여기, 필드 설명은 resources/prompts/report-outline/schema.md)

export const OUTLINE_OUT_FIELDS = [
  "message",
  "points",
  "story",
  "subStory",
  "storyWhy",
  "alternative",
  "materials",
  "material.kind",
  "material.text",
  "material.when",
  "material.source",
  "material.quote",
  "blocks",
  "block.kind",
  "block.variant",
  "block.label",
  "block.purpose",
  "block.cells",
  "block.materials",
  "block.figures",
  "block.alts",
  "block.layout",
  "block.span",
  "results",
  "resultShape",
  "splitAxis",
  "splitChip",
  "axes",
  "axis.axis",
  "axis.materials",
] as const;

/** 구성안 AI 답의 배치 값(ladder = 라벨 사다리 — 저장할 때는 지움)·폭 값(빈 글 = 그릇 폭 전부) — 경영관리 구성안 스키마도 씀 */
export const PLAN_LAYOUTS = ["ladder", "full", "stage"] as const;
export const PLAN_SPANS = ["", "half"] as const;

/**
 * 구성안 AI 답 스키마. 이야기 틀(story·subStory)은 enum이 아니라 문자열로 받고 정리(cleanComposition — matchName)가 12종으로 맞춤(2026-10-12):
 * enum·literal이면 가운뎃점 변형(･ㆍ)·띄어쓰기·「주 + 보조」 표기 하나로 답 전체 파싱이 실패함(같은 날 집필 story 버그와 같은 원인). 모르는 이름은 버림(빈 글).
 * 담당자가 틀을 고른 요청은 값을 코드가 그 틀로 덮음(withFixedStory). AI 답에 「섞음」은 없음(두 틀이 필요하면 주 틀 + 보조 틀 — 2026-10-09)
 */
export function compositionOutSchema(desc?: Descriptions) {
  const d = <T extends z.ZodType>(s: T, key: (typeof OUTLINE_OUT_FIELDS)[number]) => described(s, desc, key);
  const material = z.object({
    id: z.string(),
    kind: d(z.enum(MATERIAL_KINDS), "material.kind"),
    text: d(z.string(), "material.text"),
    when: d(z.string(), "material.when"),
    source: d(z.string(), "material.source"),
    quote: d(z.string(), "material.quote"),
  });
  const block = z.object({
    kind: d(z.enum(BLOCK_KINDS), "block.kind"),
    variant: d(z.string(), "block.variant"),
    label: d(z.string(), "block.label"),
    purpose: d(z.string(), "block.purpose"),
    cells: d(z.number(), "block.cells"),
    materials: d(z.array(z.string()), "block.materials"),
    figures: d(z.array(z.object({ kind: z.enum(FIGURE_KINDS), desc: z.string(), pos: z.enum(FIGURE_POS), size: z.enum(FIGURE_SIZES) })), "block.figures"),
    alts: d(z.array(z.object({ kind: z.enum(BLOCK_KINDS), variant: z.string(), why: z.string() })), "block.alts"),
    layout: d(z.enum(PLAN_LAYOUTS), "block.layout").optional(),
    span: d(z.enum(PLAN_SPANS), "block.span").optional(),
  });
  return z.object({
    message: d(z.string(), "message"),
    points: d(z.array(z.string()), "points"),
    story: d(z.string(), "story"),
    subStory: d(z.string(), "subStory").optional(),
    storyWhy: d(z.string(), "storyWhy"),
    alternative: d(z.string(), "alternative"),
    materials: d(z.array(material), "materials"),
    blocks: d(z.array(block), "blocks"),
    results: d(z.string(), "results"),
    resultShape: d(z.enum(RESULT_SHAPES), "resultShape").optional(),
    // 갈래 축·칩(2026-10-13): enum이 아니라 선택 문자열 — 정리(cleanComposition — split-axes.ts cleanSplit)가 사전 이름으로 맞추고 근거 없는 칩은 버림
    splitAxis: d(z.string(), "splitAxis").optional(),
    splitChip: d(z.string(), "splitChip").optional(),
    // 성과 축(2026-10-14): 축 이름은 enum이 아니라 선택 문자열 — 정리(cleanAxes)가 빈 축·겹침·없는 재료 번호를 버림
    axes: d(z.array(z.object({ axis: d(z.string(), "axis.axis"), materials: d(z.array(z.string()), "axis.materials") })), "axes").optional(),
  });
}
export const CompositionOut = compositionOutSchema();

/** 담당자가 고른 틀(「섞음」 제외)이 있으면 AI가 적은 story를 그 틀로 덮음 */
export function withFixedStory<T extends { story: string }>(out: T, story?: Story): T {
  return story && story !== "섞음" ? { ...out, story } : out;
}

/** 월간 점검 보완 요청 절(두 트랙 구성안 공통 — lib/reports/inspection-input.ts) */
export const INSPECTION_INPUT_SECTIONS = ["inspection.head", "inspection.focus", "inspection.item", "inspection.question", "inspection.tail"] as const;
/** 담당자가 고른 짜임·여러 안 절(두 트랙 구성안 공통 — lib/reports/framework-pick.ts framePrompt, 2026-10-12) */
export const FRAME_INPUT_SECTIONS = ["frame.head", "frame.pattern", "frame.example", "frame.images", "alt.auto", "alt.rank"] as const;

/** 갈래 축 사전 절(두 트랙 구성안 공통 — lib/reports/split-axes.ts splitHeadPrompt, 2026-10-13) */
export const SPLIT_INPUT_SECTIONS = ["split.head", "split.axis", "split.values"] as const;

/** 구성안 프롬프트 파일(resources/prompts/report-outline)에 있어야 하는 절 — split.sibling·split.none·split.siblingItem은 같은 실행과제 형제 카드의 축·칩(split-axes.ts splitSiblingsPrompt) */
export const OUTLINE_PROMPT_SPEC: PromptSpec = { system: ["system"], request: ["task", "memo", "story", "story.mix", "storyHints", "storyHints.item", "storyHints.none", "storyHints.siblings", ...INSPECTION_INPUT_SECTIONS, ...FRAME_INPUT_SECTIONS, ...SPLIT_INPUT_SECTIONS, "split.sibling", "split.none", "split.siblingItem"], schema: OUTLINE_OUT_FIELDS };
export type CompositionOutput = z.infer<typeof CompositionOut>;

// ---------------------------------------------------------------------------
// 정리·대조(결정론)

/** 재료·블록·성과 축 상한 */
export const COMPOSITION_LIMITS = { materials: 20, blocks: 10, cells: 6, axes: 4 } as const;

const num = (tok: string) => tok.replace(/,/g, "").replace(/\s+/g, "");

/**
 * AI 구성안 → 저장할 구성안 + 경고. hayKey = 근거 원문(sourceKey로 걷은 글 — 카드·첨부·전년 절·평가 근거), known = 아는 숫자(numKey 모양).
 * 재료: 번호 겹침·빈 글 버림, 원문 구절을 찾았는지(found), 수치 재료의 숫자가 근거에 없으면 경고. 블록: 모르는 종류 버림, 모양·칸 수·그림 정리, 없는 재료 번호는 뗌.
 */
export function cleanComposition(out: CompositionOutput, hayKey: string, known: Set<string>): { composition: Composition; warnings: string[] } {
  const { materials, warnings } = cleanMaterials(out.materials, hayKey, known);
  const ids = new Set(materials.map((m) => m.id));
  const blocks: PlanBlock[] = [];
  let retired = 0;
  for (const b of (out.blocks ?? []).slice(0, COMPOSITION_LIMITS.blocks)) {
    const x = cleanPlanBlock(b, ids);
    if (!x) continue;
    // 핵심 수치 띠는 주요사업 구성안에 두지 않음(frameworks.ts BIZ_RETIRED_SHAPES, 2026-10-28) — 대안 모양에서도 뺌
    if (BIZ_RETIRED_SHAPES.includes(shapeCode(x.kind, x.variant))) {
      retired += 1;
      continue;
    }
    if (x.alts) x.alts = x.alts.filter((a) => !BIZ_RETIRED_SHAPES.includes(shapeCode(a.kind, a.variant)));
    blocks.push(x);
  }
  if (retired) warnings.push(`구성: 핵심 수치 띠 ${retired}개를 뺐습니다 — ${BIZ_RETIRED_WHY}.`);
  dropLoneSpans(blocks);
  // 이야기 틀은 문자열로 받아 12종으로 맞춤(가운뎃점 변형·띄어쓰기·「주 + 보조」 표기 — 모르면 빈 글)
  const story = matchName(out.story, MAIN_STORIES);
  const subStory = matchName(out.subStory, MAIN_STORIES);
  // 갈래 축·칩: 축은 사전 이름으로(모르면 버림), 칩은 표준 값이거나 근거 원문(hayKey)에 있는 낱말만
  const sp = cleanSplit(out.splitAxis, out.splitChip, "biz", hayKey);
  warnings.push(...sp.warnings);
  const composition: Composition = {
    version: 1,
    message: cleanLine(out.message, 120),
    points: (out.points ?? []).map((x) => cleanLine(x, 120)).filter(Boolean).slice(0, 3),
    story,
    ...(subStory && subStory !== story ? { subStory } : {}),
    storyWhy: cleanLine(out.storyWhy, 200),
    alternative: cleanLine(out.alternative, 200),
    blocks,
    results: cleanLine(out.results, 160),
    resultShape: RESULT_SHAPES.includes(out.resultShape as ResultShape) ? (out.resultShape as ResultShape) : "bullets",
    materials,
    memo: "",
    ...(sp.split ? { split: sp.split } : {}),
  };
  const axes = cleanAxes(out.axes, ids);
  if (axes.length) composition.axes = axes;
  return { composition, warnings };
}

/** 성과 축 정리: 축 이름은 한 줄 12자까지, 빈 축·겹친 축(띄어쓰기 무시) 버림, 재료표에 없는 번호·겹친 번호 버림(재료가 비어도 축은 남김 — compositionIssues가 경고), 앞 4개까지 */
export function cleanAxes(raw: unknown, ids: Set<string>): PerfAxis[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: PerfAxis[] = [];
  for (const a of raw as Json[]) {
    const axis = cleanLine(a?.axis, 12).trim();
    const key = axis.replace(/\s+/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const materials = [...new Set((Array.isArray(a?.materials) ? a.materials : []).map((m: unknown) => String(m).trim()).filter((m: string) => ids.has(m)))] as string[];
    out.push({ axis, materials });
    if (out.length === COMPOSITION_LIMITS.axes) break;
  }
  return out;
}

/**
 * 재료표 정리(구성안 공용 — 주요사업·경영관리): 번호 겹침·빈 글 버림, 원문 구절 대조(found), 근거에 없는 숫자가 든 수치 재료 경고.
 * max = 재료 상한(주요사업은 COMPOSITION_LIMITS.materials 그대로, 경영관리는 절 수에 비례 — mg-outline.ts mgMaterialCap)
 */
export function cleanMaterials(raw: CompositionOutput["materials"] | undefined, hayKey: string, known: Set<string>, max: number = COMPOSITION_LIMITS.materials): { materials: Material[]; warnings: string[] } {
  const warnings: string[] = [];
  const seen = new Set<string>();
  const materials: Material[] = [];
  for (const m of (raw ?? []).slice(0, max * 2)) {
    const id = String(m?.id ?? "").trim() || `m${materials.length + 1}`;
    const text = cleanLine(m?.text, 200);
    if (!text || seen.has(id) || !MATERIAL_KINDS.includes(m?.kind)) continue;
    seen.add(id);
    const quote = cleanLine(m?.quote, 300);
    const found = m.kind !== "need" && Boolean(quote) && quoteFoundIn(hayKey, quote);
    materials.push({ id, kind: m.kind, text, when: cleanLine(m?.when, 30), source: cleanLine(m?.source, 60), quote, found });
    if (materials.length >= max) break;
  }
  const unfound = materials.filter((m) => m.kind !== "need" && !m.found);
  if (unfound.length) warnings.push(`재료: 근거 원문에서 구절을 찾지 못한 재료 ${unfound.length}개(${unfound.map((m) => m.id).join("·")}) — 집필 때 쓰지 않거나 원자료로 확인합니다.`);
  const strange = materials.filter((m) => m.kind === "figure" && numberTokens(m.text).some((t) => !known.has(num(t)) && !known.has(num(t).replace(/(%|배)$/, ""))));
  if (strange.length) warnings.push(`재료: 근거에 없는 숫자가 든 수치 재료 ${strange.length}개(${strange.map((m) => m.id).join("·")}).`);
  return { materials, warnings };
}

/** AI 구성안 블록 하나 정리(구성안 공용): 모르는 종류면 null, 모양·칸 수·그림·대안 정리, 재료표에 없는 번호는 뗌 */
export function cleanPlanBlock(b: CompositionOutput["blocks"][number] | undefined, ids: Set<string>): PlanBlock | null {
  if (!b || !BLOCK_KINDS.includes(b.kind)) return null;
  const variant = variantOf(b.kind, b.variant);
  return {
    kind: b.kind,
    variant,
    label: cleanLine(b.label, 24),
    purpose: cleanLine(b.purpose, 120),
    cells: clampCells(b.kind, variant, Number(b.cells)),
    materials: (Array.isArray(b.materials) ? b.materials : []).map(String).filter((x) => ids.has(x)),
    figures: cleanFigures(b.kind, b.figures, cleanLine),
    ai: { kind: b.kind, variant },
    alts: cleanAlts(b.kind, variant, (b as { alts?: unknown }).alts),
    // 배치: ladder·빈 글·목록 밖·이 종류에 뜻 없는 값은 지움(짝 없는 가로 반씩은 목록 정리 뒤 dropLoneSpans)
    ...layoutFields({ kind: b.kind, layout: (b as { layout?: unknown }).layout, span: (b as { span?: unknown }).span }),
  };
}

/** 모양: 목록 안이면 그대로, 밖이면 그 종류의 첫째(모양이 없는 종류는 빈 글) */
const variantOf = (kind: BlockKind, v: unknown) => {
  const vs = VARIANTS[kind];
  return vs ? (vs.includes(String(v)) ? String(v) : vs[0]) : "";
};

/** AI 대안 모양 정리: 모르는 종류·처음 모양과 같은 것·겹침 버림, 2개까지 */
function cleanAlts(kind: BlockKind, variant: string, raw: unknown): PlanAlt[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set([`${kind}:${variant}`]);
  const out: PlanAlt[] = [];
  for (const a of raw as Json[]) {
    if (!BLOCK_KINDS.includes(a?.kind)) continue;
    const v = variantOf(a.kind, a.variant);
    const key = `${a.kind}:${v}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: a.kind, variant: v, why: cleanLine(a.why, 80) });
    if (out.length === 2) break;
  }
  return out;
}

/** 저장된 구성안 읽기(형식이 다르면 null) */
export function readComposition(raw: Json): Composition | null {
  if (!raw || typeof raw !== "object" || raw.version !== 1 || !Array.isArray(raw.blocks) || !Array.isArray(raw.materials)) return null;
  return raw as Composition;
}

// ---------------------------------------------------------------------------
// 판면 어림 · 블록 높이 예산

/** 구성안 블록 → 칸을 채운 보통 모양 블록(판면 어림용 — 배치·폭도 옮김) */
export const planBlocks = (c: Composition): Block[] => c.blocks.map((b) => canonicalBlock(b.kind, b.variant, b.cells, b.label, b.figures, undefined, layoutFields(b)));

/** 블록 하나가 혼자 차지하는 판면 행 높이(mm): 가로 반씩은 같은 블록 둘의 짝(반 폭 높이), 단 띠는 띠 머리 포함. 배치가 없으면 예전 「블록 하나의 행」 그대로 */
const soloRowMm = (b: Block, module: number) => fitReport({ sub: { title: "" }, blocks: b.span ? [b, b] : [b], results: [], module }).rows[0]?.mm ?? 0;

/** 단 띠에서 둘째 단위부터는 띠 머리를 다시 그리지 않음 — 블록마다 뺄 띠 머리 높이(mm) */
function stageRepeats(blocks: Block[]): number[] {
  const out = new Array<number>(blocks.length).fill(0);
  for (const g of layoutGroups(blocks)) if (g.type === "stage") g.units.slice(1).forEach((u) => u.forEach((j) => (out[j] = stageHeadMm(g.label))));
  return out;
}

/** 구성안 판면 어림(mm): 제목 38자·추진성과(모양대로 — 불릿 2줄, 3칸 + 불릿 1줄, 불릿 2줄 + 막대)를 넣은 보통 모양으로 */
export function compositionFit(c: Composition, module: number, head: HeadMode = "all") {
  const shape = c.resultShape ?? "bullets";
  const results = shape === "cards" ? ["가".repeat(50)] : ["가".repeat(50), "가".repeat(50)];
  const resultCards = shape === "cards" ? [{}, {}, {}] : [];
  const resultChart = shape === "chart" ? { series: [{}, {}] } : null;
  return fitReport({ sub: { title: "가".repeat(38), ...(c.split?.chip ? { chip: c.split.chip } : {}) }, head, blocks: planBlocks(c), results, resultCards, resultChart, module });
}

/**
 * 블록마다 높이 예산(mm) — 보통 모양 높이를 블록 영역의 95%에 맞게 늘이거나 줄인 값(집필 요청에 블록마다 적음).
 * 평가 라운드 I1·I2: 첫 초안이 판면의 117~119% — 전체 예산만 주면 AI가 블록 높이를 셈하지 못함
 */
export function blockBudgets(c: Composition, module: number, head: HeadMode = "all"): number[] {
  const blocks = planBlocks(c);
  const repeat = stageRepeats(blocks);
  const heights = blocks.map((b, i, all) => (b.kind === "chart" && i > 0 && all[i - 1].label === b.label ? 0 : Math.max(8, soloRowMm(b, module) - repeat[i])));
  // 가로 반씩 짝은 한 줄을 함께 씀 — 둘 다 큰 쪽 높이를 받고 합에는 한 번만
  let sum = 0;
  for (const g of layoutGroups(blocks))
    for (const u of g.units) {
      const h = Math.max(...u.map((j) => heights[j]));
      for (const j of u) heights[j] = h;
      sum += h;
    }
  const k = (blockAreaMm(module, head) * 0.95) / (sum || 1);
  return heights.map((h) => Math.round(h * k));
}

/** 칸을 줄여도 도식 모양이 남는 최소 칸 수(단계·칸·시기 3, 협업 가운데 + 2곳, 전후 비교 2행, 수치 띠 2, 인용·말풍선·불릿 1 — 0.5쪽 구성안이 인용 2칸·불릿 2줄로 예산을 넘던 것, 평가 라운드 K) */
const CELL_FLOOR: Partial<Record<BlockKind, number>> = { cards: 3, steps: 3, timeline: 3, hub: 3, compare: 2, stats: 2, case: 2, quotes: 1, voices: 1, bullets: 1, qa: 1, table: 2, strategy: 2, pdca: 4 };

/** 집필 블록의 칸 수(구성안 PlanBlock.cells와 같은 셈: 전후 비교는 행, 불릿·우수사례는 줄, 막대는 막대 수) */
const cellCount = (b: Block) => (b.kind === "compare" ? b.rows.length : b.kind === "bullets" || b.kind === "case" ? b.items.length : b.kind === "chart" ? b.series.length : b.cells.length);

/** 구성안 블록 수 상한(불릿·띠 포함) — 0.5쪽 3개, 1쪽 6개(구성안 어림이 블록 영역에 드는 보통 수, 1-가 시험 7블록 = 280/255mm) */
export const planBlockCap = (module: number) => (module <= 0.5 ? 3 : Math.round(module * 6));

/**
 * 구성안을 판면에 맞게 줄이기(결정론 — 화면 「판면에 맞게 줄이기」·연기 시험 자동). 구성안이 블록을 고정하므로 집필 뒤 고치기로는 판면을 못 맞춤
 * (1-가 시험: 구성안 어림 280/255mm → 집필·고치기 2회 뒤 275mm, 표준 모양 어림은 집필 결과와 약 2% 차이).
 * 순서: ① 첫 불릿 블록을 뺀 불릿·띠·소제목 블록을 뒤에서부터 뺌 ② 가장 높은 블록의 칸을 하나씩(최소 칸 수 CELL_FLOOR까지)
 * ③ 그래도 넘치면 그대로 두고 경고 — 어느 도식을 뺄지는 사람이 고름. 목표 = 예산 이하
 */
export function fitComposition(c: Composition, module: number, head: HeadMode = "all"): { composition: Composition; changes: string[] } {
  let cur: Composition = { ...c, blocks: c.blocks.map((b) => ({ ...b })) };
  const changes: string[] = [];
  const over = () => {
    const r = compositionFit(cur, module, head);
    return r.total > r.budget;
  };
  for (let guard = 0; guard < 20 && over(); guard++) {
    const firstBullets = cur.blocks.findIndex((b) => b.kind === "bullets");
    const drop = [...cur.blocks.keys()].reverse().find((i) => ["bullets", "band", "banner", "subhead"].includes(cur.blocks[i].kind) && i !== firstBullets);
    if (drop !== undefined) {
      changes.push(`${cur.blocks[drop].label || cur.blocks[drop].kind} 블록 뺌`);
      cur = { ...cur, blocks: cur.blocks.filter((_, i) => i !== drop) };
      continue;
    }
    // 높은 블록부터 칸을 하나 줄여 보고, 판면이 실제로 줄어드는 것만 받음(인용 2칸 → 1칸·그림 옆 불릿처럼 높이가 그대로인 칸 줄이기는 안 함)
    const rows = planBlocks(cur).map((b, i) => ({ i, mm: soloRowMm(b, module) }));
    const total = compositionFit(cur, module, head).total;
    const pick = rows
      .filter((r) => cur.blocks[r.i].cells > (CELL_FLOOR[cur.blocks[r.i].kind] ?? 99))
      .sort((a, b) => b.mm - a.mm)
      .map((r) => ({ r, next: { ...cur, blocks: cur.blocks.map((x, i) => (i === r.i ? { ...x, cells: x.cells - 1 } : x)) } }))
      .find((x) => compositionFit(x.next, module, head).total < total);
    if (!pick) break;
    const b = cur.blocks[pick.r.i];
    cur = pick.next;
    changes.push(`${b.label || b.kind}: 칸 ${b.cells} → ${b.cells - 1}`);
  }
  return { composition: cur, changes };
}

/** 블록 한 칸의 글 한도: 칸마다 최대 줄 수 · 한 줄 한글 글자 수(null = 한도 없음 — 막대·띠·소제목·정의) */
export interface BlockLimit {
  lines: number;
  perLine: number;
  /** bullets·case는 줄 수가 곧 불릿 수 */
  unit: "cell" | "line";
  /** 나란한 칸(sideBySide) — 글 한도에 「나란한 칸은 같은 줄 수로」를 붙임 */
  side?: boolean;
}

/** 칸 글이 있는 블록 종류(칸마다 줄 수로 높이가 정해짐) */
const CELL_TEXT = new Set<BlockKind>(["cards", "steps", "timeline", "hub", "quotes", "voices", "stats", "compare", "qa", "table", "strategy", "pdca"]);

/**
 * 블록마다 글 한도(구현 계획 2단계 보완): 높이 예산(mm)은 AI가 셈하지 못해 첫 초안이 128%였음(평가 라운드 J) → 예산에 드는 최대 줄 수를
 * 표준 모양(canonicalBlock에 칸마다 L줄)으로 거꾸로 셈(1줄부터 늘려 예산을 넘기 전까지)하고, 칸 폭의 한 줄 글자 수와 함께 집필 요청에 적음
 */
export function blockLimits(c: Composition, module: number, head: HeadMode = "all"): Array<BlockLimit | null> {
  const budgets = blockBudgets(c, module, head);
  const repeat = stageRepeats(planBlocks(c));
  return c.blocks.map((b, i) => {
    const w = blockPerLine(b);
    if (w?.unit === "line") return { lines: b.cells, perLine: w.perLine, unit: "line" as const };
    if (!w || !budgets[i]) return null;
    const rowMm = (lines: number) => soloRowMm(canonicalBlock(b.kind, b.variant, b.cells, b.label, b.figures, lines, layoutFields(b)), module) - repeat[i];
    let lines = 1;
    while (lines < 8 && rowMm(lines + 1) <= budgets[i]) lines += 1;
    return { lines, perLine: w.perLine, unit: "cell" as const, ...(sideBySide(b) ? { side: true } : {}) };
  });
}

/** 구성안 블록 칸 폭의 한 줄 한글 글자 수(높이 예산 없이 폭만 — blockLimits와 같은 셈, 경영관리 집필 요청 mg-draft.ts mgPlanPrompt도 씀). 칸 글이 없는 블록은 null */
export function blockPerLine(b: Pick<PlanBlock, "kind" | "variant" | "cells" | "label" | "figures" | "layout" | "span">): { perLine: number; unit: "cell" | "line" } | null {
  const probe = canonicalBlock(b.kind, b.variant, b.cells, b.label, b.figures, 1, layoutFields(b));
  const width = blockWidth(probe) - figuresWidth(probe);
  if (b.kind === "bullets" || b.kind === "case") return { perLine: hangulPerLine(width - (b.kind === "case" ? 12 : 4)), unit: "line" };
  if (!CELL_TEXT.has(b.kind)) return null;
  return { perLine: hangulPerLine(slotOf(probe, width).body), unit: "cell" };
}

/**
 * 나란한 칸이 있는 구성안 블록(칸 2개 이상인 상자 도식, 전후 패널은 늘 두 패널 — lib/reports/fit.ts isBoxBlock): 형제 칸 줄 수를 맞춰야 상자가 비어 보이지 않음
 * (2026-10-15 후속 5 — 초안 G 상자 채움 72~75%). 두 트랙 집필 요청의 글 한도에 씀
 */
export const sideBySide = (b: Pick<PlanBlock, "kind" | "variant" | "cells">) => isBoxBlock(b) && (isPanelCompare(b) || b.cells >= 2);

/** 글 한도 글자(주요사업 집필 요청 plan.block). 나란한 칸이고 2줄 이상이면 가장 짧은 칸의 아래 한도(N−1줄)를 붙임 */
export const limitText = (l: BlockLimit | null) =>
  !l ? "—" : l.unit === "line" ? `불릿 ${l.lines}줄 이하 · 한 줄 약 ${l.perLine}자` : `칸마다 최대 ${l.lines}줄 · 한 줄 약 ${l.perLine}자${l.side && l.lines >= 2 ? ` · 나란한 칸은 같은 줄 수로(가장 짧은 칸도 ${l.lines - 1}줄 이상)` : ""}`;

/**
 * 집필 초안이 글 한도를 넘긴 블록(결정론 — 고치기 요청에 넣음). 구성안 블록과 같은 순서·종류로 맞은 블록만 봄.
 * 칸 글 줄 수 = 칸 불릿마다 실제 칸 폭으로 셈(fitLayout — 자간 맞춤 반영), 불릿 블록은 불릿 수
 */
export function planLimitIssues(c: Composition, blocks: Block[], module: number, head: HeadMode = "all"): string[] {
  const limits = blockLimits(c, module, head);
  const out: string[] = [];
  // 담당자가 고른 도식이 초안에 없으면 먼저(사람이 정한 짜임 — 2026-09-28)
  const kinds = blocks.map((b) => b.kind);
  for (const p of c.blocks) if (p.by === "human" && !kinds.includes(p.kind)) out.push(`모양: [${p.label || shapeName(p.kind, p.variant)}] 담당자가 고른 ${shapeName(p.kind, p.variant)} 블록이 초안에 없습니다 — 구성안대로 그 모양으로 씁니다.`);
  // 구성안에 없는 블록을 더 넣었으면 빼게(2026-09-28 1-나: 구성안 6블록인데 초안이 연도 흐름을 하나 더 넣음 — 판면이 넘치고 짜임이 달라짐)
  const extra = extraBlocks(c, blocks);
  if (extra.length) out.push(`짜임: 구성안에 없는 블록 ${extra.length}개(${extra.map((b) => `[${b.label || "전폭"}] ${shapeName(b.kind, b.variant)}`).join(", ")})를 넣었습니다 — 빼고 구성안 블록 ${c.blocks.length}개만 씁니다(블록을 더하지 않음).`);
  let j = 0;
  c.blocks.forEach((p, i) => {
    const k = blocks.slice(j).findIndex((b) => b.kind === p.kind);
    if (k < 0) return;
    const b = blocks[j + k];
    j += k + 1;
    const name = p.label || p.kind;
    // 칸 수는 구성안대로(늘리면 판면이 넘침 — 평가 라운드 K: 전후 비교 2행 → 3·4행으로 늘린 초안 3장 중 2장이 0.5쪽을 넘김)
    if (!["define", "band", "banner", "subhead"].includes(p.kind) && cellCount(b) > p.cells) out.push(`칸 수: [${name}] ${cellCount(b)}칸 → 구성안대로 ${p.cells}칸으로(칸을 늘리지 않음)`);
    const l = limits[i];
    if (!l) return;
    if (l.unit === "line") {
      if (b.items.length > l.lines) out.push(`글 한도: [${name}] 불릿 ${b.items.length}줄 → ${l.lines}줄 이하로`);
      return;
    }
    const width = blockWidth(b) - figuresWidth(b);
    const slot = slotOf(b, width);
    // 수치 표는 값 칸 하나하나가 한 칸(한 행의 값들은 옆으로 나란함 — 추진실적 열·2단 라벨 표는 행마다 불릿 칸)
    const cellLines = b.kind === "compare" ? b.rows.flatMap((r) => [r.before, r.after]) : isGridTable(b) ? b.cells.flatMap((x) => x.bullets.map((v) => [v])) : b.cells.map((x) => x.bullets);
    const most = Math.max(0, ...cellLines.map((xs) => xs.reduce((n, x) => n + fitLayout(x, slot.body).lines, 0)));
    if (most > l.lines) out.push(`글 한도: [${name}] 가장 긴 칸이 ${most}줄 → 칸마다 ${l.lines}줄 이하(한 줄 약 ${l.perLine}자)로`);
  });
  return out.slice(0, 4);
}

/** 구성안 점검(결정론 — 화면 경고): 판면 어림 넘침·빔, 블록 없음, 자료 필요 재료 */
export function compositionIssues(c: Composition, module: number, head: HeadMode = "all"): string[] {
  const out: string[] = [];
  if (!c.blocks.length) return ["구성안에 블록이 없습니다."];
  const r = compositionFit(c, module, head);
  if (r.total > r.budget * 1.08) out.push(`판면: 구성안 어림 ${r.total}mm로 ${module}쪽(${r.budget}mm)보다 ${r.total - r.budget}mm 넘칩니다 — 블록 하나를 빼거나 칸 수를 줄입니다.`);
  else if (r.total < r.budget * 0.85) out.push(`판면: 구성안 어림 ${r.total}mm로 ${module}쪽(${r.budget}mm)에 ${r.budget - r.total}mm가 빕니다 — 블록이나 칸을 더할 수 있습니다.`);
  // 고른 이야기 틀의 핵심 요소(이 과제만의 요소)가 구성안에 없으면 — 근거가 없어 AI가 뺀 것(2026-09-28 1-나: 현장 목소리형인데 시민 말 원문이 없어 말풍선이 빠짐)
  const fw = frameworkOf(c.story);
  if (fw) {
    const avail = shapeAvailability(c);
    const kinds = new Set(c.blocks.map((b) => b.kind));
    const missing = [...new Set(fw.blocks.map((b) => b.kind).filter((k) => isOwnKind(k) && !kinds.has(k)))];
    if (missing.length) out.unshift(`틀: 고른 「${c.story}」의 ${missing.map((k) => shapeName(k, "")).join("·")}이(가) 구성안에 없습니다 — ${missing.map((k) => (avail[k].ok ? `${shapeName(k, "")}는 도식 목록에서 더할 수 있음` : avail[k].why.split(" — ")[0])).join(" · ")}. 근거 자료(설문·민원·보도 원문 등)를 첨부하고 다시 만들면 들어갈 수 있습니다.`);
  }
  // 모양 다양성(2026-10-12 — 경고만): 시각 블록 3개 이상이면 서로 다른 모양 3가지 이상
  const variety = bizVarietyIssue(c.blocks);
  if (variety) out.push(variety);
  const need = c.materials.filter((m) => m.kind === "need");
  if (need.length) out.push(`자료 필요 ${need.length}건: ${need.map((m) => m.text).join(" · ")}`);
  // 성과 축(2026-10-14 — 경고만): 축에 근거 재료(자료 필요가 아닌 재료)가 하나도 없으면
  const byId = new Map(c.materials.map((m) => [m.id, m]));
  for (const a of c.axes ?? []) {
    if (!a.materials.some((id) => byId.has(id) && byId.get(id)!.kind !== "need")) out.push(`성과 축: 「${a.axis}」에 근거 재료가 없음 — 재료표에서 그 축을 보여 줄 실적·기준 대비 값을 찾거나 자료 필요로`);
  }
  // 사람이 더한 블록은 목적·재료가 비기 쉬움 — 집필이 근거 없이 채우지 못해 빠지거나 얇아짐
  const name = (b: PlanBlock, i: number) => `${i + 1}번 ${b.label || shapeName(b.kind, b.variant)}`;
  const bare = c.blocks.map((b, i) => ({ b, i })).filter(({ b }) => !TEXT_KINDS.has(b.kind) && !b.materials.length);
  if (bare.length) out.push(`재료 없는 블록: ${bare.map(({ b, i }) => name(b, i)).join(" · ")} — 재료를 넣지 않으면 집필이 근거 없이 채우지 못합니다.`);
  const aimless = c.blocks.map((b, i) => ({ b, i })).filter(({ b }) => !b.purpose.trim());
  if (aimless.length) out.push(`목적 없는 블록: ${aimless.map(({ b, i }) => name(b, i)).join(" · ")} — 이 블록이 보여 줄 것을 한 줄 적어 주세요.`);
  // 목소리 → 해법 1:1(2026-10-13 — 경고만, 자동 고치기·점수에 안 넣음): 현장 목소리형(주 틀·보조 틀)에서 말풍선 바로 다음 전후 비교·표의 행 수가 말풍선 수와 다르면
  if (c.story === "현장 목소리형" || c.subStory === "현장 목소리형") {
    c.blocks.forEach((b, i) => {
      const next = c.blocks[i + 1];
      if (b.kind === "voices" && next && (next.kind === "compare" || next.kind === "table") && next.cells !== b.cells)
        out.push(`목소리–해법: 말풍선 ${b.cells}개와 다음 표 ${next.cells}행이 1:1이 아닙니다 — 목소리마다 해법 행 하나로 맞춥니다.`);
    });
  }
  return out;
}

/** 재료 없이도 되는 글·띠 블록 */
const TEXT_KINDS = new Set<BlockKind>(["band", "banner", "subhead"]);

// ---------------------------------------------------------------------------
// 사람 편집(블록 순서·빼기·이야기 틀·그림 자리·메모) — 저장된 구성안 안에서만

/**
 * 구성안 편집·도식 목록의 모양 조건: 근거 조건(shapeAvailability) + 주요사업은 핵심 수치 띠를 새로 고르지 않음(BIZ_RETIRED_SHAPES, 2026-10-28 —
 * 원래 그 모양이던 블록은 그대로 둘 수 있음: applyCompositionEdit·shapeChoices가 원래 종류를 허용). 경영관리는 근거 조건만
 */
function editAvailability(c: Composition): Record<BlockKind, Availability> {
  const avail = shapeAvailability(c);
  if (!c.mg) for (const kind of BLOCK_KINDS) if (BIZ_RETIRED_SHAPES.includes(kind)) avail[kind] = { ok: false, why: BIZ_RETIRED_WHY };
  return avail;
}

/** 블록 한 개의 편집(화면이 새 순서대로 보냄) */
export interface BlockEdit {
  /** 원래 블록 순번(저장된 구성안 기준) — 새로 더한 블록은 null. 같은 순번이 둘이면 뒤의 것은 복제 */
  from: number | null;
  kind: string;
  variant: string;
  label: string;
  purpose: string;
  cells: number;
  /** 재료 번호(재료표 안에서만) */
  materials: string[];
  memo: string;
  /** 원래 블록의 그림 중 남길 것(종류는 바꿀 수 있음, 서술·자리·크기는 원래대로) — 새 블록·복제는 무시 */
  figures: Array<{ index: number; kind: string }>;
  /** 경영관리: 이 블록이 놓일 절 열쇠(구성안 mg.parts 안에서만 — lib/reports/mg-outline.ts가 검증) */
  at?: string;
  /** 배치(full·stage — 없거나 빈 글이면 라벨 사다리)·폭(half) — lib/reports/layout.ts */
  layout?: string;
  span?: string;
}

export interface CompositionEdit {
  blocks: BlockEdit[];
  story: string;
  /** 추진성과 모양(없으면 그대로) */
  resultShape?: string;
  memo: string;
  /** 경영관리: 절 순서·제목·이야기 틀(주 틀·보조 틀 — 보조 틀은 빈 글이면 없음, 빠뜨리면 그대로)·갈래 칩(빈 글이면 없음, 빠뜨리면 그대로)(구성안 mg.parts 안의 열쇠만 — 빠진 절은 뺌, lib/reports/mg-outline.ts applyMgCompositionEdit) */
  parts?: Array<{ key: string; title: string; story: string; subStory?: string; chip?: string }>;
  /** 갈래 축·칩(축 빈 글 = 없음, 빠뜨리면 그대로 — lib/reports/split-axes.ts). 경영관리는 축만(칩은 parts[].chip) */
  split?: { axis: string; chip: string };
}

/** 저장된 구성안 → 편집 시작 값(화면이 들고 고침) */
export function editOf(c: Composition): CompositionEdit {
  return {
    blocks: c.blocks.map((b, i) => ({ from: i, kind: b.kind, variant: b.variant, label: b.label, purpose: b.purpose, cells: b.cells, materials: [...b.materials], memo: b.memo ?? "", figures: b.figures.map((f, k) => ({ index: k, kind: f.kind })), ...(b.at ? { at: b.at } : {}), ...layoutFields(b) })),
    story: c.story,
    resultShape: c.resultShape ?? "bullets",
    memo: c.memo ?? "",
    ...(c.mg ? { parts: c.mg.parts.map((p) => ({ key: p.key, title: p.title, story: p.story, subStory: p.subStory ?? "", chip: p.chip ?? "" })) } : {}),
    split: c.mg ? { axis: c.mg.axis ?? "", chip: "" } : { axis: c.split?.axis ?? "", chip: c.split?.chip ?? "" },
  };
}

/** 블록 칸 수 상한과 같은 블록 수 상한 — 사람이 더해도 이 이상은 안 됨 */
export const EDIT_LIMITS = { blocks: COMPOSITION_LIMITS.blocks, label: 24, purpose: 120, memo: 200, materials: 12 } as const;

/**
 * 편집 적용(결정론 — 서버가 저장·미리보기 전에 부름): 블록 목록을 새로 받되 저장된 구성안의 재료·그림·AI 추천 안에서만.
 * 모르는 종류는 버리고, 근거가 없는 이 과제만의 요소(frameworks.ts shapeAvailability)로 바꾸려 하면 원래 모양으로 두고 notes에 이유를 남김.
 * 칸 수는 종류별 범위로, 재료는 재료표에 있는 번호만, 그림은 원래 블록의 것만(새 모양의 자리 규칙으로 다시 정리). 원래와 달라진 블록은 by: "human".
 * 갈래 축·칩(주요사업 — 경영관리는 mg-outline.ts applyMgCompositionEdit)은 AI 답과 같은 규칙(split-axes.ts cleanSplit): hayKey = 근거 글(서버가 카드·재료표 글로 만듦),
 * 저장된 칩은 같은 축이면 그대로 둘 수 있음. 받아들이지 않은 칩·축은 notes에
 */
export function applyCompositionEdit(c: Composition, e: CompositionEdit, maxBlocks: number = EDIT_LIMITS.blocks, hayKey = ""): { composition: Composition; notes: string[] } {
  const notes: string[] = [];
  const avail: Record<BlockKind, Availability> = editAvailability(c);
  const ids = new Set(c.materials.map((m) => m.id));
  const used = new Set<number>();
  const blocks: PlanBlock[] = [];
  for (const x of (Array.isArray(e.blocks) ? e.blocks : []).slice(0, maxBlocks)) {
    const from = Number.isInteger(x?.from) && (x.from as number) >= 0 && (x.from as number) < c.blocks.length ? (x.from as number) : null;
    const orig = from === null ? null : c.blocks[from];
    const copy = from !== null && used.has(from);
    if (from !== null) used.add(from);
    let kind: BlockKind | null = BLOCK_KINDS.includes(x?.kind as BlockKind) ? (x.kind as BlockKind) : (orig?.kind ?? null);
    if (!kind) continue;
    if (!avail[kind].ok && kind !== orig?.kind) {
      notes.push(`${shapeName(kind, "")}: ${avail[kind].why}`);
      kind = orig?.kind ?? "bullets";
    }
    const variant = kind === orig?.kind && !VARIANTS[kind]?.includes(String(x?.variant)) ? orig.variant : variantOf(kind, x?.variant);
    const figures =
      orig && !copy
        ? cleanFigures(
            kind,
            (Array.isArray(x?.figures) ? x.figures : []).filter((f) => orig.figures[f?.index]).map((f) => ({ ...orig.figures[f.index], kind: FIGURE_KINDS.includes(f.kind as never) ? f.kind : orig.figures[f.index].kind })),
            cleanLine,
          )
        : [];
    const materials = [...new Set((Array.isArray(x?.materials) ? x.materials : []).map(String).filter((m) => ids.has(m)))].slice(0, EDIT_LIMITS.materials);
    const next: PlanBlock = {
      kind,
      variant,
      label: cleanLine(x?.label, EDIT_LIMITS.label),
      purpose: cleanLine(x?.purpose, EDIT_LIMITS.purpose),
      cells: clampCells(kind, variant, Number(x?.cells)),
      materials,
      figures,
      ...(cleanLine(x?.memo, EDIT_LIMITS.memo) ? { memo: cleanLine(x?.memo, EDIT_LIMITS.memo) } : {}),
      ...(orig?.ai ? { ai: orig.ai } : {}),
      ...(orig?.alts?.length ? { alts: orig.alts } : {}),
      // 경영관리 절 표지는 그대로 옮김(열쇠 검증·절 순서 정렬은 lib/reports/mg-outline.ts applyMgCompositionEdit)
      ...(typeof x?.at === "string" && x.at ? { at: x.at } : orig?.at ? { at: orig.at } : {}),
      // 배치·폭은 화면이 보낸 값(없으면 라벨 사다리·그릇 폭) — 목록 밖·이 종류에 뜻 없는 값은 지움
      ...layoutFields({ kind, layout: x?.layout, span: x?.span }),
    };
    const changed = !orig || copy || blockKey(next) !== blockKey(orig);
    if (changed || orig?.by === "human") next.by = "human";
    blocks.push(next);
  }
  // 짝 없는 가로 반씩은 지움(경영관리는 절을 넘는 짝도 — 절 순서 정렬 뒤 mg-outline.ts가 한 번 더)
  dropLoneSpans(blocks, blocks.map((b) => b.at ?? ""));
  const resultShape = RESULT_SHAPES.includes(e.resultShape as ResultShape) ? (e.resultShape as ResultShape) : c.resultShape;
  const story = STORIES.includes(e.story as Story) ? (e.story as Story) : c.story;
  const composition: Composition = { ...c, blocks, story, ...(resultShape ? { resultShape } : {}), memo: cleanLine(e.memo, 500) };
  // 보조 틀은 주 틀에 딸린 것 — 주 틀을 바꾸면 지움
  if (story !== c.story) delete composition.subStory;
  // 갈래 축·칩(주요사업): 보냈을 때만 바꿈 — 축 빈 글이면 지움
  if (!c.mg && e.split && typeof e.split === "object") {
    const sp = cleanSplit(e.split.axis, e.split.chip, "biz", hayKey, c.split && matchAxis(e.split.axis, "biz") === c.split.axis ? c.split.chip : "");
    notes.push(...sp.warnings.map((w) => w.replace(/^갈래:\s*/, "갈래 칩: ")));
    if (sp.split) composition.split = sp.split;
    else delete composition.split;
  }
  return { composition, notes: [...new Set(notes)] };
}

/** 도식 고르기 한 줄(화면 「도식 목록」 — 모양마다 고를 수 있는지·바꾸면 판면이 몇 mm 달라지는지) */
export interface ShapeChoice {
  code: string;
  kind: BlockKind;
  variant: string;
  /** 바꾸면 쓸 칸 수(같은 종류면 지금 칸 수, 다르면 그 모양의 보통 칸 수) */
  cells: number;
  ok: boolean;
  why: string;
  /** 판면 어림 차이(mm, 바꾼 뒤 − 지금) */
  deltaMm: number;
}

/**
 * 블록 pos의 도식을 바꾸거나(change) pos 뒤에 새 블록을 더할 때(add) 모양마다 결과(결정론): 근거 조건(shapeAvailability)과
 * 편집을 적용한 구성안의 판면 어림 차이. 모양 29가지 × 판면 어림 1번씩
 */
export function shapeChoices(c: Composition, e: CompositionEdit, target: { pos: number; mode: "change" | "add" }, module: number, head: HeadMode = "all"): ShapeChoice[] {
  const avail = editAvailability(c);
  const base = compositionFit(applyCompositionEdit(c, e).composition, module, head).total;
  const cur = e.blocks[target.pos];
  return SHAPES.map((sh) => {
    const cells = target.mode === "change" && cur && cur.kind === sh.kind ? clampCells(sh.kind, sh.variant, cur.cells) : defaultCells(sh.kind, sh.variant);
    const one: BlockEdit =
      target.mode === "change" && cur
        ? { ...cur, kind: sh.kind, variant: sh.variant, cells }
        : { from: null, kind: sh.kind, variant: sh.variant, label: e.blocks[target.pos]?.label ?? "", purpose: "", cells, materials: [], memo: "", figures: [] };
    const blocks = target.mode === "change" ? e.blocks.map((b, i) => (i === target.pos ? one : b)) : [...e.blocks.slice(0, target.pos + 1), one, ...e.blocks.slice(target.pos + 1)];
    const a = avail[sh.kind];
    // 근거가 없는 이 과제만의 요소도 원래 그 모양이었으면 고를 수 있음(applyCompositionEdit와 같은 규칙)
    const origKind = target.mode === "change" && cur?.from != null ? c.blocks[cur.from]?.kind : null;
    const ok = a.ok || origKind === sh.kind;
    const total = ok ? compositionFit(applyCompositionEdit(c, { ...e, blocks }).composition, module, head).total : base;
    return { code: sh.code, kind: sh.kind, variant: sh.variant, cells, ok, why: a.why, deltaMm: Math.round(total - base) };
  });
}

/** 사람이 고쳤는지 볼 블록 값(모양·라벨·목적·칸·재료·메모·그림) */
const blockKey = (b: PlanBlock) => JSON.stringify([b.kind, b.variant, b.label, b.purpose, b.cells, b.materials, b.memo ?? "", b.figures.map((f) => [f.kind, f.desc, f.pos, f.size]), b.at ?? "", b.layout ?? "", b.span ?? ""]);

// ---------------------------------------------------------------------------
// 집필 요청(승인된 구성안) · 집필 점검

/** 집필 요청 글의 「승인된 구성안」(report-draft/request.md plan.*) */
export function planPrompt(p: PromptSet, c: Composition, module: number, head: HeadMode = "all"): string {
  const r = (key: string, vars: Record<string, string | number> = {}) => fillFrom(p, "request", key, vars);
  const budgets = blockBudgets(c, module, head);
  const limits = blockLimits(c, module, head);
  // 성과 축은 평가 논점 줄 아래 한 줄씩(축이 없으면 빈 글 — 그 자리 글이 예전 요청 글과 같음)
  const axes = (c.axes ?? []).map((a) => `\n- 성과 축: ${a.axis} ← ${a.materials.join("·") || "—"}`).join("");
  const lines = [r("plan.head", { message: c.message || "—", points: c.points.join(" · ") || "—", axes, story: storyLabel(c.story, c.subStory) || "—" })];
  c.blocks.forEach((b, i) => {
    const figs = b.figures.map((f) => `${FIGURE_LABEL[f.kind]}/${f.size}/${f.pos} 「${f.desc}」`).join(", ");
    lines.push(
      r("plan.block", {
        n: i + 1,
        kind: b.variant ? `${b.kind}:${b.variant}` : b.kind,
        label: b.label || "전폭",
        layout: planLayoutText(b),
        purpose: b.purpose || "—",
        cells: b.cells,
        mm: budgets[i] || "막대(앞 행 오른쪽)",
        limit: limitText(limits[i]),
        materials: b.materials.join("·") || "—",
        figures: figs || "없음",
      }),
    );
    if (b.by === "human" || b.memo) lines.push(r("plan.human", { memo: b.memo || "없음" }));
  });
  lines.push(r("plan.materialsHead"));
  for (const m of c.materials) lines.push(r("plan.material", { id: m.id, kind: MATERIAL_LABEL[m.kind], text: m.text, when: m.when || "—", source: m.source || "—", found: m.kind === "need" ? "자료 필요" : m.found ? "원문 확인" : "원문 못 찾음" }));
  lines.push(r("plan.tail", { results: c.results || "—", shape: r(`plan.shape.${c.resultShape ?? "bullets"}`), memo: c.memo || "없음" }));
  return lines.join("\n");
}

/**
 * 집필 요청 블록 줄의 배치 꼬리(두 트랙 공용 — 요청 글 plan.block {{layout}}): 기본 배치(라벨 사다리·라벨 없는 전폭)면 빈 글(예전 요청 글 그대로),
 * 아니면 「 · 배치 전폭(라벨 칸 없음)」·「 · 배치 단 띠(라벨 「…」이 위 띠 제목)」, 가로 반씩이면 「 · 다음 블록과 가로 반씩(칸 폭 절반)」을 덧붙임
 */
export function planLayoutText(b: Pick<PlanBlock, "kind" | "label" | "layout" | "span">): string {
  const f = layoutFields(b);
  const base = f.layout === "stage" && b.label ? ` · 배치 ${LAYOUT_LABEL.stage}(라벨 「${b.label}」이 위 띠 제목)` : f.layout === "full" && b.label ? ` · 배치 ${LAYOUT_LABEL.full}(라벨 칸 없음)` : "";
  return f.span ? `${base} · 다음 블록과 가로 반씩(칸 폭 절반)` : base;
}

/**
 * 구성안 배치를 집필 초안 블록에 입힘(결정론 — 배치는 AI가 아니라 승인된 구성안이 정함): 구성안 블록과 짝지은 초안 블록(planMatch)은 그 블록의 layout·span을,
 * 짝이 없는 블록은 배치 없음(라벨 사다리)으로. 그 뒤 짝 없는 가로 반씩은 지움. at = 경영관리 절 열쇠(짝이 절을 넘지 않게)
 */
export function applyPlanLayout(c: Pick<Composition, "blocks">, blocks: Block[], at?: string[]): void {
  const match = planMatch(c, blocks);
  const from = new Map<number, PlanBlock>();
  match.forEach((j, i) => j !== null && from.set(j, c.blocks[i]));
  blocks.forEach((b, j) => {
    delete b.layout;
    delete b.span;
    const p = from.get(j);
    if (p) Object.assign(b, layoutFields({ kind: b.kind, layout: p.layout, span: p.span }));
  });
  dropLoneSpans(blocks, at);
}

/** 블록 종류(모양) 순서 */
const sig = (xs: Array<{ kind: string; variant: string }>) => xs.map((b) => (b.variant && b.variant !== (VARIANTS[b.kind as BlockKind]?.[0] ?? "") ? `${b.kind}:${b.variant}` : b.kind));

/** 집필 초안이 구성안 짜임을 따랐는지: 같은 순서로 맞은 블록 수(가장 긴 공통 부분열) / 구성안 블록 수 */
export function planAdherence(c: Composition, blocks: Block[]): { matched: number; total: number; same: boolean } {
  const a = sig(c.blocks);
  const b = sig(blocks);
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const matched = dp[a.length][b.length];
  return { matched, total: a.length, same: matched === a.length && a.length === b.length };
}

/**
 * 구성안 블록 i ↔ 집필 초안 블록 j 짝(planAdherence와 같은 가장 긴 공통 부분열 — 종류·모양 순서). 결과는 구성안 블록마다 초안 블록 순번, 짝이 없으면 null.
 * 과제별 초안 화면이 구성안 블록 메모를 초안의 그 블록 높이에 세울 때 씀(같은 길이의 공통 부분열이 여럿이면 앞쪽 짝을 고름)
 */
export function planMatch(c: Pick<Composition, "blocks">, blocks: Array<{ kind: string; variant: string }>): Array<number | null> {
  const a = sig(c.blocks);
  const b = sig(blocks);
  // 뒤에서부터 채운 표(dp[i][j] = a[i..]·b[j..]의 공통 부분열 길이) — 앞에서부터 짝을 고르며 따라감
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: Array<number | null> = new Array(a.length).fill(null);
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) out[i++] = j++;
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return out;
}

/**
 * 구성안만 있는 형제 카드의 짜임(초안이 아직 없을 때 — 2026-10-10): 같은 사업 카드들이 구성안 단계에서도 서로의 주 틀·블록 순서를 보게 함
 * (예전에는 저장된 초안 spec만 형제로 봐서, 구성안만 만든 카드끼리 같은 틀로 몰릴 수 있었음). 블록이 없으면 null
 */
export function outlineSiblingLayout(label: string, c: Composition): SiblingLayout | null {
  if (!c.blocks.length) return null;
  return { label, story: c.story ?? "", ...(c.subStory ? { subStory: c.subStory } : {}), signature: sig(c.blocks).join(" → ") };
}

/** 형제 초안 행(card_report_drafts + cards 조인 — splitSiblingsOf) */
export interface SplitDraftRow {
  card_id: string;
  spec: unknown;
  outline: unknown;
  cards: { task_no: string; title: string } | Array<{ task_no: string; title: string }> | null;
}

const SUB_MARKS = "가나다라마바사아자차카타파하";

/**
 * 같은 실행과제(같은 대상사업·실행과제 번호) 형제 카드의 소항목 제목·갈래 축·칩(주요사업 — 2026-10-13): 축·칩은 형제 구성안의 split(없으면 초안 칩),
 * 제목·표지는 형제 초안(없으면 카드 제목·과제번호). 구성안·초안 행이 있는 형제만, 표지 순
 */
export function splitSiblingsOf(data: unknown, cardId: string, siblings: SiblingCard[], rows: SplitDraftRow[]): SplitSibling[] {
  const d = (data ?? {}) as { targetBusiness?: unknown; executionTaskNo?: unknown };
  const tb = String(d.targetBusiness ?? "").trim();
  const etn = String(d.executionTaskNo ?? "").trim();
  if (!etn) return [];
  const same = new Map(siblings.filter((x) => x.id !== cardId && x.targetBusiness.trim() === tb && x.executionTaskNo.trim() === etn).map((x) => [x.id, x]));
  return rows
    .flatMap((r) => {
      const sib = same.get(r.card_id);
      if (!sib) return [];
      const sp = readSection(r.spec);
      const plan = readComposition(r.outline);
      const c = Array.isArray(r.cards) ? r.cards[0] : r.cards;
      return [{ mark: sp?.sub.mark || sib.taskNo.split("-")[1] || "", title: sp?.sub.title || c?.title || "", axis: plan?.split?.axis ?? "", chip: plan?.split?.chip || sp?.sub.chip || "" }];
    })
    .sort((a, b) => (SUB_MARKS.indexOf(a.mark) + 1 || 99) - (SUB_MARKS.indexOf(b.mark) + 1 || 99));
}

/** 집필 초안 블록 중 구성안 블록과 짝이 없는 것(planMatch — 구성안에 없는데 더 넣은 블록) */
export function extraBlocks(c: Pick<Composition, "blocks">, blocks: Block[]): Block[] {
  const used = new Set(planMatch(c, blocks).filter((x): x is number => x !== null));
  return blocks.filter((_, i) => !used.has(i));
}

/** 판면 폭(참고: 본문 170mm) — 화면 표시용 */
export const COMPOSITION_PAGE_WIDTH = PAGE_MM.width;
