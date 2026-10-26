// 통째로 넣기(full) 대 선별(sel) 병행 비교 — 작성지원·질문 답 블라인드 쌍 심사의 순수 부분(select-judge.ts가 파일·DB·CLI를 맡음).
// 묶음 만들기·순서 섞기·키 풀기·답 검사·결정론 지표·요약 셈. 입출력 없음. 계획 §6.3.
import { z } from "zod";
import { seededShuffle } from "./judge-run-core.ts";

export const ARMS = ["full", "sel"] as const;
export type Arm = (typeof ARMS)[number];
export const FEATURES = ["writer", "chat"] as const;
export type Feature = (typeof FEATURES)[number];

/** 조각 원문 한 개당 묶음에 싣는 최대 글자 수(묶음에 그대로 적음) */
export const CHUNK_CHARS = 3000;

// ───────────── 순서·키 ─────────────

/** 쌍마다 무작위(씨앗 고정) 순서: A·B에 어느 방식이 오는지 */
export function pairOrder(feature: Feature, uid: string): { A: Arm; B: Arm } {
  const [A, B] = seededShuffle([...ARMS], `select-judge:${feature}:${uid}`);
  return { A, B };
}

export type JudgeKey = Record<string, { A: Arm; B: Arm }>;
export const pairId = (feature: Feature, uid: string) => `${feature}/${uid}`;

// ───────────── 답 모양(저장된 select-ab 결과) ─────────────

export interface AbRecord {
  cardId: string;
  uid: string;
  arm: Arm;
  feature: Feature;
  fellBack?: boolean;
  result: unknown;
}
export interface WriterCitation { key: string; title: string; quote: string; verified: boolean }
export interface WriterSuggestion {
  kind: string;
  targetPath: string | null;
  period: string | null;
  current: string | null;
  proposed: string[];
  reason: string;
  sourceKeys: string[];
  applicable: boolean;
}
export interface WriterResult {
  headline?: string;
  summary?: string;
  citations?: WriterCitation[];
  suggestions?: WriterSuggestion[];
  monthlyRow?: unknown;
  needInput?: unknown;
}
export interface ChatResult { question?: string; answer?: string }

// ───────────── 조각 key 찾기 ─────────────

const KEY_RE = /[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\/[A-Za-z0-9가-힣._-]+)+/g;
/** 글에서 조각 key처럼 생긴 낱말을 모음(실재 여부는 호출부가 DB로 확인). 「자료 확인 필요: <key>」 안의 key도 잡힘 */
export const keyCandidates = (text: string): string[] => [...new Set([...text.matchAll(KEY_RE)].map((m) => m[0].replace(/[.,;:]+$/, "")))];

/** 답이 인용·언급한 조각 key 후보(실재 확인 전) */
export function mentionedKeys(feature: Feature, result: unknown): string[] {
  if (feature === "chat") return keyCandidates(String((result as ChatResult).answer ?? ""));
  const r = result as WriterResult;
  const s = new Set<string>();
  for (const c of r.citations ?? []) s.add(c.key);
  for (const g of r.suggestions ?? []) for (const k of g.sourceKeys ?? []) s.add(k);
  for (const k of keyCandidates(`${r.headline ?? ""}\n${r.summary ?? ""}`)) s.add(k);
  return [...s];
}

// ───────────── 읽기 쉬운 글 ─────────────

const verifiedLabel = (v: boolean) => (v ? "원문 확인" : "원문과 다름");

/** 작성지원 결과 → 마크다운(방식을 드러내는 값은 넣지 않음) */
export function writerMarkdown(r: WriterResult): string {
  const out: string[] = [];
  out.push(`### 한 줄 요약\n${r.headline ?? ""}`);
  out.push(`### 설명\n${r.summary ?? ""}`);
  const sug = r.suggestions ?? [];
  out.push(`### 카드 반영 제안 (${sug.length}건)`);
  sug.forEach((s, i) => {
    const where = s.kind === "monthly" ? `월별 실적 ${s.period ?? "?"}` : (s.targetPath ?? "칸 지정 없음");
    out.push(
      [
        `#### 제안 ${i + 1} — ${where} (${s.kind}${s.applicable ? "" : ", 반영 불가"})`,
        `- 현재 글: ${s.current ? s.current.replace(/\n/g, " / ") : "(없음)"}`,
        `- 바꿀 글: ${s.proposed.join(" / ")}`,
        `- 이유: ${s.reason}`,
        `- 근거 조각: ${s.sourceKeys.length ? s.sourceKeys.join(", ") : "(없음)"}`,
      ].join("\n"),
    );
  });
  const cit = r.citations ?? [];
  out.push(`### 인용 (${cit.length}건)`);
  cit.forEach((c, i) => out.push(`${i + 1}. [${c.key}] ${c.title}\n   인용: 「${c.quote}」\n   인용 대조(코드 계산): ${verifiedLabel(c.verified)}`));
  if (r.needInput) out.push(`### 추가로 필요한 자료\n${typeof r.needInput === "string" ? r.needInput : JSON.stringify(r.needInput)}`);
  return out.join("\n\n");
}

export const answerMarkdown = (feature: Feature, result: unknown): string => (feature === "chat" ? String((result as ChatResult).answer ?? "") : writerMarkdown(result as WriterResult));

// ───────────── 심사 묶음 ─────────────

export interface ChunkText { key: string; title: string; text: string }

/** 조각 원문 블록(길면 앞 CHUNK_CHARS자) */
export function chunkBlock(c: ChunkText): string {
  const cut = c.text.length > CHUNK_CHARS;
  return `#### [${c.key}] ${c.title}${cut ? ` (앞 ${CHUNK_CHARS}자만 실음 — 원문 ${c.text.length}자)` : ""}\n${cut ? c.text.slice(0, CHUNK_CHARS) : c.text}`;
}

export interface PacketInput {
  feature: Feature;
  cardId: string;
  cardText: string;
  question?: string;
  answerA: string;
  answerB: string;
  chunks: ChunkText[];
}

/** 심사 요청 글. 방식(arm)·요청 크기·토큰은 넣지 않음 */
export function buildPacket(p: PacketInput): string {
  const req =
    p.feature === "chat"
      ? `질문: ${p.question ?? ""}`
      : "요청: 작성지원 「개선 제안」 — 카드의 보완점과 반영 제안을 낸다.";
  return [
    `# 심사 묶음 — 카드 ${p.cardId} · ${p.feature === "chat" ? "질문" : "작성지원"}`,
    req,
    `## 1. 카드 원장 글 (경로 | 글)\n${p.cardText}`,
    `## 2. 답 A\n${p.answerA}`,
    `## 3. 답 B\n${p.answerB}`,
    `## 4. 두 답이 인용·언급한 조각 원문 (${p.chunks.length}건, 조각당 앞 ${CHUNK_CHARS}자까지만 실음)\n${p.chunks.length ? p.chunks.map(chunkBlock).join("\n\n") : "(없음)"}`,
    "=====\n위 묶음과 대조해 답 A·B를 루브릭의 답 형식(JSON 하나)으로 심사하세요.",
  ].join("\n\n");
}

// ───────────── 블라인드 누출(선별 방식에만 나오는 문구) ─────────────

const BLIND_RE = /자료 확인 필요|고르지 않은 조각|선별/;
export const blindBreaks = (text: string): boolean => BLIND_RE.test(text);

// ───────────── 심사 답 ─────────────

const Score = z.number().int().min(1).max(5);
const Axis = z.object({ A: Score, B: Score, note: z.string() });
const Count = z.number().int().min(0);
const Errors = z.object({ cardDenied: Count, overwrite: Count, fabricated: Count, factError: Count });
export const JudgeSchema = z.object({
  axes: z.object({ 근거: Axis, 특화: Axis, 유용: Axis, 누락오류: Axis }),
  errors: z.object({ A: Errors, B: Errors }),
  notes: z.array(z.string()),
  winner: z.enum(["A", "B", "비슷"]),
  confidence: z.enum(["낮음", "중간", "높음"]),
  reason: z.string(),
});
export type JudgeAnswer = z.infer<typeof JudgeSchema>;
export const judgeJsonSchema = (): object => z.toJSONSchema(JudgeSchema, { target: "draft-7" });

export function checkJudge(raw: unknown): { ok: true; value: JudgeAnswer } | { ok: false; errors: string[] } {
  const p = JudgeSchema.safeParse(raw);
  return p.success ? { ok: true, value: p.data } : { ok: false, errors: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 8) };
}

export const AXIS_NAMES = ["근거", "특화", "유용", "누락오류"] as const;
export type Winner = Arm | "비슷";

/** A/B 표기 → 방식으로 풀기 */
export function resolveJudge(a: JudgeAnswer, key: { A: Arm; B: Arm }) {
  const side = (arm: Arm): "A" | "B" => (key.A === arm ? "A" : "B");
  const per = (arm: Arm) => ({
    scores: Object.fromEntries(AXIS_NAMES.map((n) => [n, a.axes[n][side(arm)]])) as Record<(typeof AXIS_NAMES)[number], number>,
    errors: a.errors[side(arm)],
  });
  const winner: Winner = a.winner === "비슷" ? "비슷" : key[a.winner];
  return { winner, confidence: a.confidence, full: per("full"), sel: per("sel") };
}
export type Resolved = ReturnType<typeof resolveJudge>;

// ───────────── 결정론 지표 ─────────────

export interface WriterMetrics { suggestions: number; applicable: number; citations: number; verified: number; notVerified: number; keys: number }
export interface ChatMetrics { chars: number; keys: number; needMaterial: number }

export function writerMetrics(r: WriterResult, keys: string[]): WriterMetrics {
  const sug = r.suggestions ?? [];
  const cit = r.citations ?? [];
  return { suggestions: sug.length, applicable: sug.filter((s) => s.applicable).length, citations: cit.length, verified: cit.filter((c) => c.verified).length, notVerified: cit.filter((c) => !c.verified).length, keys: keys.length };
}
export function chatMetrics(r: ChatResult, keys: string[]): ChatMetrics {
  const t = String(r.answer ?? "");
  return { chars: t.length, keys: keys.length, needMaterial: (t.match(/자료 확인 필요/g) ?? []).length };
}

// ───────────── 요약 ─────────────

export interface PairOutcome {
  feature: Feature;
  uid: string;
  resolved?: Resolved; // 심사 전(--dry)·실패면 없음
  metrics: { full: WriterMetrics | ChatMetrics; sel: WriterMetrics | ChatMetrics };
  blindBreak: Arm[]; // 블라인드를 깰 문구가 든 답의 방식
}

const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);
const ERR_NAMES = ["cardDenied", "overwrite", "fabricated", "factError"] as const;

export function summarize(pairs: PairOutcome[]) {
  const out: Record<string, unknown> = {};
  for (const f of FEATURES) {
    const ps = pairs.filter((p) => p.feature === f);
    const judged = ps.filter((p) => p.resolved);
    const wins = (w: Winner) => {
      const m = judged.filter((p) => p.resolved!.winner === w);
      return { total: m.length, 높음: m.filter((p) => p.resolved!.confidence === "높음").length, 중간: m.filter((p) => p.resolved!.confidence === "중간").length, 낮음: m.filter((p) => p.resolved!.confidence === "낮음").length };
    };
    const axes = Object.fromEntries(AXIS_NAMES.map((n) => [n, { full: mean(judged.map((p) => p.resolved!.full.scores[n])), sel: mean(judged.map((p) => p.resolved!.sel.scores[n])) }]));
    const errors = Object.fromEntries(ERR_NAMES.map((n) => [n, { full: judged.reduce((s, p) => s + p.resolved!.full.errors[n], 0), sel: judged.reduce((s, p) => s + p.resolved!.sel.errors[n], 0) }]));
    const numKeys = (arm: Arm): Record<string, number> => {
      const ms = ps.map((p) => p.metrics[arm] as unknown as Record<string, number>);
      const names = [...new Set(ms.flatMap((m) => Object.keys(m)))];
      return Object.fromEntries(names.map((k) => [k, ms.reduce((s, m) => s + (m[k] ?? 0), 0)]));
    };
    out[f] = {
      pairs: ps.length,
      judged: judged.length,
      verdict: { full: wins("full"), sel: wins("sel"), 비슷: wins("비슷") },
      // 계획 §6.3 첫째 기준: 선별 승 + 비슷 >= 통째로 넣기 승
      selNotWorse: judged.length ? wins("sel").total + wins("비슷").total >= wins("full").total : null,
      axes,
      errors,
      metricsSum: { full: numKeys("full"), sel: numKeys("sel") },
      blindBreak: { full: ps.filter((p) => p.blindBreak.includes("full")).length, sel: ps.filter((p) => p.blindBreak.includes("sel")).length },
    };
  }
  return out;
}

/** summary 표(마크다운) */
export function summaryTable(summary: ReturnType<typeof summarize>): string {
  const lines: string[] = [];
  for (const f of FEATURES) {
    const s = summary[f] as { pairs: number; judged: number; verdict: Record<string, { total: number; 높음: number; 중간: number; 낮음: number }>; axes: Record<string, { full: number | null; sel: number | null }>; errors: Record<string, { full: number; sel: number }>; blindBreak: { full: number; sel: number } };
    lines.push(`## ${f} — 쌍 ${s.pairs}, 심사 ${s.judged}`, "| 결과 | 건 | 높음 | 중간 | 낮음 |", "|---|---:|---:|---:|---:|");
    for (const [k, v] of Object.entries(s.verdict)) lines.push(`| ${k === "비슷" ? "비슷" : `${k} 승`} | ${v.total} | ${v.높음} | ${v.중간} | ${v.낮음} |`);
    lines.push("", "| 축 | full | sel |", "|---|---:|---:|");
    for (const [k, v] of Object.entries(s.axes)) lines.push(`| ${k} | ${v.full ?? "—"} | ${v.sel ?? "—"} |`);
    lines.push("", "| 오류 건수 | full | sel |", "|---|---:|---:|");
    for (const [k, v] of Object.entries(s.errors)) lines.push(`| ${k === "cardDenied" ? "카드에 있는데 없다고 함" : k} | ${v.full} | ${v.sel} |`);
    lines.push("", `블라인드를 깰 문구가 든 답: full ${s.blindBreak.full}건, sel ${s.blindBreak.sel}건`, "");
  }
  return lines.join("\n");
}
