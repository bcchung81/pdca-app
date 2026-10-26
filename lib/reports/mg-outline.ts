// 경영관리 경평 초안 「구성안」(순수) — 카드 1장 → 평가내용·대주제·절(가·나·다) 골격 + 절마다 블록(설계 docs/plan/경영관리-경평초안-설계.md §7·§10).
// 주요사업 구성안(composition.ts)의 재료표·블록 정리·사람 편집을 그대로 쓰고, 다른 것만 여기: 골격(Composition.mg)·블록의 절 표지(PlanBlock.at)·
// 절 단위 점검·전년 보고서 골격(공통 지식 rpt25-mg-NN의 절 조각)·카드 ↔ 평가내용 첫 대응(추천 기본값 — 사람이 구성안에서 고름).
// 판면 어림·높이 예산은 쓰지 않음(쪽 수(작성분량)는 2026-10-12 확보, 판형·글자 규격 자료가 없고 2026-10-12 사용자 결정대로 경고까지만 — 설계 §7-3). AI 지시문은 resources/prompts/report-outline-mg/*.md.

import { z } from "zod";
import { type Descriptions, type PromptSet, type PromptSpec, described, fillFrom } from "../prompts/template.ts";
import { BLOCK_KINDS, FIGURE_KINDS, FIGURE_POS, FIGURE_SIZES, type BlockKind, VARIANTS } from "./blocks.ts";
import { type DiagramHint, type HintOptions, mgVarietyIssues } from "./diagram-hints.ts";
import { COMPOSITION_LIMITS, type Composition, type CompositionEdit, FRAME_INPUT_SECTIONS, INSPECTION_INPUT_SECTIONS, MATERIAL_KINDS, PLAN_LAYOUTS, PLAN_SPANS, type PlanBlock, SPLIT_INPUT_SECTIONS, applyCompositionEdit, cleanMaterials, cleanPlanBlock } from "./composition.ts";
import { dropLoneSpans } from "./layout.ts";
import { MG_MAIN_STORIES, MG_STORIES, type MgMainStory, type MgStory } from "./frameworks-mg.ts";
import { matchName, shapeName, storyLabel } from "./frameworks.ts";
import { type FrameInput, type OutlineFrame, framePrompt } from "./framework-pick.ts";
import { type MgPart, mgPartKey } from "./mg-types.ts";
import { cleanLine } from "./section.ts";
import { cleanChip, matchAxis } from "./split-axes.ts";
import type { LooseJson } from "../loose-json.ts";

type Json = LooseJson;

/** 절·블록 상한 — 카드 1장이 평균 절 4.2개(분석 §5)라 넉넉히 */
export const MG_LIMITS = { parts: 8, blocks: 32 } as const;

/**
 * 재료 상한(2026-10-12 C6): 절 수 × 6개, 최소 주요사업과 같은 20개·최대 40개. 절 하나는 블록 3~6개가 보통이고(report-outline-mg/system.md) 블록마다 재료 1~2개라 절당 6개 안팎 —
 * 고정 20개일 때 절 4개인 8-1 구성안이 재료 20/20으로 꽉 차 뒤 절이 얇아졌음. 40개는 주요사업 상한의 두 배(요청이 이미 약 18만 자라 답 길이를 묶어 둠)
 */
export const mgMaterialCap = (parts: number) => Math.min(40, Math.max(COMPOSITION_LIMITS.materials, Math.round(parts) * 6));

// ---------------------------------------------------------------------------
// 전년 보고서 골격(공통 지식 rpt25-mg-NN — lib/knowledge/parsers/report25-mg.ts)

/** 전년 보고서의 절 하나 또는 절 없는 대주제 본문(mark 빈 글) */
export interface MgPriorSection {
  /** 조각 키 */
  key: string;
  evalNo: number;
  evalTitle: string;
  themeNo: number;
  themeTitle: string;
  mark: string;
  title: string;
  /** 앞 대주제에 붙은 표지(BP 등)와 절 표지 */
  markers: string[];
  text: string;
  page: number | null;
}

/** 조각 한 줄 → 전년 절(세부평가내용별 장의 절 report_section·절 없는 대주제 본문 detail_theme만 — 그 밖은 null) */
export function toMgPriorSection(row: { chunk_key: string; text?: string | null; meta?: Json; report_page_2025?: number | null }): MgPriorSection | null {
  const m = row.meta ?? {};
  const evalNo = Number(m.eval_no);
  const themeNo = Number(m.theme_no);
  if (!Number.isInteger(evalNo) || evalNo < 1 || !Number.isInteger(themeNo) || themeNo < 1) return null;
  const detail = m.chapter === "detail";
  if (!detail && !(m.chapter === "detail_theme")) return null;
  // 절이 있는 대주제의 도입 글(has_sections)은 골격의 칸이 아님 — 절에 붙여 읽음(근거 글로는 씀)
  return {
    key: row.chunk_key,
    evalNo,
    evalTitle: String(m.eval_title ?? ""),
    themeNo,
    themeTitle: String(m.theme_title ?? ""),
    mark: detail ? String(m.mark ?? "") : "",
    title: detail ? String(m.title ?? "") : "",
    markers: [...(Array.isArray(m.theme_markers) ? m.theme_markers : []), ...(Array.isArray(m.markers) ? m.markers : [])].map(String),
    text: String(row.text ?? ""),
    page: row.report_page_2025 ?? null,
  };
}

/** 골격 글(요청·화면): 평가내용 → 대주제 → 절 제목 줄 */
export function skeletonLines(secs: MgPriorSection[]): string[] {
  const out: string[] = [];
  let ev = -1;
  let th = "";
  for (const s of [...secs].sort(partOrder)) {
    if (s.evalNo !== ev) {
      ev = s.evalNo;
      th = "";
      out.push(`평가내용 ${s.evalNo}. ${s.evalTitle}`);
    }
    const t = `${s.evalNo}.${s.themeNo}`;
    if (t !== th) {
      th = t;
      out.push(`  대주제 ${s.themeNo}. ${s.themeTitle || "(제목 없음)"}${s.mark ? "" : " — 절 없이 대주제 본문"}`);
    }
    if (s.mark) out.push(`    ${s.mark}. ${s.title}`);
  }
  return out;
}

const MARK_ORDER = "가나다라마바사아자차카타파하";
const markRank = (m: string) => (m ? MARK_ORDER.indexOf(m) + 1 || 99 : 0);
/** 평가내용 → 대주제 → 절 표지 순(대주제 본문이 그 대주제의 절보다 앞) */
export const partOrder = (a: { evalNo: number; themeNo: number; mark: string }, b: { evalNo: number; themeNo: number; mark: string }) => a.evalNo - b.evalNo || a.themeNo - b.themeNo || markRank(a.mark) - markRank(b.mark);

/**
 * 카드 ↔ 2025 보고서 평가내용 첫 대응(분석 문서 §5 — 카드 제목과 평가내용 제목 대조, 신뢰도 중~낮음 칸 포함). 구성안의 추천 기본값으로만 쓰고(설계 결정 2026-10-09),
 * 불명한 칸(3-1·7-2·9-3·10-2)은 후보를 여럿 둠 — 구성안에서 사람이 고름. 혁신가점(12~14)은 평가지표 한 장이라 빈 배열(그 지표의 평가내용 모두)
 */
export const MG_CARD_EVALS: Record<string, number[]> = {
  "1-1": [1],
  "1-2": [2],
  "2-1": [1],
  "2-2": [2],
  "2-3": [3],
  "3-1": [1, 3],
  "3-2": [2],
  "3-3": [4],
  "4-1": [1],
  "4-2": [1],
  "4-3": [1],
  "5-1": [1],
  "5-2": [1],
  "5-3": [1],
  "6-1": [1],
  "6-2": [2],
  "6-3": [3],
  "6-4": [4],
  "7-1": [1],
  "7-2": [1],
  "7-3": [2],
  "7-4": [3],
  "8-1": [1],
  "8-2": [2],
  "8-3": [3],
  "9-1": [1],
  "9-2": [2],
  "9-3": [3, 4],
  "9-4": [5],
  "10-1": [2],
  "10-2": [1, 2],
  "10-3": [3],
  "11-1": [3],
  "11-2": [1],
  "11-3": [2],
  "11-4": [2],
};

/** 이 카드의 추천 평가내용(전년 골격에 있는 번호만 — 대응이 없거나 골격에 없으면 그 지표의 평가내용 모두) */
export function defaultEvals(taskNo: string, secs: MgPriorSection[]): number[] {
  return evalsFor(taskNo, secs.map((s) => s.evalNo));
}

/** defaultEvals를 평가내용 번호 목록으로(목차·쪽 배정 lib/reports/mg-page-plan.ts도 씀) */
export function evalsFor(taskNo: string, evalNos: number[]): number[] {
  const all = [...new Set(evalNos)].sort((a, b) => a - b);
  const want = (MG_CARD_EVALS[taskNo] ?? []).filter((n) => all.includes(n));
  return want.length ? want : all;
}

// ---------------------------------------------------------------------------
// AI 답 스키마(구조는 여기, 필드 설명은 resources/prompts/report-outline-mg/schema.md)

export const MG_OUTLINE_OUT_FIELDS = [
  "message",
  "points",
  "parts",
  "part.evalNo",
  "part.themeNo",
  "part.themeTitle",
  "part.mark",
  "part.title",
  "part.story",
  "part.subStory",
  "part.why",
  "part.chip",
  "materials",
  "material.kind",
  "material.text",
  "material.when",
  "material.source",
  "material.quote",
  "blocks",
  "block.part",
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
  "splitAxis",
] as const;

export function mgOutlineOutSchema(desc?: Descriptions) {
  const d = <T extends z.ZodType>(s: T, key: (typeof MG_OUTLINE_OUT_FIELDS)[number]) => described(s, desc, key);
  const part = z.object({
    evalNo: d(z.number(), "part.evalNo"),
    themeNo: d(z.number(), "part.themeNo"),
    themeTitle: d(z.string(), "part.themeTitle"),
    mark: d(z.string(), "part.mark"),
    title: d(z.string(), "part.title"),
    // 주 틀 12종(섞음 없음 — 2026-10-12 C5, 두 틀이 필요하면 보조 틀). enum이 아니라 문자열로 받고 정리가 12종으로 맞춤(matchName — 가운뎃점 변형·띄어쓰기 하나로
    // 답 전체 파싱이 실패하지 않게, 2026-10-12). 모르는 이름·섞음은 빈 글. 옛 구성안의 섞음은 정리·편집에서만 읽음
    story: d(z.string(), "part.story"),
    subStory: d(z.string(), "part.subStory").optional(),
    why: d(z.string(), "part.why"),
    // 갈래 칩(2026-10-13 — 카드의 갈래 축 값, 선택 문자열: 정리가 표준 값·근거 글로 걸러 냄 — split-axes.ts cleanChip)
    chip: d(z.string(), "part.chip").optional(),
  });
  const material = z.object({
    id: z.string(),
    kind: d(z.enum(MATERIAL_KINDS), "material.kind"),
    text: d(z.string(), "material.text"),
    when: d(z.string(), "material.when"),
    source: d(z.string(), "material.source"),
    quote: d(z.string(), "material.quote"),
  });
  const block = z.object({
    part: d(z.number(), "block.part"),
    kind: d(z.enum(BLOCK_KINDS), "block.kind"),
    variant: d(z.string(), "block.variant"),
    label: d(z.string(), "block.label"),
    purpose: d(z.string(), "block.purpose"),
    cells: d(z.number(), "block.cells"),
    materials: d(z.array(z.string()), "block.materials"),
    figures: d(z.array(z.object({ kind: z.enum(FIGURE_KINDS), desc: z.string(), pos: z.enum(FIGURE_POS), size: z.enum(FIGURE_SIZES) })), "block.figures"),
    alts: d(z.array(z.object({ kind: z.enum(BLOCK_KINDS), variant: z.string(), why: z.string() })), "block.alts"),
    // 배치(라벨 사다리·전폭·단 띠)·폭(가로 반씩) — 2026-10-12, 주요사업 구성안과 같은 값(lib/reports/layout.ts)
    layout: d(z.enum(PLAN_LAYOUTS), "block.layout").optional(),
    span: d(z.enum(PLAN_SPANS), "block.span").optional(),
  });
  return z.object({
    message: d(z.string(), "message"),
    points: d(z.array(z.string()), "points"),
    parts: d(z.array(part), "parts"),
    materials: d(z.array(material), "materials"),
    blocks: d(z.array(block), "blocks"),
    // 갈래 축(카드 하나 — 절을 나누는 축, 선택 문자열: 정리가 사전 이름으로 맞춤 — split-axes.ts matchAxis)
    splitAxis: d(z.string(), "splitAxis").optional(),
  });
}
export const MgOutlineOut = mgOutlineOutSchema();
export type MgOutlineOutput = z.infer<typeof MgOutlineOut>;

/** 경영관리 구성안 프롬프트 파일(resources/prompts/report-outline-mg)에 있어야 하는 절 */
export const MG_OUTLINE_PROMPT_SPEC: PromptSpec = {
  system: ["system"],
  request: ["task", "memo", "storyHints", "storyHints.item", "storyHints.none", "storyHints.siblings", "siblings.head", "siblings.item", "diagram.head", "diagram.item", "part.head", "part.asked.story", "part.asked.free", "part.story", "part.storyFree", "part.item", "volume.head", "volume.part", "volume.tail", "close.strict", "close.loose", "close.none", ...INSPECTION_INPUT_SECTIONS, ...FRAME_INPUT_SECTIONS, ...SPLIT_INPUT_SECTIONS, "siblings.axis", "part.split"],
  schema: MG_OUTLINE_OUT_FIELDS,
};

// ---------------------------------------------------------------------------
// 정리·대조(결정론)

const cleanMark = (s: unknown) => {
  const m = String(s ?? "").replace(/[.\s]/g, "");
  return /^[가-하]$/.test(m) ? m : "";
};
export const isMgStory = (s: unknown): s is MgStory => (MG_STORIES as readonly string[]).includes(String(s));
/** 주 틀 12종인가(섞음 아님) — AI 답·절 다시 짜기·보조 틀은 이것만 */
export const isMgMainStory = (s: unknown): s is MgMainStory => (MG_MAIN_STORIES as readonly string[]).includes(String(s));

/** 절 이름(화면·경고): 「평가내용 1 · 대주제 2 · 가. 제목」 */
export function mgPartLabel(p: Pick<MgPart, "evalNo" | "themeNo" | "mark" | "title" | "themeTitle">): string {
  return `평가내용 ${p.evalNo} · 대주제 ${p.themeNo}${p.mark ? ` · ${p.mark}. ${p.title}` : p.themeTitle ? ` ${p.themeTitle}` : ""}`;
}

/** 절 순서대로 블록 정렬(같은 절 안은 원래 순서). 정렬 뒤 짝이 없어진 가로 반씩(절을 넘는 짝 포함)은 지운 사본으로(받은 블록은 바꾸지 않음) */
export function sortByParts(blocks: PlanBlock[], parts: MgPart[]): PlanBlock[] {
  const order = new Map(parts.map((p, i) => [p.key, i]));
  const sorted = blocks
    .map((b, i) => ({ b, i, o: order.get(b.at ?? "") ?? Number.MAX_SAFE_INTEGER }))
    .sort((x, y) => x.o - y.o || x.i - y.i)
    .map((x) => x.b);
  const probe = sorted.map((b) => ({ kind: b.kind, label: b.label, layout: b.layout, span: b.span }));
  dropLoneSpans(probe, sorted.map((b) => b.at ?? ""));
  return sorted.map((b, i) => {
    if (b.span === undefined || probe[i].span !== undefined) return b;
    const rest = { ...b };
    delete rest.span;
    return rest;
  });
}

/**
 * AI 구성안(경영관리) → 저장할 구성안 + 경고. 재료·블록은 주요사업과 같은 정리(cleanMaterials·cleanPlanBlock — 재료 상한만 절 수에 비례 mgMaterialCap), 절은 번호·표지를 정리하고
 * 평가내용·대주제 제목은 전년 골격에 있으면 그 이름을 씀(전년 골격에 없는 평가내용 번호는 버리지 않고 경고 — 보고서에 빈 평가내용 상자가 나옴).
 * 이야기 틀은 주 틀 12종만(섞음·모르는 틀은 빈 글), 보조 틀은 주 틀과 다를 때만. 블록은 가리킨 절(1부터 세는 번호)이 없으면 버리고, 블록이 없는 절도 뺌.
 * 갈래 축은 사전 이름으로(모르면 버림 — ctx.axis를 주면(절 다시 짜기) AI 답 대신 그 축), 절 칩은 그 축의 표준 값이거나 근거 원문(hayKey)에 있는 낱말만(split-axes.ts cleanChip — 축이 없거나 절 표지가 없는 절은 칩 없음).
 */
export function cleanMgComposition(out: MgOutlineOutput, hayKey: string, known: Set<string>, ctx: { indicator: string; prior: MgPriorSection[]; axis?: string }): { composition: Composition; warnings: string[] } {
  // 재료 상한의 절 수 = AI가 낸 절 중 번호가 맞는 서로 다른 절(절 상한까지)
  const partCount = Math.min(MG_LIMITS.parts, new Set((out.parts ?? []).filter((x) => Math.round(Number(x?.evalNo)) >= 1 && Math.round(Number(x?.themeNo)) >= 1).map((x) => mgPartKey(Math.round(Number(x.evalNo)), Math.round(Number(x.themeNo)), cleanMark(x.mark)))).size);
  const { materials, warnings } = cleanMaterials(out.materials, hayKey, known, mgMaterialCap(partCount));
  const ids = new Set(materials.map((m) => m.id));
  const axis = ctx.axis !== undefined ? ctx.axis : matchAxis(out.splitAxis, "mg");
  if (ctx.axis === undefined && !axis && String(out.splitAxis ?? "").trim()) warnings.push(`갈래: 「${String(out.splitAxis).trim()}」은(는) 경영관리 갈래 축 사전에 없어 뺐습니다.`);
  const chipWarnings = new Set<string>();
  const parts: MgPart[] = [];
  const keyAt: Array<string | null> = [];
  for (const raw of (out.parts ?? []).slice(0, MG_LIMITS.parts * 2)) {
    const evalNo = Math.round(Number(raw?.evalNo));
    const themeNo = Math.round(Number(raw?.themeNo));
    if (!(evalNo >= 1) || !(themeNo >= 1)) {
      keyAt.push(null);
      continue;
    }
    const mark = cleanMark(raw?.mark);
    const key = mgPartKey(evalNo, themeNo, mark);
    if (!parts.some((p) => p.key === key)) {
      if (parts.length >= MG_LIMITS.parts) {
        keyAt.push(null);
        continue;
      }
      const ev = ctx.prior.find((s) => s.evalNo === evalNo);
      const th = ctx.prior.find((s) => s.evalNo === evalNo && s.themeNo === themeNo);
      const story = matchName(raw?.story, MG_MAIN_STORIES);
      const sub = matchName(raw?.subStory, MG_MAIN_STORIES);
      // 갈래 칩: 축이 있고 절 표지가 있는 절만(대주제 본문은 제목 줄이 없음)
      const chip = mark ? partChip(raw?.chip, axis, hayKey, "", chipWarnings) : "";
      parts.push({
        key,
        evalNo,
        evalTitle: ev?.evalTitle ?? "",
        themeNo,
        themeTitle: cleanLine(raw?.themeTitle, 80) || th?.themeTitle || "",
        mark,
        title: mark ? cleanLine(raw?.title, 80) : "",
        story,
        ...(story && sub && sub !== story ? { subStory: sub } : {}),
        why: cleanLine(raw?.why, 160),
        ...(chip ? { chip } : {}),
      });
    }
    keyAt.push(key);
  }
  parts.sort(partOrder);
  const blocks: PlanBlock[] = [];
  let lost = 0;
  for (const b of (out.blocks ?? []).slice(0, MG_LIMITS.blocks)) {
    const at = keyAt[Math.round(Number(b?.part)) - 1] ?? null;
    const x = cleanPlanBlock(b, ids);
    if (!x) continue;
    if (!at) {
      lost += 1;
      continue;
    }
    blocks.push({ ...x, at });
  }
  if (lost) warnings.push(`구성: 놓일 절을 알 수 없는 블록 ${lost}개를 뺐습니다.`);
  warnings.push(...chipWarnings);
  const used = new Set(blocks.map((b) => b.at));
  const empty = parts.filter((p) => !used.has(p.key));
  if (empty.length) warnings.push(`구성: 블록이 없는 절 ${empty.length}개(${empty.map(mgPartLabel).join(" / ")})를 뺐습니다.`);
  const kept = parts.filter((p) => used.has(p.key));
  // 평가내용 번호 확인(2026-10-12 C11): 전년 골격이 있는데 그 번호가 없으면 경고만(버리지 않음 — 올해 새 평가내용일 수 있음)
  if (ctx.prior.length) {
    const knownEvals = new Set(ctx.prior.map((s) => s.evalNo));
    for (const n of [...new Set(kept.map((p) => p.evalNo))].filter((n) => !knownEvals.has(n))) warnings.push(`평가내용: ${n}번은 2025 보고서에 없는 번호입니다(2025: ${[...knownEvals].sort((a, b) => a - b).join("·")}) — 평가내용 상자가 제목 없이 나옵니다. 새 평가내용이면 확인하고, 아니면 맞는 번호로 다시 만들어 주세요.`);
  }
  const composition: Composition = {
    version: 1,
    message: cleanLine(out.message, 120),
    points: (out.points ?? []).map((x) => cleanLine(x, 120)).filter(Boolean).slice(0, 3),
    story: "",
    storyWhy: "",
    alternative: "",
    blocks: sortByParts(blocks, kept),
    results: "",
    resultShape: "bullets",
    materials,
    memo: "",
    mg: { indicator: ctx.indicator, parts: kept, ...(mgCloseRule(ctx.prior).strict ? { strictClose: true } : {}), ...(axis ? { axis } : {}) },
  };
  return { composition, warnings };
}

/** 절 칩 하나 정리(AI 답·사람 편집 공용): 축이 없으면 칩을 버리고(적었으면 경고), 있으면 cleanChip. 경고는 warnings에 모음 */
function partChip(raw: unknown, axis: string, hayKey: string, keep: string, warnings: Set<string>): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (!axis) {
    warnings.add("갈래: 갈래 축이 없어 절 칩을 뺐습니다.");
    return "";
  }
  const c = cleanChip(s, axis, hayKey, keep);
  if (c.warning) warnings.add(c.warning);
  return c.chip;
}

/** 재료 없이도 되는 글·띠 블록 */
const TEXT_KINDS = new Set<BlockKind>(["band", "banner", "subhead"]);

/** '25 지적 대응 어휘(2026-10-17 서사 순서 측정과 같은 정규식) */
const FINDING_WORDS = /지적|평가위원|개선\s?요구|평가\s?의견/;

/**
 * 여는 블록이 '25 지적 대응에서 시작하는지(경영관리 구성안 — 경고만, 2026-10-17 서사 순서 S): 핵심 메시지 또는 절마다 첫 블록의 목적·라벨에 지적 어휘.
 * 2025 경영관리 보고서는 지적 대응을 지표 단위 「Ⅰ. 지적사항 조치실적」 표가 맡고 본문 절은 지적에서 시작하지 않음. 없으면 빈 글
 */
export function mgFindingOpenIssue(c: Composition): string {
  const where: string[] = [];
  if (FINDING_WORDS.test(c.message)) where.push("핵심 메시지");
  for (const p of c.mg?.parts ?? []) {
    const first = c.blocks.find((b) => b.at === p.key);
    if (first && (FINDING_WORDS.test(first.purpose) || FINDING_WORDS.test(first.label))) where.push(`${mgPartLabel(p)} 첫 블록`);
  }
  return where.length ? `구성안: 여는 블록이 '25 지적 대응에서 시작 — 이 과제의 가치(왜)에서 시작하고 지적 대응은 그것을 해소하는 블록 하나로(${where.join(" · ")}).` : "";
}

/** 구성안 점검(경영관리 — 화면 경고): 블록 없는 절, 추진성과로 닫지 않은 절, 지적으로 여는 절(mgFindingOpenIssue), 자료 필요, 재료·목적 없는 블록. 판면 어림은 하지 않음 */
export function mgCompositionIssues(c: Composition): string[] {
  if (!c.blocks.length) return ["구성안에 블록이 없습니다."];
  const out: string[] = [];
  const parts = c.mg?.parts ?? [];
  const strict = Boolean(c.mg?.strictClose);
  const open = new Set(unclosedPartKeys(parts, c.blocks.map((b) => ({ at: b.at ?? "", label: b.label, kind: b.kind, variant: b.variant })), strict));
  for (const p of parts) {
    const bs = c.blocks.filter((b) => b.at === p.key);
    if (!bs.length) out.push(`절: ${mgPartLabel(p)}에 블록이 없습니다.`);
    // 막지 않고 알림만(대주제 본문은 예외) — 성과로 닫음 = 「추진성과」·「추진실적」·「성과」 라벨 또는 같은 대주제 마지막 절의 공용 추진성과(분석 §8.8), 엄격 지표는 마지막 블록 라벨 「추진성과」만
    else if (open.has(p.key)) out.push(strict ? `절: ${mgPartLabel(p)}의 마지막 블록이 라벨 「추진성과」가 아닙니다 — 이 지표의 2025 보고서는 절마다 「추진성과」 행으로 닫았습니다(성과 재료가 없으면 「자료 필요」로 남김).` : `절: ${mgPartLabel(p)}이(가) 성과로 닫히지 않습니다 — 「추진성과」 행이나 「추진실적」 열이 든 구분표(또는 대주제 마지막 절의 공용 추진성과)로 성과를 보일 재료가 있으면 둡니다.`);
  }
  // 모양 다양성(2026-10-12 — 경고만): 한 절에 같은 표 모양 하나까지, 카드 전체 서로 다른 모양이 절반 넘게
  out.push(...mgVarietyIssues(c.blocks, c.blocks.map((b) => b.at ?? ""), parts.map((p) => ({ key: p.key, name: mgPartLabel(p) }))));
  const opening = mgFindingOpenIssue(c);
  if (opening) out.push(opening);
  const need = c.materials.filter((m) => m.kind === "need");
  if (need.length) out.push(`자료 필요 ${need.length}건: ${need.map((m) => m.text).join(" · ")}`);
  const name = (b: PlanBlock, i: number) => `${i + 1}번 ${b.label || shapeName(b.kind, b.variant)}`;
  const bare = c.blocks.map((b, i) => ({ b, i })).filter(({ b }) => !TEXT_KINDS.has(b.kind) && !b.materials.length);
  if (bare.length) out.push(`재료 없는 블록: ${bare.map(({ b, i }) => name(b, i)).join(" · ")} — 재료를 넣지 않으면 집필이 근거 없이 채우지 못합니다.`);
  const aimless = c.blocks.map((b, i) => ({ b, i })).filter(({ b }) => !b.purpose.trim());
  if (aimless.length) out.push(`목적 없는 블록: ${aimless.map(({ b, i }) => name(b, i)).join(" · ")} — 이 블록이 보여 줄 것을 한 줄 적어 주세요.`);
  return out;
}

/**
 * 절 이야기 틀 고치기(사람 편집): 주 틀은 12종(옛 섞음은 원래 섞음이던 절이 그대로 둘 때만 — 새로 섞음을 고를 수는 없음), 모르는 틀이면 그대로.
 * 보조 틀은 빈 글이면 지우고 주 틀과 다른 12종이면 받음(빠뜨리면 그대로). 주 틀을 바꾸면서 보조 틀을 옛 값 그대로 보내면 지움(주요사업처럼 주 틀에 딸린 것)
 */
function partStories(p: MgPart, x: { story?: string; subStory?: string } | undefined): Pick<MgPart, "story" | "subStory"> {
  const story: MgPart["story"] = isMgMainStory(x?.story) || (x?.story === "섞음" && p.story === "섞음") ? (x!.story as MgStory) : p.story;
  const raw = x && "subStory" in x ? x.subStory : p.subStory;
  const stale = story !== p.story && raw === p.subStory;
  const sub = !stale && isMgMainStory(raw) && raw !== story && isMgMainStory(story) ? raw : undefined;
  return { story, subStory: sub };
}

/**
 * 사람 편집(경영관리): 블록 편집은 주요사업과 같은 규칙(applyCompositionEdit — 블록 상한만 MG_LIMITS)에 절 표지를 얹음.
 * 절은 저장된 구성안 안의 열쇠만 — 순서·제목·이야기 틀(주 틀·보조 틀 — partStories)·갈래 칩을 바꾸고, 목록에서 빠진 절은 뺌(모두 빼면 원래대로). 놓일 절이 없는 블록은 첫 절로, 블록은 절 순서대로 다시 섬.
 * 갈래 축(e.split.axis — 빈 글이면 지움, 빠뜨리면 그대로)·절 칩은 AI 답과 같은 규칙(hayKey = 근거 글 — 서버가 카드·재료표 글로 만듦, 같은 축이면 저장된 칩은 그대로 둘 수 있음)
 */
export function applyMgCompositionEdit(c: Composition, e: CompositionEdit, hayKey = ""): { composition: Composition; notes: string[] } {
  const r = applyCompositionEdit(c, e, MG_LIMITS.blocks);
  if (!c.mg) return r;
  const known = new Map(c.mg.parts.map((p) => [p.key, p]));
  const chipNotes = new Set<string>();
  const rawAxis = e.split && typeof e.split === "object" ? String(e.split.axis ?? "") : null;
  const axis = rawAxis === null ? (c.mg.axis ?? "") : matchAxis(rawAxis, "mg");
  if (rawAxis?.trim() && !axis) chipNotes.add(`갈래: 「${rawAxis.trim()}」은(는) 경영관리 갈래 축 사전에 없어 뺐습니다.`);
  const sameAxis = axis === (c.mg.axis ?? "");
  const parts: MgPart[] = [];
  for (const x of Array.isArray(e.parts) ? e.parts : c.mg.parts) {
    const p = known.get(String(x?.key ?? ""));
    if (!p || parts.some((q) => q.key === p.key)) continue;
    const next: MgPart = { ...p, title: p.mark ? cleanLine(x?.title, 80) || p.title : "", ...partStories(p, x) };
    if (!next.subStory) delete next.subStory;
    const rawChip = x && "chip" in x ? x.chip : p.chip;
    const chip = p.mark ? partChip(rawChip, axis, hayKey, sameAxis ? (p.chip ?? "") : "", chipNotes) : "";
    if (chip) next.chip = chip;
    else delete next.chip;
    parts.push(next);
  }
  const kept = parts.length ? parts : c.mg.parts;
  const keys = new Set(kept.map((p) => p.key));
  const notes = [...r.notes];
  let moved = 0;
  const blocks = r.composition.blocks.map((b) => {
    if (b.at && keys.has(b.at)) return b;
    moved += 1;
    return { ...b, at: kept[0].key, by: "human" as const };
  });
  if (moved) notes.push(`놓일 절이 없는 블록 ${moved}개를 첫 절로 옮겼습니다.`);
  notes.push(...[...chipNotes].map((w) => w.replace(/^갈래:\s*/, "갈래 칩: ")));
  const mg = { ...c.mg, parts: kept };
  if (axis) mg.axis = axis;
  else delete mg.axis;
  return { composition: { ...r.composition, story: "", blocks: sortByParts(blocks, kept), mg }, notes };
}

// ---------------------------------------------------------------------------
// 같은 지표 다른 카드의 짜임(형제) — 대주제·절 겹침 점검과 구성안 요청(2026-10-09).
// 경영관리는 카드 여러 장이 한 지표의 평가내용·대주제를 나눠 맡아(MG-4는 카드 3장 : 대주제 6개) 두 카드가 같은 절 표지를 고르면 보고서에서 절이 겹침

export interface MgSiblingPart {
  key: string;
  evalNo: number;
  themeNo: number;
  mark: string;
  title: string;
  /** 「평가내용 N · 대주제 N · 가. 제목」 */
  label: string;
  story: string;
  /** 보조 틀(없으면 주 틀 하나) */
  subStory?: string;
  /** 이 절 블록의 종류(모양) 순서 */
  signature: string;
  /** 갈래 칩(없으면 칩 없음) */
  chip?: string;
}

export interface MgSibling {
  /** 카드 과제번호(9-1 등) */
  taskNo: string;
  parts: MgSiblingPart[];
  /** 그 카드 구성안의 갈래 축(없으면 축 없음) */
  axis?: string;
}

const blockSig = (b: Pick<PlanBlock, "kind" | "variant">) => (b.variant && b.variant !== (VARIANTS[b.kind]?.[0] ?? "") ? `${b.kind}:${b.variant}` : b.kind);

/** 구성안 → 형제 짜임(절마다 열쇠·이름·틀·블록 서명). 구성안이 없거나 경영관리 골격이 없으면 null */
export function mgSiblingOf(taskNo: string, c: Composition | null): MgSibling | null {
  if (!c?.mg?.parts.length) return null;
  return {
    taskNo,
    parts: c.mg.parts.map((p) => ({
      key: p.key,
      evalNo: p.evalNo,
      themeNo: p.themeNo,
      mark: p.mark,
      title: p.title,
      label: mgPartLabel(p),
      story: p.story,
      ...(p.subStory ? { subStory: p.subStory } : {}),
      signature: c.blocks.filter((b) => b.at === p.key).map(blockSig).join(" → "),
      ...(p.chip ? { chip: p.chip } : {}),
    })),
    ...(c.mg.axis ? { axis: c.mg.axis } : {}),
  };
}

/** 절 제목 비교용(띄어쓰기·문장부호 걷기) */
const titleKey = (s: string) => s.replace(/[\s·・ㆍ,.'’“”"()（）\-–—]/g, "");

/**
 * 같은 지표 다른 카드와 겹치는 절(결정론 — 구성안 경고): 같은 절 열쇠(같은 평가내용·대주제·표지), 같은 대주제 본문(표지 없음),
 * 같은 대주제 안 같은 절 제목. 같은 대주제의 다른 절은 겹침이 아님(카드 여러 장이 한 대주제를 나눠 맡음)
 */
export function mgOverlapIssues(c: Composition, siblings: MgSibling[]): string[] {
  const out: string[] = [];
  for (const p of c.mg?.parts ?? []) {
    for (const sib of siblings) {
      const hit = sib.parts.find((q) => q.key === p.key);
      const sameTitle = !hit && p.mark && sib.parts.find((q) => q.evalNo === p.evalNo && q.themeNo === p.themeNo && q.mark && titleKey(q.title) && titleKey(q.title) === titleKey(p.title));
      if (hit) out.push(`겹침: ${mgPartLabel(p)} — ${sib.taskNo} 카드 구성안도 같은 ${p.mark ? "절" : "대주제 본문"}(${p.key})을 맡습니다. 이 카드의 절 표지를 다음 글자로 바꾸거나 다른 대주제로 옮겨 주세요.`);
      else if (sameTitle) out.push(`겹침: ${mgPartLabel(p)} — ${sib.taskNo} 카드 구성안의 ${sameTitle.label}과(와) 같은 제목입니다. 두 카드가 같은 내용을 쓰는지 확인해 주세요.`);
    }
  }
  return out;
}

/** 구성안 요청 「같은 지표 다른 카드의 짜임」(report-outline-mg/request.md siblings.*) — 형제가 없으면 빈 글 */
export function mgSiblingsPrompt(p: PromptSet, siblings: MgSibling[]): string {
  // 갈래 축이 있는 카드는 그 카드 절 줄 앞에 축 한 줄(siblings.axis), 절 줄에는 칩(chip — 없으면 빈 글)
  const rows = siblings.flatMap((sb) => [
    ...(sb.axis ? [fillFrom(p, "request", "siblings.axis", { taskNo: sb.taskNo, axis: sb.axis })] : []),
    ...sb.parts.map((x) => fillFrom(p, "request", "siblings.item", { taskNo: sb.taskNo, key: x.key, label: x.label, story: storyLabel(x.story, x.subStory) || "—", signature: x.signature || "—", chip: x.chip ? ` · 칩 [${x.chip}]` : "" })),
  ]);
  if (!rows.length) return "";
  return [fillFrom(p, "request", "siblings.head", { count: siblings.length }), ...rows].join("\n");
}

/** 경영관리 도식 후보 옵션(sectionHints — 2026-10-12 C12): 경영관리 짜임 신호를 켜고, 추천 평가내용의 2025 절 글도 신호를 볼 글로 */
export const mgHintOptions = (ctx: { prior: MgPriorSection[]; evals: number[] }): HintOptions => ({ track: "mg", extraTexts: ctx.prior.filter((s) => ctx.evals.includes(s.evalNo)).map((s) => s.text) });

/** 구성안 요청 「도식 고르기」(report-outline-mg/request.md diagram.*) — 앱이 카드·첨부에서 찾은 도식 후보, 없으면 빈 글 */
export function mgDiagramPrompt(p: PromptSet, hints: DiagramHint[]): string {
  if (!hints.length) return "";
  return [fillFrom(p, "request", "diagram.head"), ...hints.map((h) => fillFrom(p, "request", "diagram.item", { kind: h.kind, why: h.why, group: h.own ? "이 과제만의 요소" : "기본 도식" }))].join("\n");
}

/** 성과로 닫는 블록인지: 라벨에 「추진성과」·「추진실적」·「성과」(띄어쓰기 무시) */
const closesResult = (label: string) => /추진성과|추진실적|성과/.test(label.replace(/\s/g, ""));

/** 2025 절 글의 라벨 「추진성과」 행 — 조각 글은 kordoc이 표를 「라벨 | 내용」 줄로 편 것이라 줄머리에 남음(lib/knowledge/parsers/report25-mg.ts) */
const RESULT_ROW_RE = /(^|\n)\s*추진\s*성과\s*\|/;

/** 이 지표 2025 보고서의 닫기 관례: 절(표지 있는 것 — 대주제 본문 제외)이 모두 「추진성과」 행을 가지면 엄격 */
export interface MgCloseRule {
  strict: boolean;
  /** 「추진성과」 행이 글에서 보인 절 수 · 절 수 */
  closed: number;
  total: number;
}

/**
 * 닫기 관례(결정론 — 2026-10-12 사용자 결정 D2): 2025 절 글에 「추진성과 |」 줄머리가 있는 절을 셈. 14개 지표 조각으로 세면 MG-12(11/11)·MG-13(9/9)만 모두이고
 * 이는 육안 판정(분석 docs/analysis/2025-경영관리-경영실적보고서-분석.md §8.7·§8.8 — MG-12 닫음 11/11·공용 0, MG-13 미종결 0)과 같음.
 * 글에서는 표 안 추진성과가 빠지기도 해(MG-8 1-2-나 등 육안 닫음인데 글에 없음) 닫은 절을 덜 세는 쪽으로만 틀림 — 그래서 엄격 판정은 「모두」일 때만
 */
export function mgCloseRule(prior: MgPriorSection[]): MgCloseRule {
  const secs = prior.filter((s) => s.mark);
  const closed = secs.filter((s) => RESULT_ROW_RE.test(s.text)).length;
  return { strict: secs.length > 0 && closed === secs.length, closed, total: secs.length };
}

/** 구성안·집필 요청의 「닫기 관례」 한 줄(report-outline-mg·report-draft-mg request.md close.*) */
export function mgClosePrompt(p: PromptSet, prior: MgPriorSection[], indicator: string): string {
  const rule = mgCloseRule(prior);
  if (!rule.total) return fillFrom(p, "request", "close.none", { indicator });
  return fillFrom(p, "request", rule.strict ? "close.strict" : "close.loose", { indicator, total: rule.total });
}

/**
 * 성과로 닫지 않은 절 열쇠(대주제 본문은 예외 — 구성안 점검·집필 점검 공용). 2025 경영관리 14개 지표 육안(분석 §8.8): 「추진성과」 행 없이 끝나는 절 46% —
 * 구분표의 「추진실적」 열과 대주제 공용 추진성과를 닫음으로 인정하면 22%. 그래서 라벨에 성과·실적이 든 블록이 있거나, 같은 대주제의 마지막 절이 성과로 닫으면 그 대주제의 앞 절도 닫은 것으로 봄.
 * strict(엄격 지표 — mgCloseRule): 절마다 마지막 블록 라벨이 「추진성과」여야 함 — 「추진실적」·대주제 공용 추진성과는 인정하지 않음(2025 MG-12·13은 공용 추진성과 0)
 */
export function unclosedPartKeys(parts: MgPart[], blocks: Array<{ at: string; label: string; kind?: string; variant?: string }>, strict = false): string[] {
  if (strict) return parts.filter((p) => p.mark && !/추진성과/.test((blocks.filter((b) => b.at === p.key).at(-1)?.label ?? "").replace(/\s/g, ""))).map((p) => p.key);
  // 추진실적 열 표(table:result — 오른쪽 「추진실적」 칸)는 라벨과 상관없이 「추진실적」 닫기(2026-10-12 — 분석 「추진성과로 닫지 않는 절」의 오른쪽 추진실적 열)
  const closed = (key: string) => blocks.some((b) => b.at === key && (closesResult(b.label) || (b.kind === "table" && b.variant === "result")));
  const lastOfTheme = new Map<string, string>();
  for (const p of parts) if (p.mark) lastOfTheme.set(`${p.evalNo}.${p.themeNo}`, p.key);
  return parts.filter((p) => p.mark && !closed(p.key) && !closed(lastOfTheme.get(`${p.evalNo}.${p.themeNo}`) ?? "")).map((p) => p.key);
}

/**
 * 절별 「이 틀로 다시 짜기」 요청 대상(2026-10-10 사용자 결정 — 주요사업 「틀 바꾸기」처럼, 다른 절은 그대로).
 * 2026-10-12: 이야기 틀 대신(또는 함께) 구성 패턴·2025 예시 절·요청 글로도 다시 짬 — story가 없으면 AI가 그 절의 주 틀·보조 틀을 고름, frame은 고른 짜임의 요청 글 재료
 */
export interface MgPartRedo {
  part: MgPart;
  /** 고른 주 틀(보조 틀은 다시 짜면 지움). 없으면 AI가 고름 */
  story?: MgMainStory;
  /** 다른 절(겹치지 않게 — 열쇠·이름·틀·블록 라벨) */
  others: Array<{ key: string; label: string; story: string; blocks: string }>;
  /** 담당자가 고른 구성 패턴·2025 예시 절·여러 안 맥락(lib/reports/framework-pick.ts framePrompt) */
  frame?: FrameInput;
  /** 카드의 갈래 축(구성안 mg.axis — 이 절 칩은 그 축의 값으로). 없으면 축 없음 */
  axis?: string;
}

/** 다시 짤 절과 다른 절 요약(구성안의 절·블록에서) */
export function mgPartRedo(c: Composition, key: string, story?: MgMainStory, frame?: FrameInput): MgPartRedo | null {
  const parts = c.mg?.parts ?? [];
  const part = parts.find((p) => p.key === key);
  if (!part) return null;
  const others = parts
    .filter((p) => p.key !== key)
    .map((p) => ({ key: p.key, label: mgPartLabel(p), story: storyLabel(p.story, p.subStory) || "—", blocks: c.blocks.filter((b) => b.at === p.key).map((b) => b.label || shapeName(b.kind, b.variant)).join(" → ") || "—" }));
  return { part, ...(story ? { story } : {}), others, ...(frame ? { frame } : {}), ...(c.mg?.axis ? { axis: c.mg.axis } : {}) };
}

/**
 * 구성안 요청 「이 절만 다시 짜기」(report-outline-mg/request.md part.*) — 전체 구성안 요청(task 절) 대신 붙임. 틀을 골랐으면 그 틀 하나로(part.story),
 * 아니면 AI가 고른 짜임·요청에 맞게 주 틀을 고름(part.storyFree). 고른 구성 패턴·예시 절은 다른 절 목록 뒤에(framePrompt)
 */
export function mgPartPrompt(p: PromptSet, r: MgPartRedo): string {
  const asked = r.story ? fillFrom(p, "request", "part.asked.story", { story: r.story }) : fillFrom(p, "request", "part.asked.free");
  const storyRule = r.story ? fillFrom(p, "request", "part.story", { story: r.story }) : fillFrom(p, "request", "part.storyFree");
  const head = [
    fillFrom(p, "request", "part.head", { key: r.part.key, label: mgPartLabel(r.part), evalNo: r.part.evalNo, themeNo: r.part.themeNo, mark: r.part.mark || "없음(대주제 본문)", asked, storyRule, maxBlocks: 6 }),
    ...r.others.map((o) => fillFrom(p, "request", "part.item", o)),
    // 갈래 축이 있으면 이 절의 칩도 그 축 값으로(지금 칩 — 없으면 「없음」)
    ...(r.axis && r.part.mark ? [fillFrom(p, "request", "part.split", { axis: r.axis, chip: r.part.chip || "없음" })] : []),
  ].join("\n");
  const frame = r.frame ? framePrompt(p, r.frame, true) : "";
  return frame ? `${head}\n\n${frame}` : head;
}

const materialNo = (id: string) => Number(/^m(\d+)$/.exec(id)?.[1] ?? 0);

/**
 * 절 하나만 다시 짠 AI 구성안(next)을 지금 구성안(current)에 합침(결정론): 그 절의 블록만 새 블록으로 바꾸고(새 블록은 모두 그 절 열쇠로 — AI가 표지를 바꿔도),
 * 새 블록의 재료는 지금 재료와 글·구절이 같으면 그 번호를, 아니면 겹치지 않는 새 번호로 붙임. 그 절의 틀은 고른 주 틀로(보조 틀은 지움 — 주 틀 기준으로 다시 짬),
 * 틀을 고르지 않은 다시 짜기(구성 패턴·예시 절·요청 글만 — 2026-10-12)는 AI가 그 절에 적은 주 틀·보조 틀(정리된 12종 — 없으면 지금 틀), 둔 이유는 새 답에 있으면 바꿈.
 * 고른 짜임(frame)은 그 절에 남김(주면 바꾸고, 안 주면 지움). 갈래 칩은 새 답에 (정리를 통과한) 칩이 있으면 그것, 없으면 지금 칩 그대로(축은 카드의 것 — 절 다시 짜기에서 안 바뀜).
 * 다른 절의 블록·재료·사람이 고친 내용은 그대로. 바뀐 절의 옛 블록만 가리키던 재료는 뺌.
 * 블록 상한(MG_LIMITS.blocks)을 넘는 새 블록은 버림. AI가 블록을 내지 못하면 바꾸지 않음(changed false)
 */
export function replaceMgPart(current: Composition, next: Composition, key: string, pick: MgMainStory | { story?: MgMainStory; frame?: OutlineFrame }): { composition: Composition; changed: boolean; notes: string[] } {
  const chosen = typeof pick === "string" ? { story: pick } : pick;
  const notes: string[] = [];
  const parts = current.mg?.parts ?? [];
  if (!current.mg || !parts.some((p) => p.key === key)) return { composition: current, changed: false, notes: ["구성안에 없는 절입니다."] };
  const kept = current.blocks.filter((b) => b.at !== key);
  const room = Math.max(0, MG_LIMITS.blocks - kept.length);
  if (next.blocks.length > room) notes.push(`블록 상한(${MG_LIMITS.blocks}개)을 넘어 새 블록 ${next.blocks.length - room}개를 뺐습니다.`);
  const fresh = next.blocks.slice(0, room);
  if (!fresh.length) return { composition: current, changed: false, notes: [...notes, "AI가 이 절의 블록을 내지 못해 구성안을 그대로 두었습니다."] };
  // 재료 번호 다시 매기기(같은 글·구절이면 지금 번호를 다시 씀)
  const same = (a: { text: string; quote: string }, b: { text: string; quote: string }) => a.text === b.text && a.quote === b.quote;
  let top = Math.max(0, ...current.materials.map((m) => materialNo(m.id)));
  const idMap = new Map<string, string>();
  const added: Composition["materials"] = [];
  for (const m of next.materials) {
    if (!fresh.some((b) => b.materials.includes(m.id))) continue;
    const hit = current.materials.find((x) => same(x, m)) ?? added.find((x) => same(x, m));
    if (hit) idMap.set(m.id, hit.id);
    else {
      const id = `m${++top}`;
      idMap.set(m.id, id);
      added.push({ ...m, id });
    }
  }
  const newBlocks = fresh.map((b) => ({ ...b, at: key, materials: b.materials.map((id) => idMap.get(id)).filter((id): id is string => Boolean(id)) }));
  // 바뀐 절의 옛 블록만 가리키던 재료는 뺌(다른 블록이 쓰거나 어느 블록도 안 쓰던 재료 — 자료 필요 등 — 는 그대로)
  const usedAfter = new Set([...kept, ...newBlocks].flatMap((b) => b.materials));
  const oldOnly = new Set(current.blocks.filter((b) => b.at === key).flatMap((b) => b.materials).filter((id) => !usedAfter.has(id)));
  const materials = [...current.materials.filter((m) => !oldOnly.has(m.id)), ...added];
  const ai = next.mg?.parts[0];
  const why = ai?.why ?? "";
  const nextParts = parts.map((p) => {
    if (p.key !== key) return p;
    const story: MgPart["story"] = chosen.story ?? (isMgMainStory(ai?.story) ? ai.story : p.story);
    const out: MgPart = { ...p, story, ...(why ? { why } : {}) };
    delete out.subStory;
    if (!chosen.story && ai?.subStory && ai.subStory !== story && isMgMainStory(story)) out.subStory = ai.subStory;
    if (chosen.frame) out.frame = chosen.frame;
    else delete out.frame;
    if (ai?.chip && p.mark) out.chip = ai.chip;
    return out;
  });
  return {
    composition: { ...current, blocks: sortByParts([...kept, ...newBlocks], nextParts), materials, mg: { ...current.mg, parts: nextParts } },
    changed: true,
    notes,
  };
}
