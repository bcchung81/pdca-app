// 12월 경영실적보고서 — 과제관리카드 1건 → 평가내용2 소항목(「가.」) 초안 spec(순수).
// 근거: docs/analysis/2025-주요사업-경영실적보고서-분석.md — B-2(번호 체계·정형 구조·마커), C-4(카드 필드 ↔ 보고서 부분), C-5(결정론/AI 경계), D-1·F-d(블록 spec).
// 결정론(코드): 대상사업·실행과제 번호(N-M)·소항목 표시(가.)·마커(신규·AI·지적개선)·숫자 대조. AI: 소항목 제목·라벨 사다리 불릿·도식 채우기·추진성과 문장.
// AI에 보내는 지시문(시스템 적응문·요청 문구·답 필드 설명)은 코드에 쓰지 않고 resources/prompts/report-draft/*.md에 둡니다(서버 모듈 lib/prompts/sets.ts가 읽어 ReportPrompts로 넘김).
// 여기는 조건·반복·셈(분량 공식, 첨부 글 몫, 전년 절 「같은 과제」 기준)만 — 보고서 작성 지침이 따로 오면 프롬프트 파일을 바꿉니다.

import { z } from "zod";
import { cardOutline } from "../ai/writer.ts";
import { inspectionCardText } from "../ai/inspect.ts";
import { BLOCK_OUT_FIELDS, type Block, STORIES, actualBars, blockBullets, blockOutSchema, blockSignature, blockTexts, cleanBlocks, layoutHints, visualCount } from "./blocks.ts";
import { KB_SECTIONS } from "../knowledge/kb-sections.ts";
import { type Descriptions, type PromptSet, type PromptSpec, described, fillFrom } from "../prompts/template.ts";
import { FIT_BAND, type FitLine, type FitNeed, type FitReport, type HeadMode, PAGE_MM, blockAreaMm, blockCosts, capacityLines, fitReport, guardFigures, hollowWarning, subTitleMax } from "./fit.ts";
import { isStory, storyLabel } from "./frameworks.ts";
import { cardFindings } from "./findings.ts";
import { type DiagramHint, type HintOptions, bizVarietyIssue, diagramHints, kindUsage, ownKindsIn, repeatedKinds } from "./diagram-hints.ts";
import { NEEDS_MAX, NEED_RE, type YearActuals, dedupeNeedYear, stripNeeds, yearActuals, yearIssues } from "./actuals.ts";
import { GROUND_WEAK, groundScores } from "./ground.ts";
import { proseIssues } from "./prose.ts";
import { kpiMissingWarning } from "./kpi-cover.ts";
import { figureRepeatWarning } from "./repeat-figures.ts";
import { planAsResultWarning, resultPlanWarning } from "./result-plan.ts";
import { LENS_GROUPS, type LensRef, SURVEY_TYPES } from "./lens.ts";
import { type PriorPick, priorLabel } from "./prior.ts";
import type { MgDraftMeta } from "./mg-types.ts";
import type { LooseJson } from "../loose-json.ts";
import { arrowTitleWarnings, bareBoxWarnings, subTitleIssues } from "./title-checks.ts";

type Json = LooseJson;

// 라벨 사다리 행(순서대로). 2025 최종본 평가내용2 본문 실측 — 추진배경이 가장 많고 현황 및 문제점·추진방향·추진실적 순(docs/analysis/diagram-catalog-2025.html §3)
export const LADDER_LABELS = ["추진배경", "현황 및 문제점", "추진방향", "추진내용", "추진노력", "추진실적"] as const;
export type LadderLabel = (typeof LADDER_LABELS)[number];
export const DIAGRAM_TYPES = ["none", "before_after", "process_flow", "timeline", "card_grid", "action_table"] as const;
export type DiagramType = (typeof DIAGRAM_TYPES)[number];
export const MARKERS = ["BP", "지적개선", "신규", "AI"] as const;
export type Marker = (typeof MARKERS)[number];

export interface Diagram {
  type: DiagramType;
  title: string;
  /** before_after: 구분·기존·개선 */
  rows: Array<{ key: string; before: string[]; after: string[] }>;
  /** process_flow(단계)·timeline(시기 = title)·card_grid(카드) */
  steps: Array<{ title: string; bullets: string[]; note: string }>;
  /** action_table: 추진 노력·추진 성과 */
  actions: Array<{ effort: string; result: string }>;
}

/** 행 오른쪽 작은 막대(’24 vs ’25 등) — 값은 근거에 적힌 수치 그대로, 막대 높이는 렌더러가 셈(결정론) */
export interface MiniChart {
  title: string;
  series: Array<{ label: string; value: string }>;
  badge: string;
}

export interface LadderRow {
  label: LadderLabel;
  bullets: string[];
  diagram: Diagram;
  /** v2: 행 오른쪽 막대(없으면 null) */
  chart?: MiniChart | null;
}

/** v2: 추진배경 위 인용 상자(정부·CEO·현장) — quote는 카드·첨부 원문에서 찾은 것만 남음 */
export interface ContextBox {
  chip: string;
  title: string;
  quote: string;
  cite: string;
}

/** v2: 우수사례 상자(수상·선정·보도) — 근거 원문 구절(evidence)을 찾은 것만 남음 */
export interface CaseBox {
  tab: string;
  title: string;
  items: string[];
}

/** v2: 3칸 추진성과 한 칸 */
export interface ResultCard {
  tag: string;
  headline: string;
  figure: string;
}

/** 소항목 1건 spec(HTML·HWPX 렌더러가 같이 읽는 모양) */
export interface ReportSectionSpec {
  /** 1 = 라벨 사다리 + 추진성과, 2 = + 인용 상자·메시지 띠·행 막대·우수사례·3칸 추진성과, 3 = 블록 목록(짜임 자유 — blocks). 읽기는 모두 */
  version: 1 | 2 | 3;
  card: { id: string; taskNo: string; title: string };
  business: { no: number; name: string };
  task: { no: string; title: string; bp: boolean };
  /** chip = 갈래 칩(제목 앞 「[값] 」 — 승인된 구성안 split에서 코드가 옮김, lib/reports/split-axes.ts). 없으면 칩 없음(이 기능 전 초안 포함) */
  sub: { mark: string; title: string; markers: Marker[]; chip?: string };
  rows: LadderRow[];
  results: string[];
  caption: string;
  /** v2 */
  context?: ContextBox[];
  banner?: string;
  cases?: CaseBox[];
  resultCards?: ResultCard[];
  /** 추진성과 막대(곁들임 — 불릿 오른쪽, 2025 1-1 다): 값이 모두 근거에 있고 막대마다 시점 라벨이 있을 때만. 3칸과는 함께 쓰지 않음 */
  resultChart?: MiniChart | null;
  /** 추진성과 강조 띠(상자 오른쪽 끝 칩 24자 안 — 2025 「C → B」 향상!·「1.6시간」 단축!): 숫자·등급이 근거에 있을 때만 */
  resultBand?: string;
  /** v3: 이야기 순서대로 놓인 블록(라벨이 있으면 사다리 행) — v3에서는 rows가 빈 배열 */
  blocks?: Block[];
  /** v3: 이야기 틀(형제 초안과 겹침을 봄) */
  story?: string;
  /** 쪽 모듈(0.5쪽 단위) — 목차·쪽 배정 값이 있으면 그것, 없으면 분석 D-2(AX 붙임 카드 1쪽, 그 밖 0.5쪽) */
  module: number;
  /** 초안을 만들 때 넣은 첨부 자료(카드 전용 자료·보고서 추가자료)와 전년 절. 없으면 카드만 */
  sources?: ReportSource[];
  /** 이 초안에 고른 전년 절 키(빈 배열 = 사람이 뺌). 전년 절 기능 전에 만든 초안은 없음 → 화면이 자동으로 고름 */
  priorKeys?: string[];
  /** 만들 때 쓴 프롬프트 판(report-draft@해시8 — resources/prompts/report-draft). 프롬프트 파일 분리 전 초안은 없음 */
  promptVersion?: string;
  /** 머리 모드(사업 단위 조판에서 이 소항목에 붙는 머리 — 판면 어림이 이 모드로 셈). 이 기능 전 초안은 없음 = all */
  head?: HeadMode;
  /** 판면 어림(mm, lib/reports/fit.ts) — 예산 = 쪽 모듈 × 255mm. passes = 맞추기 요청 횟수 */
  fit?: { total: number; budget: number; passes?: number };
  /**
   * 근거 겹침이 약한 문장(4단계 검증 보강, 2026-09-27 — lib/reports/ground.ts). weak = 원문 전부(화면 미리보기의 옅은 점선 표시용,
   * 내려받기 HTML에는 넣지 않음), checked = 판단한 문장 수(짧아서 판단하지 않은 문장은 제외). 판정이 아니라 신호 — 사실 여부는 사람이 봄.
   */
  ground?: { weak: string[]; checked: number };
  /**
   * 승인된 구성안대로 쓴 초안(「구성안대로 집필」·「승인하고 집필」 — 2026-09-28): 구성안 이야기 틀과 짜임이 같은 순서로 맞은 블록 수.
   * 없으면 구성안 없이 쓴 초안(「바로 만들기」) — 화면 도구줄이 「구성안대로 · 짜임 m/t」 또는 「구성안 안 씀」으로 보임
   */
  plan?: { story: string; subStory?: string; matched: number; total: number };
  /** 사람이 드래그 「AI 수정 요청」으로 고친 블록 번호(lib/reports/block-edit.ts) — 다시 만들기가 덮기 전에 경고. AI가 새로 쓰면 없어짐 */
  humanEdits?: number[];
  /** 경영관리: 평가내용 → 대주제 → 절 골격과 블록마다 절 열쇠(lib/reports/mg-draft.ts) — 있으면 판면 어림을 하지 않고 렌더러가 절 머리를 그림. 주요사업은 없음 */
  mg?: MgDraftMeta;
}

/** 초안 근거로 넣은 첨부 자료 하나 */
export interface ReportSource {
  /** card = 카드 전용 자료, report = 보고서 추가자료, prior = 전년도 경영실적보고서 같은 과제 절(공통 지식 rpt25-biz, id = 조각 키), lens = 평가 기준·평가위원 관점 조각(공통 지식, id = 조각 키) */
  kind: "card" | "report" | "prior" | "lens";
  id: string;
  name: string;
}

/** 프롬프트에 넣는 첨부 자료 — 앱이 kordoc으로 뽑은 전체 글(자르지 않음, PDF 원본은 보내지 않음: 참고자료 설계 1단계·D2) */
export interface ReportFile {
  name: string;
  text: string;
  /**
   * 이 과제와 맺는 관계(참고자료 3단계): card = 이 과제 카드 전용 자료 · matched = 사람이 이 과제에 연결(확정)한 보고서 추가자료 ·
   * same-report = 연결하지 않은 같은 보고서 자료. 비우면 card(옛 호출·시험)
   */
  relation?: "card" | "matched" | "same-report";
  /** 수치를 숫자 근거로 인정하는 자료인가 — false면 인용 대조에만 씀(다른 과제 수치가 섞이는 것을 막음). 비우면 인정 */
  numberEvidence?: boolean;
}

export interface SectionContext {
  business: { no: number; name: string };
  task: { no: string; title: string };
  mark: string;
  markers: Marker[];
  module: number;
  /** 머리 모드: 과제번호 순서로 앞 과제와 대상사업이 다르면 all, 실행과제만 다르면 task, 둘 다 같으면 sub(2025 최종본 — 실행과제 첫 소항목만 띠) */
  head: HeadMode;
  /** 갈래 칩(승인된 구성안 split.chip — 집필 검증이 spec.sub.chip으로 옮김). 없으면 칩 없음 */
  chip?: string;
}

export interface SiblingCard {
  id: string;
  taskNo: string;
  targetBusiness: string;
  executionTaskNo: string;
  executionTask: string;
}

const taskNum = (t: string) => Number(String(t).split("-")[0]) || 0;
const clean = (s: unknown) => String(s ?? "").trim();
/**
 * 번호·마커(결정론). 대상사업 N = 그 주요사업 카드에서 대상사업이 처음 나오는 순서, 실행과제 M = 그 대상사업 안 실행과제 번호 순서,
 * 소항목 표시 = 과제번호 끝 글자(1-가 → 가). 신규 = 26년 신규과제 체크, AI = AX 연계·AI활용 체크, 지적개선 = 경영평가 지적사항이 있음.
 */
export function sectionContext(card: Json, siblings: SiblingCard[], pages: number | null = null): SectionContext {
  const sorted = [...siblings].sort((a, b) => taskNum(a.taskNo) - taskNum(b.taskNo) || a.taskNo.localeCompare(b.taskNo, "ko"));
  const businesses: string[] = [];
  for (const s of sorted) if (s.targetBusiness && !businesses.includes(s.targetBusiness)) businesses.push(s.targetBusiness);
  const bizName = clean(card?.targetBusiness);
  const bizNo = Math.max(1, businesses.indexOf(bizName) + 1);
  const tasks: string[] = [];
  for (const s of sorted) if (s.targetBusiness === bizName && s.executionTaskNo && !tasks.includes(s.executionTaskNo)) tasks.push(s.executionTaskNo);
  const m = Math.max(1, tasks.indexOf(clean(card?.executionTaskNo)) + 1);
  // 머리 모드: 과제번호 순서에서 바로 앞 과제(사업 단위 조판·2025 최종본과 같은 규칙)
  const at = sorted.findIndex((s) => s.id === clean(card?.id));
  const prev = at > 0 ? sorted[at - 1] : null;
  const head: HeadMode = !prev || prev.targetBusiness !== bizName ? "all" : prev.executionTaskNo !== clean(card?.executionTaskNo) ? "task" : "sub";
  const markers: Marker[] = [];
  if (cardFindings(card).length) markers.push("지적개선");
  if (card?.tags?.new || card?.overview?.checks?.new) markers.push("신규");
  if (card?.tags?.ax || card?.strategy?.ai?.checked) markers.push("AI");
  const ax = Array.isArray(card?.axAttachments) && card.axAttachments.length > 0;
  return {
    business: { no: bizNo, name: bizName || "대상사업" },
    task: { no: `${bizNo}-${m}`, title: clean(card?.executionTask) || clean(card?.title) },
    mark: clean(card?.taskNo).split("-")[1] || "가",
    markers,
    // 목차·쪽 배정(report_outline.pages)이 있으면 그 분량, 없으면 AX 붙임 1쪽·그 밖 0.5쪽
    module: pages && pages > 0 ? Math.min(3, Math.round(pages * 2) / 2) : ax ? 1 : 0.5,
    head,
  };
}

/**
 * 쪽 모듈 → 분량 안내. 2025 최종본 실측: 한 쪽에 시각 블록(도식·인용 상자·메시지 띠·막대·우수사례) 5~8개,
 * 도식 밖 불릿은 몇 줄뿐(같은 과제 1-1 가.는 7블록·불릿 2줄). 예전 안내(1쪽 = 불릿 14~18줄 + 도식 2개)는 글 위주 초안을 만들었음.
 */
export function moduleGuide(p: ReportPrompts, module: number): string {
  // 0.5쪽은 짜임을 고정(평가 라운드 C2·D: 0.5쪽 첫 초안이 3~4블록 + 막대로 113~148% — 고치기 1회 뒤에도 117~129%)
  if (module <= 0.5) return requestText(p, "moduleGuide.half");
  // 판면 실측(2026-09-27): 0.5쪽은 제목부·추진성과를 빼면 블록 영역이 약 85mm라 시각 블록 2~3개가 한계(예전 안내 3~4개는 0.5쪽 초안을 170~230mm로 넘치게 했음)
  const blocks = Math.max(2, Math.round(module * 4.5));
  const bullets = Math.max(3, Math.round(module * 6));
  return requestText(p, "moduleGuide", { blocks, blocksMax: blocks + 1, bullets, figures: `${Math.max(1, Math.round(module * 2))}~${figureCap(module)}` });
}

/** 그림 자리표시 상한(쪽 모듈마다) — 1쪽 4개(2025 실측 보통 범위의 위 끝), 0.5쪽 1개(평가 라운드 H: 그림을 넣은 0.5쪽이 고치기 2번 뒤에도 106~107%) */
export const figureCap = (module: number) => (module <= 0.5 ? 1 : Math.round(module * 4));

/** 경평 초안 프롬프트 묶음(resources/prompts/report-draft — 읽기는 서버 모듈 lib/prompts/sets.ts). system.md @system에는 {{style}} {{rules}}(report-harness 사본 중 REPORT_HARNESS)를 채움 */
export type ReportPrompts = PromptSet;

/**
 * 경평 초안 시스템 프롬프트에 넣는 report-harness 사본 범위(④ 규칙 정리, 2026-09-27 사용자 결정 「관련 절만」).
 * 예전에는 style-guide 전문 + report-craft 전문 + [draft] 규칙 42건(약 3.3만 자)을 넣었는데, 문서 전체 구성(□·ㅇ 계층·붙임·표·게이트 절차)과
 * 앱 규칙과 부딪히는 대목(R062 1줄 35자 ↔ 2025 실측 55자, 노란 음영 강조 ↔ **, 날짜 '25. 6. 27(금) ↔ ’25.6, 연결어 ~하여로 압축 ↔ ~하여 1/8)이 섞였음.
 * style-guide: §4 종결어미·조사, §11 쉬운 말·두괄식. 규칙: R044 라벨 나열 금지 · R047 과잉정밀 수치 · R057 연결어 반복 · R065 나열 수치 괄호 ·
 * R080 같은 종결 명사 반복 · R091 쉬운 말 · R093 도식 칸 서술형 문장. report-craft(게이트 절차)는 뺌 — 앱의 작업 절차(process.md)가 대신함
 */
export const REPORT_HARNESS = { style: [4, 11], rules: ["R044", "R047", "R057", "R065", "R080", "R091", "R093"] } as const;

/** request.md에 있어야 하는 절 */
export const REQUEST_SECTIONS = [
  "header",
  "markers.none",
  "moduleGuide",
  "moduleGuide.half",
  "actuals.head",
  "actuals.kpi",
  "actuals.kpiInput",
  "actuals.kpiExpected",
  "actuals.kpiNone",
  "actuals.kpiOutcome",
  "actuals.outcomeHead",
  "actuals.outcomeItem",
  "actuals.monthlyHead",
  "actuals.monthlyItem",
  "actuals.monthlyNone",
  "fit.guide",
  "fit.head",
  "fit.headKeep",
  "fit.yearHead",
  "fit.yearItem",
  "fit.over",
  "fit.under",
  "fit.ragged",
  "fit.sparse",
  "fit.rows",
  "fit.raggedHead",
  "fit.sparseHead",
  "fit.lineItem",
  "fit.hollowHead",
  "fit.hollowItem",
  "fit.tail",
  "diagram.guide",
  "diagram.none",
  "diagram.item",
  "fit.composeHead",
  "fit.proseHead",
  "fit.unknownHead",
  "fit.titleHead",
  "lens.head",
  ...LENS_GROUPS.map((g) => `lens.group.${g}` as const),
  "lens.item",
  "lens.itemPlain",
  "prior.head",
  "prior.item",
  "prior.itemNoTask",
  "prior.same",
  "prior.similar",
  "prior.hints",
  "prior.tail",
  "siblings.head",
  "siblings.item",
  "siblings.noStory",
  "files.head",
  "files.item",
  "files.relation.card",
  "files.relation.matched",
  "files.relation.same",
  "plan.head",
  "plan.block",
  "plan.human",
  "plan.materialsHead",
  "plan.material",
  "plan.tail",
  "plan.shape.bullets",
  "plan.shape.cards",
  "plan.shape.chart",
] as const;
/** schema.md에 있어야 하는 절(AI 답 필드 경로) */
export const SECTION_OUT_FIELDS = ["title", "story", "blocks", "results", "resultCards", "resultChart", "resultBand", "caption"] as const;
export const SCHEMA_FIELDS = [...SECTION_OUT_FIELDS, ...BLOCK_OUT_FIELDS.map((k) => `block.${k}`)];

/** 경평 초안 프롬프트 파일에 있어야 하는 절 */
export const REPORT_PROMPT_SPEC: PromptSpec = { system: ["system"], request: [...REQUEST_SECTIONS, ...KB_SECTIONS], schema: SCHEMA_FIELDS };

/** request.md 절 하나를 채움 */
function requestText(p: ReportPrompts, key: (typeof REQUEST_SECTIONS)[number], vars: Record<string, string | number> = {}): string {
  return fillFrom(p, "request", key, vars);
}

/** AI 답(v3): 제목 · 이야기 틀 · 블록 목록 · 추진성과. desc(schema.md)를 주면 모델에 보내는 필드 설명을 붙이고, 없으면 구조만(타입·검증용) */
/**
 * story를 주면(승인된 구성안대로 쓸 때) 답의 story를 문자열로 느슨하게 받고 값은 코드가 구성안 것으로 덮음(`withPlanStory`) —
 * 예전에는 구성안 틀 하나로 묶어(literal) AI가 「주 + 보조」로 붙이거나 가운뎃점(· ･ ㆍ)을 다르게 적으면 구조화 출력 파싱이 통째로 실패했음(2026-10-12)
 */
export function sectionOutputSchema(desc?: Descriptions, story?: (typeof STORIES)[number]) {
  const d = <T extends z.ZodType>(s: T, key: (typeof SECTION_OUT_FIELDS)[number]) => described(s, desc, key);
  return z.object({
    title: d(z.string(), "title"),
    story: d(story ? z.string() : z.enum(STORIES), "story"),
    blocks: d(z.array(blockOutSchema(desc)), "blocks"),
    results: d(z.array(z.string()), "results"),
    resultCards: d(z.array(z.object({ tag: z.string(), headline: z.string(), figure: z.string() })), "resultCards"),
    // 곁들임이라 없어도 됨(예전 답·손으로 쓴 답 JSON도 그대로 읽음)
    resultChart: d(z.object({ title: z.string(), series: z.array(z.object({ label: z.string(), value: z.string() })), badge: z.string() }), "resultChart").optional(),
    resultBand: d(z.string(), "resultBand").optional(),
    caption: d(z.string(), "caption"),
  });
}
export const SectionOutputSchema = sectionOutputSchema();

/** 승인된 구성안이 있으면 AI가 적은 이야기 틀을 무시하고 구성안의 틀(주 틀)로 덮음 — 집필·판면 맞추기(고치기) 모두 이 값이 spec.story가 됨 */
export function withPlanStory<T extends { story: string }>(out: T, plan?: { story: string }): T {
  return plan?.story && (STORIES as readonly string[]).includes(plan.story) ? { ...out, story: plan.story } : out;
}
export type SectionOutput = z.infer<typeof SectionOutputSchema>;

/** 전년 절 닮은 정도 → 프롬프트 표시(0.35 넘으면 같은 과제로 봄 — 59장 실측) */
export const PRIOR_SAME_SCORE = 0.35;

/** 같은 주요사업의 다른 소항목 초안(형제) — 짜임이 겹치지 않게 요청에 적음 */
export interface SiblingLayout {
  label: string;
  /** 주 틀(틀 후보 감점·겹침은 이것으로) */
  story: string;
  /** 보조 틀(구성안 subStory — 요청 글에 「주 + 보조」로만) */
  subStory?: string;
  signature: string;
}

export function sectionPrompt(
  p: ReportPrompts,
  card: Json,
  ctx: SectionContext,
  year: number,
  files: ReportFile[] = [],
  prior: PriorPick[] = [],
  siblings: SiblingLayout[] = [],
  lens: LensRef[] = [],
  actuals: YearActuals = yearActuals(card),
): string {
  const r = (key: (typeof REQUEST_SECTIONS)[number], vars: Record<string, string | number> = {}) => requestText(p, key, vars);
  const lines = [
    r("header", {
      year,
      businessNo: ctx.business.no,
      businessName: ctx.business.name,
      taskNo: ctx.task.no,
      taskTitle: ctx.task.title,
      mark: ctx.mark,
      module: ctx.module,
      moduleGuide: moduleGuide(p, ctx.module),
      markers: ctx.markers.join("·") || r("markers.none"),
      // 소항목 제목 글자 한도(2026-10-28): 표지·갈래 칩·마커 칩을 뺀 한 줄 폭에 드는 한글 수(fit.ts subTitleMax — 판면 어림과 같은 글 폭 모델)
      chip: ctx.chip ? `[${ctx.chip}] ` : "",
      titleMax: subTitleMax(ctx),
      card: inspectionCardText(card),
    }),
  ];
  // 올해 실적 재료: 계량지표(’25 실적·’26 목표·’26 실적 = 부서 입력 → 카드 정량 성과 칸 → 카드 예상 칸) + 월별 실적 중 수치가 든 줄 + 정량 성과 칸의 남은 올해 실적 줄(lib/reports/actuals.ts)
  const yy = String(year % 100).padStart(2, "0");
  lines.push("", r("actuals.head", { year, today: actuals.today || "—" }));
  for (const k of actuals.kpi) {
    const actual = k.input ? r("actuals.kpiInput", { value: k.input }) : k.outcome ? r("actuals.kpiOutcome", { value: k.outcome }) : k.expected ? r("actuals.kpiExpected", { value: k.expected }) : r("actuals.kpiNone", { yy, name: k.name });
    lines.push(r("actuals.kpi", { name: k.name, unit: k.unit || "—", prevYY: String((year - 1) % 100).padStart(2, "0"), prev: k.prev || "—", yy, target: k.target || "—", actual }));
  }
  if (actuals.monthly.length) {
    lines.push(r("actuals.monthlyHead", { yy }));
    for (const m of actuals.monthly) lines.push(r("actuals.monthlyItem", { period: m.period || "—", line: m.line }));
  } else lines.push(r("actuals.monthlyNone"));
  if (actuals.outcome?.length) {
    lines.push(r("actuals.outcomeHead"));
    for (const line of actuals.outcome) lines.push(r("actuals.outcomeItem", { line }));
  }
  // 판면 예산: 쪽 높이·블록 영역·칸 폭별 한 줄 글자 수(lib/reports/fit.ts — 2025 판면·보고서 CSS와 같은 값)
  lines.push(
    "",
    r("fit.guide", {
      module: ctx.module,
      height: Math.round(ctx.module * PAGE_MM.height),
      area: blockAreaMm(ctx.module, ctx.head),
      slots: capacityLines().map((x) => `  - ${x}`).join("\n"),
      // 주요사업은 핵심 수치 띠를 쓰지 않아 그 높이 줄을 뺌(2026-10-28 — frameworks.ts BIZ_RETIRED_SHAPES)
      costs: blockCosts(false).map((x) => `  - ${x}`).join("\n"),
    }),
  );
  // 도식 고르기: 카드·근거의 신호로 뽑은 후보 두 갈래(이 과제만의 요소·기본 도식) + 같은 주요사업 초안들이 이미 쓴 도식(lib/reports/diagram-hints.ts)
  const hints = sectionHints(card, prior, files, lens, actuals, year);
  const usage = kindUsage(siblings.map((x) => x.signature));
  const list = (hs: DiagramHint[]) => (hs.length ? hs.map((h) => r("diagram.item", { kind: h.kind, why: h.why })).join("\n") : `  - ${r("diagram.none")}`);
  lines.push(
    "",
    r("diagram.guide", {
      own: list(hints.filter((h) => h.own)),
      basic: list(hints.filter((h) => !h.own)),
      usage: usage.length ? usage.map(([k, n]) => `${k} ${n}`).join(" · ") : r("diagram.none"),
    }),
  );
  if (lens.length) {
    // 평가위원 관점은 카드 바로 뒤(이야기를 정하기 전에 읽게) — 묶음 머리 아래 조각마다
    lines.push("", r("lens.head"));
    for (const g of LENS_GROUPS) {
      const refs = lens.filter((x) => x.group === g);
      if (!refs.length) continue;
      lines.push("", r(`lens.group.${g}`));
      refs.forEach((x, i) => lines.push("", r(x.where ? "lens.item" : "lens.itemPlain", { n: i + 1, title: x.title, where: x.where, text: x.text })));
    }
  }
  if (prior.length) {
    lines.push("", r("prior.head", { priorYear: year - 1, priorYY: String(year - 1).slice(2), count: prior.length }));
    prior.forEach((pick, i) => {
      const s = pick.section;
      const match = r(pick.score >= PRIOR_SAME_SCORE ? "prior.same" : "prior.similar");
      lines.push("", r(s.taskTitle ? "prior.item" : "prior.itemNoTask", { n: i + 1, label: priorLabel(s), score: pick.score, match, taskNo: s.taskNo, taskTitle: s.taskTitle, targetName: s.targetName, text: s.text }));
      const hints = layoutHints(s.text);
      if (hints.length) lines.push(r("prior.hints", { hints: hints.join(" → ") }));
    });
    lines.push("", r("prior.tail"));
  }
  if (siblings.length) {
    lines.push("", r("siblings.head", { count: siblings.length }));
    for (const sb of siblings) lines.push(r("siblings.item", { label: sb.label, story: storyLabel(sb.story, sb.subStory) || r("siblings.noStory"), signature: sb.signature }));
  }
  if (files.length) {
    // 자료마다 전체 글(자르지 않음 — 넘치면 lib/ai/budget.ts가 멈춤)
    lines.push("", r("files.head", { count: files.length }));
    files.forEach((f, i) => {
      lines.push("", r("files.item", { n: i + 1, name: f.name, relation: r(`files.relation.${f.relation === "same-report" ? "same" : (f.relation ?? "card")}` as (typeof REQUEST_SECTIONS)[number]) }));
      lines.push(f.text);
    });
  }
  return lines.join("\n");
}

/**
 * 도식·틀 후보의 신호를 볼 글: 카드 + 전년 절 + 숫자 근거로 인정하는 첨부만(이 과제에 연결하지 않은 보고서 자료의 다른 과제 내용이 도식·틀로 새지 않게)
 */
export const hintSource = (card: Json, prior: PriorPick[], files: ReportFile[]) => [inspectionCardText(card), ...prior.map((x) => x.section.text), ...files.filter((f) => f.numberEvidence !== false).map((f) => f.text)].join("\n");

/**
 * 도식 후보(요청 글과 검증이 같은 값을 씀): 카드·전년 절·첨부 글의 신호 + '25 평가위원 지적 원문(인용 상자) + 같은 지표의 시점별 값(막대 —
 * 계량지표 ’25 실적과 ’26 실적(부서 입력)이 둘 다 숫자일 때만 — 목표만 있는 값은 실적 없는 목표 막대가 돼 후보에서 뺌, 2026-10-14).
 * 이 과제만의 요소(인용·말풍선·우수사례·정의·협업 구조)는 전년 절을 뺀 카드·첨부 글로만 셈 — 전년 절의 인용·현장 말·수상 낱말이 후보를 켜면
 * 짜임 검증(composeIssues)이 쓰라고 요구해 2025 보고서 글을 올해 초안에 다시 쓰게 됨(2026-10-14 블라인드 심사 「전년복제」 22건 중 10~11건). 기본 도식은 전년 절까지 봄.
 * 핵심 수치 띠는 주요사업 후보에 없음(2026-10-28 — diagram-hints.ts)
 */
export function sectionHints(card: Json, prior: PriorPick[], files: ReportFile[], lens: LensRef[], actuals: YearActuals, year: number, opts?: HintOptions): DiagramHint[] {
  const yy = (n: number) => String(n % 100).padStart(2, "0");
  const series = actuals.kpi.filter((k) => /\d/.test(k.prev) && /\d/.test(k.input)).map((k) => `${k.name}: ’${yy(year - 1)}년 ${k.prev} → ’${yy(year)}년 ${k.input}`);
  const extras = {
    critiques: lens.filter((x) => x.group === "critiques").map((x) => x.text),
    series,
    survey: lens.filter((x) => x.group === "survey").map((x) => x.text),
  };
  const all = diagramHints(hintSource(card, prior, files), extras, opts);
  if (!prior.length) return all;
  // diagramHints는 이 과제만의 요소를 먼저 두므로 이어 붙여도 순서 규칙이 같음
  return [...diagramHints(hintSource(card, [], files), extras, opts).filter((h) => h.own), ...all.filter((h) => !h.own)];
}

/**
 * 그림 자리 문제(결정론 — 고치기 요청과 초안 경고에 같은 문장). 평가 라운드 G: 그림을 넣은 8장 중 7장이 추진배경 불릿 옆 사진(2025 자리 쏠림 없음 —
 * 그림 28개 중 칸 안 8·현황 양옆 6·구성 삽화 5·사례 옆 4·패널 안 3·지도 2). 불릿 옆 그림은 초안당 1개까지, 1쪽 이상은 사진·삽화·지도·화면 중 하나 이상을 도식 블록에(로고 제외)
 */
export function figurePlaceIssues(blocks: Block[], module: number): string[] {
  const pics = blocks.flatMap((b) => (b.figures ?? []).filter((f) => f.kind !== "logo").map(() => b.kind));
  const onBullets = pics.filter((k) => k === "bullets").length;
  if (onBullets > 1) return [`그림 자리: 불릿 블록 옆 그림이 ${onBullets}개입니다 — 1개만 남기고 나머지는 전후 비교(패널 안)·우수사례 옆·현황 칸·단계 블록 옆으로 옮깁니다.`];
  if (module >= 1 && pics.length && onBullets === pics.length) return ["그림 자리: 그림이 모두 불릿 블록 옆입니다 — 하나 이상은 도식 블록(전후 비교 패널 안·우수사례 옆·현황 칸·단계 블록 옆)에 둡니다."];
  return [];
}

/** 짜임 문제(결정론 — 교정 요청과 초안 경고에 같은 문장): 이 과제만의 요소 후보가 있는데 하나도 쓰지 않음 */
// 강제 대상: '25 평가위원 지적 인용 후보(사업 단위 「집행」 지적이라 카드와 무관한 경우가 많음)는 후보로만 두고 쓰라고 요구하지 않음(2026-10-14 — 전년 절 신호를 빼자 지적 인용이 59장 중 43장의 유일한 후보가 됨)
export function composeIssues(blocks: Block[], own: DiagramHint[]): string[] {
  const forced = own.filter((h) => !h.why.startsWith("'25 평가위원 지적"));
  if (!forced.length || ownKindsIn(blocks).length) return [];
  return [`이 과제만의 요소가 없습니다 — 기본 도식 하나를 후보(${forced.map((h) => h.kind).join("·")}) 중 하나로 바꿉니다: ${forced[0].why}.`];
}

/**
 * 판면 맞추기 요청(첫 요청 글 뒤에 붙임): 어림 높이·예산, 넘침/빔, 행별 높이, 두 줄 넘는 칸 글, 앞서 쓴 초안 JSON.
 * need는 fitNeeded(report) — over·under·wrap. title = 소항목 제목 한 줄 폭 문제(title-checks.ts subTitleIssues — 2026-10-28, 제목만 줄이라고 알림)
 */
export function fitPrompt(p: ReportPrompts, ctx: SectionContext, draft: SectionOutput, report: FitReport, need: FitNeed | null, year: string[] = [], compose: string[] = [], prose: string[] = [], unknown: string[] = [], title: string[] = []): string {
  const r = (key: (typeof REQUEST_SECTIONS)[number], vars: Record<string, string | number> = {}) => requestText(p, key, vars);
  const item = (x: FitLine) => r("fit.lineItem", { where: x.where, text: x.text, lines: x.lines, fill: Math.round(x.fill * 100), perLine: x.perLine, target: Math.round(x.perLine * (x.lines > 1 ? 2 : 1) * 0.9) });
  // 판면이 맞고 올해 실적 문제만 있으면 「고치기」 머리(판면·짜임 유지)
  const lines = [need ? r("fit.head", { module: ctx.module, total: report.total, budget: report.budget, area: blockAreaMm(ctx.module, ctx.head) }) : r("fit.headKeep", { total: report.total, budget: report.budget })];
  // 목표 범위(예산의 97~100%) — 평가 라운드 G: 28mm만 줄이면 되는 초안을 77mm 줄여 77%가 됨
  const range = { low: Math.round(report.budget * 0.97), budget: report.budget };
  if (need === "over") lines.push(r("fit.over", { mm: report.total - report.budget, ...range }));
  else if (need === "under") lines.push(r("fit.under", { mm: report.budget - report.total, ...range }));
  else if (need) lines.push(r(need === "ragged" ? "fit.ragged" : "fit.sparse"));
  if (need) {
    lines.push(r("fit.rows", { rows: report.rows.map((x) => `${x.label || x.kinds} ${Math.round(x.mm)}mm`).join(" · ") }));
    if (report.ragged.length) lines.push(r("fit.raggedHead"), ...report.ragged.slice(0, 16).map(item));
    if (report.sparse.length) lines.push(r("fit.sparseHead"), ...report.sparse.slice(0, 20).map(item));
  }
  // 빈 상자 칸(2026-10-15 후속 5): 맞추기를 부르는 사유는 아니지만, 고치기를 하면 판면을 맞출 때도 판면이 맞을 때도 함께 알림 — 짧은 칸을 형제 칸 높이까지 채워도 블록 높이는 그대로
  const hollow = report.hollow ?? [];
  if (hollow.length) lines.push(r("fit.hollowHead"), ...hollow.slice(0, 12).map((x) => r("fit.hollowItem", { where: x.where, used: x.used, most: x.most, perLine: x.perLine, add: x.add })));
  // 근거에 없는 숫자(기준 사다리 ① 근거 — 2026-10-10 계획서 §10 E4: 예전에는 고치기 요청에 안 넣어 고치기가 그대로 두거나 새로 만들 수 있었음). 고치기를 부르는 사유로는 안 씀(시간)
  if (unknown.length) lines.push(r("fit.unknownHead"), ...unknown.slice(0, 12).map((text) => r("fit.yearItem", { text })));
  if (year.length) lines.push(r("fit.yearHead"), ...year.map((text) => r("fit.yearItem", { text })));
  if (compose.length) lines.push(r("fit.composeHead"), ...compose.map((text) => r("fit.yearItem", { text })));
  if (prose.length) lines.push(r("fit.proseHead"), ...prose.map((text) => r("fit.yearItem", { text })));
  if (title.length) lines.push(r("fit.titleHead", { titleMax: subTitleMax(ctx) }), ...title.map((text) => r("fit.yearItem", { text })));
  lines.push("", r("fit.tail", { draft: JSON.stringify(draft) }));
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 검증: 형식 정리 + 숫자 대조

export const cleanLine = (s: unknown, max = 400) =>
  dedupeNeedYear(
    reportTypography(
      String(s ?? "")
        .replace(/[<>]/g, "")
        .replace(/^\s*(?:[-∙•·#]|\*(?!\*))\s*/, "") // 글머리 기호는 떼되 강조 표시(**…**)는 둠
        .replace(/\s+/g, " ")
        .trim(),
    ),
  ).slice(0, max); // 윗첨자 연도 뒤 자리표시의 같은 연도는 뺌(actuals.ts dedupeNeedYear)

/**
 * 글자 한도로 자르되 닫히지 않은 【…】·(…)는 여는 기호 앞에서 끊음(2026-10-10 — 추진성과 3칸이 쓰인 초안 4건 중 2건이
 * 「… 【확인: 」·「AI 모니터링(’26.」처럼 자리표시·괄호 한가운데에서 잘려 초안에 남았음). 한도 안이면 그대로
 */
export function clipLine(s: string, max: number): string {
  if (s.length <= max) return s;
  let t = s.slice(0, max);
  for (const [open, close] of [["【", "】"], ["(", ")"]]) {
    const i = t.lastIndexOf(open);
    if (i >= 0 && !t.includes(close, i)) t = t.slice(0, i);
  }
  return t.replace(/[\s,･·]+$/, "");
}

/**
 * 2025 최종본 표기로 통일(결정론): 글자 사이 가운뎃점은 전부 ･(U+FF65 — 2025 본문 224회, 카드는 ··∙가 섞임),
 * 연도는 ’25(U+2019 + 두 자리 — 카드의 ‘25·'25를 바로잡음). 뜻은 바꾸지 않습니다.
 */
export function reportTypography(s: string): string {
  return s.replace(/(?<=\S)\s?[·∙ㆍ]\s?(?=\S)/g, "･").replace(/[‘'](?=\d{2}(?:년|\.\d|[~∼)\s,]|$))/g, "’");
}

/** 원문 대조용 열쇠: 빈칸·따옴표·구두점·가운뎃점을 걷음(표기 통일 전후가 같게) */
export function sourceKey(s: string): string {
  return s.replace(/[\s"'“”‘’「」『』()（）\[\]<>·･∙ㆍ,.:;!?~∼\-–—…|/*]/g, "").toLowerCase();
}

/** 인용·근거 구절이 근거 글에 있는지(…로 줄인 인용은 조각마다, 6자 넘는 조각만 셈) */
export function quoteFoundIn(hayKey: string, quote: string): boolean {
  const parts = quote.split(/\.{3}|…/).map(sourceKey).filter((p) => p.length >= 6);
  return parts.length > 0 && parts.every((p) => hayKey.includes(p));
}

/** 불릿·추진성과 문장이 2025 최종본 문체에서 벗어난 곳(결정론 경고 — 고치지 않고 알림) */
export function styleWarnings(spec: Pick<ReportSectionSpec, "rows" | "results" | "blocks">): string[] {
  // 강조 표시(**…**)는 걷고, 【확인: …】 자리표시는 채울 수치 한 자리(4자)로 셈 — 담당자가 채우면 짧은 수치가 됨
  // 위첨자(^{’25년})는 작은 글자라 길이·끝말에서 뺌
  const plain = (x: string) => x.replace(/\*\*/g, "").replace(NEED_RE, "○○○○").replace(/\^\{[^{}]*\}/g, "");
  const bullets = [...spec.rows.flatMap((r) => r.bullets), ...(spec.blocks ?? []).flatMap(blockBullets)].map(plain);
  const results = spec.results.map(plain);
  const lines = [...bullets, ...results];
  // 괄호 비교·출처를 걷은 끝말: ~함·됨·음·임(명사형 어미)·~다로 끝나면 경고(시스템·플랫폼처럼 ㅁ으로 끝나는 명사는 빼려고 네 글자만 봄)
  const tail = (x: string) => x.replace(/(\s*\([^()]*\))+\s*$/, "").replace(/[.!\s]+$/, "");
  const verbal = lines.filter((x) => /(?:[가-힣](?:함|됨|음|임)|[가-힣]다)$/.test(tail(x)) && !/(?:시스템|플랫폼|프로그램|알고리즘|다음|마음)$/.test(tail(x)));
  const out: string[] = [];
  if (verbal.length) out.push(`문체: ‘~함·~됨·~음·~임·~다’로 끝난 문장 ${verbal.length}개 — 2025 최종본처럼 동작성 명사(구축·마련·확산 등)로 끝내 주세요: ${verbal.slice(0, 3).join(" / ")}`);
  const long = bullets.filter((x) => x.length > 110);
  if (long.length) out.push(`문체: 두 줄(110자)을 넘는 불릿 ${long.length}개 — 한 불릿에 정보 하나, 1줄(55자) 안팎으로 줄여 주세요.`);
  const longRes = results.filter((x) => x.length > 75);
  if (longRes.length) out.push(`문체: 한 줄(75자)을 넘는 추진성과 문장 ${longRes.length}개 — 각 1줄로 줄여 주세요.`);
  return out;
}
const cleanList = (a: unknown, max: number, len = 400) => (Array.isArray(a) ? a.map((x) => cleanLine(x, len)).filter(Boolean).slice(0, max) : []);

/** 숫자 조각(단위 포함) — 연도 표기(’25·2026년)와 목록 번호(①)는 뺌 */
export function numberTokens(text: string, opts: { dates?: boolean } = {}): string[] {
  const out: string[] = [];
  const re = /(?<![’'\d.,])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(%|퍼센트|배)?/g;
  for (const m of text.matchAll(re)) {
    const before = text.slice(Math.max(0, m.index - 1), m.index);
    const whole = m[0].trim();
    if (/[’']/.test(before)) continue;
    const n = m[1].replace(/,/g, "");
    if (/^20\d\d$/.test(n) && /^\s*년/.test(text.slice(m.index + m[0].length))) continue; // 2026년
    if (n.length === 1 && !m[2] && !m[3]) continue; // 한 자리 수(1단계·3개 등)는 대조하지 않음
    // 월.일 날짜는 숫자가 아님: 물결 뒤 「~10.9」(뒤에 무엇이 오든), 괄호 속 「(9.4)」「(7.6.)」 — 카드의 「9월 4일」을 2025 표기로 줄여 쓴 것(평가 라운드 F 2/4-다).
    // 카드·초안 모두 같은 규칙으로 걸러야 대조가 맞음(H 3/4-나: 카드 「~10.9)」는 빼고 초안 「~10.9 운영」은 세어 없는 숫자로 잡혔음)
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 2);
    const lead = text.slice(Math.max(0, m.index - 2), m.index);
    const monthDay = m[2] && !m[3] && Number(n) >= 1 && Number(n) <= 12 && Number(m[2]) >= 1 && Number(m[2]) <= 31;
    if (!opts.dates && monthDay && (/~\s*$/.test(lead) || (/\(\s*$/.test(lead) && /^\.?\)|^\.?[~,]/.test(after)))) continue;
    out.push(whole);
  }
  return out;
}

const numKey = (tok: string) => tok.replace(/,/g, "").replace(/\s+/g, "").replace(/퍼센트/, "%");

/**
 * 근거 글의 숫자를 아는 숫자 모음에 넣음. 월.일 날짜(괄호 속 「(6.23.)」·물결 뒤)도 넣음 — 초안 쪽은 그 자리의 날짜를 빼고 세지만 괄호 없이 쓴 날짜(「기관장회의 6.23」)는
 * 세므로, 근거에서 날짜를 빼면 카드에 있는 날짜가 「없는 숫자」로 잡혔음(2026-10-10 계획서 §10 E2 — 평가 초안 81건의 없는 숫자 16개 중 4개). 카드에 없는 날짜는 그대로 잡힘
 */
function addKnownNumbers(set: Set<string>, text: string): Set<string> {
  for (const t of numberTokens(text, { dates: true })) {
    set.add(numKey(t));
    set.add(numKey(t).replace(/(%|배)$/, ""));
  }
  return set;
}

/** 카드 글에 있는 숫자 모음(대조용) */
export function cardNumbers(card: Json): Set<string> {
  return addKnownNumbers(new Set<string>(), `${cardOutline(card)}\n${inspectionCardText(card)}`);
}

/** 아는 숫자 = 카드 글 + 근거 글(extraText — 첨부·전년 절·실사 답변 등)의 숫자. 주요사업·경영관리 검증과 다시 점검이 함께 씀 */
export function knownNumbers(card: Json, extraText = ""): Set<string> {
  return addKnownNumbers(cardNumbers(card), extraText);
}

/** 근거 원문 열쇠(인용 대조)와 아는 숫자(숫자 대조) — verifySection·구성안 정리가 같은 근거를 씀 */
/**
 * 초안 근거 글 두 벌(서버 액션·연기 시험 공용): known = 숫자 대조에도 쓰는 글(첨부 전체 글·전년 절·실사 답변·부서 계량 실적 입력),
 * quoteOnly = 인용 대조에만 쓰는 글(평가 기준·평가위원 지적·유관기관 사례, 숫자 근거로 인정하지 않는 첨부). 첨부는 AI에 넣은 글과 같은 전체 글이라 뒤쪽 숫자도 근거로 인정(참고자료 설계 P5) —
 * 단 보고서 추가자료는 사람이 이 과제에 연결(확정)한 것만(ReportFile.numberEvidence)
 */
/** 과제 대응표가 이 과제에 연결한 공통 지식 조각 중 숫자 근거로 쓰는 유형 — KCA 자신의 2025 보고서 절·실사 답변(평가위원 지적은 인용 대조에만) */
const LINKED_NUMBER_TYPES: readonly string[] = ["report_section", ...SURVEY_TYPES];

/**
 * linked: 과제 대응표가 이 과제에 연결한 조각(자동·확정 — kb.list.relevant). 그중 2025 보고서 절·실사 답변의 수치도 숫자 근거(2026-10-10 — 전년 절은 닮은 순으로만,
 * 실사는 평가 근거 3건까지만 골라, 이 과제에 연결된 2025 절·실사 답변의 KCA 수치가 「없는 숫자」로 붉게 칠해졌음: 평가 라운드 초안의 없는 숫자 10개 중 6개가 실사 답변 수치)
 */
export function draftEvidence(files: ReportFile[], prior: PriorPick[], lens: LensRef[], actuals: YearActuals, linked: Array<{ unitType: string; text: string }> = []): { known: string; quoteOnly: string; past: string; current: string } {
  // 숫자 근거로 인정하지 않는 자료(이 과제에 연결하지 않은 보고서 추가자료)의 글은 인용 대조에만 — 다른 과제 수치가 이 과제 초안에 섞여도 「없는 숫자」로 잡히게(참고자료 3단계 P3)
  const counted = files.filter((f) => f.numberEvidence !== false);
  const known = [...counted.map((f) => f.text), ...prior.map((p) => p.section.text), ...lens.filter((x) => x.group === "survey").map((x) => x.text), ...linked.filter((x) => LINKED_NUMBER_TYPES.includes(x.unitType)).map((x) => x.text), ...actuals.kpi.map((k) => k.input)].join("\n");
  const quoteOnly = [...files.filter((f) => f.numberEvidence === false).map((f) => f.text), ...lens.filter((x) => x.group !== "survey").map((x) => x.text)].join("\n");
  // known을 두 갈래로(전년 인용 점검 priorQuoteIssues — 2026-10-14 후속 2): past = 2025 보고서 글(전년 절·이 과제에 연결된 2025 절), current = 올해 근거(첨부·실사 답변·계량 실적 입력, 카드 제외)
  const past = [...prior.map((p) => p.section.text), ...linked.filter((x) => x.unitType === "report_section").map((x) => x.text)].join("\n");
  const current = [...counted.map((f) => f.text), ...lens.filter((x) => x.group === "survey").map((x) => x.text), ...linked.filter((x) => (SURVEY_TYPES as readonly string[]).includes(x.unitType)).map((x) => x.text), ...actuals.kpi.map((k) => k.input)].join("\n");
  return { known, quoteOnly, past, current };
}

/** 제목 앞에 AI가 칩을 겹쳐 적었으면 뗌(칩은 렌더러가 따로 그림 — 「[예방] [예방] …」 방지). 칩이 없으면 그대로 */
export function chipless(title: string, chip?: string): string {
  if (!chip) return title;
  const head = `[${chip}]`;
  return title.startsWith(head) ? title.slice(head.length).trim() : title;
}

export function evidenceOf(card: Json, extraText = "", quoteOnly = ""): { hayKey: string; known: Set<string> } {
  const hayKey = sourceKey(`${cardOutline(card)}\n${inspectionCardText(card)}\n${extraText}\n${quoteOnly}`);
  const known = knownNumbers(card, extraText);
  return { hayKey, known };
}

export interface SectionCheck {
  spec: ReportSectionSpec;
  /** 카드에 없는 숫자(경고) */
  unknownNumbers: string[];
  warnings: string[];
  /** 올해 실적 문제(lib/reports/actuals.ts yearIssues — 교정 요청에 그대로 넣음). year를 주지 않으면 빈 배열 */
  yearIssues: string[];
  /** 짜임 문제(composeIssues — 이 과제만의 요소 후보가 있는데 쓰지 않음). own을 주지 않으면 빈 배열 */
  composeIssues: string[];
  /** 문장 문제(lib/reports/prose.ts — 항목 나열·관리 정보·풀지 않은 약어·제목·라벨의 평가 대응 말). 교정 요청에 그대로 넣음 */
  proseIssues: string[];
  /** 소항목 제목 한 줄 폭 문제(lib/reports/title-checks.ts subTitleIssues — 2026-10-28). 자동 고치기 사유 — 고치기 요청은 제목만 줄이라고 함 */
  titleIssues: string[];
}

/**
 * AI 답 정리 + 숫자 대조(v3 블록 목록). extraText: 초안에 넣은 첨부 자료·전년 절 글(그 숫자·인용도 근거).
 * siblings: 같은 주요사업 형제 초안의 짜임 — 서명이 같으면 경고.
 * quoteOnly: 인용·말풍선 원문 대조에만 쓰는 글(평가 기준·평가위원 지적·유관기관 사례) — 그 수치는 KCA 실적 근거가 아니라 숫자 대조에 넣지 않음.
 * placeBlocks: 정리한 블록에 배치를 입힘(승인된 구성안으로 쓴 초안 — composition.ts applyPlanLayout). 판면 어림·그림 폭 지킴이 전에 부름.
 * years: extraText를 2025 보고서 글(past)과 올해 근거(current)로 나눈 것(draftEvidence) — 주면 전년 인용 점검(priorQuoteIssues)을 짜임 문제로 냄
 * today: 집필 날짜(YYYY-MM-DD) — 실적 칸의 아직 안 온 시점(’26.11월) 점검의 기준(lib/reports/result-plan.ts). 없으면 계획 낱말만 봄
 */
export function verifySection(out: SectionOutput, card: Json, ctx: SectionContext, extraText = "", siblings: SiblingLayout[] = [], quoteOnly = "", year?: number, own: DiagramHint[] = [], placeBlocks?: (blocks: Block[]) => void, years?: { past: string; current: string }, today?: string): SectionCheck {
  // 인용·말풍선·우수사례·정의는 근거(카드 글 + 첨부·전년 절 글 + 평가 근거)에서 원문을 찾은 것만 — 지어낸 글을 막음
  const hay = sourceKey(`${cardOutline(card)}\n${inspectionCardText(card)}\n${extraText}\n${quoteOnly}`);
  const { blocks, dropped } = cleanBlocks(out.blocks ?? [], cleanLine, (q) => quoteFoundIn(hay, q), { biz: true });
  placeBlocks?.(blocks);
  // 추진성과 3칸 글자 한도(칩 12·결과 줄 40·큰 수치 60 — schema.md resultCards) — 넘치면 자리표시·괄호를 깨지 않게 자르고 알림
  let clipped = 0;
  const clip = (s: unknown, max: number) => {
    const t = cleanLine(s);
    if (t.length > max) clipped++;
    return clipLine(t, max);
  };
  const resultCards = (out.resultCards ?? []).map((c) => ({ tag: clip(c.tag, 12), headline: clip(c.headline, 40), figure: clip(c.figure, 60) })).filter((c) => c.headline || c.figure);
  const known = knownNumbers(card, extraText);
  const isKnown = (t: string) => known.has(numKey(t)) || known.has(numKey(t).replace(/(%|배)$/, ""));
  const extras = resultExtras(out, resultCards.length >= 2, isKnown, `${cardOutline(card)}\n${inspectionCardText(card)}\n${extraText}`);
  const spec: ReportSectionSpec = {
    version: 3,
    card: { id: clean(card?.id), taskNo: clean(card?.taskNo), title: clean(card?.title) },
    business: ctx.business,
    task: { ...ctx.task, bp: false },
    sub: { mark: ctx.mark, title: chipless(cleanLine(out.title, 120).replace(/^[가-힣]\.\s*/, ""), ctx.chip) || clean(card?.title), markers: ctx.markers, ...(ctx.chip ? { chip: ctx.chip } : {}) },
    rows: [],
    blocks,
    story: isStory(out.story) ? out.story : "",
    results: cleanList(out.results, 3, 200),
    caption: cleanLine(out.caption, 200),
    module: ctx.module,
    head: ctx.head,
    resultCards: resultCards.length >= 2 ? resultCards.slice(0, 3) : [],
    ...(extras.chart ? { resultChart: extras.chart } : {}),
    ...(extras.band ? { resultBand: extras.band } : {}),
  };
  // 【확인: …】 자리표시 안의 시점·기간은 사실이 아니므로 대조에서 뺌
  const unknownNumbers = [...new Set(numberTokens(stripNeeds(sectionText(spec))).filter((t) => !isKnown(t)))];
  const warnings: string[] = [...extras.warnings];
  if (visualCount(blocks) < 2) warnings.push("도식 블록이 2개보다 적습니다 — 2025 최종본은 1쪽에 5~8개입니다.");
  // 그림 자리표시: 쪽 모듈 상한(0.5쪽 2·1쪽 4)을 넘으면 뒤 블록 것부터 뺌
  const cap = figureCap(ctx.module);
  let kept = 0;
  let cut = 0;
  for (const b of blocks) {
    const f = b.figures ?? [];
    const keep = Math.max(0, Math.min(f.length, cap - kept));
    if (keep < f.length) {
      cut += f.length - keep;
      b.figures = f.slice(0, keep);
    }
    kept += keep;
  }
  if (cut) warnings.push(`그림: 자리표시는 ${ctx.module}쪽에 ${cap}개까지라 뒤 ${cut}개를 뺐습니다.`);
  // 그림 옆에 남는 글 폭이 모자라면 작게 줄이거나 뺌(lib/reports/fit.ts guardFigures)
  warnings.push(...guardFigures(blocks));
  if (!spec.results.length && !spec.resultCards?.length) warnings.push("추진성과 상자가 비었습니다.");
  if (clipped && spec.resultCards?.length) warnings.push(`문체: 추진성과 3칸 글 ${clipped}곳이 칸 한도(칩 12자·결과 줄 40자)를 넘어 잘렸습니다 — 잘린 뒤를 확인해 짧게 고쳐 주세요.`);
  warnings.push(...dropped);
  const again = repeatedKinds(blocks);
  if (again.length) warnings.push(`도식: 한 소항목에 같은 도식을 두 번 썼습니다(${again.join("·")}) — 다른 모양의 도식으로 바꿔 주세요.`);
  // 모양 다양성(2026-10-12): 경고만 — composeIssues(고치기 사유·점수)에는 넣지 않음
  const variety = bizVarietyIssue(blocks);
  if (variety) warnings.push(variety);
  const ownIssues = composeIssues(blocks, own);
  warnings.push(...ownIssues.map((x) => `도식: ${x}`));
  // 전년 인용: 2025 보고서 글에서만 찾은 인용·말풍선·우수사례 — 짜임 문제(자동 고치기 사유)로
  const caseEvidence = blocks.some((b) => b.kind === "case") ? (out.blocks ?? []).filter((b) => b?.kind === "case").map((b) => String(b.evidence ?? "")) : [];
  const priorQuote = years ? priorQuoteIssues(blocks, caseEvidence, years.past, sourceKey(`${cardOutline(card)}\n${inspectionCardText(card)}\n${years.current}\n${quoteOnly}`)) : [];
  warnings.push(...priorQuote);
  // 판면: 쪽 예산(모듈 × 255mm)과 어림 높이
  const fit = fitReport(spec);
  spec.fit = { total: fit.total, budget: fit.budget };
  if (fit.total > fit.budget * FIT_BAND.over) warnings.push(`판면: 어림 ${fit.total}mm로 ${ctx.module}쪽(${fit.budget}mm)보다 ${fit.total - fit.budget}mm 넘칩니다 — 칸 글·블록을 줄여 주세요.`);
  else if (fit.total < fit.budget * FIT_BAND.under) warnings.push(`판면: 어림 ${fit.total}mm로 ${ctx.module}쪽(${fit.budget}mm)에 ${fit.budget - fit.total}mm가 빕니다.`);
  // 빈 상자 칸: 경고만(자동 고치기 사유·짜임 문제에 안 넣음 — 고치기를 하게 되면 fitPrompt가 목록을 함께 보냄)
  const hollow = hollowWarning(fit.hollow);
  if (hollow) warnings.push(hollow);
  const sig = blockSignature(blocks);
  const same = siblings.filter((sb) => sb.signature === sig);
  if (same.length) warnings.push(`짜임: 같은 주요사업의 ${same.map((x) => x.label).join("·")}와 블록 순서가 똑같습니다 — 다시 만들거나 블록을 바꿔 주세요.`);
  warnings.push(...styleWarnings(spec));
  // 올해 실적: 수치 띠 칸의 시점·올해 실적 칸, 추진성과가 예상·목표·전년 값뿐인지, 자리표시 수
  const issues = year ? yearIssues(blocks, [...spec.results, ...(spec.resultChart?.series ?? []).map((x) => `${x.label} ${x.value}`)], sectionText(spec), year, NEEDS_MAX, { biz: true }) : [];
  warnings.push(...issues.map((x) => `올해 실적: ${x}`));
  const where = extraText.trim() ? "카드·첨부 자료" : "카드";
  if (unknownNumbers.length) warnings.push(`${where}에 없는 숫자 ${unknownNumbers.length}개 — 원자료로 확인하거나 지워 주세요: ${unknownNumbers.slice(0, 8).join(", ")}`);
  // 그림 자리 쏠림(상한·폭 지킴이 뒤에 봄) — 짜임 문제와 같이 고치기 요청에
  const place = figurePlaceIssues(blocks, ctx.module);
  warnings.push(...place);
  // 추진성과가 블록 수치를 되풀이하면 경고만(2026-10-14 보정 — 짜임 문제·자동 고치기 사유로 넣으면 성과 칸이 자리표시로 비는 과잉 교정이 됨)
  const repeat = resultRepeatOf(spec);
  if (repeat) warnings.push(repeat);
  // 실적 칸의 계획 표지(2026-10-17 F1 — 경고만, 자동 고치기 사유·점수에는 안 넣음)
  const planned = resultPlanWarning(spec, today);
  if (planned) warnings.push(planned);
  warnings.push(...signalWarnings(spec, card));
  // 근거 겹침(4단계 검증 보강): 블록 글·추진성과 문장마다 근거(카드 + 첨부·전년 절·실사 답변 — extraText)와 겹치는 말이 적으면 표시(신호일 뿐, 판정 아님).
  // 평가 기준·지적·유관기관 사례(quoteOnly)는 인용 원문 대조에만 쓰므로 여기서는 근거에 넣지 않음(다른 기관·평가위원 말을 KCA 실적 근거로 삼지 않게)
  const groundText = `${cardOutline(card)}\n${inspectionCardText(card)}\n${extraText}`;
  const scores = groundScores(spec, groundText);
  const weak = scores.filter((x) => x.overlap < GROUND_WEAK);
  if (weak.length) {
    spec.ground = { weak: weak.map((x) => x.text), checked: scores.length };
    const worst = [...weak].sort((a, b) => a.overlap - b.overlap).slice(0, 5);
    warnings.push(`근거 약함: 근거 글과 겹치는 말이 적은 문장 ${weak.length}개(판단 ${scores.length}개 중) — 원자료로 확인해 주세요: ${worst.map((x) => `「${x.text.slice(0, 30)}…」`).join(" / ")}`);
  }
  // 문장(읽히는 문장 — docs/plan/경평초안-문장품질-수정안.md P7): 교정 요청에도 넣음
  const prose = proseIssues(spec);
  warnings.push(...prose.map((x) => `문장: ${x}`));
  // 제목(2026-10-28): 소항목 제목 한 줄 폭(자동 고치기 사유)·블록 제목 화살표·표기 없는 상자(참고)
  const title = subTitleIssues(spec.sub);
  warnings.push(...title, ...arrowTitleWarnings(blocks), ...bareBoxWarnings(blocks));
  return { spec, unknownNumbers, warnings, yearIssues: issues, composeIssues: [...ownIssues, ...priorQuote, ...place], proseIssues: prose, titleIssues: title };
}

/**
 * 참고 경고 셋(2026-10-27 품질 측정 후속 — 집필·다시 점검 공용, 두 트랙): 같은 수치 반복(repeat-figures.ts)·카드 계획을 실적처럼 쓴 줄(result-plan.ts planAsResult)·
 * 카드 계량지표가 초안에 없음(kpi-cover.ts — 주요사업만, 경영관리는 지표가 많아 뺌). 경고만 — 자동 고치기 사유·점수(fix-policy.ts)에는 넣지 않음
 */
export function signalWarnings(spec: ReportSectionSpec, card: Json): string[] {
  const out = [figureRepeatWarning(spec), planAsResultWarning(spec, card)];
  if (!spec.mg) out.push(kpiMissingWarning(yearActuals(card).kpi.map((k) => k.name), sectionText(spec)));
  return out.filter((x): x is string => Boolean(x));
}

/**
 * 전년 인용(결정론, 2026-10-14 후속 2): 인용 상자·말풍선 칸 글과 우수사례 원문(evidence)이 2025 보고서 글(pastText)에서만 찾아지고
 * 올해 근거(currentKey — 카드·첨부·실사 답변·계량 실적 입력·평가 근거 원문의 sourceKey)에서는 못 찾으면 한 줄로 알림.
 * 블라인드 심사(카드 11장 × 2판): 전년 절의 정책·CEO 인용·현장 말·’25 수상 사례를 올해 첫 블록에 다시 써 「전년복제」 22건 중 10~11건
 */
export function priorQuoteIssues(blocks: Block[], caseEvidence: string[], pastText: string, currentKey: string): string[] {
  if (!pastText.trim()) return [];
  const pastKey = sourceKey(pastText);
  const quotes = [...blocks.filter((b) => b.kind === "quotes" || b.kind === "voices").map((b) => b.cells.map((c) => c.bullets[0] ?? "")).flat(), ...caseEvidence].map((q) => q.trim()).filter(Boolean);
  const only = [...new Set(quotes.filter((q) => quoteFoundIn(pastKey, q) && !quoteFoundIn(currentKey, q)))];
  if (!only.length) return [];
  const cut = (q: string) => (q.length > 30 ? `${q.slice(0, 30)}…` : q);
  return [`전년 인용: ${only.slice(0, 3).map((q) => `「${cut(q)}」`).join("·")}는 2025 보고서 글 — 올해 근거로 바꾸거나 빼 주세요`];
}

/**
 * 추진성과 숫자 반복(결정론, 2026-10-14): 추진성과 글의 숫자 조각 중 블록 글에도 같은 단위로 나오는 것이 2개 이상이면 짜임 문제 문장을 돌려줌
 * (블라인드 심사: 추진성과 상자가 위 블록의 수치를 같은 뜻으로 되풀이). 연도·한 자리 수·【확인: …】 자리표시 안 숫자는 numberTokens·stripNeeds가 이미 뺌
 */
export function resultRepeatIssue(resultText: string, blockText: string): string | null {
  const inBlocks = new Set(numberTokens(stripNeeds(blockText)).map(numKey));
  const same = [...new Set(numberTokens(stripNeeds(resultText)).map(numKey).filter((t) => inBlocks.has(t)))];
  if (same.length < 2) return null;
  return `추진성과: 블록에 쓴 수치를 되풀이(${same.slice(0, 4).join("·")}) — 추진성과는 기준 대비 결과나 블록에 없는 성과로`;
}

/** 초안의 추진성과 글(줄·3칸) / 그 밖의 글 — 막대·띠는 추진성과 몫이지만 반복 점검에는 줄·3칸만 셈 */
function resultRepeatOf(spec: ReportSectionSpec): string | null {
  const results = [...spec.results, ...(spec.resultCards ?? []).flatMap((c) => [c.tag, c.headline, c.figure])].join("\n");
  const rest = sectionText({ ...spec, results: [], resultCards: [], resultChart: undefined, resultBand: "" });
  return resultRepeatIssue(results, rest);
}

/** 추진성과 막대의 시점 라벨(’24년·2025년·8월·상반기·기존·개선·도입 전/후) — 라벨 없는 막대는 무엇을 견주는지 모름 */
const TIME_LABEL = /[’']\d\d|20\d\d|\d{1,2}월|상반기|하반기|분기|기존|개선|도입\s?[전후]|이전|이후/;
/** 등급 표기(C → B·B+·A0) */
const GRADE_RE = /(?<![A-Za-z0-9])[SABCDE][+0]?(?![A-Za-z0-9+])/g;

/**
 * 추진성과 곁들임 정리(결정론): 막대는 막대 2~4개·라벨마다 시점·값이 모두 근거에 있는 숫자일 때만(3칸 추진성과와는 함께 쓰지 않음),
 * 강조 띠는 24자 안·숫자나 등급이 있고 그 숫자·등급이 근거에 있을 때만(막대가 있으면 막대 배지로). 못 쓰면 버리고 경고
 */
export function resultExtras(out: Pick<SectionOutput, "resultChart" | "resultBand">, hasCards: boolean, isKnown: (tok: string) => boolean, evidence: string): { chart: MiniChart | null; band: string; warnings: string[] } {
  const warnings: string[] = [];
  let chart: MiniChart | null = null;
  const raw = out.resultChart;
  if (raw && (raw.series ?? []).length) {
    const series = (raw.series ?? []).map((x) => ({ label: cleanLine(x?.label, 16), value: cleanLine(x?.value, 24) })).filter((x) => x.label && /\d/.test(x.value)).slice(0, 4);
    const bad = series.filter((x) => /【확인:/.test(x.value) || numberTokens(x.value).some((t) => !isKnown(t)));
    if (hasCards) warnings.push("추진성과 막대: 3칸 추진성과와 함께 쓰지 않아 뺐습니다(추진성과는 한 모양이 주).");
    else if (series.length < 2) warnings.push("추진성과 막대: 값이 있는 막대가 2개보다 적어 뺐습니다.");
    else if (actualBars(series).length < 2) warnings.push("추진성과 막대: 실적 값이 2개 미만(목표·계획 값만 더한 막대)이라 뺐습니다 — 실적 값이 쌓이면 다시 쓸 수 있습니다.");
    else if (series.some((x) => !TIME_LABEL.test(x.label))) warnings.push(`추진성과 막대: 시점 라벨(’25년·기존·개선 등)이 없는 막대가 있어 뺐습니다(${series.map((x) => x.label).join("·")}).`);
    else if (bad.length) warnings.push(`추진성과 막대: 근거에 없는 값(${bad.map((x) => x.value).join("·")})이 있어 뺐습니다 — 막대 값은 근거에 적힌 수치만 씁니다.`);
    else chart = { title: cleanLine(raw.title, 40), series, badge: cleanLine(raw.badge, 24) };
  }
  let band = cleanLine(out.resultBand, 24);
  if (band) {
    const grades = band.match(GRADE_RE) ?? [];
    const gradeIn = (g: string) => new RegExp(`(?<![A-Za-z0-9])${g.replace(/\+/g, "\\+")}(?![A-Za-z0-9+])`).test(evidence);
    const ok = !/【확인:/.test(band) && (/\d/.test(band) || grades.length > 0) && numberTokens(band).every(isKnown) && grades.every(gradeIn);
    if (!ok) {
      warnings.push(`추진성과 강조 띠: 근거에 있는 숫자·등급이 아니어서 뺐습니다(「${band}」).`);
      band = "";
    }
  }
  // 막대와 강조 띠를 함께 두면 불릿 칸이 약 55mm로 좁아져 줄이 늘어남(표본 실측) — 띠 글은 막대 배지로
  if (chart && band) {
    if (!chart.badge) chart.badge = band;
    warnings.push(`추진성과 강조 띠: 막대와 함께 쓰지 않아 막대 배지로 옮겼습니다(「${band}」).`);
    band = "";
  }
  return { chart, band, warnings };
}

/**
 * 사람이 고친 초안 다시 점검(결정론 — 블록 고치기 뒤): verifySection의 결정론 부분만 다시 셈 — 판면 어림(spec.fit), 근거에 없는 숫자, 판면·문체·올해 실적·
 * 문장 점검·근거 약함 경고. AI 답 정리 단계의 경고(뺀 인용 등)는 그때의 것이라 다시 만들지 않음. extraText는 verifySection과 같은 숫자·근거 글
 */
export function recheckSection(spec: ReportSectionSpec, card: Json, extraText = "", year?: number, today?: string): { spec: ReportSectionSpec; unknownNumbers: string[]; warnings: string[] } {
  const known = knownNumbers(card, extraText);
  const next: ReportSectionSpec = { ...spec };
  const unknownNumbers = [...new Set(numberTokens(stripNeeds(sectionText(next))).filter((t) => !known.has(numKey(t)) && !known.has(numKey(t).replace(/(%|배)$/, ""))))];
  const warnings: string[] = [];
  const fit = fitReport(next);
  next.fit = { total: fit.total, budget: fit.budget, passes: spec.fit?.passes };
  if (fit.total > fit.budget * FIT_BAND.over) warnings.push(`판면: 어림 ${fit.total}mm로 ${next.module}쪽(${fit.budget}mm)보다 ${fit.total - fit.budget}mm 넘칩니다 — 칸 글·블록을 줄여 주세요.`);
  else if (fit.total < fit.budget * FIT_BAND.under) warnings.push(`판면: 어림 ${fit.total}mm로 ${next.module}쪽(${fit.budget}mm)에 ${fit.budget - fit.total}mm가 빕니다.`);
  const hollow = hollowWarning(fit.hollow);
  if (hollow) warnings.push(hollow);
  warnings.push(...styleWarnings(next));
  if (year) warnings.push(...yearIssues(next.blocks ?? [], [...next.results, ...(next.resultChart?.series ?? []).map((x) => `${x.label} ${x.value}`)], sectionText(next), year, NEEDS_MAX, { biz: true }).map((x) => `올해 실적: ${x}`));
  const where = extraText.trim() ? "카드·첨부 자료" : "카드";
  if (unknownNumbers.length) warnings.push(`${where}에 없는 숫자 ${unknownNumbers.length}개 — 원자료로 확인하거나 지워 주세요: ${unknownNumbers.slice(0, 8).join(", ")}`);
  warnings.push(...proseIssues(next).map((x) => `문장: ${x}`));
  warnings.push(...subTitleIssues(next.sub), ...arrowTitleWarnings(next.blocks ?? []), ...bareBoxWarnings(next.blocks ?? []));
  const repeat = resultRepeatOf(next);
  if (repeat) warnings.push(repeat);
  const planned = resultPlanWarning(next, today);
  if (planned) warnings.push(planned);
  warnings.push(...signalWarnings(next, card));
  const scores = groundScores(next, `${cardOutline(card)}\n${inspectionCardText(card)}\n${extraText}`);
  const weak = scores.filter((x) => x.overlap < GROUND_WEAK);
  if (weak.length) {
    next.ground = { weak: weak.map((x) => x.text), checked: scores.length };
    warnings.push(`근거 약함: 근거 글과 겹치는 말이 적은 문장 ${weak.length}개(판단 ${scores.length}개 중) — 원자료로 확인해 주세요: ${[...weak].sort((a, b) => a.overlap - b.overlap).slice(0, 5).map((x) => `「${x.text.slice(0, 30)}…」`).join(" / ")}`);
  } else delete next.ground;
  if (next.humanEdits?.length) warnings.push(`사람이 고친 블록 ${next.humanEdits.length}개(${next.humanEdits.map((i) => i + 1).join("·")}번) — 다시 만들면 사라집니다(수정 이력에는 남음).`);
  return { spec: next, unknownNumbers, warnings };
}

/** 형제 초안의 짜임(요청·경고용) */
export function siblingLayout(spec: ReportSectionSpec): SiblingLayout | null {
  if (!spec.blocks?.length) return null;
  const sub = spec.plan?.subStory;
  return { label: `${spec.task.no} ${spec.sub.mark}. ${spec.sub.title.slice(0, 24)}`, story: spec.story ?? "", ...(sub ? { subStory: sub } : {}), signature: blockSignature(spec.blocks) };
}

/** spec의 모든 글(숫자 대조·검색용) */
export function sectionText(spec: ReportSectionSpec): string {
  const parts: string[] = [spec.sub.title];
  for (const r of spec.rows) {
    parts.push(...r.bullets, r.diagram.title);
    for (const x of r.diagram.rows) parts.push(x.key, ...x.before, ...x.after);
    for (const x of r.diagram.steps) parts.push(x.title, ...x.bullets, x.note);
    for (const x of r.diagram.actions) parts.push(x.effort, x.result);
    if (r.chart) parts.push(r.chart.title, ...r.chart.series.map((x) => `${x.label} ${x.value}`), r.chart.badge);
  }
  for (const c of spec.context ?? []) parts.push(c.title, c.quote, c.cite);
  parts.push(spec.banner ?? "");
  for (const c of spec.cases ?? []) parts.push(c.tab, c.title, ...c.items);
  for (const c of spec.resultCards ?? []) parts.push(c.tag, c.headline, c.figure);
  if (spec.resultChart) parts.push(spec.resultChart.title, ...spec.resultChart.series.map((x) => `${x.label} ${x.value}`), spec.resultChart.badge);
  parts.push(spec.resultBand ?? "");
  for (const b of spec.blocks ?? []) parts.push(...blockTexts(b));
  parts.push(...spec.results);
  return parts.filter(Boolean).join("\n");
}

/** 저장된 spec 읽기(형식이 다르면 null) */
export function readSection(raw: unknown): ReportSectionSpec | null {
  const r = raw as { version?: unknown; rows?: unknown; blocks?: unknown } | null | undefined;
  if (!r || typeof r !== "object" || ![1, 2, 3].includes(r.version as number) || !Array.isArray(r.rows)) return null;
  if (r.version === 3 && !Array.isArray(r.blocks)) return null;
  return raw as ReportSectionSpec;
}
