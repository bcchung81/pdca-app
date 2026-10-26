// 과제 ↔ 공통 지식 조각 매칭(참고자료 3단계, docs/reference-materials.md §4.2.2). 순수 함수 — 모델 호출은 lib/ai/run.ts(callMatchKnowledge).
// 카드 한 장과 그 사업의 대응표 대상 조각을 light 모델이 보고 「이 과제에 해당하는 조각」만 고른다. 결과는 자동 초안일 뿐이고
// 성과관리팀이 /links에서 확정한다 — 거르는 장치가 아니라 「이 과제 해당」 표시·순서·숫자 근거 범위용이라 틀려도 자료는 빠지지 않는다.
// 지시문은 resources/prompts/match-knowledge.

import { z } from "zod";
import { type BundleChunk, layerOf } from "../knowledge/bundle.ts";
import { businessById } from "../knowledge/dictionaries.ts";
import type { BusinessId } from "../knowledge/types.ts";
import { flattenHtmlTables } from "../knowledge/rich-text.ts";
import { SCOPE_UNIT_TYPES } from "../prep/scope.ts";
import type { ScopeHit } from "../prep/types.ts";
import { type Descriptions, type PromptSet, type PromptSpec, described, fillFrom } from "../prompts/template.ts";
import { escapeXml } from "./writer.ts";
import type { LooseJson } from "../loose-json.ts";


/** 매칭 프롬프트 파일(resources/prompts/match-knowledge)에 있어야 하는 절 */
export const MATCH_PROMPT_SPEC: PromptSpec = {
  system: ["system"],
  request: ["prompt", "chunks.head"],
  schema: ["matches", "matches.key", "matches.certainty", "matches.basis"],
};

/** 매칭 답 스키마. desc(schema.md)를 주면 모델에 보내는 필드 설명을 붙이고, 없으면 구조만 */
export function matchResultSchema(desc?: Descriptions) {
  return z.object({
    matches: described(
      z.array(
        z.object({
          key: described(z.string(), desc, "matches.key"),
          certainty: described(z.enum(["high", "unsure"]), desc, "matches.certainty"),
          basis: described(z.string(), desc, "matches.basis"),
        }),
      ),
      desc,
      "matches",
    ),
  });
}
export const MatchResultSchema = matchResultSchema();
export type MatchResult = z.infer<typeof MatchResultSchema>;

/** 한 번 묻는 조각 묶음의 글자 수 상한(자르지 않고 묶음을 나눔 — 넘으면 조각 구간으로 나눠 묻는다, 설계 §4.2.2) */
export const MATCH_GROUP_CHARS = 200_000;
/** 봉투(태그·속성) 몫 — 조각마다 이만큼 더 셈 */
const ENVELOPE_CHARS = 160;

/**
 * 이 사업 카드의 매칭 후보 조각: 규칙 범위(기관 공통·공통지표·사업 미지정·이 사업)에 드는 대응표 대상 유형만.
 * docIds를 주면 그 문서만(새 판이 온 문서). 순서는 문서 → 적재 순서로 고정(같은 사업 카드끼리 글이 바이트까지 같아 캐시를 나눠 씀)
 */
export function matchCandidates(chunks: BundleChunk[], unit: string, docIds?: readonly string[]): BundleChunk[] {
  const onlyDocs = docIds?.length ? new Set(docIds) : null;
  return chunks
    .filter((c) => SCOPE_UNIT_TYPES.includes(c.unit_type) && layerOf(c, unit) !== null && (!onlyDocs || onlyDocs.has(c.doc_id)))
    .sort((a, b) => a.doc_id.localeCompare(b.doc_id) || a.seq - b.seq || a.chunk_key.localeCompare(b.chunk_key));
}

const chunkChars = (c: BundleChunk) => c.title.length + (c.text?.length ?? 0) + (c.context_prefix?.length ?? 0) + ENVELOPE_CHARS;

/** 조각을 자르지 않고 글자 수 상한으로 묶음을 나눔 — 한 조각이 상한보다 커도 혼자 한 묶음 */
export function splitByBudget(chunks: BundleChunk[], maxChars = MATCH_GROUP_CHARS): BundleChunk[][] {
  const groups: BundleChunk[][] = [];
  let cur: BundleChunk[] = [];
  let size = 0;
  for (const c of chunks) {
    const n = chunkChars(c);
    if (cur.length && size + n > maxChars) {
      groups.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(c);
    size += n;
  }
  if (cur.length) groups.push(cur);
  return groups;
}

/** 조각 봉투: 종류(unit)를 함께 적어 모델이 지적·실사·전년 절·Pool을 구분하게 함. 표는 줄 글로 풀어 넣음 */
export function matchBlock(chunks: BundleChunk[]): string {
  return chunks
    .map((c) => `<source key="${escapeXml(c.chunk_key)}" unit="${escapeXml(c.unit_type)}" title="${escapeXml(c.title)}"${c.context_prefix ? ` where="${escapeXml(c.context_prefix)}"` : ""}>\n${escapeXml(flattenHtmlTables(c.text ?? ""))}\n</source>`)
    .join("\n");
}

const unitName = (unit: string) => {
  try {
    return businessById(unit as BusinessId).name2026;
  } catch {
    return unit;
  }
};

/** 요청 앞에 붙는 조각 묶음 글(카드와 무관 — 같은 사업·같은 묶음이면 카드가 달라도 같은 글) */
export function matchShared(p: PromptSet, unit: string, chunks: BundleChunk[]): string {
  return `${fillFrom(p, "request", "chunks.head", { count: chunks.length, business: unitName(unit) })}\n${matchBlock(chunks)}`;
}

const oneLine = (v: unknown) => (typeof v === "string" ? v.replace(/\s*\n\s*/g, " / ").trim() : "");
/** 줄 배열에서 글 줄만(표·그림 줄은 뺌) */
const textLines = (arr: unknown): string[] => (Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string").map(oneLine).filter(Boolean) : []);

/** 카드 요약: 과제 정체성(과제명·실행과제·대상사업·계량지표)과 매칭에 쓰는 칸(전년 지적·AI 활용·개요). 월별 실적은 넣지 않음 */
export function matchCardSummary(data: unknown): string {
  const d = (data ?? {}) as Record<string, LooseJson>;
  const out: string[] = [];
  const put = (label: string, v: unknown) => {
    const s = oneLine(v);
    if (s) out.push(`${label}: ${s}`);
  };
  put("과제명", d.title);
  put("과제번호", d.taskNo);
  put("실행과제", [d.executionTaskNo, d.executionTask].filter(Boolean).join(" "));
  put("대상사업(세부)", d.targetBusiness);
  const kpi = (d.kpi?.rows ?? []).map((r: Record<string, unknown>) => [oneLine(r?.nameRaw ?? r?.name), oneLine(r?.formula)].filter(Boolean).join(" — ")).filter(Boolean);
  if (kpi.length) out.push(`계량지표: ${kpi.join(" / ")}`);
  // 주요사업 카드는 act.findings, 경영관리 카드는 「지적 및 개선방안」 칸(findings.rows — 지적 | 개선방안)
  const mgRows: Array<{ finding?: unknown; plan?: unknown } | null> = Array.isArray(d.findings?.rows) ? d.findings.rows : [];
  const findings = [...textLines(d.act?.findings), ...mgRows.flatMap((r) => textLines(r?.finding))];
  if (findings.length) out.push(`전년 경영평가 지적사항: ${findings.join(" / ")}`);
  const fixes = mgRows.flatMap((r) => textLines(r?.plan));
  if (fixes.length) out.push(`지적에 대한 개선방안: ${fixes.join(" / ")}`);
  put("AI 활용", d.strategy?.ai?.text);
  const overview = textLines(d.overview?.cells);
  if (overview.length) out.push(`과제 개요: ${overview.join(" / ")}`);
  return out.join("\n");
}

/** 요청 글(카드 요약) — 조각 묶음은 matchShared가 요청 앞에 따로 붙임 */
export function matchPrompt(p: PromptSet, unit: string, card: unknown): string {
  return fillFrom(p, "request", "prompt", { business: unitName(unit), card: matchCardSummary(card) });
}

const BASIS_MAX = 200;
/** 한 번 묻는 묶음에서 「애매」로 올릴 수 있는 조각 수 — 사람이 고를 일이 넘치지 않게(넘는 것은 답 순서 뒤부터 버림) */
export const UNSURE_MAX = 10;

/**
 * 모델 답 검증: 입력에 없는 key·빈 근거·같은 조각 중복은 버림(dropped로 셈). 남은 것은 답 순서(관련도 순)대로 rank를 매김.
 * 확신(high)은 자동 초안(auto), 애매(unsure)는 후보(candidate — 사람이 /links에서 고름, 표시에는 안 씀). 애매는 UNSURE_MAX건까지만.
 * 조각을 여러 묶음으로 나눠 물었으면 묶음마다 부르고 처리기가 rank를 다시 매긴다
 */
export function parseMatches(result: MatchResult, valid: ReadonlySet<string>): { hits: ScopeHit[]; dropped: number } {
  const seen = new Set<string>();
  const hits: ScopeHit[] = [];
  let dropped = 0;
  let unsure = 0;
  for (const m of result.matches) {
    const key = m.key.trim();
    const basis = m.basis.replace(/\s+/g, " ").trim();
    if (!valid.has(key) || !basis || seen.has(key)) {
      dropped++;
      continue;
    }
    const isUnsure = m.certainty === "unsure";
    if (isUnsure && ++unsure > UNSURE_MAX) {
      dropped++;
      continue;
    }
    seen.add(key);
    hits.push({ chunkKey: key, basis: basis.slice(0, BASIS_MAX), rank: hits.length + 1, status: isUnsure ? "candidate" : "auto" });
  }
  return { hits, dropped };
}
