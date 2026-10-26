// 공통 규칙 문서 교차 검증의 순수 부분(scripts/eval/rules-check.ts) — 절 묶기·요청 글·답 검사·review.md. 입출력 없음.
import { z } from "zod";
import { type BundleChunk } from "../../lib/knowledge/bundle.ts";
import { type DigestAnswer, type RepairFindings, digestBlock } from "../../lib/knowledge/rules-digest.ts";

export const VERDICTS = ["맞음", "뜻이 다름", "과장·단정", "빠짐", "키 잘못"] as const;
export type Verdict = (typeof VERDICTS)[number];
/** 올리기를 막는 판정(뜻이 다름·키 잘못) */
export const BLOCKING: readonly Verdict[] = ["뜻이 다름", "키 잘못"];

export const RuleVerdictSchema = z.object({
  verdicts: z.array(z.object({ rule: z.number().int(), verdict: z.enum(VERDICTS), reason: z.string(), fix: z.string(), wrongKeys: z.array(z.string()) })),
});
export type RuleVerdicts = z.infer<typeof RuleVerdictSchema>;

export const DocCheckSchema = z.object({
  gaps: z.array(z.object({ keys: z.array(z.string()), what: z.string(), why: z.string(), suggestion: z.string(), severity: z.enum(["높음", "중간", "낮음"]) })),
});
export type DocCheck = z.infer<typeof DocCheckSchema>;

export const jsonSchemaOf = (s: z.ZodType): object => {
  const j = z.toJSONSchema(s, { target: "draft-7" }) as Record<string, unknown>;
  delete j.$schema;
  return j;
};

export interface Batch {
  /** 이어 하기 열쇠(절 이름 + 번호) */
  id: string;
  section: string;
  /** answer.rules 안 번호(0부터) */
  rules: number[];
}

/** 절마다 묶고, 한 번에 maxRules줄을 넘으면 나눔. 절 순서는 처음 나온 순서 */
export function batchesOf(answer: DigestAnswer, maxRules = 12): Batch[] {
  const by = new Map<string, number[]>();
  answer.rules.forEach((r, i) => {
    const s = r.section.trim() || "기타";
    if (!by.has(s)) by.set(s, []);
    by.get(s)!.push(i);
  });
  const out: Batch[] = [];
  for (const [section, idx] of by) {
    const n = Math.ceil(idx.length / maxRules);
    const size = Math.ceil(idx.length / n);
    for (let k = 0; k < n; k++) out.push({ id: n > 1 ? `${section}#${k + 1}` : section, section, rules: idx.slice(k * size, (k + 1) * size) });
  }
  return out;
}

/** 묶음의 refs 합집합(입력에 있는 key만, 입력 순서) */
export function batchSources(answer: DigestAnswer, batch: Batch, chunks: BundleChunk[]): BundleChunk[] {
  const want = new Set(batch.rules.flatMap((i) => answer.rules[i].refs));
  return chunks.filter((c) => want.has(c.chunk_key));
}

/** 규칙 번호는 문서 전체의 1부터 번호(review.md의 「규칙 줄」과 같음) */
export function batchRequest(answer: DigestAnswer, batch: Batch, chunks: BundleChunk[]): string {
  const lines = batch.rules.map((i) => `[${i + 1}] ${answer.rules[i].text.trim()}\n    refs: ${answer.rules[i].refs.join(", ")}`);
  return [
    `절: ${batch.section}`,
    `판정할 규칙 번호: ${batch.rules.map((i) => i + 1).join(", ")}`,
    "",
    "<rules>",
    ...lines,
    "</rules>",
    "",
    "아래는 이 규칙 줄들이 가리킨 원문 조각 전문입니다(표는 줄 글로 풀어 실음). 번호마다 판정하세요.",
    digestBlock(batchSources(answer, batch, chunks)),
  ].join("\n");
}

/** 답이 요청한 규칙 번호를 빠짐·중복·낯선 번호 없이 모두 판정했는지, wrongKeys가 입력에 있는 key인지 */
export function checkVerdicts(v: RuleVerdicts, batch: Batch, validKeys: Set<string>): string[] {
  const want = new Set(batch.rules.map((i) => i + 1));
  const got = v.verdicts.map((x) => x.rule);
  const errs: string[] = [];
  const dup = got.filter((x, i) => got.indexOf(x) !== i);
  if (dup.length) errs.push(`번호 중복: ${[...new Set(dup)].join(",")}`);
  const missing = [...want].filter((x) => !got.includes(x));
  if (missing.length) errs.push(`번호 빠짐: ${missing.join(",")}`);
  const extra = got.filter((x) => !want.has(x));
  if (extra.length) errs.push(`낯선 번호: ${[...new Set(extra)].join(",")}`);
  for (const x of v.verdicts) {
    const bad = x.wrongKeys.filter((k) => !validKeys.has(k));
    if (bad.length) errs.push(`규칙 ${x.rule}: 입력에 없는 wrongKeys ${bad.join(",")}`);
    if (x.verdict !== "맞음" && !x.reason.trim()) errs.push(`규칙 ${x.rule}: 사유가 비었습니다`);
  }
  return errs;
}

export function docRequest(mdText: string, chunks: BundleChunk[]): string {
  return ["다음은 규칙 문서 전문입니다.", "<rules_document>", mdText, "</rules_document>", "", "아래는 입력 기준류 조각 전문입니다. 「문서 단위 점검」을 하세요.", digestBlock(chunks)].join("\n");
}

export interface UnitResult {
  id: string;
  title: string;
  checkedAt: string;
  model: string;
  /** 규칙 문서를 만들 때와 지금 DB의 조각 글 해시가 다른 key */
  staleKeys: string[];
  batches: Record<string, { hash: string; rules: number[]; verdicts: RuleVerdicts["verdicts"]; ms: number }>;
  doc: { hash: string; gaps: DocCheck["gaps"]; ms: number } | null;
}

export interface Tally {
  total: number;
  counts: Record<Verdict, number>;
  gaps: number;
}

export function tallyOf(r: UnitResult): Tally {
  const counts = Object.fromEntries(VERDICTS.map((v) => [v, 0])) as Record<Verdict, number>;
  for (const b of Object.values(r.batches)) for (const v of b.verdicts) counts[v.verdict] += 1;
  return { total: VERDICTS.reduce((n, v) => n + counts[v], 0), counts, gaps: r.doc?.gaps.length ?? 0 };
}

/** 올리기를 막는 판정이 남았는가 */
export const blocked = (r: UnitResult) => BLOCKING.some((v) => tallyOf(r).counts[v] > 0);

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const cell = (s: string) => oneLine(s).replace(/\|/g, "\\|");

/** 사람용 review.md: 맞음이 아닌 것만 + 문서 단위 지적 + 단위별 건수 표 */
export function reviewMarkdown(results: Array<{ result: UnitResult; answer: DigestAnswer }>): string {
  const out = ["# 공통 규칙 문서 교차 검증 — 지적 목록", "", "맞음이 아닌 판정만 모았습니다. 규칙 줄 번호는 문서(`<id>.md`)에 나온 순서의 1부터 번호이고, 줄 끝 [ ]의 key가 원문 조각입니다."];
  for (const { result, answer } of results) {
    out.push("", `## ${result.id} — ${result.title}`);
    if (result.staleKeys.length) out.push("", `> 주의: 규칙 문서를 만든 뒤 원문 조각 ${result.staleKeys.length}개의 글이 바뀌었습니다(${result.staleKeys.join(", ")}) — 규칙 문서를 다시 만들어야 할 수 있습니다.`);
    const rows: string[] = [];
    for (const b of Object.values(result.batches))
      for (const v of b.verdicts) {
        if (v.verdict === "맞음") continue;
        const rule = answer.rules[v.rule - 1];
        rows.push(
          [
            `### 규칙 ${v.rule} — ${v.verdict}`,
            "",
            `- 절: ${rule?.section ?? "?"}`,
            `- 규칙 줄: ${oneLine(rule?.text ?? "")}`,
            `- 사유: ${oneLine(v.reason)}`,
            `- 제안: ${oneLine(v.fix) || "(없음)"}`,
            `- 원문 key: ${(rule?.refs ?? []).join(", ")}${v.wrongKeys.length ? ` → 맞는 key 후보: ${v.wrongKeys.join(", ")}` : ""}`,
          ].join("\n"),
        );
      }
    out.push("", rows.length ? rows.join("\n\n") : "(줄 단위 지적 없음)");
    if (result.doc) {
      out.push("", `### 문서 단위: 반영이 약한 중요 내용 ${result.doc.gaps.length}건`);
      for (const [i, g] of result.doc.gaps.entries()) out.push("", `${i + 1}. [${g.severity}] ${oneLine(g.what)}`, `   - 중요한 이유: ${oneLine(g.why)}`, `   - 제안: ${oneLine(g.suggestion)}`, `   - 원문 key: ${g.keys.join(", ")}`);
    }
  }
  out.push("", "## 단위별 건수", "", `| 단위 | 판정 줄 | ${VERDICTS.join(" | ")} | 문서 단위 지적 | 올리기 |`, `|---|---|${VERDICTS.map(() => "---").join("|")}|---|---|`);
  for (const { result } of results) {
    const t = tallyOf(result);
    out.push(`| ${cell(result.id)} | ${t.total} | ${VERDICTS.map((v) => t.counts[v]).join(" | ")} | ${t.gaps} | ${blocked(result) ? "막힘(뜻 다름·키 잘못 남음)" : "가능"} |`);
  }
  return `${out.join("\n")}\n`;
}

/** 올리지 않고 멈출 이유(빈 배열이면 올려도 됨): 검산 실패·교차 검증 미완료·뜻 다름/키 잘못 남음·원문이 바뀜 */
export function storeBlockers(digest: { check: { ok: boolean }; answer: DigestAnswer | null }, result: UnitResult | null): string[] {
  const out: string[] = [];
  if (!digest.answer) return ["규칙 문서 답이 없음"];
  if (!digest.check.ok) out.push("규칙 문서 검산(check.ok)이 실패");
  if (!result) return [...out, "교차 검증 결과가 없음(rules-check.ts를 먼저 실행)"];
  const judged = new Map<number, Verdict>();
  for (const b of Object.values(result.batches)) for (const v of b.verdicts) judged.set(v.rule, v.verdict);
  const missing = digest.answer.rules.map((_, i) => i + 1).filter((n) => !judged.has(n));
  if (missing.length) out.push(`교차 검증이 끝나지 않은 규칙 ${missing.length}줄(예: ${missing.slice(0, 5).join(",")})`);
  if (!result.doc) out.push("문서 단위 점검이 끝나지 않음");
  const t = tallyOf(result);
  for (const v of BLOCKING) if (t.counts[v]) out.push(`${v} ${t.counts[v]}건이 남음`);
  if (result.staleKeys.length) out.push(`규칙 문서를 만든 뒤 원문 조각 ${result.staleKeys.length}개가 바뀜(${result.staleKeys.slice(0, 3).join(", ")}…)`);
  return out;
}

/** 교차 검증 결과 → 고쳐 만들기 지적(맞음이 아닌 줄 + 문서 단위 지적) */
export function findingsOf(r: UnitResult): RepairFindings {
  const lines = Object.values(r.batches)
    .flatMap((b) => b.verdicts)
    .filter((v) => v.verdict !== "맞음")
    .map((v) => ({ rule: v.rule, verdict: v.verdict as string, reason: oneLine(v.reason), fix: oneLine(v.fix), wrongKeys: v.wrongKeys }))
    .sort((a, b) => a.rule - b.rule);
  return { lines, docGaps: (r.doc?.gaps ?? []).map((g) => ({ ...g })) };
}
