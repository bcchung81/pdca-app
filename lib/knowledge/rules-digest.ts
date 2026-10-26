// 공통 규칙 문서(지식공급 하이브리드 선별 계획 5단계 — docs/plan/지식공급-하이브리드선별-계획.md §4·§5). 순수 함수.
// 기준류 조각(chunkRole = rule)을 AI가 끝까지 읽고 만든 근거 메모를 검산하고, 요청에 붙는 마크다운 글로 바꿉니다.
// 범위: 트랙 공통(track-biz·track-mg) = buildBundle(…, "card")의 ①기관 공통·②공통지표·사업 미지정 층, 평가단위(BZ-n·MG-n) = ③층.
// 과제 목록 행(task_list_row)은 과제 고유라 층에 없어 대상이 아닙니다(layerOf가 이미 뺌).
// 규칙 문서는 숫자·인용 근거가 아닙니다 — 인용·숫자 대조는 늘 원문 조각으로 합니다. 지시문·표지 문구는 resources/prompts/rules-digest.

import { createHash } from "node:crypto";
import { z } from "zod";
import { escapeXml } from "../ai/writer.ts";
import { type Descriptions, type PromptSet, type PromptSpec, described, fillFrom } from "../prompts/template.ts";
import { numberTokens } from "../reports/section.ts";
import { BIZ_TRACK, MGMT_TRACK, type TrackSpec } from "../tracks/index.ts";
import { MGMT_INDICATORS } from "../tracks/mgmt-units.ts";
import { type BundleChunk, DOC_ORDER, type LayerId, layerOf } from "./bundle.ts";
import { chunkRole } from "./chunk-role.ts";
import { BUSINESSES } from "./dictionaries.ts";
import { flattenHtmlTables } from "./rich-text.ts";

/** 프롬프트 파일(resources/prompts/rules-digest)에 있어야 하는 절 */
export const RULES_DIGEST_PROMPT_SPEC: PromptSpec = {
  system: ["system"],
  request: ["prompt", "chunks.head", "retry", "doc.head", "doc.omitted"],
  schema: ["rules", "rules.section", "rules.text", "rules.refs", "rules.quotes", "omitted", "omitted.key", "omitted.reason"],
};

/** 답 스키마. desc(schema.md)를 주면 모델에 보내는 필드 설명을 붙이고, 없으면 구조만 */
export function rulesDigestSchema(desc?: Descriptions) {
  return z.object({
    rules: described(
      z.array(
        z.object({
          section: described(z.string(), desc, "rules.section"),
          text: described(z.string(), desc, "rules.text"),
          refs: described(z.array(z.string()), desc, "rules.refs"),
          quotes: described(z.array(z.string()), desc, "rules.quotes"),
        }),
      ),
      desc,
      "rules",
    ),
    omitted: described(z.array(z.object({ key: described(z.string(), desc, "omitted.key"), reason: described(z.string(), desc, "omitted.reason") })), desc, "omitted"),
  });
}
export const RulesDigestSchema = rulesDigestSchema();
export type DigestAnswer = z.infer<typeof RulesDigestSchema>;

// ---------------------------------------------------------------------------
// 범위: 어떤 조각을 요약하나

export interface DigestTarget {
  /** 파일 이름에 쓰는 영문 id(track-biz·track-mg·BZ-1·MG-3 …) */
  id: string;
  track: TrackSpec;
  /** 층 판정에 쓰는 평가단위(트랙 공통은 트랙의 모든 평가단위) */
  units: readonly string[];
  layers: readonly LayerId[];
  /** 문서 머리·요청에 쓰는 이름 */
  title: string;
}

const TRACK_TARGETS: Record<string, TrackSpec> = { "track-biz": BIZ_TRACK, "track-mg": MGMT_TRACK };

/** id → 범위. 모르는 id는 오류(추측하지 않음) */
export function digestTarget(id: string): DigestTarget {
  const track = TRACK_TARGETS[id];
  if (track) return { id, track, units: track.sharedUnits, layers: ["institution", "common"], title: `${track.id} 트랙 공통(기관 공통·공통지표·사업 미지정)` };
  const biz = BUSINESSES.find((b) => b.id === id);
  if (biz && (BIZ_TRACK.sharedUnits as readonly string[]).includes(id)) return { id, track: BIZ_TRACK, units: [id], layers: ["business"], title: `주요사업${id.replace(/^BZ-/, "")} ${biz.name2026}(이 사업 공통)` };
  const mg = MGMT_INDICATORS.find((m) => m.id === id);
  if (mg) return { id, track: MGMT_TRACK, units: [id], layers: ["business"], title: `경영관리 지표${mg.no} ${mg.name}(이 지표 공통)` };
  throw new Error(`규칙 문서 범위를 모릅니다: ${id} (track-biz·track-mg·BZ-1~3·MG-1~14)`);
}

const docRank = (id: string) => {
  const i = DOC_ORDER.indexOf(id);
  return i < 0 ? DOC_ORDER.length : i;
};
const keyOfLayer = (c: BundleChunk, unit: string, layers: readonly LayerId[]) => {
  const l = layerOf(c, unit, "card");
  return l !== null && layers.includes(l);
};

/**
 * 범위의 기준류 조각(묶음과 같은 순서 — 문서 → 적재 순서). 트랙 공통은 평가단위마다 층을 따로 계산해 같은지 확인하고,
 * 다르면 멈춤(트랙 공통 문서 하나로 대신할 수 없음)
 */
export function digestChunks(chunks: BundleChunk[], target: DigestTarget): BundleChunk[] {
  const pick = (unit: string) =>
    chunks
      .filter((c) => chunkRole(c) === "rule" && keyOfLayer(c, unit, target.layers))
      .sort((a, b) => docRank(a.doc_id) - docRank(b.doc_id) || a.doc_id.localeCompare(b.doc_id) || a.seq - b.seq || a.chunk_key.localeCompare(b.chunk_key));
  const [first, ...rest] = target.units.map(pick);
  const sig = (xs: BundleChunk[]) => xs.map((c) => c.chunk_key).join("\n");
  for (const [i, xs] of rest.entries())
    if (sig(xs) !== sig(first)) throw new Error(`${target.id}: 평가단위 ${target.units[0]}와 ${target.units[i + 1]}의 공통 층 기준류 조각이 다릅니다.`);
  return first ?? [];
}

/** 조각 하나의 원문 글(제목·위치·본문 — 표는 줄 글로 풀어 모델이 읽는 글과 같게) */
const sourceText = (c: BundleChunk) => [c.title, c.context_prefix ?? "", flattenHtmlTables(c.text ?? "")].join("\n");
/** 원문 글자 수(본문만 — 사전 실측과 같은 셈) */
export const sourceChars = (chunks: BundleChunk[]) => chunks.reduce((n, c) => n + (c.text?.length ?? 0), 0);

/** 조각 봉투: 모델이 key·종류·제목·위치를 보게 함 */
export function digestBlock(chunks: BundleChunk[]): string {
  return chunks
    .map((c) => `<source key="${escapeXml(c.chunk_key)}" unit="${escapeXml(c.unit_type)}" title="${escapeXml(c.title)}"${c.context_prefix ? ` where="${escapeXml(c.context_prefix)}"` : ""}>\n${escapeXml(flattenHtmlTables(c.text ?? ""))}\n</source>`)
    .join("\n");
}

/** 목표 분량(원문의 15~30%) */
export const DIGEST_RATIO = { min: 0.15, max: 0.3 } as const;

/** 요청 글: 조각 묶음 → 할 일. retry를 주면 검산 문제와 앞 답을 붙임 */
export function digestPrompt(p: PromptSet, target: DigestTarget, chunks: BundleChunk[], retry?: { problems: string[]; previous: DigestAnswer }): string {
  const chars = sourceChars(chunks);
  const vars = { title: target.title, count: chunks.length, chars, minChars: Math.round(chars * DIGEST_RATIO.min), maxChars: Math.round(chars * DIGEST_RATIO.max), keys: chunks.map((c) => c.chunk_key).join(", ") };
  const out = [fillFrom(p, "request", "chunks.head", vars), digestBlock(chunks), "", fillFrom(p, "request", "prompt", vars)];
  if (retry) out.push("", fillFrom(p, "request", "retry", { problems: retry.problems.map((x) => `- ${x}`).join("\n"), previous: JSON.stringify(retry.previous) }));
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// 검산: ① 키 실재 ② 인용 글자 그대로 ③ 빠짐 0 ④ 숫자

export interface DigestCheck {
  ok: boolean;
  /** rules.refs·omitted에 있으나 입력에 없는 키 */
  unknownKeys: string[];
  /** refs가 빈 규칙(0부터 센 번호) */
  emptyRefs: number[];
  /** refs 조각 글에 글자 그대로 없는 인용(quotes와 글 속 「」) */
  badQuotes: Array<{ rule: number; quote: string }>;
  /** 어느 refs·omitted에도 없는 입력 키 */
  missing: string[];
  /** refs 조각 글에 없는 숫자 */
  unknownNumbers: Array<{ rule: number; numbers: string[] }>;
  /** 참고(실패 아님): refs와 omitted에 함께 있는 키 */
  both: string[];
}

/** 공백만 걷음(인용은 공백 차이만 허용) */
const squash = (s: string) => s.replace(/\s+/g, "");
const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** 인용이 글에 글자 그대로 있는지(공백 차이만 허용). 줄임표로 나눈 인용은 조각이 순서대로 모두 있어야 함 */
export function quoteInText(quote: string, text: string): boolean {
  const parts = unescape(quote).replace(/^「|」$/g, "").split(/…|\.{3}|⋯/).map(squash).filter(Boolean);
  if (!parts.length) return false;
  const hay = squash(text);
  let from = 0;
  for (const part of parts) {
    const i = hay.indexOf(part, from);
    if (i < 0) return false;
    from = i + part.length;
  }
  return true;
}

/** 글 속 「…」 인용 */
export const bracketQuotes = (text: string) => [...text.matchAll(/「([^「」]+)」/g)].map((m) => m[1]);

const numValue = (tok: string) => tok.replace(/,/g, "").replace(/\s+/g, "").replace(/퍼센트|%|배$/g, "");
/** 글의 숫자 값 모음(쉼표 걷음) */
const numbersOf = (text: string) => new Set([...text.replace(/(?<=\d),(?=\d{3})/g, "").matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]));
/** 연도 열쇠(두 자리): 2025·’25·'25 → 25 */
const yearsOf = (text: string) => new Set([...text.matchAll(/(?<!\d)20(\d\d)(?!\d)|[’‘'](\d\d)(?!\d)/g)].map((m) => m[1] ?? m[2]));

/**
 * 규칙 글의 숫자 중 원문(refs 조각 글)에 없는 것. 경평 초안 숫자 대조의 numberTokens(쉼표·소수·%·배, 한 자리 수·연도는 뺌)에 더해
 * 규칙 문서에서 중요한 배점(「2점」처럼 한 자리 수 + 점 — 원문에 「2점」이 있어야 함)과 기준연도(2025·’25)도 봄
 */
export function unknownNumbersIn(text: string, source: string): string[] {
  const known = numbersOf(source);
  const hay = squash(source);
  const years = yearsOf(source);
  const out: string[] = [];
  for (const t of numberTokens(text, { dates: true })) if (!known.has(numValue(t))) out.push(t.trim());
  for (const m of text.matchAll(/(?<![\d.,])(\d(?:\.\d+)?)\s*점/g)) if (!hay.includes(`${m[1]}점`)) out.push(m[0].replace(/\s+/g, ""));
  for (const m of text.matchAll(/(?<!\d)20(\d\d)(?!\d)|[’‘'](\d\d)(?!\d)/g)) if (!years.has(m[1] ?? m[2])) out.push(m[0]);
  return [...new Set(out)];
}

/** 답 검산. chunks = 이 범위의 입력 조각 전부 */
export function checkDigest(answer: DigestAnswer, chunks: BundleChunk[]): DigestCheck {
  const byKey = new Map(chunks.map((c) => [c.chunk_key, c]));
  const unknown = new Set<string>();
  const covered = new Set<string>();
  const emptyRefs: number[] = [];
  const badQuotes: DigestCheck["badQuotes"] = [];
  const unknownNumbers: DigestCheck["unknownNumbers"] = [];
  answer.rules.forEach((r, i) => {
    const refs = r.refs.filter((k) => byKey.has(k));
    for (const k of r.refs) (byKey.has(k) ? covered : unknown).add(k);
    if (!r.refs.length) emptyRefs.push(i);
    const source = refs.map((k) => sourceText(byKey.get(k)!)).join("\n");
    for (const q of new Set([...r.quotes, ...bracketQuotes(r.text)])) if (!quoteInText(q, source)) badQuotes.push({ rule: i, quote: q });
    const nums = unknownNumbersIn(r.text, source);
    if (nums.length) unknownNumbers.push({ rule: i, numbers: nums });
  });
  const omitted = new Set<string>();
  for (const o of answer.omitted) (byKey.has(o.key) ? omitted : unknown).add(o.key);
  const missing = chunks.map((c) => c.chunk_key).filter((k) => !covered.has(k) && !omitted.has(k));
  const both = [...omitted].filter((k) => covered.has(k));
  const ok = !unknown.size && !emptyRefs.length && !badQuotes.length && !missing.length && !unknownNumbers.length;
  return { ok, unknownKeys: [...unknown], emptyRefs, badQuotes, missing, unknownNumbers, both };
}

/** 검산 문제 → 다시 만들기 요청에 붙이는 줄(규칙 번호는 1부터) */
export function checkProblems(check: DigestCheck, answer: DigestAnswer): string[] {
  const rule = (i: number) => `규칙 ${i + 1}(「${answer.rules[i]?.text.slice(0, 40) ?? ""}…」)`;
  return [
    ...(check.unknownKeys.length ? [`입력에 없는 key: ${check.unknownKeys.join(", ")}`] : []),
    ...check.emptyRefs.map((i) => `${rule(i)}: refs가 비었습니다`),
    ...check.badQuotes.map((q) => `${rule(q.rule)}: 인용 「${q.quote}」이 refs 조각 글에 글자 그대로 없습니다`),
    ...(check.missing.length ? [`규칙 refs에도 omitted에도 없는 입력 key: ${check.missing.join(", ")}`] : []),
    ...check.unknownNumbers.map((n) => `${rule(n.rule)}: refs 조각 글에 없는 숫자 ${n.numbers.join(", ")}`),
  ];
}

// ---------------------------------------------------------------------------
// 요청에 붙는 글

/** 답 → 마크다운(머리 표지 → 절마다 규칙 줄 + [조각 키] → 해당 없음·중복 부록). 절 순서는 처음 나온 순서 */
export function digestMarkdown(p: PromptSet, target: DigestTarget, answer: DigestAnswer): string {
  const sections = new Map<string, string[]>();
  for (const r of answer.rules) {
    const name = r.section.trim() || "기타";
    if (!sections.has(name)) sections.set(name, []);
    sections.get(name)!.push(`- ${r.text.trim()} [${r.refs.join(", ")}]`);
  }
  const out = [fillFrom(p, "request", "doc.head", { title: target.title })];
  for (const [name, lines] of sections) out.push("", `## ${name}`, "", ...lines);
  if (answer.omitted.length) out.push("", fillFrom(p, "request", "doc.omitted"), "", ...answer.omitted.map((o) => `- ${o.key} — ${o.reason.trim()}`));
  return `${out.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// 부분 갱신(해시 기록 — 원문이 바뀌면 바뀐 조각을 가리키는 절만 다시 만듦. 다시 만드는 일은 아직 구현 안 함)

export interface DigestInput {
  key: string;
  /** 조각 종류·제목·위치·본문의 sha256 앞 16자 */
  hash: string;
  chars: number;
}

export const chunkHash = (c: BundleChunk) => createHash("sha256").update(JSON.stringify([c.unit_type, c.title, c.context_prefix ?? "", c.text ?? ""])).digest("hex").slice(0, 16);

export const digestInputs = (chunks: BundleChunk[]): DigestInput[] => chunks.map((c) => ({ key: c.chunk_key, hash: chunkHash(c), chars: c.text?.length ?? 0 }));

export interface DigestStale {
  /** 글이 바뀐 조각 */
  changed: string[];
  /** 새로 범위에 든 조각(어느 절에 둘지 새로 정해야 함) */
  added: string[];
  /** 범위에서 빠진 조각 */
  removed: string[];
  /** 바뀌거나 빠진 조각을 가리키는 절 — 다시 만들 대상 */
  sections: string[];
  /** 바뀐 조각 중 부록(해당 없음·중복)에 있던 것 — 다시 판정할 대상 */
  omitted: string[];
}

/** 앞 판의 입력 해시·답과 지금 입력을 견줘 다시 만들 대상을 셈 */
export function staleDigest(prev: { inputs: DigestInput[]; answer: DigestAnswer }, now: DigestInput[]): DigestStale {
  const before = new Map(prev.inputs.map((x) => [x.key, x.hash]));
  const after = new Map(now.map((x) => [x.key, x.hash]));
  const changed = now.filter((x) => before.has(x.key) && before.get(x.key) !== x.hash).map((x) => x.key);
  const added = now.filter((x) => !before.has(x.key)).map((x) => x.key);
  const removed = prev.inputs.filter((x) => !after.has(x.key)).map((x) => x.key);
  const dirty = new Set([...changed, ...removed]);
  const sections = [...new Set(prev.answer.rules.filter((r) => r.refs.some((k) => dirty.has(k))).map((r) => r.section.trim() || "기타"))];
  const omitted = prev.answer.omitted.filter((o) => changed.includes(o.key)).map((o) => o.key);
  return { changed, added, removed, sections, omitted };
}
