// 경평 초안 모델 비교 — 교차 심사 실행기(judge-run.ts)의 순수 부분: 전역 블라인드 번호·섞기·누출 검사·답 검사·합치기.
// 입출력 없음. 루브릭의 답 형식은 docs/analysis/eval/2026-10-21-gpt/judge-rubric.md.
import { z } from "zod";

export const AXES = ["근거", "논점", "인과", "성과", "차별성", "시각", "문체"] as const;

/** 카드 id → 파일 이름 조각(`/` → `_`, drafts 파일 이름 규칙과 같음) */
export const cardTag = (card: string): string => card.replace(/\//g, "_");

// ───────────── 씨앗 고정 섞기 ─────────────

function hash32(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.codePointAt(0)!, 16777619) >>> 0;
  return h;
}

/** 같은 씨앗이면 같은 순서(mulberry32 + Fisher-Yates). 원본은 바꾸지 않음 */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const a = [...items];
  let t = hash32(seed);
  const rnd = () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 카드마다 초안 이름을 섞어 D01부터 전역으로 번호를 붙임(카드 순서대로 이어서). 입력 순서와 무관하게 같은 결과 */
export function assignBlindKeys(cards: { card: string; names: string[] }[]): Record<string, string> {
  const key: Record<string, string> = {};
  let n = 0;
  for (const c of cards) {
    for (const name of seededShuffle([...c.names].sort(), `pack:${c.card}`)) {
      n += 1;
      key[`D${String(n).padStart(2, "0")}`] = name;
    }
  }
  return key;
}

/** 심사자마다 다른 제시 순서(심사자·카드로 씨앗 고정) */
export const judgeOrder = (ids: string[], judge: string, card: string): string[] => seededShuffle([...ids].sort(), `order:${judge}:${card}`);

// ───────────── 정체 누출 검사 ─────────────

const LEAK_RE = /(?<![A-Za-z])(claude code|claude|sonnet|opus|gpt|sol|luna|codex)(?![A-Za-z])/gi;

/** 심사 묶음 글에서 모델 정체 낱말을 찾음. allow = 초안 본문에 원래 있는 낱말(대소문자 무시) */
export function leakHits(text: string, allow: string[] = []): string[] {
  const ok = new Set(allow.map((w) => w.toLowerCase()));
  return [...new Set([...text.matchAll(LEAK_RE)].map((m) => m[0]).filter((w) => !ok.has(w.toLowerCase())))];
}

// ───────────── 답 형식 ─────────────

const ScoreInt = z.number().int().min(1).max(5);
export const JudgeAnswerSchema = z.object({
  judge: z.string(),
  card: z.string(),
  drafts: z.array(
    z.object({
      id: z.string(),
      scores: z.object({ 근거: ScoreInt, 논점: ScoreInt, 인과: ScoreInt, 성과: ScoreInt, 차별성: ScoreInt, 시각: ScoreInt, 문체: ScoreInt }),
      overall: z.number().min(0).max(10),
      best: z.string(),
      flaw: z.string(),
      fix: z.string(),
      fabrications: z.array(z.string()),
    }),
  ),
  ranking: z.array(z.string()),
  common_flaws: z.array(z.object({ flaw: z.string(), drafts: z.array(z.string()), cause: z.string() })),
  groups: z.array(z.object({ drafts: z.array(z.string()), trait: z.string() })),
});
export type JudgeAnswer = z.infer<typeof JudgeAnswerSchema>;

/** CLI에 보내는 JSON 스키마 */
export const judgeJsonSchema = (): object => z.toJSONSchema(JudgeAnswerSchema, { target: "draft-7" });

/** 답 검사: 스키마 + 그 카드의 초안이 빠짐·중복·낯선 번호 없이 모두 + ranking도 전부 */
export function checkAnswer(raw: unknown, ids: string[]): { ok: true; value: JudgeAnswer } | { ok: false; errors: string[] } {
  const p = JudgeAnswerSchema.safeParse(raw);
  if (!p.success) return { ok: false, errors: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 8) };
  const errors: string[] = [];
  const same = (label: string, got: string[]) => {
    const dup = got.filter((x, i) => got.indexOf(x) !== i);
    const missing = ids.filter((x) => !got.includes(x));
    const extra = got.filter((x) => !ids.includes(x));
    if (dup.length) errors.push(`${label} 중복: ${[...new Set(dup)].join(",")}`);
    if (missing.length) errors.push(`${label} 빠짐: ${missing.join(",")}`);
    if (extra.length) errors.push(`${label} 낯선 번호: ${[...new Set(extra)].join(",")}`);
  };
  same("drafts", p.data.drafts.map((d) => d.id));
  same("ranking", p.data.ranking);
  return errors.length ? { ok: false, errors } : { ok: true, value: p.data };
}

// ───────────── 합치기(비교 보고서 형식) ─────────────

export interface MergedJudge {
  judge: string;
  drafts: (JudgeAnswer["drafts"][number] & { card: string })[];
  ranking: string[];
  rankingByCard: Record<string, string[]>;
  common_flaws: (JudgeAnswer["common_flaws"][number] & { card: string })[];
  groups: (JudgeAnswer["groups"][number] & { card: string })[];
}

/** 카드별 답 → 심사자 한 명의 비교 보고서 입력. 전체 ranking = 종합 높은 순(같으면 카드 안 순위, 그다음 번호) */
export function mergeJudge(judge: string, answers: { card: string; answer: JudgeAnswer }[]): MergedJudge {
  const drafts = answers.flatMap((a) => a.answer.drafts.map((d) => ({ ...d, card: a.card })));
  const pos = new Map(answers.flatMap((a) => a.answer.ranking.map((id, i) => [id, i] as const)));
  const ranking = [...drafts]
    .sort((x, y) => y.overall - x.overall || (pos.get(x.id) ?? 0) - (pos.get(y.id) ?? 0) || x.id.localeCompare(y.id))
    .map((d) => d.id);
  return {
    judge,
    drafts,
    ranking,
    rankingByCard: Object.fromEntries(answers.map((a) => [a.card, a.answer.ranking])),
    common_flaws: answers.flatMap((a) => a.answer.common_flaws.map((f) => ({ ...f, card: a.card }))),
    groups: answers.flatMap((a) => a.answer.groups.map((g) => ({ ...g, card: a.card }))),
  };
}
