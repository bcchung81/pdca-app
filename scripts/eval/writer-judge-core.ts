// AI 작성지원 결과 단건 채점(writer-judge.ts)의 순수 부분 — 묶음 만들기·답 검사·결정론 지표·요약 셈. 입출력 없음.
// 조각 원문 블록·언급 key 찾기·결정론 지표는 select-judge-core.ts의 것을 그대로 씀.
import { z } from "zod";
import {
  CHUNK_CHARS, type ChunkText, type WriterMetrics, type WriterResult, chunkBlock, mentionedKeys, writerMarkdown, writerMetrics,
} from "./select-judge-core.ts";

export { CHUNK_CHARS, type ChunkText, mentionedKeys, writerMetrics };

/** 카드 전용 자료 하나를 묶음에 싣는 최대 글자 수 */
export const MATERIAL_CHARS = 30_000;

export const MODE_NAMES = ["improve", "discover", "reflect", "followup"] as const;
export type ModeName = (typeof MODE_NAMES)[number];

// ───────────── writer-run.ts 산출 기록 ─────────────

export interface RunRecord {
  cardId: string;
  uid: string;
  unit?: string;
  mode: ModeName;
  label: string;
  periodLabel: string;
  model?: string;
  sec?: number;
  sources?: number;
  knowledge?: string;
  materials?: { used: string[]; skipped: string[] };
  /** 건너뜀 이유(AI를 안 불렀으면 있음) */
  skipped?: string;
  /** AI 없이 코드가 만든 결과(보완 점검 미흡 0건) */
  codeResult?: boolean;
  followupBasis?: FollowupBasisLike | null;
  result?: ResultLike;
}

export interface FollowupBasisLike {
  period: string;
  statusLabel: string;
  focus: boolean;
  rows: { id: string; label: string; star: boolean; requested: string; cardThen: string; question: string; evidence: string[] }[];
}
interface FollowupItemLike { id: string; label: string; star: boolean; judgment: string; cardQuote: string; cardQuoteOk: boolean | null; inspectionQuote: string; inspectionQuoteOk: boolean | null; remaining: string; missing: boolean }
export type ResultLike = Omit<WriterResult, "monthlyRow"> & { monthlyRow?: Record<string, string> | null; needInput?: string | null; followup?: { items: FollowupItemLike[]; counts?: Record<string, number> } | null };

/** 심사 대상 가름: AI를 부른 기록만. 아니면 이유 */
export function judgeable(r: RunRecord): { ok: true } | { ok: false; reason: string } {
  if (r.skipped) return { ok: false, reason: `건너뜀 — ${r.skipped}` };
  if (r.codeResult) return { ok: false, reason: "코드 결과(AI 안 부름)" };
  if (!r.result) return { ok: false, reason: "결과 없음" };
  return { ok: true };
}

// ───────────── 읽기 쉬운 글 ─────────────

const q = (b: boolean | null) => (b === null ? "인용 없음" : b ? "원문 확인" : "원문과 다름");

/** 답 → 마크다운(카드 반영 제안은 칸 경로·현재 글·바꿀 글, 실적 반영의 월별 행, 보완 점검 행 포함). 방식·모델 단서는 넣지 않음 */
export function writerAnswerMarkdown(r: ResultLike): string {
  const out: string[] = [writerMarkdown(r as WriterResult)];
  if (r.monthlyRow) {
    const m = r.monthlyRow;
    out.push(`### 월별 실적 행\n- 월: ${m.month}\n- 추진실적: ${m.activity}\n- 정량성과: ${m.quantitative}\n- 정성성과: ${m.qualitative}\n- 진도율: ${m.progress}\n- 리스크: ${m.risk}`);
  }
  const f = r.followup;
  if (f?.items?.length) {
    out.push(
      `### 보완 점검 (${f.items.length}행)`,
      ...f.items.map(
        (it) =>
          `#### ${it.id} — ${it.star ? "★" : ""}${it.label} → 판단: ${it.judgment}${it.missing ? " (답에서 빠져 코드가 채움)" : ""}\n- 카드 인용: 「${it.cardQuote}」 (인용 대조: ${q(it.cardQuoteOk)})\n- 점검표 인용: 「${it.inspectionQuote}」 (인용 대조: ${q(it.inspectionQuoteOk)})\n- 남은 할 일: ${it.remaining || "(없음)"}`,
      ),
    );
  }
  return out.join("\n\n");
}

// ───────────── 심사 묶음 ─────────────

export interface MaterialText { key: string; name: string; text: string }
export interface PacketInput {
  cardId: string;
  mode: ModeName;
  modeLabel: string;
  modeHint: string;
  periodLabel: string;
  cardText: string;
  materials: MaterialText[];
  followupBasis?: FollowupBasisLike | null;
  answer: string;
  chunks: ChunkText[];
}

function materialBlock(m: MaterialText): string {
  const cut = m.text.length > MATERIAL_CHARS;
  return `#### [${m.key}] ${m.name}${cut ? ` (앞 ${MATERIAL_CHARS}자만 실음 — 원문 ${m.text.length}자)` : ""}\n${cut ? m.text.slice(0, MATERIAL_CHARS) : m.text}`;
}

function followupRowsBlock(b: FollowupBasisLike): string {
  const head = `${b.period} 점검(${b.statusLabel}) · 미흡 ${b.rows.length}건 · 집중보완: ${b.focus ? "예" : "아니오"}`;
  const rows = b.rows.map((r) => `- ${r.id} | ${r.star ? "★" : ""}${r.label}\n  - 요구받은 보완: ${r.requested}\n  - 점검 당시 카드: ${r.cardThen}\n  - 예상 질의: ${r.question}\n  - 점검표 근거: ${r.evidence.join(" / ")}`);
  return [head, ...rows].join("\n");
}

/** 심사 요청 글. 라벨·모델·토큰 단서는 넣지 않음 */
export function buildPacket(p: PacketInput): string {
  const parts = [
    `# 심사 묶음 — 카드 ${p.cardId}`,
    `## 요청\n- 종류: ${p.modeLabel}\n- 기준 월: ${p.periodLabel}\n- 요청 내용: (없음 — 요청 종류대로)\n- 이 요청 종류의 안내: ${p.modeHint}`,
    `## 1. 카드 원장 글 (경로 | 글)\n${p.cardText}`,
    `## 2. 카드 전용 자료 (${p.materials.length}건, 길면 앞 ${MATERIAL_CHARS}자까지만 실음)\n${p.materials.length ? p.materials.map(materialBlock).join("\n\n") : "(없음)"}`,
  ];
  if (p.mode === "followup") parts.push(`## 3. 점검표 미흡 행 (보완 점검의 대조 기준)\n${p.followupBasis ? followupRowsBlock(p.followupBasis) : "(없음)"}`);
  parts.push(
    `## ${p.mode === "followup" ? 4 : 3}. 답 (채점 대상)\n${p.answer}`,
    `## ${p.mode === "followup" ? 5 : 4}. 답이 인용·언급한 공통 지식 조각 원문 (${p.chunks.length}건, 조각당 앞 ${CHUNK_CHARS}자까지만 실음)\n${p.chunks.length ? p.chunks.map(chunkBlock).join("\n\n") : "(없음)"}`,
    "=====\n위 묶음과 대조해 답을 루브릭의 답 형식(JSON 하나)으로 채점하세요.",
  );
  return parts.join("\n\n");
}

// ───────────── 심사 답 ─────────────

export const ERROR_TYPES = ["fabricated", "factError", "planAsResult", "overwrite", "missedInCard", "wrongField", "style", "other"] as const;
export type ErrorType = (typeof ERROR_TYPES)[number];
export const LAYERS = ["prompt", "code", "material"] as const;
export const AXIS_NAMES = ["grounding", "specific", "useful", "rules", "safety"] as const;
export type AxisName = (typeof AXIS_NAMES)[number];
export const AXIS_LABELS: Record<AxisName, string> = { grounding: "근거", specific: "카드 특화", useful: "유용", rules: "규칙 준수", safety: "반영 안전" };
export const ERROR_LABELS: Record<ErrorType, string> = {
  fabricated: "지어냄", factError: "사실 오류", planAsResult: "계획·제안을 실적처럼", overwrite: "부당한 덮어쓰기", missedInCard: "카드에 있는데 없다고 함", wrongField: "칸 잘못", style: "문체 위반", other: "기타",
};

const Score = z.number().int().min(1).max(5);
const Axis = z.object({ score: Score, note: z.string() });
export const JudgeSchema = z.object({
  axes: z.object({ grounding: Axis, specific: Axis, useful: Axis, rules: Axis, safety: z.object({ score: Score.nullable(), note: z.string() }) }),
  errors: z.array(z.object({ type: z.enum(ERROR_TYPES), where: z.string(), evidence: z.string(), note: z.string() })),
  weakness: z.string(),
  improvements: z.array(z.object({ layer: z.enum(LAYERS), change: z.string() })),
  summary: z.string(),
});
export type JudgeAnswer = z.infer<typeof JudgeSchema>;
export const judgeJsonSchema = (): object => z.toJSONSchema(JudgeSchema, { target: "draft-7" });

/** 답 검사: 모양(축 범위·필수 칸) + 오류 항목에 인용·위치가 있고 약점 한 줄이 비어 있지 않음 */
export function checkJudge(raw: unknown, opts: { hasSuggestions?: boolean } = {}): { ok: true; value: JudgeAnswer } | { ok: false; errors: string[] } {
  const p = JudgeSchema.safeParse(raw);
  if (!p.success) return { ok: false, errors: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 8) };
  const errors: string[] = [];
  p.data.errors.forEach((e, i) => {
    if (!e.evidence.trim()) errors.push(`errors.${i}.evidence: 답의 문장 인용이 비어 있음`);
    if (!e.where.trim()) errors.push(`errors.${i}.where: 위치가 비어 있음`);
  });
  if (!p.data.weakness.trim()) errors.push("weakness: 비어 있음");
  if (opts.hasSuggestions && p.data.axes.safety.score === null) errors.push("axes.safety.score: 카드 반영 제안이 있는데 null");
  return errors.length ? { ok: false, errors } : { ok: true, value: p.data };
}

// ───────────── 요약 ─────────────

export interface Outcome {
  label: string;
  mode: ModeName;
  uid: string;
  cardId: string;
  judge?: JudgeAnswer;
  metrics: WriterMetrics;
}
export interface Excluded { label: string; mode: ModeName; uid: string; cardId: string; reason: string }

const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);

export function summarize(outcomes: Outcome[]) {
  const groups = new Map<string, Outcome[]>();
  for (const o of outcomes) {
    const k = `${o.label}\u0000${o.mode}`;
    groups.set(k, [...(groups.get(k) ?? []), o]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, os]) => {
      const [label, mode] = k.split("\u0000") as [string, ModeName];
      const judged = os.filter((o) => o.judge);
      const axes = Object.fromEntries(AXIS_NAMES.map((n) => [n, mean(judged.map((o) => o.judge!.axes[n].score).filter((s): s is number => s !== null))])) as Record<AxisName, number | null>;
      const errors = Object.fromEntries(ERROR_TYPES.map((t) => [t, judged.reduce((s, o) => s + o.judge!.errors.filter((e) => e.type === t).length, 0)])) as Record<ErrorType, number>;
      const metrics = os.reduce<Record<string, number>>((acc, o) => {
        for (const [mk, v] of Object.entries(o.metrics)) acc[mk] = (acc[mk] ?? 0) + (v as number);
        return acc;
      }, {});
      return { label, mode, cards: os.length, judged: judged.length, axes, errors, metrics, weaknesses: judged.map((o) => ({ cardId: o.cardId, uid: o.uid, weakness: o.judge!.weakness })) };
    });
}
export type Summary = ReturnType<typeof summarize>;

const cell = (n: number | null) => (n === null ? "—" : String(n));

/** summary.md (마크다운) */
export function summaryMarkdown(summary: Summary, excluded: Excluded[]): string {
  const lines: string[] = [];
  lines.push("## 축 평균 (1~5점)", "", `| 라벨 | 요청 종류 | 건 | ${AXIS_NAMES.map((n) => AXIS_LABELS[n]).join(" | ")} |`, `|---|---|---:|${AXIS_NAMES.map(() => "---:").join("|")}|`);
  for (const s of summary) lines.push(`| ${s.label} | ${s.mode} | ${s.judged}/${s.cards} | ${AXIS_NAMES.map((n) => cell(s.axes[n])).join(" | ")} |`);
  lines.push("", "## 오류 종류별 건수", "", `| 라벨 | 요청 종류 | ${ERROR_TYPES.map((t) => ERROR_LABELS[t]).join(" | ")} |`, `|---|---|${ERROR_TYPES.map(() => "---:").join("|")}|`);
  for (const s of summary) lines.push(`| ${s.label} | ${s.mode} | ${ERROR_TYPES.map((t) => s.errors[t]).join(" | ")} |`);
  lines.push("", "## 결정론 지표 (합계)", "", "| 라벨 | 요청 종류 | 제안 수 | 반영 가능 | 인용 | 원문 확인 | 원문과 다름 | 언급 조각 |", "|---|---|---:|---:|---:|---:|---:|---:|");
  for (const s of summary) lines.push(`| ${s.label} | ${s.mode} | ${s.metrics.suggestions ?? 0} | ${s.metrics.applicable ?? 0} | ${s.metrics.citations ?? 0} | ${s.metrics.verified ?? 0} | ${s.metrics.notVerified ?? 0} | ${s.metrics.keys ?? 0} |`);
  lines.push("", "## 카드별 가장 큰 약점");
  for (const s of summary) {
    lines.push("", `### ${s.label} · ${s.mode}`);
    for (const w of s.weaknesses) lines.push(`- ${w.cardId}: ${w.weakness}`);
    if (!s.weaknesses.length) lines.push("- (심사한 건 없음)");
  }
  if (excluded.length) {
    lines.push("", "## 심사에서 뺀 건");
    for (const e of excluded) lines.push(`- ${e.label} · ${e.mode} · ${e.cardId}: ${e.reason}`);
  }
  return lines.join("\n") + "\n";
}
