// 경평 초안 평가용 결정론 스코어카드(수동 연기 시험 전용) — 초안 spec(html.json)마다 판면·도식·근거·연도 구성·논점 커버·문체 경고를 셈.
// 호스티드 DB는 카드 원장·전년 절·평가 근거를 읽기만 함(쓰지 않음). 판단이 아니라 셈이라 결과는 결정론(같은 초안 → 같은 값).
// 실행: node --conditions=react-server --env-file=.env.local scripts/eval/eval-report-score.ts <evalDir>
//  evalDir 예: docs/analysis/eval/2026-09-27 — <evalDir>/drafts/*.html.json을 읽어(없으면 건너뜀) <evalDir>/scores.json을 씀.
//  근거(카드·전년 절·평가 근거)는 앱이 쓰는 것과 같은 결정론 함수(pickPrior·loadLens)로 다시 모음.
//  <evalDir>/measure.json(카드 id별 frameMm·liCount·raggedLi·sparseLi — 브라우저 실측)이 있으면 record.measure에 그대로 옮김.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { inspectionCardText } from "../../lib/ai/inspect.ts";
import { type YearActuals, type Timing, hasFigure, needsIn, planOnly, timingOf, yearActuals, yearIssues } from "../../lib/reports/actuals.ts";
import { type Block, VARIANTS, figuresOf } from "../../lib/reports/blocks.ts";
import { ownKindsIn, repeatedKinds } from "../../lib/reports/diagram-hints.ts";
import { firstBlockStats, kindStats, storyStats } from "../../lib/reports/eval-stats.ts";
import { fitReport } from "../../lib/reports/fit.ts";
import { GROUND_WEAK, bigramSet, groundScores, groundedSentences, overlapScore } from "../../lib/reports/ground.ts";
import type { LensRef } from "../../lib/reports/lens.ts";
import { loadLens } from "../../lib/reports/lens-queries.ts";
import { lensCover } from "../../lib/reports/lens-cover.ts";
import { plainText } from "../../lib/reports/fit.ts";
import { type PriorSection, pickPrior, toPriorSection } from "../../lib/reports/prior.ts";
import { isListed, proseIssues } from "../../lib/reports/prose.ts";
import { PRIOR_SAME_SCORE, type ReportSectionSpec, figureCap, numberTokens, readSection, sectionHints, sectionText, styleWarnings } from "../../lib/reports/section.ts";
import type { LooseJson } from "../../lib/loose-json.ts";

type Json = LooseJson;

const evalDir = process.argv[2];
if (!evalDir) {
  console.error("usage: node --conditions=react-server --env-file=.env.local scripts/eval/eval-report-score.ts <evalDir>");
  process.exit(1);
}
const draftsDir = `${evalDir}/drafts`;
if (!existsSync(draftsDir)) throw new Error(`초안 폴더가 없음: ${draftsDir}`);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
// 평가 세트는 2026년도 경영실적보고서 초안(올해 실적 판단의 기준 연도)
const YEAR = 2026;

// ---------------------------------------------------------------------------
// .log 파일에서 JSON 블록(scripts/smoke/ai-report-smoke.ts의 console.log 결과) 뽑기 — 아직 도는 중(HTML: 줄 없음)이면 null

interface LogMeta {
  model?: string;
  sec?: number;
  usage?: { input?: number; output?: number; cacheRead?: number };
  fitPasses?: number;
  unknownNumbers?: string[];
  warnings?: string[];
  story?: string;
  layout?: string | null;
}
function parseLog(path: string): LogMeta | null {
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, "utf8").split("\n");
  const start = lines.findIndex((l) => l.startsWith("provider "));
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && l.startsWith("HTML: "));
  const body = (end >= 0 ? lines.slice(start + 1, end) : lines.slice(start + 1)).join("\n").trim();
  if (!body) return null;
  try {
    return JSON.parse(body) as LogMeta;
  } catch {
    return null; // 아직 도는 중이거나 실패(진행 중 로그)
  }
}

// ---------------------------------------------------------------------------
// 근거 원문 겹침(lib/reports/ground.ts — 4단계 검증 보강에서 앱 검증(section.ts verifySection)과 규칙 한 곳으로 옮김)

// ---------------------------------------------------------------------------
// 도식 목록(불릿·소제목 제외, kind 또는 kind:모양 — lib/reports/blocks.ts의 blockSignature와 같은 표기)

function diagramName(b: Block): string {
  const def = VARIANTS[b.kind]?.[0] ?? "";
  return b.variant && b.variant !== def ? `${b.kind}:${b.variant}` : b.kind;
}
const diagramList = (blocks: Block[]): string[] => blocks.filter((b) => b.kind !== "bullets" && b.kind !== "subhead").map(diagramName);

// ---------------------------------------------------------------------------
// 표현 보강(2026-09-27): 추진성과 모양(bullets·cards·chart)·강조 띠·위첨자 비교 줄 수·새 블록(qa·table·cards:vs) 개수

/** 추진성과 모양: resultCards가 2개 이상이면 cards, resultChart가 있으면 chart, 그 밖은 bullets(곁들임인 resultBand·위첨자는 따로 셈) */
function resultShapeOf(spec: ReportSectionSpec): "bullets" | "cards" | "chart" {
  if ((spec.resultCards ?? []).length >= 2) return "cards";
  if (spec.resultChart && (spec.resultChart.series ?? []).length >= 2) return "chart";
  return "bullets";
}
function expressionSummary(spec: ReportSectionSpec) {
  const blocks = spec.blocks ?? [];
  return {
    resultShape: resultShapeOf(spec),
    resultBand: Boolean(spec.resultBand),
    // 추진성과 줄 중 위첨자 비교(^{…})를 쓴 줄 수
    supResultLines: spec.results.filter((r) => r.includes("^{")).length,
    qa: blocks.filter((b) => b.kind === "qa").length,
    table: blocks.filter((b) => b.kind === "table").length,
    cardsVs: blocks.filter((b) => b.kind === "cards" && b.variant === "vs").length,
  };
}

// ---------------------------------------------------------------------------
// 문장 품질(문장품질-수정안, 2026-09-27, lib/reports/prose.ts) — 나열·절차 낱말·카드 어휘 겹침·카드 글 그대로 옮김·proseIssues 갈래별 수.
// 규칙(isListed·proseIssues)은 lib/reports/prose.ts, 문장 모음은 lib/reports/ground.ts의 groundedSentences 그대로(규칙 한 곳).

/** 절차·관리 낱말(문장품질-수정안 1절 표) */
const PROC_WORD_RE = /산정|재산정|사후검증|지침|절차|기준|입력|관리|모니터링|점검|운영|수립|마련|정비|검토|반영|적용/g;

/** 두 글(빈칸 걷은)의 가장 긴 공통 조각(글자 수) — 카드 글을 그대로 옮긴 정도를 봄(DP, O(len(a)·len(b))) */
function longestCommonSubstring(a: string, b: string): number {
  if (!a.length || !b.length) return 0;
  let prev = new Array(b.length + 1).fill(0);
  let max = 0;
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > max) max = cur[j];
      }
    }
    prev = cur;
  }
  return max;
}

/** proseIssues() 줄을 갈래로: 나열·관리 정보·풀지 않은 약어·평가 대응 말(각 줄 머리 문구로 가름 — prose.ts의 out.push 순서와 같음) */
function proseCategory(issue: string): "listed" | "admin" | "abbr" | "evalWord" | "other" {
  if (issue.startsWith("한 칸에 서로 다른 항목을 나열한 글")) return "listed";
  if (issue.startsWith("관리 정보(예산·인원)")) return "admin";
  if (issue.startsWith("풀지 않은 약어")) return "abbr";
  if (issue.startsWith("제목·라벨에 평가 대응 말")) return "evalWord";
  return "other";
}

function proseSummary(spec: ReportSectionSpec, cardText: string) {
  const sentences = groundedSentences(spec).map((s) => plainText(s).replace(/【확인:[^】]*】/g, "○○"));
  const n = sentences.length;
  const listedCount = sentences.filter((s) => isListed(s)).length;
  const procWords = sentences.reduce((sum, s) => sum + (s.match(PROC_WORD_RE)?.length ?? 0), 0);
  const cardBg = bigramSet(cardText);
  const cardTextFlat = cardText.replace(/\s/g, "");
  const overlaps = sentences.map((s) => overlapScore(s, cardBg)).filter((x): x is number => x !== null);
  const copiedCount = sentences.filter((s) => longestCommonSubstring(s.replace(/\s/g, ""), cardTextFlat) > 12).length;
  const issues = proseIssues(spec);
  const issueCounts = { listed: 0, admin: 0, abbr: 0, evalWord: 0, other: 0 };
  for (const x of issues) issueCounts[proseCategory(x)]++;
  return {
    sentences: n,
    list: sentences, // 비교 페이지(eval-report-page.ts)의 「초안 문장」 칸에 그대로 씀
    listedRatio: n ? Math.round((listedCount / n) * 1000) / 1000 : 0,
    procWordsPerSentence: n ? Math.round((procWords / n) * 1000) / 1000 : 0,
    cardOverlapAvg: overlaps.length ? Math.round((overlaps.reduce((a, b) => a + b, 0) / overlaps.length) * 1000) / 1000 : null,
    cardCopiedRatio: n ? Math.round((copiedCount / n) * 1000) / 1000 : 0,
    issues,
    issueCounts,
  };
}

// ---------------------------------------------------------------------------
// 그림 자리표시(figures, 2026-09-27, lib/reports/blocks.ts): 개수·종류·자리·크기 분포와 쪽 모듈 상한(figureCap) 안 여부

function countBy<T extends string>(xs: T[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of xs) out[x] = (out[x] ?? 0) + 1;
  return out;
}
function figuresSummary(spec: ReportSectionSpec) {
  const figs = figuresOf(spec.blocks ?? []);
  return {
    count: figs.length,
    byKind: countBy(figs.map((f) => f.kind)),
    byPos: countBy(figs.map((f) => f.pos)),
    bySize: countBy(figs.map((f) => f.size)),
    // 0.5쪽 0~2·1쪽 0~4(module × 4, 최소 2) — figureCap과 같은 값. 0개(그릴 대상 없음)도 허용
    perModuleOk: figs.length <= figureCap(spec.module),
  };
}

// ---------------------------------------------------------------------------
// 짜임(도식 수렴 해소 ③, 2026-09-27): 실제로 쓴 이 과제만의 요소(own)·앱이 찾은 후보(candidates)·첫 블록·시각 블록 수(불릿·소제목·메시지 띠·가치 띠 제외)

const COMPOSE_PLAIN_KINDS = new Set(["bullets", "subhead", "banner", "band"]);
const composeVisuals = (blocks: Block[]) => blocks.filter((b) => !COMPOSE_PLAIN_KINDS.has(b.kind)).length;

// ---------------------------------------------------------------------------
// 연도 구성: numberTokens() 토큰이 나온 조각(줄)의 낱말로 분류(그대로) + 올해 실적(lib/reports/actuals.ts, 2026-09-27 B)

type YearBucket = "y26" | "past" | "plan" | "other";
function classifyPiece(piece: string): YearBucket {
  if (/’26|2026|올해|금년/.test(piece)) return "y26";
  if (/’25|2025|’24|2024|전년/.test(piece)) return "past";
  if (/예상|목표|계획/.test(piece)) return "plan";
  return "other";
}
/**
 * 핵심 수치 띠(stats)·추진성과의 「올해 실적」 여부는 앱이 초안을 검증할 때 쓰는 것과 같은 결정론 함수(lib/reports/actuals.ts)로 셈합니다.
 * statsNowOrNeed: stats 블록이 없으면 null(판단 대상 아님), 있으면 now·need 칸이 하나라도 있는지.
 * resultsNow: 추진성과 문장 중 자리표시가 있거나(needsIn) 목표·예상 전용이 아니면서 수치가 있는(hasFigure) 줄의 수 —
 *   actuals.ts의 비공개 mentionsNow·pastFigure를 새로 export하지 않고, 공개 함수(needsIn·hasFigure·planOnly)만으로 어림한 것입니다.
 */
function yearMix(spec: ReportSectionSpec, year: number) {
  const counts: Record<YearBucket, number> = { y26: 0, past: 0, plan: 0, other: 0 };
  for (const piece of sectionText(spec).split("\n")) {
    const n = numberTokens(piece).length;
    if (n) counts[classifyPiece(piece)] += n;
  }
  const statsBlocks = (spec.blocks ?? []).filter((b) => b.kind === "stats");
  const statsTiming: Record<Timing, number> = { need: 0, target: 0, now: 0, past: 0, none: 0 };
  for (const b of statsBlocks) for (const c of b.cells) statsTiming[timingOf({ note: c.note, text: `${c.head} ${c.bullets.join(" ")}` }, year)]++;
  const statsNowOrNeed = statsBlocks.length ? statsTiming.now + statsTiming.need > 0 : null;
  const resultsNow = spec.results.filter((r) => needsIn(r).length > 0 || (hasFigure(r) && !planOnly(r, year))).length;
  const issues = yearIssues(spec.blocks ?? [], spec.results, sectionText(spec), year);
  const needs = needsIn(sectionText(spec)).length;
  return { counts, statsTiming, statsNowOrNeed, resultsNow, needs, issues };
}

// ---------------------------------------------------------------------------
// 논점 커버(lib/reports/lens-cover.ts — 4단계 검증 보강에서 과제별 초안 화면(칩)과 규칙 한 곳으로 옮김): 5축

// ---------------------------------------------------------------------------
// 카드 1장의 근거(원장·전년 절·평가 근거) — 앱과 같은 결정론 함수로 다시 모음(읽기 전용)

interface CardSources {
  card: { id: string; eval_unit_id: string; data: Json };
  prior: ReturnType<typeof pickPrior>;
  lens: LensRef[];
  actuals: YearActuals;
  /** 앱이 찾은 이 과제만의 요소 후보(kind만) — 카드·전년 절·평가 기준·올해 실적 재료로(첨부 없이, ai-report-smoke.ts와 같은 입력) */
  candidates: string[];
}
async function loadCardSources(id: string): Promise<CardSources | null> {
  const { data: card, error } = await db.from("cards").select("id, eval_unit_id, team_id, data").eq("id", id).single();
  if (error || !card) {
    console.warn(`카드를 읽지 못함(${id}): ${error?.message}`);
    return null;
  }
  const { data: rows } = await db.from("knowledge_chunks").select("chunk_key, business, title, text, report_page_2025, meta").eq("doc_id", "rpt25-biz").eq("business", card.eval_unit_id);
  const sections: PriorSection[] = (rows ?? []).map(toPriorSection);
  const prior = pickPrior(card.data, sections);
  const lens = await loadLens(db, { id: card.id, evalUnitId: card.eval_unit_id, data: card.data });
  const { data: report } = await db.from("reports").select("inputs").eq("eval_unit_id", card.eval_unit_id).eq("team_id", card.team_id).eq("year", YEAR).maybeSingle();
  const actuals = yearActuals(card.data, (report?.inputs?.kpi ?? {}) as Record<string, string>);
  const candidates = sectionHints(card.data, prior, [], lens, actuals, YEAR)
    .filter((h) => h.own)
    .map((h) => h.kind);
  return { card, prior, lens, actuals, candidates };
}

// ---------------------------------------------------------------------------

const files = readdirSync(draftsDir)
  .filter((f) => f.endsWith(".html.json"))
  .sort();
console.log(`초안 ${files.length}건`);

const measurePath = `${evalDir}/measure.json`;
const measure: Record<string, Json> = existsSync(measurePath) ? JSON.parse(readFileSync(measurePath, "utf8")) : {};

const records: Json[] = [];
/** 곁의 구성안 파일(평가 연기 시험이 남김)의 보조 틀 */
const outlineSub = (base: string): string => {
  const path = `${draftsDir}/${base}.html.outline.json`;
  if (!existsSync(path)) return "";
  try {
    return String(JSON.parse(readFileSync(path, "utf8"))?.subStory ?? "");
  } catch {
    return "";
  }
};
for (const file of files) {
  const base = file.slice(0, -".html.json".length);
  let raw: Json;
  try {
    raw = JSON.parse(readFileSync(`${draftsDir}/${file}`, "utf8"));
  } catch (e) {
    console.warn(`spec을 읽지 못함(${file}): ${(e as Error).message}`);
    continue;
  }
  const spec = readSection(raw);
  if (!spec) {
    console.warn(`spec 형식이 아님(건너뜀): ${file}`);
    continue;
  }
  const id: string = spec.card.id || base.replace(/_/g, "/");
  const sources = await loadCardSources(id);
  const log = parseLog(`${draftsDir}/${base}.log`);

  const sourceText = sources
    ? [inspectionCardText(sources.card.data), ...sources.prior.map((p) => p.section.text), ...sources.lens.filter((l) => l.group === "survey").map((l) => l.text)].join("\n")
    : "";
  const overlaps = groundScores(spec, sourceText);
  const weak = overlaps.filter((x) => x.overlap < GROUND_WEAK);
  const weakest = [...overlaps].sort((a, b) => a.overlap - b.overlap).slice(0, 10);

  // 문장 품질(카드 글만 — 전년 절·평가 근거는 「근거 겹침」 쪽에서 이미 봄)
  const cardText = sources ? inspectionCardText(sources.card.data) : "";
  const prose = proseSummary(spec, cardText);

  const fit = fitReport(spec);
  const blocks = spec.blocks ?? [];
  const diagrams = diagramList(blocks);
  const repeated = repeatedKinds(blocks);
  const composeOwn = ownKindsIn(blocks);
  const composeVisualCount = composeVisuals(blocks);
  const compose = {
    own: composeOwn,
    candidates: sources?.candidates ?? [],
    staplesOnly: composeOwn.length === 0 && composeVisualCount > 0,
    first: blocks.length ? diagramName(blocks[0]) : null,
    visuals: composeVisualCount,
  };

  records.push({
    file,
    id,
    meta: {
      title: spec.sub.title,
      mark: spec.sub.mark,
      cardTitle: spec.card.title,
      business: spec.business,
      task: spec.task,
      module: spec.module,
      priorTop: sources?.prior[0] ? { key: sources.prior[0].section.key, score: sources.prior[0].score, same: sources.prior[0].score >= PRIOR_SAME_SCORE } : null,
      // 문장 대조 페이지(eval-report-page.ts)용 — DB를 다시 안 읽도록 전년 절 원문을 통째로 둠(커밋 안 하는 평가 산출물)
      priorText: sources?.prior[0]?.section.text ?? "",
      log,
    },
    fitEstimate: { total: fit.total, budget: fit.budget, ragged: fit.ragged.length, sparse: fit.sparse.length, bullets: fit.bullets },
    // 이야기 틀(주 + 보조 — 2026-10-09): 초안 spec의 틀, 보조 틀은 구성안대로 쓴 초안의 spec.plan 또는 곁의 구성안 파일(<id>.html.outline.json)
    story: { story: spec.story ?? "", subStory: spec.plan?.subStory ?? outlineSub(base) },
    diagrams: { list: diagrams, distinct: new Set(diagrams).size, repeated },
    groundWeak: {
      total: overlaps.length,
      weakCount: weak.length,
      weakShare: overlaps.length ? Math.round((weak.length / overlaps.length) * 1000) / 1000 : 0,
      weakest,
    },
    yearMix: yearMix(spec, YEAR),
    lensCover: lensCover(spec),
    styleWarnCount: styleWarnings(spec).length,
    compose,
    figures: figuresSummary(spec),
    expression: expressionSummary(spec),
    prose,
    measure: measure[id] ?? null,
  });
  console.log(`  ${id}: 도식 ${diagrams.length}(고유 ${new Set(diagrams).size}) · 판면 ${fit.total}/${fit.budget}mm · 약한 문장 ${weak.length}/${overlaps.length} · 나열 ${prose.listedRatio} · 카드겹침 ${prose.cardOverlapAvg ?? "-"} · 문장문제 ${prose.issues.length}`);
}

// ---------------------------------------------------------------------------
// 묶음 요약: 도식 종류 분포·상위 3 비중·엔트로피(비트)·주요 지표 평균

const kinds = kindStats(records.map((r) => r.diagrams.list as string[]));
const stories = storyStats(records.map((r) => r.story as { story: string; subStory: string }));
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const avg = (xs: number[]) => (xs.length ? round3(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

// 올해 실적 요약: 핵심 수치 띠가 있는 초안 중 올해(now)·확인(need) 칸이 있는 비율, 올해 실적 문제(yearIssues)가 있는 초안 수, 자리표시 평균 개수
const withStats = records.filter((r) => r.yearMix.statsNowOrNeed !== null);
const draftsStatsNowOrNeed = `${withStats.filter((r) => r.yearMix.statsNowOrNeed).length}/${withStats.length}`;
const draftsWithYearIssues = `${records.filter((r) => (r.yearMix.issues as string[]).length > 0).length}/${records.length}`;
const avgNeeds = avg(records.map((r) => r.yearMix.needs));

// 짜임 요약(도식 수렴 해소 ③, 2026-09-27): 후보가 있었던 초안 중 실제로 이 과제만의 요소를 쓴 비율, 첫 블록 분포, 쪽 모듈별 평균 시각 블록 수
const withCandidates = records.filter((r) => (r.compose.candidates as string[]).length > 0);
const draftsWithOwn = `${withCandidates.filter((r) => (r.compose.own as string[]).length > 0).length}/${withCandidates.length}`;
const { firstBlocks, bulletsShare: firstBulletsShare } = firstBlockStats(records.map((r) => r.compose.first as string | null).filter((x): x is string => Boolean(x)));
const avgVisualsHalf = avg(records.filter((r) => r.meta.module === 0.5).map((r) => r.compose.visuals));
const avgVisualsFull = avg(records.filter((r) => r.meta.module !== 0.5).map((r) => r.compose.visuals));

// 그림 자리표시 요약(2026-09-27): 평균 개수, 그림이 있는 초안 수, 종류별 분포(그릴 대상이 없는 과제는 0개가 정상)
const avgFigures = avg(records.map((r) => r.figures.count));
const draftsWithFigures = `${records.filter((r) => r.figures.count > 0).length}/${records.length}`;
const figureKinds: Record<string, number> = {};
for (const r of records) for (const [k, n] of Object.entries(r.figures.byKind as Record<string, number>)) figureKinds[k] = (figureKinds[k] ?? 0) + n;

// 표현 보강 요약(2026-09-27): 새 표현 종류마다 쓰인 초안 수(N/전체) — 이 기능 전 초안은 모두 0/bullets가 정상
const withExpr = (pred: (e: Json) => boolean) => `${records.filter((r) => pred(r.expression)).length}/${records.length}`;
const draftsWithChart = withExpr((e) => e.resultShape === "chart");
const draftsWithCardsResult = withExpr((e) => e.resultShape === "cards");
const draftsWithBand = withExpr((e) => e.resultBand);
const draftsWithSup = withExpr((e) => e.supResultLines > 0);
const draftsWithQa = withExpr((e) => e.qa > 0);
const draftsWithTable = withExpr((e) => e.table > 0);
const draftsWithCardsVs = withExpr((e) => e.cardsVs > 0);

// 문장 품질 요약(문장품질-수정안, 2026-09-27): 나열·절차 낱말·카드 어휘 겹침·카드 글 그대로 옮김 평균, 문장 문제 있는 초안 수·갈래별 합계
const avgListedRatio = avg(records.map((r) => r.prose.listedRatio));
const avgProcWordsPerSentence = avg(records.map((r) => r.prose.procWordsPerSentence));
const overlapVals = records.map((r) => r.prose.cardOverlapAvg).filter((x): x is number => x !== null);
const avgCardOverlap = overlapVals.length ? avg(overlapVals) : null;
const avgCardCopiedRatio = avg(records.map((r) => r.prose.cardCopiedRatio));
const draftsWithProseIssues = `${records.filter((r) => (r.prose.issues as string[]).length > 0).length}/${records.length}`;
const avgProseIssueCount = avg(records.map((r) => (r.prose.issues as string[]).length));
const proseIssueCounts = { listed: 0, admin: 0, abbr: 0, evalWord: 0, other: 0 };
for (const r of records) for (const [k, n] of Object.entries(r.prose.issueCounts as Record<string, number>)) proseIssueCounts[k as keyof typeof proseIssueCounts] += n;

const summary = {
  drafts: records.length,
  kindFrequency: kinds.frequency,
  top3Share: kinds.top3Share,
  entropyBits: kinds.entropyBits,
  // 이야기 틀(주 + 보조) 분포·섞음 비율·쓰인 주 틀 수(2026-10-09 — 라운드 O: 섞음 5/8·주 틀 3종)
  stories,
  avgFitRatio: avg(records.map((r) => r.fitEstimate.total / r.fitEstimate.budget)),
  avgDiagramsDistinct: avg(records.map((r) => r.diagrams.distinct)),
  avgGroundWeakShare: avg(records.map((r) => r.groundWeak.weakShare)),
  avgStyleWarnCount: avg(records.map((r) => r.styleWarnCount)),
  avgLensCoverCount: avg(records.map((r) => r.lensCover.count)),
  draftsStatsNowOrNeed,
  draftsWithYearIssues,
  avgNeeds,
  draftsWithOwn,
  firstBlocks,
  firstBulletsShare,
  avgVisualsHalf,
  avgVisualsFull,
  avgFigures,
  draftsWithFigures,
  figureKinds,
  draftsWithChart,
  draftsWithCardsResult,
  draftsWithBand,
  draftsWithSup,
  draftsWithQa,
  draftsWithTable,
  draftsWithCardsVs,
  avgListedRatio,
  avgProcWordsPerSentence,
  avgCardOverlap,
  avgCardCopiedRatio,
  draftsWithProseIssues,
  avgProseIssueCount,
  proseIssueCounts,
};

writeFileSync(`${evalDir}/scores.json`, JSON.stringify({ generatedAt: new Date().toISOString(), evalDir, summary, records }, null, 1));
console.log(`scores.json 씀: ${evalDir}/scores.json (${records.length}건)`);
