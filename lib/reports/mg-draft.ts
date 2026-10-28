// 경영관리 경평 초안 「집필」(순수) — 승인된 구성안(평가내용 → 대주제 → 절)대로 카드 1장의 대주제 묶음을 한 번에 씀(설계 결정 2026-10-09 「카드당 1회」).
// 요청 글(구성안·집필 공용 자료 블록)·승인된 구성안 글·AI 답 정리(블록 정리·원문 대조·숫자 대조·문체·올해 실적·근거 겹침)는 주요사업 부품을 그대로 씀.
// 다른 것: 절마다 블록을 받아 한 줄 블록 목록 + 절 표지(spec.mg.at)로 펼침, 판면 맞추기·자동 고치기 없음(2026-10-12 사용자 결정 — 경고까지만), 추진성과는 절마다 블록으로.
// 분량(2026-10-12 사용자 결정 D1): 목차·쪽 배정의 이 카드 쪽수(지표 총량은 작성분량(규정), 카드 몫은 2025 쪽 비율로 앱이 어림한 배정)를 「분량 목표」로 요청에 넣고, 쓴 뒤 높이 어림(사업 조판과 같은 mgSpecHeight)이 ±25% 밖이면 경고만.
// 닫기(D2): 2025 절이 모두 「추진성과」로 닫힌 지표는 절마다 마지막 블록 라벨 「추진성과」(mg-outline.ts mgCloseRule), 아니면 기본 규칙.
// AI 지시문은 resources/prompts/report-draft-mg/*.md(공통 지식 절은 _shared/knowledge-mg.md).

import { z } from "zod";
import { cardOutline } from "../ai/writer.ts";
import { inspectionCardText } from "../ai/inspect.ts";
import { KB_SECTIONS } from "../knowledge/kb-sections.ts";
import { type Descriptions, type PromptSet, type PromptSpec, described, fillFrom } from "../prompts/template.ts";
import { NEEDS_MAX, type YearActuals, stripNeeds, yearIssues } from "./actuals.ts";
import { BLOCK_OUT_FIELDS, type Block, FIGURE_LABEL, blockOutSchema, blockTexts, cleanBlocks, isGridTable } from "./blocks.ts";
import { mgSpecHeight } from "./business-layout.ts";
import { type Composition, MATERIAL_LABEL, applyPlanLayout, blockPerLine, planBlockCap, planLayoutText, sideBySide } from "./composition.ts";
import { mgVarietyIssues, repeatedKinds } from "./diagram-hints.ts";
import { HEAD_PART_MM, PAGE_MM, blockCosts, guardFigures, hollowBoxes, hollowWarning, plainText, tableShapeCosts, titleMm } from "./fit.ts";
import { isNoFindingLine } from "./findings.ts";
import { MG_FRAMEWORKS } from "./frameworks-mg.ts";
import { storyLabel } from "./frameworks.ts";
import { GROUND_WEAK, bigramSet, groundScores } from "./ground.ts";
import { LENS_GROUPS, type LensRef } from "./lens.ts";
import { MG_LIMITS, type MgPriorSection, mgCloseRule, mgClosePrompt, mgPartLabel, partOrder, skeletonLines, unclosedPartKeys } from "./mg-outline.ts";
import type { MgDraftMeta, MgPart } from "./mg-types.ts";
import { proseIssues } from "./prose.ts";
import { resultPlanWarning } from "./result-plan.ts";
import { type Marker, type ReportFile, type ReportSectionSpec, cleanLine, knownNumbers, numberTokens, quoteFoundIn, resultRepeatIssue, sectionText, signalWarnings, sourceKey, styleWarnings } from "./section.ts";
import { arrowTitleWarnings } from "./title-checks.ts";
import type { LooseJson } from "../loose-json.ts";

type Json = LooseJson;

/** 요청 글(구성안·집필 공용)의 맥락 */
export interface MgDraftContext {
  /** 평가단위(MG-N) */
  unit: string;
  /** 지표 이름 */
  indicator: string;
  taskNo: string;
  /** 앱이 붙일 마커(지적개선·신규) */
  markers: Marker[];
  /** 그 지표의 2025 보고서 골격(절·절 없는 대주제 본문 — 글 포함) */
  prior: MgPriorSection[];
  /** 이 카드의 추천 평가내용(분석 §5 첫 대응 — mg-outline.ts defaultEvals) */
  evals: number[];
  /** 분량 목표 = 목차·쪽 배정의 이 카드 쪽수(저장된 배정, 없으면 목차 화면의 기본 배정 — mg-queries.ts loadMgCardPages). 못 정하면 없음(분량 절·경고 없음) */
  pages?: number | null;
  /** 카드 원장의 시점 글(mgCardAsOf — 요청 「카드」 머리). 없으면 「시점 모름」 */
  cardAsOf?: string;
}

/**
 * 카드 원장의 시점(2026-10-12): 원본 판(cards.edition YYMMDD)과 그 뒤 원장 JSON 저장 횟수(data_rev)·마지막 수정일 — 카드와 첨부의 같은 항목 값이 다를 때
 * AI가 「더 최근 자료」를 고르는 근거. 요청에 카드 날짜가 없으면 「올해 실적 재료」의 작성일(오늘)을 카드 날짜로 읽어 옛 카드 값을 고른 일이 있었음(13-4)
 */
export function mgCardAsOf(c: { edition?: string | null; data_rev?: number | null; updated_at?: string | null }): string {
  const m = /^(\d\d)(\d\d)(\d\d)$/.exec(String(c.edition ?? ""));
  const ed = m ? `’${m[1]}.${Number(m[2])}.${Number(m[3])}. 판` : "판 모름";
  const rev = Number(c.data_rev ?? 0);
  const d = /^\d\d(\d\d)-(\d\d)-(\d\d)/.exec(String(c.updated_at ?? ""));
  if (rev > 0) return `${ed}(그 뒤 원장 수정 ${rev}회${d ? ` — 마지막 ’${d[1]}.${Number(d[2])}.${Number(d[3])}.` : ""})`;
  return `${ed}(그 뒤 원장 수정 없음)`;
}

/** 카드 「지적 및 개선방안」의 실제 지적 행(행마다 지적 줄을 이은 글 — 빈 표시·「지적사항 없음」 줄은 뺌, findings.ts) */
export function mgFindingRows(card: Json): string[] {
  return (card?.findings?.rows ?? [])
    .map((r: Json) =>
      (Array.isArray(r?.finding) ? r.finding : [])
        .map((x: unknown) => String(typeof x === "string" ? x : ((x as Json)?.text ?? "")))
        .filter((t: string) => t.replace(/[\s∙•·\-]/g, "") && !isNoFindingLine(t))
        .join(" "),
    )
    .filter(Boolean);
}

/** 경영관리 마커: 지적 및 개선방안 칸에 지적이 있으면 지적개선(「지적사항 없음」 줄은 지적 아님 — findings.ts), 26년 신규 체크면 신규 */
export function mgMarkers(card: Json): Marker[] {
  const out: Marker[] = [];
  if (mgFindingRows(card).length) out.push("지적개선");
  if (card?.overview?.checks?.new) out.push("신규");
  return out;
}

/** 지적개선 표지 자리 문턱: 지적 행의 글자 두 개 묶음 중 그 절 글에만 있는 묶음(모든 절에 있는 묶음은 뺌)의 비율 — 이보다 낮으면 첫 자리(예전 그대로) */
export const MG_FINDING_MIN = 0.3;

/**
 * 지적개선 표지를 붙일 절(결정론, 2026-10-15): 지적 행마다 글이 가장 많이 겹치는 절 열쇠(같으면 앞 절, 중복 없음).
 * 절 글 = 대주제 제목·절 제목·그 절 블록 글(blockTexts), 겹침 = 지적 행 글자 두 개 묶음(ground.ts bigramSet) 중 그 절 글에 있고 모든 절에 있지는 않은 묶음의 비율.
 * 마커에 지적개선이 없거나(「지적사항 없음」뿐) 문턱(MG_FINDING_MIN) 아래면 그 행은 빼고, 다 빠지면 빈 목록(렌더러는 예전처럼 첫 대주제 띠)
 */
export function mgFindingParts(spec: ReportSectionSpec, card: Json): string[] {
  const parts = spec.mg?.parts ?? [];
  const rows = mgFindingRows(card);
  if (!parts.length || !rows.length || !spec.sub.markers.includes("지적개선")) return [];
  const at = spec.mg?.at ?? [];
  const blocks = spec.blocks ?? [];
  const sets = parts.map((p) => bigramSet(plainText([p.themeTitle, p.title, ...blocks.flatMap((b, i) => (at[i] === p.key ? blockTexts(b) : []))].join("\n"))));
  const common = sets.length >= 2 ? new Set([...sets[0]].filter((g) => sets.every((s) => s.has(g)))) : new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const f = [...bigramSet(plainText(row))];
    if (!f.length) continue;
    let best = -1;
    let top = 0;
    sets.forEach((s, i) => {
      const r = f.filter((g) => s.has(g) && !common.has(g)).length / f.length;
      if (r > top) [best, top] = [i, r];
    });
    if (best >= 0 && top >= MG_FINDING_MIN && !out.includes(parts[best].key)) out.push(parts[best].key);
  }
  return out;
}

/** spec.mg.finding을 다시 정함(집필 답 정리·다시 점검 공용) — 고를 절이 없으면 필드를 지움 */
function withFinding(spec: ReportSectionSpec, card: Json): void {
  if (!spec.mg) return;
  const finding = mgFindingParts(spec, card);
  const mg: MgDraftMeta = { ...spec.mg, finding };
  if (!finding.length) delete mg.finding;
  spec.mg = mg;
}

/** 요청 글에 넣는 전년 절 글 상한(자): 고른 평가내용의 절 본문 — 넘치면 뒤 절은 제목만 */
export const MG_PRIOR_CHARS = 40_000;

/** request.md에 있어야 하는 절 */
export const MG_REQUEST_SECTIONS = [
  "header",
  "markers.none",
  "skeleton.head",
  "skeleton.line",
  "skeleton.defaults",
  "skeleton.none",
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
  "lens.head",
  ...LENS_GROUPS.map((g) => `lens.group.${g}` as const),
  "lens.item",
  "lens.itemPlain",
  "prior.head",
  "prior.item",
  "prior.titleOnly",
  "prior.tail",
  "files.head",
  "files.item",
  "files.relation.card",
  "files.relation.matched",
  "files.relation.same",
  "plan.head",
  "volume.plan",
  "close.strict",
  "close.loose",
  "close.none",
  "plan.part",
  "plan.block",
  "plan.human",
  "plan.materialsHead",
  "plan.material",
  "plan.tail",
] as const;
type RequestKey = (typeof MG_REQUEST_SECTIONS)[number];

/** AI 답 필드(schema.md 절 이름) */
export const MG_DRAFT_OUT_FIELDS = ["parts", "part.key", "part.title", "part.blocks", "caption"] as const;
export const MG_DRAFT_SCHEMA_FIELDS = [...MG_DRAFT_OUT_FIELDS, ...BLOCK_OUT_FIELDS.map((k) => `block.${k}`)];

/** 경영관리 집필 프롬프트 파일(resources/prompts/report-draft-mg)에 있어야 하는 절 */
export const MG_DRAFT_PROMPT_SPEC: PromptSpec = { system: ["system"], request: [...MG_REQUEST_SECTIONS, ...KB_SECTIONS], schema: MG_DRAFT_SCHEMA_FIELDS };

export function mgDraftOutSchema(desc?: Descriptions) {
  const d = <T extends z.ZodType>(s: T, key: (typeof MG_DRAFT_OUT_FIELDS)[number]) => described(s, desc, key);
  return z.object({
    parts: d(z.array(z.object({ key: d(z.string(), "part.key"), title: d(z.string(), "part.title"), blocks: d(z.array(blockOutSchema(desc)), "part.blocks") })), "parts"),
    caption: d(z.string(), "caption"),
  });
}
export const MgDraftOut = mgDraftOutSchema();
export type MgDraftOutput = z.infer<typeof MgDraftOut>;

const yy = (n: number) => String(n % 100).padStart(2, "0");

/**
 * 요청 글의 자료 블록(구성안·집필 공용): 머리(지표·카드·마커) → 전년 보고서 골격과 추천 평가내용 → 올해 실적 재료 → 평가 기준·평가위원 관점 →
 * 전년 보고서 절 글(evals의 절 — 상한 MG_PRIOR_CHARS) → 첨부. evals = 글을 넣을 평가내용(구성안은 추천 값, 집필은 승인된 구성안의 평가내용)
 */
export function mgMaterialsPrompt(p: PromptSet, card: Json, ctx: MgDraftContext, year: number, evals: number[], files: ReportFile[] = [], lens: LensRef[] = [], actuals?: YearActuals): string {
  const r = (key: RequestKey, vars: Record<string, string | number> = {}) => fillFrom(p, "request", key, vars);
  const lines = [r("header", { year, indicator: ctx.indicator, taskNo: ctx.taskNo, title: String(card?.title ?? ""), markers: ctx.markers.join("·") || r("markers.none"), card: inspectionCardText(card), asOf: ctx.cardAsOf || "시점 모름" })];
  lines.push("", r("skeleton.head", { priorYear: year - 1 }));
  const sk = skeletonLines(ctx.prior);
  if (sk.length) lines.push(...sk.map((line) => r("skeleton.line", { line })));
  else lines.push(r("skeleton.none"));
  lines.push(r("skeleton.defaults", { evals: ctx.evals.length ? ctx.evals.map((n) => `평가내용 ${n}`).join("·") : "—" }));
  if (actuals) {
    lines.push("", r("actuals.head", { year, today: actuals.today || "—" }));
    for (const k of actuals.kpi) {
      const actual = k.input ? r("actuals.kpiInput", { value: k.input }) : k.outcome ? r("actuals.kpiOutcome", { value: k.outcome }) : k.expected ? r("actuals.kpiExpected", { value: k.expected }) : r("actuals.kpiNone", { yy: yy(year), name: k.name });
      lines.push(r("actuals.kpi", { name: k.name, unit: k.unit || "—", prevYY: yy(year - 1), prev: k.prev || "—", yy: yy(year), target: k.target || "—", actual }));
    }
    if (actuals.monthly.length) {
      lines.push(r("actuals.monthlyHead", { yy: yy(year) }));
      for (const m of actuals.monthly) lines.push(r("actuals.monthlyItem", { period: m.period || "—", line: m.line }));
    } else lines.push(r("actuals.monthlyNone"));
    if (actuals.outcome?.length) {
      lines.push(r("actuals.outcomeHead"));
      for (const line of actuals.outcome) lines.push(r("actuals.outcomeItem", { line }));
    }
  }
  if (lens.length) {
    lines.push("", r("lens.head"));
    for (const g of LENS_GROUPS) {
      const refs = lens.filter((x) => x.group === g);
      if (!refs.length) continue;
      lines.push("", r(`lens.group.${g}`));
      refs.forEach((x, i) => lines.push("", r(x.where ? "lens.item" : "lens.itemPlain", { n: i + 1, title: x.title, where: x.where, text: x.text })));
    }
  }
  const secs = ctx.prior.filter((s) => evals.includes(s.evalNo)).sort(partOrder);
  if (secs.length) {
    lines.push("", r("prior.head", { priorYear: year - 1, priorYY: yy(year - 1), count: secs.length }));
    let used = 0;
    secs.forEach((s, i) => {
      const label = mgPartLabel(s);
      if (used + s.text.length > MG_PRIOR_CHARS) lines.push("", r("prior.titleOnly", { n: i + 1, label }));
      else {
        used += s.text.length;
        lines.push("", r("prior.item", { n: i + 1, label, text: s.text }));
      }
    });
    lines.push("", r("prior.tail"));
  }
  if (files.length) {
    lines.push("", r("files.head", { count: files.length }));
    files.forEach((f, i) => {
      lines.push("", r("files.item", { n: i + 1, name: f.name, relation: r(`files.relation.${f.relation === "same-report" ? "same" : (f.relation ?? "card")}` as RequestKey) }));
      lines.push(f.text);
    });
  }
  return lines.join("\n");
}

/** 분량 목표 쪽수(0보다 큰 수만) */
const targetPages = (pages: number | null | undefined) => (typeof pages === "number" && pages > 0 ? pages : null);

/** 절 머리만 있는 빈 초안 — mgSpecHeight(사업 조판과 같은 셈)로 머리 높이(평가내용 상자·대주제 띠·절 제목 줄 + 위아래 여백)를 잼 */
const headOnly = (parts: MgPart[]): ReportSectionSpec => ({ version: 3, card: { id: "", taskNo: "", title: "" }, business: { no: 0, name: "" }, task: { no: "", title: "", bp: false }, sub: { mark: "", title: "", markers: [] }, rows: [], blocks: [], results: [], caption: "", module: 1, mg: { indicator: "", parts, at: [] } });

/** 블록 종류별 어림 높이 줄(주요사업 「판면 예산」과 같은 표 — lib/reports/fit.ts blockCosts, 표 모양 4종 줄은 경영관리만 tableShapeCosts) */
const costLines = () => [...blockCosts(), tableShapeCosts()].map((x) => `  - ${x}`).join("\n");

/**
 * 구성안 요청 「분량 목표」(report-outline-mg/request.md volume.* — 2026-10-12 D1): 배정 쪽 · 판면 높이 · 머리 높이 · 블록 수 감 · 절 수(쪽당 2~3절 언저리)별 블록 영역과 절당 분량.
 * 배정이 없으면 빈 글(분량 목표 없이)
 */
export function mgVolumePrompt(p: PromptSet, pages: number | null | undefined): string {
  const n = targetPages(pages);
  if (!n) return "";
  const height = Math.round(n * PAGE_MM.height);
  const cap = planBlockCap(n);
  const lo = Math.min(MG_LIMITS.parts, Math.max(1, Math.floor(n * 2)));
  const hi = Math.min(MG_LIMITS.parts, Math.max(lo, Math.ceil(n * 3)));
  const marks = "가나다라마바사아";
  const lines = [fillFrom(p, "request", "volume.head", { pages: n, pageMm: PAGE_MM.height, height, blocks: cap, evalMm: HEAD_PART_MM.biz, themeMm: HEAD_PART_MM.task, titleMm: titleMm("", []).toFixed(1), costs: costLines() })];
  for (let k = lo; k <= hi; k++) {
    const area = Math.max(0, Math.round(height - mgSpecHeight(headOnly(Array.from({ length: k }, (_, i) => part(1, marks[i]))))));
    lines.push(fillFrom(p, "request", "volume.part", { parts: k, area, perPart: Math.round(area / k), perBlocks: Math.max(1, Math.round(cap / k)) }));
  }
  lines.push(fillFrom(p, "request", "volume.tail"));
  return lines.join("\n");
}

/** 머리 높이 어림용 절(평가내용 1·대주제 1, 제목 한 줄) */
const part = (themeNo: number, mark: string): MgPart => ({ key: `1.${themeNo}.${mark}`, evalNo: 1, evalTitle: "", themeNo, themeTitle: "", mark, title: "", story: "", why: "" });

/** 집필 요청 블록 줄의 글 한도(칸 폭으로 센 한 줄 글자 수 — composition.ts blockPerLine, 주요사업 글 한도와 같은 폭 셈). 나란한 칸은 줄 수 맞춤만(판면 맞추기가 없어 줄 수 상한은 안 둠) */
function mgLimitText(b: Composition["blocks"][number]): string {
  const w = blockPerLine(b);
  if (!w) return "없음(짧은 글)";
  return w.unit === "line" ? `불릿 ${b.cells}줄 이하 · 한 줄 약 ${w.perLine}자` : `칸마다 한 줄 약 ${w.perLine}자${sideBySide(b) ? " · 나란한 칸은 줄 수를 같게(±1줄)" : ""}`;
}

/** 승인된 구성안 글(집필 요청 — 이 지표의 닫기 관례·분량 목표, 절마다 이야기 틀과 블록·글 한도) */
export function mgPlanPrompt(p: PromptSet, c: Composition, ctx: Pick<MgDraftContext, "indicator" | "prior" | "pages">): string {
  const r = (key: RequestKey, vars: Record<string, string | number> = {}) => fillFrom(p, "request", key, vars);
  const lines = [r("plan.head", { message: c.message || "—", points: c.points.join(" · ") || "—" })];
  lines.push(mgClosePrompt(p, ctx.prior, ctx.indicator));
  const pages = targetPages(ctx.pages);
  const parts = c.mg?.parts ?? [];
  if (pages && parts.length) {
    const height = Math.round(pages * PAGE_MM.height);
    const head = mgSpecHeight(headOnly(parts));
    const area = Math.max(0, Math.round(height - head));
    lines.push(r("volume.plan", { pages, parts: parts.length, blocks: c.blocks.length, height, headMm: Math.round(head), area, perPart: Math.round(area / parts.length), perBlock: c.blocks.length ? Math.round(area / c.blocks.length) : area, costs: costLines() }));
  }
  let n = 0;
  for (const part of parts) {
    const fw = MG_FRAMEWORKS.find((f) => f.story === part.story);
    lines.push(r("plan.part", { key: part.key, where: mgPartLabel(part), story: storyLabel(part.story, part.subStory) || "—", fit: fw?.fit ?? "—", why: part.why || "—" }));
    for (const b of c.blocks.filter((x) => x.at === part.key)) {
      n += 1;
      const figs = b.figures.map((f) => `${FIGURE_LABEL[f.kind]}/${f.size}/${f.pos} 「${f.desc}」`).join(", ");
      lines.push(r("plan.block", { n, kind: b.variant ? `${b.kind}:${b.variant}` : b.kind, label: b.label || "전폭", layout: planLayoutText(b), purpose: b.purpose || "—", cells: b.cells, limit: mgLimitText(b), materials: b.materials.join("·") || "—", figures: figs || "없음" }));
      if (b.by === "human" || b.memo) lines.push(r("plan.human", { memo: b.memo || "없음" }));
    }
  }
  lines.push(r("plan.materialsHead"));
  for (const m of c.materials) lines.push(r("plan.material", { id: m.id, kind: MATERIAL_LABEL[m.kind], text: m.text, when: m.when || "—", source: m.source || "—", found: m.kind === "need" ? "자료 필요" : m.found ? "원문 확인" : "원문 못 찾음" }));
  lines.push(r("plan.tail", { memo: c.memo || "없음" }));
  return lines.join("\n");
}

/** 【확인】 자리표시 상한 — 절마다 2개(report-draft-mg/inputs.md), 절이 둘 이하면 주요사업 소항목과 같은 4개 */
const needsCap = (parts: number) => Math.max(NEEDS_MAX, parts * 2);

const numKey = (tok: string) => tok.replace(/,/g, "").replace(/\s+/g, "").replace(/퍼센트/, "%");

/** spec의 모든 글 + 절 제목(숫자 대조) */
/**
 * 추진성과 블록의 수치 반복 경고(경고만 — 경영관리는 자동 고치기 없음, 2026-10-14): 절마다 라벨이 추진성과·추진실적·성과인 블록의 글을
 * 같은 절의 다른 블록 글과 견줌(주요사업 resultRepeatIssue와 같은 규칙)
 */
export function mgResultRepeats(spec: ReportSectionSpec): string[] {
  const blocks = spec.blocks ?? [];
  const at = spec.mg?.at ?? [];
  const out: string[] = [];
  for (const key of [...new Set(at)]) {
    const mine = blocks.filter((_, i) => at[i] === key);
    const isRes = (b: Block) => /^(추진성과|추진실적|성과)$/.test(b.label.trim());
    const issue = resultRepeatIssue(mine.filter(isRes).flatMap(blockTexts).join("\n"), mine.filter((b) => !isRes(b)).flatMap(blockTexts).join("\n"));
    if (issue) out.push(issue);
  }
  return out;
}

export const mgSpecText = (spec: ReportSectionSpec) => [sectionText(spec), ...(spec.mg?.parts ?? []).map((p) => `${p.themeTitle}\n${p.title}`)].join("\n");

/** 성과로 닫지 않은 절(대주제 본문 제외) — 구성안 점검과 같은 규칙(mg-outline.ts unclosedPartKeys — 기본은 「추진실적」 열·대주제 공용 추진성과 인정, 엄격 지표는 마지막 블록 「추진성과」만) */
function unclosedParts(parts: MgPart[], blocks: Block[], at: string[], strict: boolean): MgPart[] {
  const open = new Set(unclosedPartKeys(parts, blocks.map((b, i) => ({ at: at[i] ?? "", label: b.label, kind: b.kind, variant: b.variant })), strict));
  return parts.filter((p) => open.has(p.key));
}

/** 닫기 경고 한 줄(집필·다시 점검 공용) */
const closeWarning = (open: MgPart[], strict: boolean) =>
  strict
    ? `절: ${open.map(mgPartLabel).join(" / ")}의 마지막 블록이 라벨 「추진성과」가 아닙니다 — 이 지표의 2025 보고서는 절마다 「추진성과」 행으로 닫았습니다.`
    : `절: ${open.map(mgPartLabel).join(" / ")}이(가) 성과(「추진성과」 행·「추진실적」 열)로 닫히지 않았습니다.`;

/** 분량 경고 폭(±25%) — 카드 몫은 2025 쪽 비율로 나눈 어림이라 넓게(2026-10-12 사용자 결정 D1) */
export const MG_VOLUME_BAND = 0.25;

/** 분량 경고(D1): 어림 높이(mm — mgSpecHeight)가 배정 쪽 × 판면 높이의 ±25% 밖이면 한 줄, 안이거나 배정이 없으면 null */
export function mgVolumeWarning(mm: number, pages: number | null | undefined): string | null {
  const n = targetPages(pages);
  if (!n) return null;
  const budget = n * PAGE_MM.height;
  const ratio = (mm - budget) / budget;
  if (Math.abs(ratio) <= MG_VOLUME_BAND) return null;
  const pct = Math.round(ratio * 100);
  return `분량: 어림 ${Math.round(mm)}mm(약 ${(mm / PAGE_MM.height).toFixed(1)}쪽) — 배정 ${n}쪽(작성분량 기준) 대비 ${pct > 0 ? "+" : ""}${pct}% — ${ratio > 0 ? "블록·칸 글을 줄이거나 구성안에서 블록을 빼 주세요." : "근거가 있으면 블록·칸을 보태 주세요."}`;
}

/**
 * 집필 점검 보강(2026-10-12 — 경고만, 집필·다시 점검 공용): 표의 빈 값 칸·수치 띠의 빈 큰 수치(자리표시 없이 빈 칸), 초안 전체 그림 자리 0
 * (report-draft-mg/blocks.md 그림 자리 — 2025 경영관리 보고서는 절마다 사진·삽화 1~3장), 같은 절 안 같은 도식 반복(주요사업 repeatedKinds — 경영관리는 표도 예외), 분량
 */
function mgShapeWarnings(spec: ReportSectionSpec): string[] {
  const out: string[] = [];
  const blocks = spec.blocks ?? [];
  for (const b of blocks) {
    const where = b.label ? `[${b.label}] ` : "";
    if (isGridTable(b)) {
      const cols = new Map<string, number>();
      for (const c of b.cells)
        c.bullets.forEach((v, k) => {
          if (v.trim()) return;
          const name = b.items[k + 1] || `${k + 2}번째 열`;
          cols.set(name, (cols.get(name) ?? 0) + 1);
        });
      if (cols.size) out.push(`빈 칸: ${where}표의 ${[...cols].map(([name, n]) => `「${name}」 ${n}칸`).join("·")}이 비었습니다 — 값이 근거에 없으면 【확인: …】로 두고, 올해 값이 하나도 없는 열은 빼고 그 실적은 자리표시 한 줄로 알립니다.`);
    }
    if (b.kind === "stats") {
      const n = b.cells.filter((c) => !c.head.trim()).length;
      if (n) out.push(`빈 칸: ${where}수치 띠의 큰 수치 ${n}칸이 비었습니다 — 값이 근거에 없으면 【확인: …】로 둡니다.`);
    }
  }
  if (blocks.length && !blocks.some((b) => b.figures?.length)) out.push("그림 자리: 초안에 그림 자리가 없습니다 — 2025 경영관리 보고서는 절마다 사진·삽화가 1~3장 붙습니다(제도·재무·보수처럼 그릴 대상이 없는 절은 0개). 근거에 행사·현장·시스템 화면 같은 그릴 대상이 있으면 구성안 블록에 그림 자리를 더해 주세요.");
  const at = spec.mg?.at ?? [];
  for (const p of spec.mg?.parts ?? []) {
    const again = repeatedKinds(blocks.filter((_, i) => at[i] === p.key)).filter((k) => k !== "table");
    if (again.length) out.push(`도식: ${mgPartLabel(p)}에서 같은 도식(${again.join("·")})을 두 번 이상 썼습니다 — 한 절 안에서는 한 번(표·불릿·막대·소주제 제외).`);
  }
  // 모양 다양성(2026-10-12 — 경고만): 한 절에 같은 표 모양 하나까지, 카드 전체 서로 다른 모양이 절반 넘게
  out.push(...mgVarietyIssues(blocks, at, (spec.mg?.parts ?? []).map((p) => ({ key: p.key, name: mgPartLabel(p) }))));
  // 빈 상자 칸(2026-10-15 후속 5 — 주요사업과 같은 셈·문구, 경고만)
  const hollow = hollowWarning(hollowBoxes(blocks, at));
  if (hollow) out.push(hollow);
  const volume = mgVolumeWarning(mgSpecHeight(spec), spec.mg?.pages);
  if (volume) out.push(volume);
  return out;
}

export interface MgDraftCheck {
  spec: ReportSectionSpec;
  unknownNumbers: string[];
  warnings: string[];
}

/**
 * AI 답 정리 + 점검(경영관리): 절마다 블록 정리(cleanBlocks — 원문 없는 인용·사례·정의는 뺌)를 하고 승인된 구성안의 절 순서로 펼침(spec.mg.at).
 * 숫자 대조 근거 = 카드 + extraText(첨부·전년 보고서 절·실사 답변·계량 실적 입력), quoteOnly = 인용 대조에만(평가 기준·지적).
 * 경고: 구성안에 있는데 안 쓴 절·모르는 절·추진성과로 닫지 않은 절(이 지표 닫기 관례대로)·뺀 블록·빈 칸·그림 자리 0·절 안 같은 도식 반복·분량(배정 ±25%)·근거에 없는 숫자·문체·올해 실적·문장·근거 약함.
 * 판면을 맞추지는 않음(자동 고치기 없음 — 경고만). 배정 쪽수·닫기 관례·지적개선 표지 자리는 spec.mg(pages·strictClose·finding)에 남겨 다시 점검·블록 고치기·렌더러가 씀
 */
export function verifyMgDraft(out: MgDraftOutput, card: Json, plan: Composition, ctx: MgDraftContext, extraText = "", quoteOnly = "", year?: number, today?: string): MgDraftCheck {
  const hay = sourceKey(`${cardOutline(card)}\n${inspectionCardText(card)}\n${extraText}\n${quoteOnly}`);
  const parts = plan.mg?.parts ?? [];
  const byKey = new Map(parts.map((p) => [p.key, p]));
  const got = new Map<string, { title: string; blocks: Block[] }>();
  const dropped: string[] = [];
  let strange = 0;
  for (const op of out.parts ?? []) {
    const key = String(op?.key ?? "").trim();
    const p = byKey.get(key);
    if (!p || got.has(key)) {
      strange += 1;
      continue;
    }
    const c = cleanBlocks(op.blocks ?? [], cleanLine, (q) => quoteFoundIn(hay, q));
    // 배치(전폭·단 띠·가로 반씩)는 승인된 구성안의 이 절 블록에서 옮김(AI가 정하지 않음)
    applyPlanLayout({ blocks: plan.blocks.filter((b) => b.at === key) }, c.blocks);
    dropped.push(...c.dropped);
    got.set(key, { title: cleanLine(op.title, 80).replace(/^[가-하]\.\s*/, ""), blocks: c.blocks });
  }
  const blocks: Block[] = [];
  const at: string[] = [];
  const used: MgPart[] = [];
  const strict = mgCloseRule(ctx.prior).strict;
  const pages = targetPages(ctx.pages);
  for (const p of parts) {
    const g = got.get(p.key);
    if (!g || !g.blocks.length) continue;
    used.push({ ...p, title: p.mark ? g.title || p.title : "", why: "" });
    for (const b of g.blocks) {
      blocks.push(b);
      at.push(p.key);
    }
  }
  const spec: ReportSectionSpec = {
    version: 3,
    card: { id: String(card?.id ?? ""), taskNo: String(card?.taskNo ?? ""), title: String(card?.title ?? "") },
    business: { no: 0, name: ctx.indicator },
    task: { no: ctx.taskNo, title: String(card?.title ?? ""), bp: false },
    sub: { mark: "", title: String(card?.title ?? ""), markers: ctx.markers },
    rows: [],
    blocks,
    story: "",
    results: [],
    caption: cleanLine(out.caption, 200),
    module: 1,
    mg: { indicator: ctx.indicator, parts: used, at, ...(pages ? { pages } : {}), ...(strict ? { strictClose: true } : {}) },
  };
  withFinding(spec, card);
  const known = knownNumbers(card, extraText);
  const isKnown = (t: string) => known.has(numKey(t)) || known.has(numKey(t).replace(/(%|배)$/, ""));
  const text = mgSpecText(spec);
  const unknownNumbers = [...new Set(numberTokens(stripNeeds(text)).filter((t) => !isKnown(t)))];
  const warnings: string[] = [];
  const missing = parts.filter((p) => !used.some((u) => u.key === p.key));
  if (missing.length) warnings.push(`구성안: 승인한 절 ${parts.length}개 중 ${missing.length}개(${missing.map(mgPartLabel).join(" / ")})를 쓰지 않았습니다 — 다시 만들거나 구성안을 고쳐 주세요.`);
  if (strange) warnings.push(`구성안: 구성안에 없는 절 ${strange}개를 답에 넣어 뺐습니다.`);
  const open = unclosedParts(used, blocks, at, strict);
  if (open.length) warnings.push(closeWarning(open, strict));
  // 블록 제목 화살표(참고 — 두 트랙 공용, lib/reports/title-checks.ts, 2026-10-28)
  warnings.push(...guardFigures(blocks, at), ...dropped, ...mgShapeWarnings(spec), ...styleWarnings(spec), ...arrowTitleWarnings(blocks));
  if (year) warnings.push(...yearIssues(blocks, [], text, year, needsCap(used.length)).map((x) => `올해 실적: ${x}`));
  const where = extraText.trim() ? "카드·근거 자료" : "카드";
  if (unknownNumbers.length) warnings.push(`${where}에 없는 숫자 ${unknownNumbers.length}개 — 원자료로 확인하거나 지워 주세요: ${unknownNumbers.slice(0, 8).join(", ")}`);
  const scores = groundScores(spec, `${cardOutline(card)}\n${inspectionCardText(card)}\n${extraText}`);
  const weak = scores.filter((x) => x.overlap < GROUND_WEAK);
  if (weak.length) {
    spec.ground = { weak: weak.map((x) => x.text), checked: scores.length };
    warnings.push(`근거 약함: 근거 글과 겹치는 말이 적은 문장 ${weak.length}개(판단 ${scores.length}개 중) — 원자료로 확인해 주세요: ${[...weak].sort((a, b) => a.overlap - b.overlap).slice(0, 5).map((x) => `「${x.text.slice(0, 30)}…」`).join(" / ")}`);
  }
  warnings.push(...proseIssues(spec).map((x) => `문장: ${x}`), ...mgResultRepeats(spec));
  const planned = resultPlanWarning(spec, today);
  if (planned) warnings.push(planned);
  warnings.push(...signalWarnings(spec, card));
  return { spec, unknownNumbers, warnings };
}

/** 사람이 고친 경영관리 초안 다시 점검(블록 고치기·직접 고치기·되돌리기 뒤): 숫자 대조·문체·올해 실적·문장·근거 약함·추진성과로 닫기·빈 칸·그림 자리·도식 반복·분량(spec.mg.pages). 판면 맞추기 없음 */
export function recheckMgSection(spec: ReportSectionSpec, card: Json, extraText = "", year?: number, today?: string): { spec: ReportSectionSpec; unknownNumbers: string[]; warnings: string[] } {
  const known = knownNumbers(card, extraText);
  const next: ReportSectionSpec = { ...spec };
  delete next.fit;
  // 지적개선 표지 자리도 고친 블록 글로 다시 정함(필드가 없던 초안도 이때 정해짐)
  withFinding(next, card);
  const text = mgSpecText(next);
  const unknownNumbers = [...new Set(numberTokens(stripNeeds(text)).filter((t) => !known.has(numKey(t)) && !known.has(numKey(t).replace(/(%|배)$/, ""))))];
  const warnings: string[] = [];
  const strict = Boolean(next.mg?.strictClose);
  const open = next.mg ? unclosedParts(next.mg.parts, next.blocks ?? [], next.mg.at, strict) : [];
  if (open.length) warnings.push(closeWarning(open, strict));
  warnings.push(...mgShapeWarnings(next), ...styleWarnings(next), ...arrowTitleWarnings(next.blocks ?? []));
  if (year) warnings.push(...yearIssues(next.blocks ?? [], [], text, year, needsCap(next.mg?.parts.length ?? 1)).map((x) => `올해 실적: ${x}`));
  const where = extraText.trim() ? "카드·근거 자료" : "카드";
  if (unknownNumbers.length) warnings.push(`${where}에 없는 숫자 ${unknownNumbers.length}개 — 원자료로 확인하거나 지워 주세요: ${unknownNumbers.slice(0, 8).join(", ")}`);
  warnings.push(...proseIssues(next).map((x) => `문장: ${x}`), ...mgResultRepeats(next));
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
