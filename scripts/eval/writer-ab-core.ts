// 공통 지식 맥락 줄이기(2026-11-21, 후보 A·B·C·D) base·new 두 갈래 비교 — 순수 부분(writer-ab.ts 실행기·writer-ab-judge.ts 심사기가 파일·DB·CLI를 맡음).
// 기록 경로·쌍 만들기·순서 섞기·묶음 통계·답 글·심사 묶음·심사 답 검사·결정론 지표·요약. 입출력 없음.
// 통째로/선별 비교 도구(select-judge-core.ts)의 조각(인용 key 찾기·작성지원 답 글·조각 블록·심사 답 스키마)을 그대로 다시 씀.
import { join } from "node:path";
import { z } from "zod";
import { seededShuffle } from "./judge-run-core.ts";
import { type ChatResult, type ChunkText, JudgeSchema, type WriterResult, blindBreaks, chunkBlock, keyCandidates, mentionedKeys, writerMarkdown } from "./select-judge-core.ts";

export const AB_ARMS = ["base", "new"] as const;
export type AbArm = (typeof AB_ARMS)[number];
/** 작성지원 요청 종류(lib/ai/writer.ts WRITER_MODES와 같은 이름) */
export const WRITER_FEATURES = ["improve", "discover", "reflect", "followup"] as const;
export type WriterFeature = (typeof WRITER_FEATURES)[number];
export const AB_FEATURES = [...WRITER_FEATURES, "chat", "comment"] as const;
export type AbFeature = (typeof AB_FEATURES)[number];
export const isWriterFeature = (f: string): f is WriterFeature => (WRITER_FEATURES as readonly string[]).includes(f);

/** 보고서 이름 */
export const FEATURE_NAME: Record<AbFeature, string> = { improve: "개선 제안", discover: "실적 발굴", reflect: "실적 반영", followup: "보완 점검", chat: "질문", comment: "리뷰어 코멘트" };

/** 질문은 모든 카드에 같은 질문 하나(검증 공통 규칙 .team/VER.md 1절) */
export const QUESTION = "이 과제를 '26 평가에 맞춰 보완하려면 무엇부터 해야 하나요? 근거 자료를 들어 우선순위 3가지로 알려 주세요.";

/** 쉼표 목록 → 기능 목록(비면 전부, 모르는 이름은 오류) */
export function parseFeatures(raw: string | undefined): AbFeature[] {
  const xs = (raw ?? AB_FEATURES.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  const bad = xs.filter((x) => !(AB_FEATURES as readonly string[]).includes(x));
  if (bad.length) throw new Error(`모르는 기능: ${bad.join(", ")} (${AB_FEATURES.join("·")})`);
  return xs as AbFeature[];
}

/** --attach <카드 id>=<파일>[+<파일>…][,<카드 id>=…] → 카드 id → 파일 경로들(writer-run.ts와 같은 꼴). 모양이 틀리면 오류 */
export function parseAttachArg(raw: string | undefined): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const pair of (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const at = pair.indexOf("=");
    const files = at < 1 ? [] : pair.slice(at + 1).split("+").map((s) => s.trim()).filter(Boolean);
    if (!files.length) throw new Error(`--attach 형식: <카드 id>=<파일>[+<파일>] — ${pair}`);
    out.set(pair.slice(0, at), [...(out.get(pair.slice(0, at)) ?? []), ...files]);
  }
  return out;
}

// ───────────── 기록 경로 ─────────────

/** 기록: <out>/<arm>/<cards.uid>/<기능>.json(있으면 이어 하기에서 건너뜀) · 실패: <기능>.fail.json(이어 하기는 다시 부름) */
export const recordFile = (out: string, arm: string, uid: string, feature: AbFeature) => join(out, arm, uid, `${feature}.json`);
export const failFile = (out: string, arm: string, uid: string, feature: AbFeature) => join(out, arm, uid, `${feature}.fail.json`);

// ───────────── 기록 모양 ─────────────

export type Usage5 = { input: number; output: number; cacheRead: number; cacheWrite: number; cacheWrite1h: number };
/** CLI 입력 토큰 전체(캐시 없음 + 캐시 읽기 + 캐시 쓰기) — 캐시 온도와 상관없이 요청 크기를 견줄 때 */
export const inputTotal = (u: Usage5 | undefined) => (u ? u.input + u.cacheRead + u.cacheWrite : 0);

export interface LayerStat { id: string; refs: number; chars: number; bonus: number }
export interface KnowledgeStats {
  /** 실제로 선별 방식이 적용됐는지(kb.select) */
  method: "선별" | "통째로";
  /** 설정(KNOWLEDGE_SELECT·KNOWLEDGE_SELECT_TRACKS·요청 종류 범위의 select)상 선별 대상인지 */
  gate: boolean;
  /** 선별 대상인데 통째로 넣기로 감(고른 키 5건 미만·규칙 문서 없음 등) */
  fellBack: boolean;
  picked: number | null;
  unpicked: number | null;
  /** 인용·숫자 대조 원문 수(bundleRefs — 선별이면 select.all + 과제 목록 행) */
  refs: number;
  /** 규칙 문서 글자(선별 방식일 때만, 경영관리는 0) */
  digestChars: number | null;
  /** 층별 조각 수·원문 글자·그중 가점 실사 */
  layers: LayerStat[];
  /** 가점 실사 조각 수: 층 원문·고른 원문·제목 목록·인용 대조 원문 */
  bonus: { inLayers: number; picked: number; unpicked: number; refs: number };
  /** 이 카드의 컨설팅 의견 덩이 조각 수 */
  consult: number;
}

/** 요청 글 크기(서버 호출과 같은 조각 — 시스템·공통 지식 덩이·목록표·요청 글) */
export interface RequestSize { system: number; shared: number[]; list: number; prompt: number; total: number }

export interface AbRecord {
  arm: string;
  feature: AbFeature;
  cardId: string;
  uid: string;
  unit: string;
  periodLabel: string;
  code: { root: string; kind: AbArm };
  settings: { KNOWLEDGE_SELECT: string; KNOWLEDGE_SELECT_TRACKS: string; selectDir: string | null; CLAUDE_CLI_TIMEOUT_MS: string };
  /** 가점 실사 관련 판정(lib/knowledge/bonus-scope.ts bonusReasons — 비면 무관 카드) */
  bonusReasons: string[];
  /** 작성지원 요청 종류별 자료 범위(new만 — lib/knowledge/mode-profile.ts writerScope). base·질문·코멘트는 null(규칙 범위 전부) */
  /** extraUnits = 넣는 갈래 밖에서 더하는 조각 종류(실적 반영의 점검표 없을 때 자가진단 체크리스트 — FIX3, 그 전 기록에는 없음) */
  scope: { groups: string[]; dropUnits: string[]; extraUnits?: string[]; select: boolean; inspection: boolean } | null;
  knowledge: KnowledgeStats | null;
  /** 최종 점검표 — given: 요청에 무엇으로 줬는지(summary = 작성지원 「최근 점검표」 요약, followup = 보완 점검 미흡 행, chat = 질문 점검표 요약, null = 안 줌) */
  inspection: { exists: boolean; period: string | null; given: "summary" | "followup" | "chat" | null; chars: number };
  /** used = 요청에 넣은 카드 전용 자료 이름(DB 저장본 다음에 --attach 파일 순 — file:N 번호와 같은 순서), attached = --attach로 더한 이 컴퓨터의 파일 */
  materials: { used: string[]; skipped: string[]; attached?: Array<{ name: string; path: string; chars: number }> };
  request: RequestSize | null;
  skipped?: string;
  codeResult?: boolean;
  model?: string;
  sec?: number;
  usage?: Usage5;
  /** 검증 전 AI 답의 건수(버려진 제안·모르는 key 인용을 셈) */
  rawCounts?: { suggestions: number; citations: number };
  /** 리뷰어 코멘트 요청(자동으로 고른 칸 — 두 갈래 같음) */
  comments?: Array<{ id: string; kind: string; path: string; quote: string; text: string; label: string }>;
  question?: string;
  result?: unknown;
}

// ───────────── 묶음 통계(순수 — 실행기가 그 갈래 코드의 묶음을 넘김) ─────────────

interface RefLike { key: string; text: string }
export interface BundleLike {
  layers: Array<{ id: string; refs: RefLike[] }>;
  list: { taskRow: RefLike | null };
  consult?: RefLike[];
  select?: { picked: RefLike[]; unpicked: Array<{ key: string }>; all: RefLike[]; digest?: { track: string; unit: string } };
}

/** 묶음 → 통계. isBonus = 조각 key가 가점 실사인지(조각 행에 lib/knowledge/bonus-scope.ts isBonusSurvey를 적용한 판정), gate = 설정상 선별 대상 */
export function bundleStats(kb: BundleLike, isBonus: (key: string) => boolean, gate: boolean): KnowledgeStats {
  const count = (xs: Array<{ key: string }>) => xs.filter((r) => isBonus(r.key)).length;
  const refs = [...(kb.select ? kb.select.all : kb.layers.flatMap((l) => l.refs)), ...(kb.list.taskRow ? [kb.list.taskRow] : [])];
  return {
    method: kb.select ? "선별" : "통째로",
    gate,
    fellBack: gate && !kb.select,
    picked: kb.select ? kb.select.picked.length : null,
    unpicked: kb.select ? kb.select.unpicked.length : null,
    refs: refs.length,
    digestChars: kb.select ? (kb.select.digest?.track.length ?? 0) + (kb.select.digest?.unit.length ?? 0) : null,
    layers: kb.layers.map((l) => ({ id: l.id, refs: l.refs.length, chars: l.refs.reduce((n, r) => n + r.text.length, 0), bonus: count(l.refs) })),
    bonus: { inLayers: kb.layers.reduce((n, l) => n + count(l.refs), 0), picked: kb.select ? count(kb.select.picked) : 0, unpicked: kb.select ? count(kb.select.unpicked) : 0, refs: count(refs) },
    consult: kb.consult?.length ?? 0,
  };
}

/** 요청에 실제로 든 공통 지식 원문 중 가점 실사 수(층 원문 + 고른 원문) */
export const bonusInRequest = (k: KnowledgeStats) => k.bonus.inLayers + k.bonus.picked;

// ───────────── 쌍 ─────────────

/** 기록 한 쌍을 심사할 수 있는지 — 아니면 까닭 */
export function pairProblem(base: AbRecord | null, neu: AbRecord | null): string | null {
  if (!base && !neu) return "두 갈래 다 없음";
  if (!base || !neu) return `한쪽만 있음(${base ? "new" : "base"} 없음)`;
  if (base.skipped || neu.skipped) return `건너뜀(${base.skipped ?? neu.skipped})`;
  if (base.codeResult || neu.codeResult) return "코드 결과(AI 안 부름)";
  if (base.result === undefined || neu.result === undefined) return "답 없음";
  return null;
}

/** 쌍마다 씨앗 고정 무작위 순서: A·B에 어느 갈래가 오는지 */
export function abPairOrder(feature: AbFeature, uid: string): { A: AbArm; B: AbArm } {
  const [A, B] = seededShuffle([...AB_ARMS], `writer-ab:${feature}:${uid}`);
  return { A, B };
}
export const abPairId = (feature: AbFeature, uid: string) => `${feature}/${uid}`;

// ───────────── 답 글(갈래를 드러내는 값은 넣지 않음) ─────────────

interface FollowupItem { id: string; label: string; judgment: string; cardQuote?: string; inspectionQuote?: string; remaining?: string }
interface VerifiedCommentLike { id: string; outcome: string; reply: string; edits: Array<{ label: string; path: string; op: string; before: string | null; lines: string[] }>; dropped: number }

function followupMarkdown(f: { items?: FollowupItem[] } | null | undefined): string {
  if (!f?.items?.length) return "";
  const row = (it: FollowupItem) =>
    [`- [${it.id}] ${it.label} — ${it.judgment}`, it.cardQuote ? `카드 인용: 「${it.cardQuote}」` : "", it.inspectionQuote ? `점검표 인용: 「${it.inspectionQuote}」` : "", it.remaining ? `남은 할 일: ${it.remaining}` : ""].filter(Boolean).join(" / ");
  return [`### 보완 점검 행 (${f.items.length}건)`, ...f.items.map(row)].join("\n");
}

const OUTCOME: Record<string, string> = { edited: "고침", answered: "답함", declined: "하지 않음" };

/** 리뷰어 코멘트 결과(verifyComments) → 마크다운 */
export function commentMarkdown(rs: VerifiedCommentLike[]): string {
  return rs
    .map((c) =>
      [
        `### 코멘트 ${c.id} — ${OUTCOME[c.outcome] ?? c.outcome}${c.dropped ? ` (칸이 맞지 않아 버린 편집 ${c.dropped}건)` : ""}`,
        `답: ${c.reply}`,
        ...c.edits.map((e) => `- 편집 ${e.op} ${e.label} (${e.path})\n  전: ${e.before ?? "(없음)"}\n  후: ${e.lines.join(" / ") || "(지움)"}`),
      ].join("\n"),
    )
    .join("\n\n");
}

/** 기능별 답 → 마크다운 */
export function abAnswerMarkdown(feature: AbFeature, result: unknown): string {
  if (feature === "chat") return String((result as ChatResult).answer ?? "");
  if (feature === "comment") return commentMarkdown((result as { comments?: VerifiedCommentLike[] }).comments ?? []);
  const r = result as WriterResult & { followup?: { items?: FollowupItem[] } | null };
  return [writerMarkdown(r), followupMarkdown(r.followup)].filter(Boolean).join("\n\n");
}

// 붙여 쓴 key: 「qa25-mg-04/q09·q10」처럼 마지막 마디만 가운뎃점으로 이어 적은 것 → qa25-mg-04/q09·qa25-mg-04/q10(select-judge-core의 keyCandidates는 앞 key만 잡음 — 감싸서 더함)
const JOINED_RE = /([a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\/[A-Za-z0-9가-힣._-]+)+)((?:[·ㆍ][A-Za-z0-9가-힣._-]+)+)/g;
const trimKey = (k: string) => k.replace(/[.,;:]+$/, "");

// 조사가 붙은 key: 「q10과」·「q10의」처럼 영숫자 마디 뒤에 한글이 붙으면 뗀 것도 후보로(마디 전체가 한글인 「2-2/가」는 그대로)
const PARTICLE_RE = /^(.*\/)([A-Za-z0-9._-]*[A-Za-z0-9])([가-힣]+)$/;
const withParticleCut = (keys: Iterable<string>): string[] => {
  const out = new Set<string>();
  for (const k of keys) {
    out.add(k);
    const m = PARTICLE_RE.exec(k);
    if (m) out.add(m[1] + m[2]);
  }
  return [...out];
};

/** 글에서 붙여 쓴 key를 펼친 것(앞 key 포함, 조사 뗀 것도). 실재 여부는 호출부가 DB로 확인 */
export function joinedKeys(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(JOINED_RE)) {
    const first = trimKey(m[1]);
    const prefix = first.slice(0, first.lastIndexOf("/") + 1);
    out.add(first);
    for (const part of m[2].split(/[·ㆍ]/).map(trimKey).filter(Boolean)) out.add(prefix + part);
  }
  return withParticleCut(out);
}

/** keyCandidates + 붙여 쓴 key 펼치기 + 조사 뗀 key */
export const abKeyCandidates = (text: string): string[] => withParticleCut([...keyCandidates(text), ...joinedKeys(text)]);

/** 답이 인용·언급한 조각 key 후보(실재 확인 전) — 붙여 쓴 key는 펼침(작성지원은 인용·근거 key + 답 글 전체의 붙여 쓴 key) */
export function abMentionedKeys(feature: AbFeature, result: unknown): string[] {
  if (feature === "chat") return abKeyCandidates(String((result as ChatResult).answer ?? ""));
  if (feature === "comment") return abKeyCandidates(abAnswerMarkdown("comment", result));
  return withParticleCut([...mentionedKeys("writer", result), ...joinedKeys(abAnswerMarkdown(feature, result))]);
}

/** 블라인드를 깰 문구(선별 방식에만 나오는 말)가 답에 있는지 */
export const abBlindBreak = (feature: AbFeature, result: unknown) => blindBreaks(abAnswerMarkdown(feature, result));

// ───────────── 심사 묶음 ─────────────

/** 카드 전용 자료 한 개당 묶음에 싣는 최대 글자 수 */
export const FILE_CHARS = 9000;

/** 묶음의 조각 — where = 앱 요청 글이 조각마다 주는 위치(lib/knowledge/bundle.ts chunkRef의 where: context_prefix + 개정 표지 — 쪽수 등) */
export type AbChunkText = ChunkText & { where?: string };

/** 조각 블록(select-judge-core chunkBlock을 감쌈): 제목 줄 뒤에 「위치: …」 — 답이 적은 쪽수·절을 심사자가 대조할 수 있게 */
export function abChunkBlock(c: AbChunkText): string {
  const block = chunkBlock(c);
  if (!c.where?.trim()) return block;
  const nl = block.indexOf("\n");
  return `${block.slice(0, nl)}\n위치: ${c.where.trim()}${block.slice(nl)}`;
}

export interface AbPacketInput {
  feature: AbFeature;
  cardId: string;
  /** 요청 종류의 할 일(앱이 AI에 준 지시 그대로 — 작성지원은 request.md task.<요청 종류>, 질문은 질문, 코멘트는 코멘트 목록) */
  duty: string;
  cardText: string;
  answerA: string;
  answerB: string;
  chunks: AbChunkText[];
  files: Array<{ name: string; text: string }>;
  /** 이 카드의 외부 컨설팅 의견 원문(근거 아님 — 점검 관점, 있을 때만 6절) */
  consult?: AbChunkText[];
  /** 최근 점검표 요약(어느 한쪽이 받았을 때만 7절) */
  inspection?: string;
}

function fileBlock(f: { name: string; text: string }, i: number): string {
  const cut = f.text.length > FILE_CHARS;
  return `#### [file:${i + 1}] ${f.name}${cut ? ` (앞 ${FILE_CHARS}자만 실음 — 원문 ${f.text.length}자)` : ""}\n${cut ? f.text.slice(0, FILE_CHARS) : f.text}`;
}

/** 심사 요청 글. 갈래(arm)·요청 크기·토큰·선별 여부는 넣지 않음 */
export function buildAbPacket(p: AbPacketInput): string {
  return [
    `# 심사 묶음 — 카드 ${p.cardId} · ${FEATURE_NAME[p.feature]}`,
    `## 0. 요청 종류와 할 일(앱이 두 AI에 똑같이 준 지시)\n${p.duty}`,
    `## 1. 카드 원장 글 (경로 | 글)\n${p.cardText}`,
    `## 2. 답 A\n${p.answerA}`,
    `## 3. 답 B\n${p.answerB}`,
    `## 4. 두 답이 인용·언급한 조각 원문 (${p.chunks.length}건, 조각당 앞 3000자까지만 실음)\n${p.chunks.length ? p.chunks.map(abChunkBlock).join("\n\n") : "(없음)"}`,
    `## 5. 카드 전용 자료(첨부 — 두 AI가 똑같이 받은 것, 자료당 앞 ${FILE_CHARS}자까지만 실음)\n${p.files.length ? p.files.map(fileBlock).join("\n\n") : "(없음)"}`,
    ...(p.consult?.length ? [`## 6. 이 카드의 외부 컨설팅 의견(${p.consult.length}건) — 근거 아님 — 점검 관점(요청 종류에 따라 한쪽 AI만 받았을 수 있음, 조각당 앞 3000자까지만 실음)\n${p.consult.map(abChunkBlock).join("\n\n")}`] : []),
    ...(p.inspection ? [`## 7. 최근 점검표 요약(요청 종류에 따라 한쪽 AI만 받았을 수 있음 — 받았는지는 판단에 쓰지 않음)\n${p.inspection}`] : []),
    "=====\n위 묶음과 대조해 답 A·B를 루브릭의 답 형식(JSON 하나)으로 심사하세요.",
  ].join("\n\n");
}

// ───────────── 심사 답 ─────────────

/** select-judge의 4축 + 지침 준수(요청 종류의 할 일) */
export const AbJudgeSchema = JudgeSchema.extend({ axes: JudgeSchema.shape.axes.extend({ 지침: JudgeSchema.shape.axes.shape.근거 }) });
export type AbJudgeAnswer = z.infer<typeof AbJudgeSchema>;
export const abJudgeJsonSchema = (): object => z.toJSONSchema(AbJudgeSchema, { target: "draft-7" });

export function checkAbJudge(raw: unknown): { ok: true; value: AbJudgeAnswer } | { ok: false; errors: string[] } {
  const p = AbJudgeSchema.safeParse(raw);
  return p.success ? { ok: true, value: p.data } : { ok: false, errors: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 8) };
}

export const AB_AXES = ["근거", "특화", "유용", "누락오류", "지침"] as const;
export type AbAxis = (typeof AB_AXES)[number];
export type AbWinner = AbArm | "비슷";
const ERR_NAMES = ["cardDenied", "overwrite", "fabricated", "factError"] as const;
type Errs = Record<(typeof ERR_NAMES)[number], number>;

/** A/B 표기 → 갈래로 풀기 */
export function resolveAb(a: AbJudgeAnswer, key: { A: AbArm; B: AbArm }) {
  const side = (arm: AbArm): "A" | "B" => (key.A === arm ? "A" : "B");
  const per = (arm: AbArm) => ({ scores: Object.fromEntries(AB_AXES.map((n) => [n, a.axes[n][side(arm)]])) as Record<AbAxis, number>, errors: a.errors[side(arm)] as Errs });
  const winner: AbWinner = a.winner === "비슷" ? "비슷" : key[a.winner];
  return { winner, confidence: a.confidence, base: per("base"), new: per("new") };
}
export type AbResolved = ReturnType<typeof resolveAb>;

// ───────────── CLI 감싸기 로그(턴 수·API 호출별 사용량) ─────────────

/**
 * CLI 한 호출: turns = CLI 턴 수, calls = 안에서 부른 API 호출 수(추정), promptTokens = 첫 API 호출의 입력 토큰(= 이 요청 글 토큰, 추정 — 캐시 없음 + 읽기 + 쓰기).
 * CLI 결과의 usage는 모든 API 호출 합계이고 usage.iterations에는 마지막 호출만 있음(2026-11-21 확인). 그래서 합계 = 마지막이면 1회(합계 그대로),
 * 아니면 2회로 보고 첫 호출 = 합계 − 마지막(마지막 호출은 첫 호출 글 + 앞 답이라 첫 호출보다 작을 수 없음 — 어긋나면 3회 이상으로 보고 비움)
 */
export interface CliCallInfo { turns: number | null; calls: 1 | 2 | null; promptTokens: number | null }
type UsageLike = { input: number; output: number; cacheRead: number; cacheWrite: number };
/** 기록의 usage(합계)와 로그 줄을 맞추는 열쇠 */
export const usageKey = (u: UsageLike) => `${u.input}/${u.output}/${u.cacheRead}/${u.cacheWrite}`;

interface CliUsageJson { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; iterations?: CliUsageJson[] }

/** 감싸기 로그(「시각<탭>결과 JSON」 한 줄씩) → 사용량 열쇠별 호출 정보. 못 읽는 줄은 건너뜀 */
export function cliLogIndex(text: string): Map<string, CliCallInfo> {
  const out = new Map<string, CliCallInfo>();
  for (const line of text.split("\n")) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    let d: { num_turns?: unknown; usage?: CliUsageJson } | null = null;
    try {
      d = JSON.parse(line.slice(tab + 1));
    } catch {
      continue;
    }
    const u = d?.usage;
    if (!u) continue;
    const inOf = (x: CliUsageJson) => (x.input_tokens ?? 0) + (x.cache_read_input_tokens ?? 0) + (x.cache_creation_input_tokens ?? 0);
    const total = inOf(u);
    const lastIt = Array.isArray(u.iterations) ? u.iterations.at(-1) : undefined;
    const last = lastIt ? inOf(lastIt) : total;
    const firstOfTwo = total - last;
    const calls: CliCallInfo["calls"] = last === total ? 1 : firstOfTwo > 0 && firstOfTwo <= last ? 2 : null;
    out.set(usageKey({ input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 }), {
      turns: typeof d?.num_turns === "number" ? d.num_turns : null,
      calls,
      promptTokens: calls === 1 ? total : calls === 2 ? firstOfTwo : null,
    });
  }
  return out;
}

// ───────────── 결정론 지표(기록 하나) ─────────────

export interface AbMetrics {
  requestChars: number;
  inputTokens: number;
  outputTokens: number;
  sec: number;
  /** 작성지원: 인용(원문 확인/다름), AI가 냈지만 요청에 없는 key라 버려진 인용 */
  citations?: number;
  verified?: number;
  notVerified?: number;
  unknownCitations?: number;
  /** 작성지원: 카드 반영 제안 — 반영 가능/칸 경로가 없거나 글 칸이 아님, 빈 제안·8건 넘침으로 버려진 것 */
  suggestions?: number;
  applicable?: number;
  notApplicable?: number;
  droppedSuggestions?: number;
  /** 질문 */
  chars?: number;
  needMaterial?: number;
  /** 코멘트 */
  edited?: number;
  answered?: number;
  declined?: number;
  droppedEdits?: number;
  /** 언급한 조각 key 중 실제 있는 것(심사기가 DB로 확인한 뒤 넘김) */
  keys?: number;
  /** 감싸기 로그가 있고 셀 수 있을 때: 첫 API 호출의 입력 토큰(= 이 요청 글 토큰 — CLI가 구조화 출력을 고치느라 다시 부르면 전체 입력은 두 배 가까이 됨)·API 호출 수(추정) */
  promptTokens?: number;
  apiCalls?: number;
}

export function recordMetrics(r: AbRecord, keys?: number, cli?: CliCallInfo): AbMetrics {
  const base: AbMetrics = {
    requestChars: r.request?.total ?? 0,
    inputTokens: inputTotal(r.usage),
    outputTokens: r.usage?.output ?? 0,
    sec: r.sec ?? 0,
    ...(keys === undefined ? {} : { keys }),
    ...(cli && cli.promptTokens !== null ? { promptTokens: cli.promptTokens } : {}),
    ...(cli && cli.calls !== null ? { apiCalls: cli.calls } : {}),
  };
  if (r.feature === "chat") {
    const t = String((r.result as ChatResult | undefined)?.answer ?? "");
    return { ...base, chars: t.length, needMaterial: (t.match(/자료 확인 필요/g) ?? []).length };
  }
  if (r.feature === "comment") {
    const cs = (r.result as { comments?: VerifiedCommentLike[] } | undefined)?.comments ?? [];
    return { ...base, edited: cs.filter((c) => c.outcome === "edited").length, answered: cs.filter((c) => c.outcome === "answered").length, declined: cs.filter((c) => c.outcome === "declined").length, droppedEdits: cs.reduce((n, c) => n + c.dropped, 0) };
  }
  const w = (r.result ?? {}) as WriterResult;
  const cit = w.citations ?? [];
  const sug = w.suggestions ?? [];
  return {
    ...base,
    citations: cit.length,
    verified: cit.filter((c) => c.verified).length,
    notVerified: cit.filter((c) => !c.verified).length,
    unknownCitations: Math.max(0, (r.rawCounts?.citations ?? cit.length) - cit.length),
    suggestions: sug.length,
    applicable: sug.filter((s) => s.applicable).length,
    notApplicable: sug.filter((s) => !s.applicable).length,
    droppedSuggestions: Math.max(0, (r.rawCounts?.suggestions ?? sug.length) - sug.length),
  };
}

// ───────────── 요약 ─────────────

export interface AbPairOutcome {
  feature: AbFeature;
  uid: string;
  cardId: string;
  resolved?: AbResolved;
  metrics: { base: AbMetrics; new: AbMetrics };
  blindBreak: AbArm[];
}

/** 요약 묶음: 작성지원(요청 종류 넷)·질문·코멘트·전체 */
export const GROUPS: Record<"writer" | "chat" | "comment" | "all", readonly AbFeature[]> = { writer: WRITER_FEATURES, chat: ["chat"], comment: ["comment"], all: AB_FEATURES };
export type GroupId = keyof typeof GROUPS;

const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);
const sumOf = (ms: AbMetrics[], k: "inputTokens" | "requestChars") => ms.reduce((n, m) => n + m[k], 0);

function summarizeGroup(ps: AbPairOutcome[]) {
  const judged = ps.filter((p) => p.resolved);
  const count = (w: AbWinner) => judged.filter((p) => p.resolved!.winner === w).length;
  const verdict = { new: count("new"), base: count("base"), 비슷: count("비슷") };
  const errs = (arm: AbArm) => Object.fromEntries(ERR_NAMES.map((n) => [n, judged.reduce((s, p) => s + p.resolved![arm].errors[n], 0)])) as Errs;
  const errors = { base: errs("base"), new: errs("new") };
  const fabFact = { base: errors.base.fabricated + errors.base.factError, new: errors.new.fabricated + errors.new.factError };
  const tokens = { base: sumOf(ps.map((p) => p.metrics.base), "inputTokens"), new: sumOf(ps.map((p) => p.metrics.new), "inputTokens") };
  // 두 갈래 모두 감싸기 로그가 있으면 첫 API 호출 입력(요청 글 토큰)으로 견줌 — CLI 재호출(구조화 출력 고치기)이 섞이지 않게
  const logged = ps.length > 0 && ps.every((p) => p.metrics.base.promptTokens !== undefined && p.metrics.new.promptTokens !== undefined);
  const promptTokens = logged ? { base: ps.reduce((n, p) => n + p.metrics.base.promptTokens!, 0), new: ps.reduce((n, p) => n + p.metrics.new.promptTokens!, 0) } : null;
  const chars = { base: sumOf(ps.map((p) => p.metrics.base), "requestChars"), new: sumOf(ps.map((p) => p.metrics.new), "requestChars") };
  return {
    pairs: ps.length,
    judged: judged.length,
    verdict,
    axes: Object.fromEntries(AB_AXES.map((n) => [n, { base: mean(judged.map((p) => p.resolved!.base.scores[n])), new: mean(judged.map((p) => p.resolved!.new.scores[n])) }])) as Record<AbAxis, { base: number | null; new: number | null }>,
    errors,
    fabFact,
    tokens,
    promptTokens,
    tokenBasis: promptTokens ? "첫 API 호출 입력" : "CLI 입력 전체",
    chars,
    criteria: {
      // (2) new 패가 new 승 + 비슷보다 적음
      notWorse: judged.length ? verdict.base < verdict.new + verdict.비슷 : null,
      // (3) 심사자가 센 지어냄·사실 오류 합이 base보다 늘지 않음
      noMoreErrors: judged.length ? fabFact.new <= fabFact.base : null,
      // (4) 입력 토큰이 줄어듦(CLI 입력 전체 — 캐시 없음 + 읽기 + 쓰기)
      fewerTokens: ps.length ? (promptTokens ? promptTokens.new < promptTokens.base : tokens.new < tokens.base) : null,
    },
    blindBreak: { base: ps.filter((p) => p.blindBreak.includes("base")).length, new: ps.filter((p) => p.blindBreak.includes("new")).length },
  };
}
export type AbGroupSummary = ReturnType<typeof summarizeGroup>;

/** 통과 기준(.team/VER.md 2절)과 묶음별 셈. failures = 갈래별 끝내 실패한 기록 수(실패 기록만 있고 성공 기록이 없는 것) */
export function summarizeAb(pairs: AbPairOutcome[], failures: Record<AbArm, number>) {
  const groups = Object.fromEntries((Object.keys(GROUPS) as GroupId[]).map((g) => [g, summarizeGroup(pairs.filter((p) => GROUPS[g].includes(p.feature)))])) as Record<GroupId, AbGroupSummary>;
  return { failures, newNoFailures: failures.new === 0, groups };
}
export type AbSummary = ReturnType<typeof summarizeAb>;

const yn = (b: boolean | null) => (b === null ? "—" : b ? "통과" : "미달");
const num = (n: number) => n.toLocaleString("en-US");

/** 요약 표(마크다운) */
export function abSummaryTable(s: AbSummary): string {
  const lines = [`실패(끝내 기록 없음): base ${s.failures.base} · new ${s.failures.new} → (1) ${s.newNoFailures ? "통과" : "미달"}`, ""];
  lines.push("| 묶음 | 쌍 | 심사 | new 승 | base 승 | 비슷 | (2) 안 짐 | 지어냄+사실 오류 base→new | (3) | 요청 글(자) base→new | 입력 토큰 base→new(기준) | (4) |", "|---|---:|---:|---:|---:|---:|---|---|---|---|---|---|");
  for (const [g, v] of Object.entries(s.groups)) {
    if (!v.pairs) continue;
    const tk = v.promptTokens ?? v.tokens;
    lines.push(`| ${g} | ${v.pairs} | ${v.judged} | ${v.verdict.new} | ${v.verdict.base} | ${v.verdict.비슷} | ${yn(v.criteria.notWorse)} | ${v.fabFact.base}→${v.fabFact.new} | ${yn(v.criteria.noMoreErrors)} | ${num(v.chars.base)}→${num(v.chars.new)} | ${num(tk.base)}→${num(tk.new)}(${v.tokenBasis}) | ${yn(v.criteria.fewerTokens)} |`);
  }
  const all = s.groups.all;
  lines.push("", "| 축(전체 평균) | base | new |", "|---|---:|---:|");
  for (const n of AB_AXES) lines.push(`| ${n} | ${all.axes[n].base ?? "—"} | ${all.axes[n].new ?? "—"} |`);
  lines.push("", "| 오류 건수(전체) | base | new |", "|---|---:|---:|");
  for (const n of ERR_NAMES) lines.push(`| ${n === "cardDenied" ? "카드에 있는데 없다고 함" : n} | ${all.errors.base[n]} | ${all.errors.new[n]} |`);
  lines.push("", `블라인드를 깰 문구가 든 답: base ${all.blindBreak.base}건, new ${all.blindBreak.new}건`);
  return lines.join("\n");
}

// ───────────── 심사 묶음 0절·표(심사기가 씀) ─────────────

interface FollowupRowLike { id: string; label: string; requested?: string }

/** 요청 종류의 할 일(심사 묶음 0절) — task = 앱이 요청 글에 넣는 그 요청 종류의 할 일 절(request.md task.<요청 종류>, 작성지원만 — 두 갈래 같은 글) */
export function dutyText(rec: AbRecord, task: string | null): string {
  if (rec.feature === "chat") return `요청 종류: 질문 — 카드를 고치지 않고 질문에 답만 냄(마크다운).\n질문: 「${rec.question ?? QUESTION}」`;
  if (rec.feature === "comment")
    return [
      "요청 종류: 리뷰어 코멘트 — 코멘트마다 「수정」이면 지정한 칸을 고친 글을, 「질문」이면 답을 냄(지정 칸 밖은 고치지 않음).",
      ...(rec.comments ?? []).map((c) => `- ${c.id} ${c.kind === "edit" ? "수정" : "질문"} · ${c.label} (${c.path}) · 고른 글 「${c.quote}」 · 코멘트: ${c.text}`),
    ].join("\n");
  const head = `요청 종류: 작성지원 「${FEATURE_NAME[rec.feature]}」 — ${rec.feature === "reflect" ? "붙여 넣은 글 없이 카드 전용 자료(5절)만으로" : "요청 글 없음"}`;
  const items = rec.feature === "followup" ? ((rec.result as { followup?: { items?: FollowupRowLike[] } | null } | undefined)?.followup?.items ?? []) : [];
  const rows = items.length ? ["점검표 미흡 행(두 AI가 똑같이 받음):", ...items.map((r) => `- [${r.id}] ${r.label} — 요구한 보완: ${r.requested ?? ""}`)] : [];
  return [head, task ?? "", ...rows].filter(Boolean).join("\n");
}

export interface PairRow {
  feature: AbFeature;
  cardId: string;
  base: AbRecord | null;
  new: AbRecord | null;
  problem: string | null;
  resolved?: AbResolved;
  reason?: string;
}

function knowledgeStr(r: AbRecord): string {
  const k = r.knowledge;
  if (!k) return "—";
  return k.method + (k.picked !== null ? ` ${k.picked}건` : "") + (k.fellBack ? "(대상인데 통째로)" : "");
}
const scopeStr = (r: AbRecord) => (r.scope ? `${r.scope.groups.length}갈래${r.scope.dropUnits.length ? `−${r.scope.dropUnits.join(",")}` : ""}${r.scope.extraUnits?.length ? `+${r.scope.extraUnits.join(",")}` : ""}${r.scope.select ? "" : "·선별 안 씀"}` : "전부");
const verdictStr = (w: AbWinner | undefined, conf?: string) => (w ? `${w === "비슷" ? "비슷" : `${w} 승`}(${conf})` : "—");

/** 결정론 표(카드 × 기능 · base / new 두 줄). cliOf = 기록의 감싸기 로그 정보(있으면 토큰 칸에 첫 API 호출 입력·호출 수) */
export function pairTable(rows: PairRow[], cliOf: (r: AbRecord) => CliCallInfo | undefined = () => undefined): string {
  const out = [
    "| 카드 | 기능 | 갈래 | 실패·건너뜀 | 공통 지식 | 범위 | 점검표 | 가점 실사(요청 원문) | 요청 글(자) | CLI 입력 토큰 | 출력 | 초 | 인용 확인/다름/버림 | 제안 반영 가능/불가/버림 | 결론 |",
    "|---|---|---|---|---|---|---|---|---:|---:|---:|---:|---|---|---|",
  ];
  for (const p of rows) {
    for (const arm of AB_ARMS) {
      const r = p[arm];
      if (!r) {
        out.push(`| ${p.cardId} | ${FEATURE_NAME[p.feature]} | ${arm} | 기록 없음 | | | | | | | | | | | |`);
        continue;
      }
      const cli = r.usage ? cliOf(r) : undefined;
      const m = recordMetrics(r, undefined, cli);
      const status = r.skipped ? `건너뜀(${r.skipped})` : r.codeResult ? "코드 결과" : "";
      const writerish = isWriterFeature(p.feature);
      const cells = [
        p.cardId,
        FEATURE_NAME[p.feature],
        arm,
        status,
        knowledgeStr(r),
        scopeStr(r),
        r.inspection.given ?? (r.inspection.exists ? "있음·안 줌" : "없음"),
        r.knowledge ? String(bonusInRequest(r.knowledge)) : "—",
        r.request ? num(r.request.total) : "—",
        cli && cli.promptTokens !== null ? `${num(cli.promptTokens)}(전체 ${num(m.inputTokens)}·API ${cli.calls}회)` : `전체 ${num(m.inputTokens)}${cli ? "(API 3회 이상)" : ""}`,
        num(m.outputTokens),
        String(Math.round(m.sec)),
        writerish ? `${m.verified}/${m.notVerified}/${m.unknownCitations}` : p.feature === "comment" ? `편집 ${m.edited}·답 ${m.answered}·안 함 ${m.declined}` : `${m.chars}자`,
        writerish ? `${m.applicable}/${m.notApplicable}/${m.droppedSuggestions}` : p.feature === "comment" ? `버린 편집 ${m.droppedEdits}` : `자료 확인 필요 ${m.needMaterial}`,
        arm === "new" ? verdictStr(p.resolved?.winner, p.resolved?.confidence) : (p.problem ?? ""),
      ];
      out.push(`| ${cells.join(" | ")} |`);
    }
  }
  return out.join("\n");
}

/** 쌍 심사 표(카드 × 기능 · 결론 · 근거 한 줄) */
export function verdictTable(rows: PairRow[]): string {
  const out = ["| 카드 | 기능 | 결론 | 근거·지침 점수 base→new | 지어냄+사실 오류 base→new | 근거 한 줄 |", "|---|---|---|---|---|---|"];
  for (const p of rows) {
    if (!p.resolved) {
      out.push(`| ${p.cardId} | ${FEATURE_NAME[p.feature]} | ${p.problem ?? "심사 전"} | | | |`);
      continue;
    }
    const r = p.resolved;
    const ff = (arm: AbArm) => r[arm].errors.fabricated + r[arm].errors.factError;
    out.push(`| ${p.cardId} | ${FEATURE_NAME[p.feature]} | ${verdictStr(r.winner, r.confidence)} | ${r.base.scores.근거}→${r.new.scores.근거} · ${r.base.scores.지침}→${r.new.scores.지침} | ${ff("base")}→${ff("new")} | ${(p.reason ?? "").replace(/\s*\n\s*/g, " ").replace(/\|/g, "／")} |`);
  }
  return out.join("\n");
}

// ───────────── 여러 회차 합치기(writer-ab-rounds.ts) ─────────────

/** 한 회차의 쌍 결과(심사기 summary.json의 pairs)와 끝내 실패 수 */
export interface RoundPairs { round: string; pairs: AbPairOutcome[]; failures: Record<AbArm, number> }

/** 쌍(기능·카드)마다 회차별 결론과 셈 — 승률 = new 승 / 심사 수, 오류 평균 = 지어냄+사실 오류(심사자가 센 것)의 회차 평균 */
export interface PairAcrossRounds {
  feature: AbFeature;
  cardId: string;
  rounds: Array<{ round: string; winner: AbWinner | null; confidence: string | null; ff: { base: number; new: number } | null }>;
  judged: number;
  verdict: { new: number; base: number; 비슷: number };
  newWinRate: number | null;
  ffMean: { base: number | null; new: number | null };
  promptTokensMean: { base: number | null; new: number | null };
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);

/** 회차들을 합침: 쌍마다 셈 + 모든 회차의 쌍을 한데 모은 통과 기준 (1)~(4)(summarizeAb 그대로) */
export function combineRounds(rs: RoundPairs[]) {
  const failures: Record<AbArm, number> = { base: rs.reduce((n, r) => n + r.failures.base, 0), new: rs.reduce((n, r) => n + r.failures.new, 0) };
  const pooled = summarizeAb(rs.flatMap((r) => r.pairs), failures);
  const keys = [...new Set(rs.flatMap((r) => r.pairs.map((p) => `${p.feature}|${p.cardId}`)))].sort((a, b) => AB_FEATURES.indexOf(a.split("|")[0] as AbFeature) - AB_FEATURES.indexOf(b.split("|")[0] as AbFeature) || a.localeCompare(b));
  const pairs: PairAcrossRounds[] = keys.map((key) => {
    const [feature, cardId] = key.split("|") as [AbFeature, string];
    const hits = rs.flatMap((r) => r.pairs.filter((p) => p.feature === feature && p.cardId === cardId).map((p) => ({ round: r.round, p })));
    const rounds = hits.map(({ round, p }) => ({
      round,
      winner: p.resolved?.winner ?? null,
      confidence: p.resolved?.confidence ?? null,
      ff: p.resolved ? { base: p.resolved.base.errors.fabricated + p.resolved.base.errors.factError, new: p.resolved.new.errors.fabricated + p.resolved.new.errors.factError } : null,
    }));
    const judged = rounds.filter((x) => x.winner);
    const count = (w: AbWinner) => judged.filter((x) => x.winner === w).length;
    const pt = (arm: AbArm) => avg(hits.map(({ p }) => p.metrics[arm].promptTokens).filter((x): x is number => x !== undefined));
    return {
      feature,
      cardId,
      rounds,
      judged: judged.length,
      verdict: { new: count("new"), base: count("base"), 비슷: count("비슷") },
      newWinRate: judged.length ? Math.round((count("new") / judged.length) * 100) / 100 : null,
      ffMean: { base: avg(judged.map((x) => x.ff!.base)), new: avg(judged.map((x) => x.ff!.new)) },
      promptTokensMean: { base: pt("base"), new: pt("new") },
    };
  });
  return { failures, pooled, pairs };
}
export type RoundsSummary = ReturnType<typeof combineRounds>;

/** 쌍마다 회차 표 */
export function roundsTable(c: RoundsSummary): string {
  const rounds = [...new Set(c.pairs.flatMap((p) => p.rounds.map((r) => r.round)))].sort();
  const cell = (p: PairAcrossRounds, round: string) => {
    const r = p.rounds.find((x) => x.round === round);
    if (!r) return "—";
    if (!r.winner) return "심사 전";
    return `${r.winner === "비슷" ? "비슷" : r.winner}(${r.confidence}) ${r.ff!.base}→${r.ff!.new}`;
  };
  const out = [`| 기능 | 카드 | ${rounds.join(" | ")} | new 승·base 승·비슷 | new 승률 | 지어냄+사실 오류 평균 base→new | 첫 호출 입력 평균 base→new |`, `|---|---|${rounds.map(() => "---").join("|")}|---|---:|---|---|`];
  for (const p of c.pairs) {
    const tk = p.promptTokensMean.base !== null && p.promptTokensMean.new !== null ? `${num(Math.round(p.promptTokensMean.base))}→${num(Math.round(p.promptTokensMean.new))}` : "—";
    out.push(`| ${FEATURE_NAME[p.feature]} | ${p.cardId} | ${rounds.map((r) => cell(p, r)).join(" | ")} | ${p.verdict.new}·${p.verdict.base}·${p.verdict.비슷} | ${p.newWinRate ?? "—"} | ${p.ffMean.base ?? "—"}→${p.ffMean.new ?? "—"} | ${tk} |`);
  }
  return out.join("\n");
}
