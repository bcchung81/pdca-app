import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { AttachmentError } from "./material-text.ts";
import { BudgetError, checkBudget } from "./budget.ts";
import type { MaterialDoc } from "./material-text.ts";
import { userBlocks } from "./user-blocks.ts";
import { type BundleChunk, type KnowledgeBundle, listText, sharedTexts } from "../knowledge/bundle.ts";
import type { EditTarget } from "../cards/patch.ts";
import { CliFailedError, CliUnavailableError, runClaudeCli } from "./cli.ts";
import { isDegenerateChat, isDegenerateWriter, retryIfDegenerate } from "./degenerate.ts";
import { codexSpec, runCodexCli } from "./codex-cli.ts";
import { type CommentRequest, type CommentResult, commentPrompt } from "./comments.ts";
import { OUTLINE_SKELETON, parseRules, pickHeadings, pickRules, pickSections } from "../harness/rules.ts";
import type { LensRef } from "../reports/lens.ts";
import type { PriorPick } from "../reports/prior.ts";
import { assistPrompts, assistPromptsMg, chatPrompts, chatPromptsMg, commentPrompts, commentPromptsMg, describePrompts, inspectPrompts, inspectPromptsMg, matchPrompts, reportDraftPrompts, reportDraftPromptsMg, reportOutlinePrompts, reportOutlinePromptsMg, reportBlockPrompts, reportBlockPromptsMg, reportUnitPromptsMg } from "../prompts/sets.ts";
import { type PromptSet, fillFrom } from "../prompts/template.ts";
import { type YearActuals, yearActuals } from "../reports/actuals.ts";
import type { BlockAskOutput, BlockEditOutput, BlockShapesOutput, ResultEditOutput } from "../reports/block-edit.ts";
import { type Composition, type CompositionOutput, planBlockCap, planLimitIssues, planPrompt, withFixedStory } from "../reports/composition.ts";
import { type FrameInput, framePrompt } from "../reports/framework-pick.ts";
import type { Story } from "../reports/blocks.ts";
import { frameworkOf, shapeCode, shapeName } from "../reports/frameworks.ts";
import { type FitNeed, type FitReport, blockAreaMm, fitNeeded, fitReport } from "../reports/fit.ts";
import { REPORT_HARNESS, type ReportFile, type ReportPrompts, type SectionCheck, type SectionContext, type SectionOutput, type SiblingLayout, fitPrompt, hintSource, moduleGuide, sectionHints, sectionOutputSchema, sectionPrompt, withPlanStory } from "../reports/section.ts";
import { storyHints, storyHintsPrompt } from "../reports/story-hints.ts";
import { mgStoryHintsFor } from "../reports/story-hints-mg.ts";
import { outlineInspectionPrompt } from "../reports/inspection-input.ts";
import { type SplitSibling, splitHeadPrompt, splitSiblingsPrompt } from "../reports/split-axes.ts";
import type { FollowupBasis } from "./followup.ts";
import { type ChatRequest, type ChatResult, chatPrompt } from "./chat.ts";
import type { DescribeInput } from "./describe.ts";
import { type MatchResult, matchPrompt, matchShared } from "./match.ts";
import { apiErrorKind, apiErrorMessage, shouldRetryApi } from "./api-errors.ts";
import { canFixAgain, draftScore, fixDeadlineMs, shouldFix } from "./fix-policy.ts";
import { type AiFeature, type Effort, FEATURE_MAX_TOKENS, specForFeature } from "./models.ts";
import { isMgmtCard } from "../cards/mgmt-card.ts";
import { type LinkIndexRow, parseLinkIndex } from "../inspections/biz-links.ts";
import { type MgDraftContext, type MgDraftOutput, mgMaterialsPrompt, mgPlanPrompt, mgVolumePrompt } from "../reports/mg-draft.ts";
import type { UnitAiOutput } from "../reports/unit-parts-ai.ts";
import { MG_LIMITS, type MgOutlineOutput, type MgPartRedo, type MgSibling, mgClosePrompt, mgDiagramPrompt, mgPartPrompt, mgSiblingsPrompt } from "../reports/mg-outline.ts";
import type { DiagramHint } from "../reports/diagram-hints.ts";
import { DEFAULT_TRACK, MGMT_TRACK, type TrackSpec, trackSpecOfUnit } from "../tracks/index.ts";
import { type InspectContext, type InspectOutput, inspectSystemText, inspectionPrompt } from "./inspect.ts";
import { type InspectMgOutput, type MgmtInspectContext, inspectMgPrompt, inspectMgSystemText } from "./inspect-mg.ts";
import { type KnowledgeRef, type PromptFile, type WriterRequest, type WriterResult, userPrompt } from "./writer.ts";
import { type AiProvider, aiProviderFrom, apiKeysFrom, keyOrder } from "./provider.ts";
import type { LooseJson } from "../loose-json.ts";



/** AI를 어디로 부를지 — 판정 로직은 lib/ai/provider.ts(순수, server-only 없음 — 그쪽에서 테스트) */
export type { AiProvider };
export { aiProviderFrom };
export function aiProvider(): AiProvider {
  return aiProviderFrom(process.env);
}

export class AiUnavailableError extends Error {}

const cardGuides = new Map<string, { guideline: string; style: string }>();

/** 트랙의 담당자 작성지원 지침 사본(주요사업 09·경영관리 08) + 문체 기준 — 작성지원·질문·코멘트 처리 시스템 프롬프트의 {{guideline}}·{{style}} */
function cardGuideText(track: TrackSpec): { guideline: string; style: string } {
  let guide = cardGuides.get(track.assistGuide);
  if (!guide) {
    const root = process.cwd();
    guide = {
      guideline: readFileSync(join(root, "resources/harness/pdca", track.assistGuide), "utf8"),
      style: readFileSync(join(root, "resources/harness/report-harness/style-guide.md"), "utf8"),
    };
    cardGuides.set(track.assistGuide, guide);
  }
  return guide;
}

/** 과제원장 AI 시스템 프롬프트 = <기능>/system.md @system(앱 적응문)에 트랙의 작성지원 지침(주요사업 09)·문체 기준을 채운 것 — 트랙을 안 정하면 주요사업 */
const cardSystem = (p: PromptSet, track: TrackSpec) => fillFrom(p, "system", "system", cardGuideText(track));
export const writerSystem = (track: TrackSpec = DEFAULT_TRACK) => cardSystem(assistPrompts().prompts, track);
export const chatSystem = (track: TrackSpec = DEFAULT_TRACK) => cardSystem(chatPrompts().prompts, track);
export const commentSystem = (track: TrackSpec = DEFAULT_TRACK) => cardSystem(commentPrompts().prompts, track);
/** 경영관리 카드의 시스템 프롬프트(지침 08 + 경영관리 적응문) — 트랙 스펙은 호출부가 평가단위에서 정함 */
export const writerSystemMg = (track: TrackSpec) => cardSystem(assistPromptsMg().prompts, track);
export const chatSystemMg = (track: TrackSpec) => cardSystem(chatPromptsMg().prompts, track);
export const commentSystemMg = (track: TrackSpec) => cardSystem(commentPromptsMg().prompts, track);

/** 토큰 사용량. cacheWrite = 캐시 쓰기 전체(5분+1시간), cacheWrite1h = 그중 1시간 캐시 몫(단가가 입력의 2배 — lib/ai/pricing.ts) */
export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number; cacheWrite1h: number };

/** API 클라이언트 시간 제한 — 가장 긴 호출(구성안·집필, effort xhigh 시절 출력 5~7만 토큰 ≈ 6~9분 — 2026-10-10 B4로 high, `CLAUDE_EFFORT_HEAVY=xhigh`로 되돌릴 수 있음)보다 길게, 함수 제한(800초)보다는 짧게 */
const API_TIMEOUT_MS = 12 * 60_000;
/** 크레딧이 소진돼 거절된 API 키(함수 인스턴스 메모리 — 인스턴스가 재사용되는 동안 유지, 성공하면 지움) */
const exhaustedKeys = new Set<string>();
/** 스트림 도중 과부하·연결 끊김 재시도 전 대기 */
const RETRY_DELAY_MS = 3_000;

/**
 * 구조화 출력 한 번 부르기(API). 늘 스트리밍으로 받습니다 — 근거를 전부 넣어 입력이 30만 토큰 안팎이 되면 첫 응답·생각 시간이 길어져
 * 비스트리밍 요청은 시간 제한에 걸릴 수 있음(참고자료 설계 §8). 스트림도 끝난 뒤 parsed_output을 돌려줌
 */
async function structuredApi<T extends z.ZodType>(opts: {
  system: string;
  /** 요청 앞에 따로 붙이는 공통 지식 덩이(카드와 상관없는 글 — 덩이마다 캐시 표지, 시스템 표지와 합쳐 4개까지 — 요청 글 표지가 있으면 덩이는 2개까지) */
  shared?: string[];
  prompt: string;
  /**
   * 요청 글 뒤에 따로 붙는 끝부분(경평 집필 자동 고치기의 「고칠 점」) — 있으면 prompt 끝에도 캐시 표지를 달아(고치기가 일어날 수 있는 1차 요청도 `cachePrompt`로 같은 자리에 달음)
   * 1차 요청 글을 고치기 요청이 캐시로 읽게 함. 표지는 시스템·공유 덩이·prompt를 합쳐 4개까지라 공유 덩이는 그만큼 줄여 붙임
   */
  promptTail?: string;
  /** prompt 끝에 캐시 표지를 다는(뒤에 끝부분이 붙을 수 있는 1차 요청 — 경평 집필) */
  cachePrompt?: boolean;
  schema: T;
  maxTokens: number;
  /** 이 호출이 속한 기능 — 모델·effort는 lib/ai/models.ts의 등급 표가 정함 */
  feature: AiFeature;
  /** 캐시 수명: 과제원장·경평 구성안·집필·자동 고치기는 5분, 경평 블록 고치기·질문만 1시간(1시간 쓰기는 입력 단가의 2배라 한 번만 부르는 호출은 손해 — 사람이 몇 분 간격으로 연달아 부르는 블록 고치기만 이득, 2026-10-12) */
  ttl?: "5m" | "1h";
  /** 요청 글 앞에 붙일 이미지·PDF(base64) — 첨부 그림 설명(4단계) 전용, API 경로에서만 */
  media?: { kind: "image" | "pdf"; mime: string; data: string };
}): Promise<{ output: z.infer<T>; model: string; usage: Usage }> {
  const allKeys = apiKeysFrom(process.env);
  if (allKeys.length === 0) throw new AiUnavailableError("AI 키(ANTHROPIC_API_KEY)가 설정되지 않았습니다. 관리자에게 알려 주세요.");
  const spec = specForFeature(opts.feature, "api");
  const cache = { type: "ephemeral" as const, ttl: opts.ttl ?? ("5m" as const) };
  const params = {
    model: spec.model,
    max_tokens: opts.maxTokens,
    // 표지 순서: 긴 수명이 앞에 와야 하므로 시스템·공유 덩이 모두 같은 수명
    system: [{ type: "text" as const, text: opts.system, cache_control: cache }],
    messages: [{ role: "user" as const, content: userBlocks({ shared: opts.shared ?? [], prompt: opts.prompt, cache, tail: opts.promptTail, cachePrompt: opts.cachePrompt, media: opts.media ? mediaBlock(opts.media) : undefined }) }],
    output_config: { format: zodOutputFormat(opts.schema), effort: spec.effort satisfies Effort },
  };
  // 키 순서: 기본 키가 늘 먼저 — 번갈아 쓰지 않음(프롬프트 캐시가 조직 단위라 키를 오가면 캐시가 끊김). 크레딧 부족으로 거절된 키만 뒤로 보냄
  const keys = keyOrder(allKeys, exhaustedKeys);
  let response: Awaited<ReturnType<ReturnType<Anthropic["messages"]["stream"]>["finalMessage"]>> | undefined;
  for (let k = 0; !response; k++) {
    const key = keys[k];
    // 시간 제한·재시도를 명시(2026-10-10 P1-3): SDK 재시도는 스트림 시작 전 오류만 — 스트림 도중 과부하·연결 끊김은 아래에서 시작 60초 안이면 한 번 더
    const client = new Anthropic({ apiKey: key, maxRetries: 2, timeout: API_TIMEOUT_MS });
    const t0 = Date.now();
    for (let attempt = 0; ; attempt++) {
      try {
        response = await client.messages.stream(params).finalMessage();
        exhaustedKeys.delete(key);
        break;
      } catch (e) {
        const kind = apiErrorKind(e);
        // 크레딧 부족은 요청을 처리하기 전에 거절돼 과금이 없으므로 같은 요청을 예비 키로 다시 보내도 됨 — 새 키는 시각·시도 횟수를 새로 시작
        if (kind === "credit" && k + 1 < keys.length) {
          exhaustedKeys.add(key);
          console.warn(`structuredApi: ${opts.feature} ${["기본", "예비 1", "예비 2"][allKeys.indexOf(key)] ?? "예비"} 키 크레딧 부족 — 다음 키로 전환`);
          break;
        }
        if (!shouldRetryApi(kind, Date.now() - t0, attempt)) throw e;
        console.error(`structuredApi: ${opts.feature} 재시도(${kind})`, e);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }
  if (response.stop_reason === "refusal") throw new Error("AI가 이 요청에 답하지 않았습니다.");
  if (response.stop_reason === "max_tokens") throw new Error("답이 너무 길어 끊겼습니다. 요청을 좁혀 다시 시도해 주세요.");
  if (!response.parsed_output) throw new Error("AI 답의 형식을 읽지 못했습니다.");
  const u = response.usage;
  return {
    output: response.parsed_output as z.infer<T>,
    model: response.model,
    usage: { input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, cacheWrite1h: u.cache_creation?.ephemeral_1h_input_tokens ?? 0 },
  };
}

// CLI의 스키마 검사기는 2020-12 메타 스키마를 몰라서 draft-7로 내고 $schema는 뺌
const cliSchemas = new WeakMap<z.ZodType, object>();
function cliSchema(schema: z.ZodType): object {
  let out = cliSchemas.get(schema);
  if (!out) {
    const s = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
    delete s.$schema;
    out = s;
    cliSchemas.set(schema, out);
  }
  return out;
}

/** 이미지·PDF를 API 요청 블록으로(base64) */
function mediaBlock(m: { kind: "image" | "pdf"; mime: string; data: string }) {
  return m.kind === "pdf"
    ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: m.data } }
    : { type: "image" as const, source: { type: "base64" as const, media_type: m.mime as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: m.data } };
}

/**
 * 구조화 출력 한 번 부르기(Claude Code CLI). AI_PROVIDER=codex(평가 전용)면 같은 시스템·요청 글·스키마로 Codex CLI를 부름 —
 * 모델·effort만 CODEX_MODEL·CODEX_EFFORT(기능별 구분 없음, lib/ai/codex-cli.ts codexSpec), 답 검사(zod)는 같음
 */
async function structuredCli<T extends z.ZodType>(opts: { system: string; prompt: string; schema: T; timeoutMs?: number; feature: AiFeature }): Promise<{ output: z.infer<T>; model: string; provider: "cli" | "codex"; usage: Usage }> {
  const codex = aiProvider() === "codex";
  const cx = codexSpec();
  const spec = codex ? { cliModel: cx.model, effort: cx.effort } : specForFeature(opts.feature, "cli");
  const run = await (codex ? runCodexCli : runClaudeCli)({
    system: opts.system,
    prompt: opts.prompt,
    schema: cliSchema(opts.schema),
    model: spec.cliModel,
    effort: spec.effort,
    timeoutMs: Number(process.env.CLAUDE_CLI_TIMEOUT_MS) || opts.timeoutMs || 300_000,
  });
  const parsed = opts.schema.safeParse(run.output);
  if (!parsed.success) throw new CliFailedError("AI 답의 형식이 맞지 않습니다. 다시 시도해 주세요.", parsed.error.message.slice(0, 500));
  return { output: parsed.data as z.infer<T>, model: run.model, provider: codex ? "codex" : "cli", usage: run.usage };
}

export interface WriterCall {
  result: WriterResult;
  model: string;
  provider: AiProvider;
  usage: Usage;
}

/** kb = 과제별 공통 지식 묶음(lib/knowledge/bundle.ts — 규칙 범위 전부) */
type WriterInput = { card: LooseJson; kb: KnowledgeBundle; req: Omit<WriterRequest, "files">; files: MaterialDoc[] };

/** 첨부 → 프롬프트 글(전체 글 — PDF도 원본 문서가 아니라 글, 참고자료 설계 D2). 작성지원·질문·코멘트·경평 공용 */
const promptFiles = (docs: MaterialDoc[]): PromptFile[] => docs.map((d) => ({ name: d.name, text: d.text }));

/**
 * AI 한 번(API·CLI 공용) — shared = 요청 앞에 붙이는 공통 지식 덩이. 보내기 전에 입력 크기를 확인(넘치면 자르지 않고 BudgetError).
 * API는 덩이마다 캐시 표지(시스템 글과 답 스키마가 같은 호출끼리만 같은 사업 카드가 앞부분을 나눠 씀 — 스키마를 바꾸면 캐시가 무효), CLI는 같은 글을 요청 앞에 이어 붙임
 */
async function knowledgeStructured<T extends z.ZodType>(o: { feature: AiFeature; system: string; shared: string[]; prompt: string; schema: T; files: PromptFile[]; ttl: "5m" | "1h"; timeoutMs?: number; maxTokens?: number; promptTail?: string; cachePrompt?: boolean }): Promise<{ output: z.infer<T>; model: string; provider: AiProvider; usage: Usage }> {
  const text = o.promptTail ? `${o.prompt}\n\n${o.promptTail}` : o.prompt;
  checkBudget(o.system, [...o.shared, text].join("\n\n"), o.files);
  if (aiProvider() === "api") {
    const r = await structuredApi({ feature: o.feature, system: o.system, shared: o.shared, prompt: o.prompt, schema: o.schema, maxTokens: o.maxTokens ?? FEATURE_MAX_TOKENS[o.feature], ttl: o.ttl, promptTail: o.promptTail === undefined ? undefined : `\n\n${o.promptTail}`, cachePrompt: o.cachePrompt });
    return { ...r, provider: "api" };
  }
  return structuredCli({ feature: o.feature, system: o.system, prompt: [...o.shared, text].join("\n\n"), schema: o.schema, timeoutMs: o.timeoutMs });
}

/** 과제원장 AI(작성지원·질문·코멘트) 한 번 — 공통 지식 ①~③은 앞에 따로, 목록표는 요청 글 안(make가 받음). 캐시 5분 */
async function cardStructured<T extends z.ZodType>(feature: AiFeature, p: PromptSet, kb: KnowledgeBundle, make: (list: string) => string, schema: T, files: PromptFile[], limits: { maxTokens?: number; timeoutMs?: number } = {}) {
  return knowledgeStructured({ feature, system: cardSystem(p, trackSpecOfUnit(kb.unit)), shared: sharedTexts(p, kb), prompt: make(listText(p, kb)), schema, files, ttl: "5m", ...limits });
}

/** 보완 점검은 점검표 미흡 행(최대 20)마다 답이 나와 길다 — 점검 초안(20행)과 같은 여유(실측: 20행 CLI 248초·출력 3.7만 토큰) */
const FOLLOWUP_LIMITS = { maxTokens: FEATURE_MAX_TOKENS.card_assist, timeoutMs: 480_000 } as const;

export async function callWriter(input: WriterInput): Promise<WriterCall> {
  return retryIfDegenerate(() => callWriterOnce(input), (c) => isDegenerateWriter(c.result));
}

async function callWriterOnce(input: WriterInput): Promise<WriterCall> {
  const { prompts, schema } = (isMgmtCard(input.card) ? assistPromptsMg : assistPrompts)();
  const files = promptFiles(input.files);
  const r = await cardStructured("card_assist", prompts, input.kb, (list) => userPrompt(prompts, input.card, list, { ...input.req, files }), schema, files, input.req.mode === "followup" ? FOLLOWUP_LIMITS : {});
  return { result: r.output, model: r.model, provider: r.provider, usage: r.usage };
}

export interface CommentCall {
  result: CommentResult;
  model: string;
  provider: AiProvider;
  usage: Usage;
}

/** 카드 코멘트 묶음 처리(리뷰어): 코멘트마다 카드 편집·답. 이 카드의 카드 전용 자료 전부를 함께 넣음(참고자료 설계 1단계) */
export async function callComments(input: { card: LooseJson; targets: Map<string, EditTarget>; kb: KnowledgeBundle; req: Omit<CommentRequest, "files">; files: MaterialDoc[] }): Promise<CommentCall> {
  const { prompts, schema } = (isMgmtCard(input.card) ? commentPromptsMg : commentPrompts)();
  const files = promptFiles(input.files);
  const r = await cardStructured("card_comment", prompts, input.kb, (list) => commentPrompt(prompts, input.card, input.targets, list, { ...input.req, files }), schema, files);
  return { result: r.output, model: r.model, provider: r.provider, usage: r.usage };
}

export interface ChatCall {
  result: ChatResult;
  model: string;
  provider: AiProvider;
  usage: Usage;
}

/** 카드 「AI 작성지원 › 질문」 한 번(지침 09 + 문체 기준 — 작성지원과 적응문만 다름). 첨부 자료는 작성지원과 같은 길 */
export async function callChat(input: ChatInput): Promise<ChatCall> {
  return retryIfDegenerate(() => callChatOnce(input), (c) => isDegenerateChat(c.result));
}

type ChatInput = { card: LooseJson; kb: KnowledgeBundle; req: Omit<ChatRequest, "files">; files: MaterialDoc[] };

async function callChatOnce(input: ChatInput): Promise<ChatCall> {
  const { prompts, schema } = (isMgmtCard(input.card) ? chatPromptsMg : chatPrompts)();
  const files = promptFiles(input.files);
  const r = await cardStructured("card_chat", prompts, input.kb, (list) => chatPrompt(prompts, input.card, list, { ...input.req, files }), schema, files);
  return { result: r.output, model: r.model, provider: r.provider, usage: r.usage };
}

let reportHarness: { style: string; rules: string } | null = null;

/**
 * 보고서 초안 시스템 프롬프트 = resources/prompts/report-draft/system.md(적응문 — 2025 최종본 소항목 양식)에
 * report-harness 사본 중 이 기능에 맞는 것(REPORT_HARNESS — 문체 기준 §4·§11, 집필 규칙 7건)을 채운 것
 */
export interface MatchCall {
  result: MatchResult;
  model: string;
  provider: AiProvider;
  usage: Usage;
}

/**
 * 과제 대응 매칭 한 번(참고자료 3단계, light 등급): 카드 한 장 × 조각 한 묶음 → 이 과제에 해당하는 조각.
 * 조각 묶음은 요청 앞에 따로(API는 캐시 표지 — 같은 사업 카드를 잇달아 부르면 5분 캐시를 나눠 씀), CLI는 요청 앞에 이어 붙임.
 * 백그라운드 처리기가 부름 — 로그인 사용자가 없어 1분 5회 제한과 ai_requests 기록은 처리기(lib/prep/handlers)가 함
 */
export async function callMatchKnowledge(input: { card: { data: unknown }; unit: string; group: BundleChunk[] }): Promise<MatchCall> {
  const { prompts, schema } = matchPrompts();
  const system = fillFrom(prompts, "system", "system");
  const shared = matchShared(prompts, input.unit, input.group);
  const prompt = matchPrompt(prompts, input.unit, input.card.data);
  checkBudget(system, `${shared}\n\n${prompt}`);
  if (aiProvider() === "api") {
    const r = await structuredApi({ feature: "prep_match", system, shared: [shared], prompt, schema, maxTokens: FEATURE_MAX_TOKENS.prep_match, ttl: "5m" });
    return { result: r.output, model: r.model, provider: "api", usage: r.usage };
  }
  const r = await structuredCli({ feature: "prep_match", system, prompt: `${shared}\n\n${prompt}`, schema, timeoutMs: 480_000 });
  return { result: r.output, model: r.model, provider: r.provider, usage: r.usage };
}

export interface DescribeCall {
  description: string;
  model: string;
  usage: Usage;
}

/**
 * 첨부 그림 설명 한 번(참고자료 4단계, light 등급): 이미지 한 장 또는 글이 없는 스캔 PDF → 보이는 글자·수치·장면을 적은 글.
 * **API 경로에서만** — Claude Code CLI(`--tools ""`)는 그림을 받지 못한다. 그래서 CLI로 돌면 AiUnavailableError(호출자가 「나중에 읽음」으로 미룸).
 * 본문은 저장하지 않고 호출 기록(토큰)만 ai_requests(feature material_describe)에 남김(호출자가)
 */
export async function callDescribe(input: DescribeInput): Promise<DescribeCall> {
  if (aiProvider() !== "api") throw new AiUnavailableError("그림 설명은 API 경로에서만 만들 수 있습니다(AI_PROVIDER=api — Claude Code CLI는 그림을 받지 못함). 나중에 API로 돌 때 읽습니다.");
  const { prompts, schema } = describePrompts();
  const system = fillFrom(prompts, "system", "system");
  const prompt = fillFrom(prompts, "request", "prompt", { name: input.name, kind: input.kind === "pdf" ? "스캔 PDF" : "이미지" });
  const r = await structuredApi({ feature: "material_describe", system, prompt, schema, maxTokens: FEATURE_MAX_TOKENS.material_describe, media: { kind: input.kind, mime: input.mime, data: Buffer.from(input.bytes).toString("base64") } });
  return { description: r.output.description, model: r.model, usage: r.usage };
}

export function reportSystem(prompts: ReportPrompts = reportDraftPrompts().prompts): string {
  if (!reportHarness) {
    const read = (f: string) => readFileSync(join(process.cwd(), "resources/harness/report-harness", f), "utf8");
    // 이 기능에 맞는 절·규칙만(REPORT_HARNESS — 문서 전체 구성·게이트 절차·앱 규칙과 부딪히는 규칙은 뺌)
    const rules = pickRules(parseRules(read("rules.md")), REPORT_HARNESS.rules)
      .map((r) => `- ${r.id} ${r.text}`)
      .join("\n");
    reportHarness = { style: pickSections(read("style-guide.md"), REPORT_HARNESS.style), rules };
  }
  return fillFrom(prompts, "system", "system", reportHarness);
}

let outlineSkeleton: string | null = null;

/** 구성안 시스템 프롬프트(두 트랙): {{skeleton}} = report-harness 도식 Pool 사본의 판정표(lib/harness/rules.ts OUTLINE_SKELETON — 한 번 읽어 둠) */
export function outlineSystem(prompts: PromptSet): string {
  outlineSkeleton ??= pickHeadings(readFileSync(join(process.cwd(), "resources/harness/report-harness", OUTLINE_SKELETON.file), "utf8"), OUTLINE_SKELETON.headings);
  return fillFrom(prompts, "system", "system", { skeleton: outlineSkeleton });
}

export interface SectionCall {
  output: SectionOutput;
  model: string;
  provider: AiProvider;
  usage: Usage;
  /** 쓴 프롬프트 판(resources/prompts/report-draft) */
  promptVersion: string;
}

/**
 * 경평 초안 과제별(소항목) 초안. 근거 = 원장 카드 + 고른 첨부 자료(카드 전용 자료·보고서 추가자료).
 * API는 PDF를 원본 문서로도 붙이고(표·그림 배치까지 모델이 봄), CLI는 글만 넘김(글자가 없는 스캔 PDF는 되돌림 — 작성지원과 같음)
 */
export interface ReportSectionInput {
  card: LooseJson;
  ctx: SectionContext;
  year: number;
  files?: MaterialDoc[];
  prior?: PriorPick[];
  siblings?: SiblingLayout[];
  lens?: LensRef[];
  /** 올해 실적 재료(카드 계량지표·월별 실적 + 부서 계량 실적 입력, lib/reports/actuals.ts) — 없으면 카드만으로 뽑음 */
  actuals?: YearActuals;
  /** 고치기: 앞서 쓴 초안과 그 판면 어림·올해 실적 문제 — 있으면 첫 요청 글 뒤에 「판면 맞추기」 또는 「고치기」를 붙여 다시 씀 */
  fit?: { draft: SectionOutput; report: FitReport; need: FitNeed | null; year?: string[]; compose?: string[]; prose?: string[]; unknown?: string[] };
  /** 승인된 구성안(lib/reports/composition.ts) — 있으면 요청 글에 「승인된 구성안」(블록마다 높이 예산)을 붙여 그 짜임대로 씀 */
  plan?: Composition;
  /** 과제별 공통 지식 묶음(규칙 범위 전부 — 참고자료 설계 2단계). 있으면 ①~③을 요청 앞에, 목록표를 요청 글 첫머리에 */
  kb?: KnowledgeBundle;
}

/**
 * 경평 초안 블록 고치기·질문(드래그 「AI 수정 요청」·「질문」 — lib/reports/block-edit.ts). 블록 하나라 초안보다 짧음(근거는 요청 글에 글로 넣음, 첨부 PDF 원본은 안 붙임)
 */
export async function callReportBlock(input: { kind: "edit"; prompt: string; kb?: KnowledgeBundle; mg?: boolean }): Promise<{ output: BlockEditOutput; model: string; provider: AiProvider; usage: Usage; promptVersion: string }>;
export async function callReportBlock(input: { kind: "ask"; prompt: string; kb?: KnowledgeBundle; mg?: boolean }): Promise<{ output: BlockAskOutput; model: string; provider: AiProvider; usage: Usage; promptVersion: string }>;
export async function callReportBlock(input: { kind: "shapes"; prompt: string; kb?: KnowledgeBundle; mg?: boolean }): Promise<{ output: BlockShapesOutput; model: string; provider: AiProvider; usage: Usage; promptVersion: string }>;
export async function callReportBlock(input: { kind: "result"; prompt: string; kb?: KnowledgeBundle }): Promise<{ output: ResultEditOutput; model: string; provider: AiProvider; usage: Usage; promptVersion: string }>;
export async function callReportBlock(input: { kind: "edit" | "ask" | "shapes" | "result"; prompt: string; kb?: KnowledgeBundle; mg?: boolean }) {
  // 추진성과 상자 고치기(result — 2026-10-13)는 주요사업만(경영관리 초안은 상자가 없음) — 같은 기능 키 report_block, 시스템 글도 블록 고치기와 같음
  if (input.kind === "result") {
    const { prompts, schema } = reportBlockPrompts();
    const r = await reportStructured("report_block", fillFrom(prompts, "system", "system", {}), schema.result, [], () => input.prompt, input.kb);
    return { ...r, promptVersion: prompts.version };
  }
  // 경영관리 초안은 report-block-mg(역할·입력이 경영관리용 — 공통 지식 절도 knowledge-mg). 「다른 모양으로」(shapes)도 같은 기능 키 report_block(호출 한도·effort·상한 그대로)
  const { prompts, schema } = input.mg ? reportBlockPromptsMg() : reportBlockPrompts();
  const system = fillFrom(prompts, "system", "system", {});
  const kbp = input.mg ? reportDraftPromptsMg().prompts : undefined;
  const r =
    input.kind === "edit"
      ? await reportStructured("report_block", system, schema.edit, [], () => input.prompt, input.kb, { kbp })
      : input.kind === "shapes"
        ? await reportStructured("report_block", system, schema.shapes, [], () => input.prompt, input.kb, { kbp })
        : await reportStructured("report_block", system, schema.ask, [], () => input.prompt, input.kb, { kbp });
  return { ...r, promptVersion: prompts.version };
}

/**
 * 경평 초안 구조화 호출 공용(API·CLI 같은 글 — PDF 원본은 보내지 않음, 참고자료 설계 D2). kb가 있으면 공통 지식 ①~③을 요청 앞에 따로(캐시: 블록 고치기·질문 1시간, 나머지 5분 —
 * 앞부분을 이어 쓰는 것은 시스템 글과 답 스키마가 같은 집필 → 자동 고치기뿐 — 구성안·집필·블록 고치기끼리는 둘 다 달라 각자 새로 씀), 목록표를 요청 글 첫머리에. 넘치면 자르지 않고 BudgetError
 */
async function reportStructured<T extends z.ZodType>(
  feature: AiFeature,
  system: string,
  schema: T,
  docs: MaterialDoc[],
  ask: (files: ReportFile[]) => string,
  kb?: KnowledgeBundle,
  // 공통 지식 절(kb.*)을 꺼낼 묶음 — 경영관리는 report-draft-mg(_shared/knowledge-mg.md), CLI 제한 시간 — 경영관리 집필은 절이 여럿이라 길게
  opts: { kbp?: PromptSet; timeoutMs?: number; tail?: string; cachePrompt?: boolean } = {},
): Promise<{ output: z.infer<T>; model: string; provider: AiProvider; usage: Usage }> {
  const files: ReportFile[] = promptFiles(docs);
  const kbp = opts.kbp ?? reportDraftPrompts().prompts;
  const prompt = kb ? `${listText(kbp, kb)}\n\n${ask(files)}` : ask(files);
  // 캐시 수명: 블록 고치기·질문(report_block)만 1시간 — 구성안·집필·자동 고치기는 한 번 부르고 끝나거나 1~3분 안에 이어져 5분으로 충분(2026-10-12)
  const ttl = feature === "report_block" ? "1h" : "5m";
  const r = await knowledgeStructured({ feature, system, shared: kb ? sharedTexts(kbp, kb) : [], prompt, schema, files, ttl, timeoutMs: opts.timeoutMs ?? 420_000, promptTail: opts.tail, cachePrompt: opts.cachePrompt });
  return { output: r.output, model: r.model, provider: r.provider, usage: r.usage };
}

export async function callReportSection(input: ReportSectionInput): Promise<SectionCall> {
  const { prompts, schema: anyStory } = reportDraftPrompts();
  // 승인된 구성안대로 쓸 때는 답의 이야기 틀을 문자열로 받고 값은 코드가 구성안 틀로 덮음(2026-09-28 구성안 틀로 묶음 → 2026-10-12 literal 대신 덮기)
  const schema = input.plan?.story ? sectionOutputSchema(prompts.schema, input.plan.story) : anyStory;
  const ask = (files: ReportFile[]) => {
    const base = sectionPrompt(prompts, input.card, input.ctx, input.year, files, input.prior ?? [], input.siblings ?? [], input.lens ?? [], input.actuals);
    const plan = input.plan ? `\n\n${planPrompt(prompts, input.plan, input.ctx.module, input.ctx.head)}` : "";
    return `${base}${plan}`;
  };
  // 자동 고치기의 「고칠 점」은 요청 글 끝에 따로 붙는 블록 — 1차 요청 글(약 4만 토큰)이 바이트까지 같아 캐시 표지(1차는 cachePrompt, 고치기는 tail 앞)가 같은 자리에 오고 고치기는 캐시로 읽음.
  // 1차 요청은 자주 고치기로 이어져(2026-09-27~10-12 주요사업 집필 25건 중 19건, 10-10 이후 4건 중 3건) 웃돈(×0.25)보다 절감(×0.9)이 큼 — 구성안·경영관리·블록 고치기는 이 경로가 아님
  const tail = input.fit ? fitPrompt(prompts, input.ctx, input.fit.draft, input.fit.report, input.fit.need, input.fit.year, input.fit.compose, input.fit.prose, input.fit.unknown) : undefined;
  // CLI 제한 10분: 2026-10-09 연기 시험 1-가 집필 2회 602초(한 번 약 300초 — 예전 7분 제한과 여유가 적음, effort xhigh)
  // 자동 고치기 호출은 기능 키를 따로(report_fix — effort·상한은 집필 report_section과 같음: 고치기만 high로 낮춘 B2c는 문장 품질이 떨어져 미채택, 그 뒤 B4로 구성안·집필·고치기를 함께 high)
  const r = await reportStructured(input.fit ? "report_fix" : "report_section", reportSystem(prompts), schema, input.files ?? [], ask, input.kb, { timeoutMs: 600_000, tail, cachePrompt: !input.fit });
  // 이야기 틀은 승인된 구성안 것을 코드가 넣음(AI가 적은 틀 이름은 무시 — 첫 집필·판면 맞추기 모두 이 함수를 지남)
  return { ...r, output: withPlanStory(r.output, input.plan), promptVersion: prompts.version };
}

export interface OutlineCall {
  output: CompositionOutput;
  model: string;
  provider: AiProvider;
  usage: Usage;
  promptVersion: string;
}

/** splitSiblings = 같은 실행과제 형제 카드의 소항목 제목·갈래 축·칩(lib/reports/split-axes.ts — 2026-10-13). 없으면 형제 절 없이 축 사전만 */
export type ReportOutlineInput = ReportSectionInput & { memo?: string; story?: Story; inspection?: FollowupBasis | null; frame?: FrameInput; splitSiblings?: SplitSibling[] };

/**
 * 구성안 요청 글 만들기(callReportOutline·연기 시험 --dry 공용 — 첨부 글 목록을 받아 요청 글): 집필과 같은 자료 블록(sectionPrompt) 뒤에 구성안 요청(task),
 * 이야기 틀(고른 틀·섞음·틀 후보), 담당자가 고른 짜임(frame — 구성 패턴·2025 예시 절·여러 안 맥락, lib/reports/framework-pick.ts framePrompt, 2026-10-12), 점검 보완 요청, 담당자 메모
 */
export function reportOutlineAsk(input: ReportOutlineInput): (files: ReportFile[]) => string {
  const draft = reportDraftPrompts().prompts;
  const { prompts } = reportOutlinePrompts();
  // 담당자가 틀 갤러리에서 고른 이야기 틀(lib/reports/frameworks.ts) — 요청에 그 틀의 블록 순서를 적고 답의 틀은 코드가 그 틀로 덮음(withFixedStory — 스키마는 늘 문자열, 2026-10-12).
  // 「섞음」을 고르면 12종 중 주 틀 + 보조 틀을 고르게 하고(story.mix), 고르지 않으면 앱이 뽑은 틀 후보(storyHints — lib/reports/story-hints.ts)를 붙임
  const fw = input.story ? frameworkOf(input.story) : null;
  const storyText = (files: ReportFile[]) => {
    if (fw?.story === "섞음") return fillFrom(prompts, "request", "story.mix");
    if (fw)
      return fillFrom(prompts, "request", "story", {
        story: fw.story,
        fit: fw.fit,
        blocks: fw.blocks.map((b) => `${b.label ? `[${b.label}] ` : ""}${shapeName(b.kind, b.variant ?? "")}(${shapeCode(b.kind, b.variant ?? "")})`).join(" → "),
      });
    const hints = sectionHints(input.card, input.prior ?? [], files, input.lens ?? [], input.actuals ?? yearActuals(input.card), input.year);
    return storyHintsPrompt(prompts, storyHints(hints, hintSource(input.card, input.prior ?? [], files), (input.siblings ?? []).map((x) => x.story)));
  };
  return (files: ReportFile[]) =>
    [
      sectionPrompt(draft, input.card, input.ctx, input.year, files, input.prior ?? [], input.siblings ?? [], input.lens ?? [], input.actuals),
      fillFrom(prompts, "request", "task", { module: input.ctx.module, moduleGuide: moduleGuide(draft, input.ctx.module), area: blockAreaMm(input.ctx.module, input.ctx.head), maxBlocks: planBlockCap(input.ctx.module) }),
      storyText(files),
      // 갈래 축 사전·같은 실행과제 형제의 축·칩(2026-10-13 — 형제가 축을 쓰면 같은 축으로 값만)
      splitHeadPrompt(prompts, "biz"),
      splitSiblingsPrompt(prompts, `${input.ctx.task.no} ${input.ctx.task.title}`.trim(), input.splitSiblings ?? []),
      input.frame ? framePrompt(prompts, input.frame, false) : "",
      outlineInspectionPrompt(prompts, input.inspection ?? null),
      input.memo?.trim() ? fillFrom(prompts, "request", "memo", { memo: input.memo.trim() }) : "",
    ]
      .filter(Boolean)
      .join("\n\n");
}

/**
 * 구성안(재료표·짜임) 한 번 — 요청 글은 reportOutlineAsk. 시스템 프롬프트 = report-outline/system.md(경평 초안의 입력·이야기 틀·블록 사전을 끼움)
 */
export async function callReportOutline(input: ReportOutlineInput): Promise<OutlineCall> {
  const { prompts, schema } = reportOutlinePrompts();
  const fixed = input.story ? frameworkOf(input.story)?.story : undefined;
  const ask = reportOutlineAsk(input);
  // CLI 제한 10분(경영관리와 같음): 2026-10-09 연기 시험 1-가 구성안 412초(출력 5.7만 토큰 — effort xhigh) — 예전 7분 제한에 걸릴 뻔함
  const r = await reportStructured("report_outline", outlineSystem(prompts), schema, input.files ?? [], ask, input.kb, { timeoutMs: 600_000 });
  return { ...r, output: withFixedStory(r.output, fixed), promptVersion: prompts.version };
}

/** 경영관리 경평 초안 요청(구성안·집필 공용) — 근거는 주요사업과 같은 범위(카드·첨부·공통 지식 묶음·평가 근거·전년 보고서 절·올해 실적) */
export interface MgReportInput {
  card: LooseJson;
  /** 구성안만: 같은 지표 다른 카드의 구성안 절(겹치지 않게)·도식 후보 */
  siblings?: MgSibling[];
  hints?: DiagramHint[];
  /** 구성안만: 최종 점검표의 미흡 행(월간 점검 보완 요청 — lib/reports/inspection-input.ts) */
  inspection?: FollowupBasis | null;
  ctx: MgDraftContext;
  year: number;
  files?: MaterialDoc[];
  lens?: LensRef[];
  actuals?: YearActuals;
  kb?: KnowledgeBundle;
}

/**
 * 경영관리 구성안 한 번 — 자료 블록(report-draft-mg/request.md, 추천 평가내용의 전년 절 글) 뒤에 구성안 요청(report-outline-mg task)과 담당자 메모.
 * 시스템 프롬프트 = report-outline-mg/system.md
 */
export async function callReportOutlineMg(input: MgReportInput & { memo?: string; part?: MgPartRedo }): Promise<{ output: MgOutlineOutput; model: string; provider: AiProvider; usage: Usage; promptVersion: string }> {
  const draft = reportDraftPromptsMg().prompts;
  const { prompts, schema } = reportOutlinePromptsMg();
  const ask = (files: ReportFile[]) =>
    [
      mgMaterialsPrompt(draft, input.card, input.ctx, input.year, input.ctx.evals, files, input.lens ?? [], input.actuals),
      mgDiagramPrompt(prompts, input.hints ?? []),
      mgSiblingsPrompt(prompts, input.siblings ?? []),
      outlineInspectionPrompt(prompts, input.inspection ?? null),
      // 절별 「이 틀로 다시 짜기」면 전체 구성안 요청(task) 대신 그 절만(part.* — 다른 절은 앱이 그대로 둠)
      input.part ? mgPartPrompt(prompts, input.part) : fillFrom(prompts, "request", "task", { maxParts: MG_LIMITS.parts, maxBlocks: MG_LIMITS.blocks }),
      // 갈래 축 사전(카드 하나에 축 하나 — 전체 구성안만, 절 다시 짜기는 part.split 줄로 카드 축을 알림, 2026-10-13)
      input.part ? "" : splitHeadPrompt(prompts, "mg"),
      // 이야기 틀 후보(카드 단위 3개 — lib/reports/story-hints-mg.ts, 2026-10-12 C5) — 전체 구성안만
      input.part ? "" : mgStoryHintsFor(prompts, { card: input.card, ctx: input.ctx, files, hints: input.hints, siblings: input.siblings }),
      // 분량 목표(배정 쪽 — 전체 구성안만)·이 지표의 닫기 관례(2026-10-12 사용자 결정 D1·D2)
      input.part ? "" : mgVolumePrompt(prompts, input.ctx.pages),
      mgClosePrompt(prompts, input.ctx.prior, input.ctx.indicator),
      input.memo?.trim() ? fillFrom(prompts, "request", "memo", { memo: input.memo.trim() }) : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  // 요청이 주요사업의 약 두 배(지표 공통 지식 ③에 전년 보고서·실사 답변이 다 들어감 — 8-1 실측 약 17.7만 자)라 CLI 제한을 집필과 같게
  const r = await reportStructured("report_outline", outlineSystem(prompts), schema, input.files ?? [], ask, input.kb, { kbp: draft, timeoutMs: 600_000 });
  return { ...r, promptVersion: prompts.version };
}

/**
 * 경영관리 집필 한 번(카드당 1회 — 설계 결정 2026-10-09): 자료 블록(승인된 구성안의 평가내용 전년 절 글) 뒤에 「승인된 구성안」(닫기 관례·분량 목표·블록 글 한도 포함). 판면 맞추기·자동 고치기 없음(R4 보류 — 분량은 경고만, 2026-10-12 D1).
 * 절이 여럿이라 답이 길어 CLI 제한 시간을 늘림. 시스템 프롬프트 = report-draft-mg/system.md(+ report-harness 문체·규칙 — 주요사업과 같은 고르기)
 */
export async function callReportDraftMg(input: MgReportInput & { plan: Composition }): Promise<{ output: MgDraftOutput; model: string; provider: AiProvider; usage: Usage; promptVersion: string }> {
  const { prompts, schema } = reportDraftPromptsMg();
  const evals = [...new Set((input.plan.mg?.parts ?? []).map((p) => p.evalNo))];
  const ask = (files: ReportFile[]) => `${mgMaterialsPrompt(prompts, input.card, input.ctx, input.year, evals.length ? evals : input.ctx.evals, files, input.lens ?? [], input.actuals)}\n\n${mgPlanPrompt(prompts, input.plan, input.ctx)}`;
  const r = await reportStructured("report_section", reportSystem(prompts), schema, input.files ?? [], ask, input.kb, { kbp: prompts, timeoutMs: 600_000 });
  return { ...r, promptVersion: prompts.version };
}

/**
 * 경영관리 지표 단위 부분(카드 밖 표)의 문장 칸 채우기 한 번(R5c — 지표당 1회, 설계 docs/plan/경영관리-R5-지표단위-설계.md §3.7). 요청 글은 lib/reports/unit-parts-ai.ts unitAiPrompt가 만든 것 그대로
 * (공통 지식 「규칙 범위 전부」·첨부는 안 넣음). 시스템 프롬프트 = report-unit-mg/system.md + report-harness 문체·규칙(경평 초안과 같은 고르기).
 * CLI 제한 10분(경영관리 구성안·집필과 같음). 운영 방식은 로컬 CLI뿐(2026-10-16 사용자 결정)이지만 API 경로도 다른 기능과 같게 둠
 */
export async function callReportUnitMg(prompt: string): Promise<{ output: UnitAiOutput; model: string; provider: AiProvider; usage: Usage; promptVersion: string }> {
  const { prompts, schema } = reportUnitPromptsMg();
  const r = await reportStructured("report_unit_mg", reportSystem(prompts), schema, [], () => prompt, undefined, { timeoutMs: 600_000 });
  return { ...r, promptVersion: prompts.version };
}

/**
 * 초안 + 고치기(한 번 + 「판면만 한 번 더」 — 시간은 canFixAgain): 쓴 초안을 검증하고 판면을 어림해(lib/reports/fit.ts) 넘치거나·비거나·칸 글이 끊기거나 덜 찼으면,
 * 또는 올해 실적 문제(verify의 yearIssues — 수치 띠에 올해 실적 없음·추진성과가 예상·목표뿐 등)가 있으면 앞 초안을 붙여 한 번 더 부르고,
 * 점수(판면 점수 + 없는 숫자·올해 실적·짜임·문장 문제 무게 — lib/ai/fix-policy.ts draftScore)가 나은 쪽을 씀(고치기 호출이 실패하면 첫 초안). verify는 부르는 쪽의 숫자·인용 근거로 검증
 */
/** 고치기 뒤에도 이만큼 넘치면 한 번 더(판면만) — 평가 라운드 D: 0.5쪽이 고치기 1회 뒤 117~129% */
const OVER_AGAIN = 1.04;
/** 고치기 뒤 이만큼 비어도 한 번 더(판면만) — 평가 라운드 G: 고치기가 지나치게 줄여 77% */
const UNDER_AGAIN = 0.92;

/** 고치기 전후 기록(연기 시험·평가용 — 판면 어림·올해 실적 문제 수·짜임 문제 수, chose = 고른 판) */
export interface FitTrace {
  drafts: Array<{ total: number; budget: number; need: FitNeed | null; year: number; compose: number; prose?: number; unknown?: number; rows?: string; failed?: boolean; error?: string }>;
  chose: number;
  /** 1차 호출 ms·고치기 호출 ms(병목 기록 — ai_requests.timings) */
  firstMs?: number;
  fixMs?: number;
  /** 「판면만 한 번 더」 호출 ms */
  againMs?: number;
  /** 고치기를 안 한 이유(lib/ai/fix-policy.ts shouldFix — 문제 없음·문장 문제만·시간 부족, stopped = 1차 저장이 멈추라고 함) */
  skipped?: "none" | "prose-only" | "time" | "stopped";
}

/**
 * 집필 + 자동 고치기. opts.onFirst — 고치기를 하기 전에 1차 초안을 넘겨 먼저 저장하게 함(고치기 도중 함수가 끊겨도 1차 초안이 남음, 2026-10-10 B2a).
 * false를 돌려주면(예: 저장 충돌) 고치기를 하지 않음. 고치기 여부는 shouldFix(판면·올해 실적·짜임 문제 + 남은 시간, B2b·B2d)
 */
export async function callReportSectionFitted(
  input: ReportSectionInput,
  verify: (out: SectionOutput) => SectionCheck,
  opts: { onFirst?: (first: { call: SectionCall; check: SectionCheck }) => Promise<boolean>; deadlineMs?: number } = {},
): Promise<{ call: SectionCall; check: SectionCheck; passes: number; usage: Usage; trace: FitTrace }> {
  const t0 = Date.now();
  // 승인된 구성안으로 쓸 때는 글 한도(칸마다 줄 수)를 넘긴 블록도 고치기 문제로(lib/reports/composition.ts planLimitIssues)
  const check = (out: SectionOutput): SectionCheck => {
    const c = verify(out);
    if (!input.plan) return c;
    const over = planLimitIssues(input.plan, c.spec.blocks ?? [], input.ctx.module, input.ctx.head);
    return { ...c, composeIssues: [...c.composeIssues, ...over], warnings: [...c.warnings, ...over] };
  };
  const first = await callReportSection(input);
  let best = { call: first, check: check(first.output) };
  const usage = { ...first.usage };
  const report = fitReport(best.check.spec);
  const need = fitNeeded(report);
  const year = best.check.yearIssues;
  const compose = best.check.composeIssues;
  const prose = best.check.proseIssues;
  // 고친 판 고르기 점수(lib/ai/fix-policy.ts draftScore — 없는 숫자·올해 실적·짜임·문장 무게)
  const score = draftScore;
  const note = (c: SectionCheck) => {
    const r = fitReport(c.spec);
    return { total: r.total, budget: r.budget, need: fitNeeded(r), year: c.yearIssues.length, compose: c.composeIssues.length, prose: c.proseIssues.length, unknown: c.unknownNumbers.length, rows: r.rows.map((x) => `${x.label || x.kinds} ${Math.round(x.mm)}`).join(" · ") };
  };
  const firstMs = Date.now() - t0;
  const trace: FitTrace = { drafts: [note(best.check)], chose: 0, firstMs };
  let passes = 0;
  const deadline = opts.deadlineMs ?? fixDeadlineMs();
  const decision = shouldFix({ need, year: year.length, compose: compose.length, prose: prose.length }, Date.now() - t0, firstMs, deadline);
  if (!decision.fix) trace.skipped = decision.reason;
  // 고치기 전에 1차 초안을 먼저 저장(끊겨도 남게) — 저장이 멈추라고 하면(충돌) 고치지 않음
  const go = decision.fix && (opts.onFirst ? await opts.onFirst(best).catch((e) => (console.error("callReportSectionFitted onFirst", e), true)) : true);
  if (decision.fix && !go) trace.skipped = "stopped";
  if (go) {
    const tFix = Date.now();
    try {
      const again = await callReportSection({ ...input, fit: { draft: first.output, report, need, year, compose, prose, unknown: best.check.unknownNumbers } });
      trace.fixMs = Date.now() - tFix;
      passes = 1;
      usage.input += again.usage.input;
      usage.output += again.usage.output;
      usage.cacheRead += again.usage.cacheRead;
      usage.cacheWrite += again.usage.cacheWrite;
      usage.cacheWrite1h += again.usage.cacheWrite1h;
      const checked = check(again.output);
      trace.drafts.push(note(checked));
      if (score(checked) <= score(best.check)) {
        best = { call: again, check: checked };
        trace.chose = 1;
      }
    } catch (e) {
      trace.drafts.push({ total: 0, budget: report.budget, need: null, year: 0, compose: 0, failed: true, error: aiErrorMessage(e) });
      console.error("callReportSectionFitted: 맞추기 실패 — 첫 초안을 씀", e);
    }
  }
  // 고친 판도 4% 넘게 넘치거나 8% 넘게 비면 판면만 한 번 더(고른 판을 앞 초안으로)
  const left = fitReport(best.check.spec);
  const again2: FitNeed | null = left.total > left.budget * OVER_AGAIN ? "over" : left.total < left.budget * UNDER_AGAIN ? "under" : null;
  // 시간: 지금까지 + 직전 고치기 시간 × 1.1이 기한 안일 때만(canFixAgain — 기한은 Vercel에서만, 계획서 §10 E7)
  if (passes && again2 && canFixAgain(Date.now() - t0, trace.fixMs ?? 0, deadline)) {
    const tAgain = Date.now();
    try {
      const again = await callReportSection({ ...input, fit: { draft: best.call.output, report: left, need: again2, year: best.check.yearIssues, compose: best.check.composeIssues, prose: best.check.proseIssues, unknown: best.check.unknownNumbers } });
      passes = 2;
      trace.againMs = Date.now() - tAgain;
      usage.input += again.usage.input;
      usage.output += again.usage.output;
      usage.cacheRead += again.usage.cacheRead;
      usage.cacheWrite += again.usage.cacheWrite;
      usage.cacheWrite1h += again.usage.cacheWrite1h;
      const checked = check(again.output);
      trace.drafts.push(note(checked));
      if (score(checked) <= score(best.check)) {
        best = { call: again, check: checked };
        trace.chose = trace.drafts.length - 1;
      }
    } catch (e) {
      trace.drafts.push({ total: 0, budget: left.budget, need: null, year: 0, compose: 0, failed: true, error: aiErrorMessage(e) });
      console.error("callReportSectionFitted: 두 번째 고치기 실패 — 앞 판을 씀", e);
    }
  }
  if (best.check.spec.fit) best.check.spec.fit.passes = passes;
  return { ...best, passes, usage, trace };
}

const inspectGuides = new Map<string, string>();

/** 종합점검 지침 사본(트랙별 — 주요사업 14·경영관리 13). 한 번 읽어 둠 */
function inspectGuide(track: TrackSpec): string {
  let guide = inspectGuides.get(track.inspectionGuide);
  if (!guide) {
    guide = readFileSync(join(process.cwd(), "resources/harness/pdca", track.inspectionGuide), "utf8");
    inspectGuides.set(track.inspectionGuide, guide);
  }
  return guide;
}

/** 점검 시스템 프롬프트 = inspection/system.md(점검 적응문 — 붙임2 유무로 두 벌) + 성과관리팀 종합점검 지침(주요사업 14) 사본 — 트랙을 안 정하면 주요사업 */
export function inspectSystem(peer = false, prompts: PromptSet = inspectPrompts().prompts, track: TrackSpec = DEFAULT_TRACK): string {
  return inspectSystemText(prompts, peer, inspectGuide(track));
}

let mgLinkIndexRows: LinkIndexRow[] | null = null;
/** 경영관리 점검의 주요사업 연계 색인(지침 13 사본의 [경영관리 지표 ↔ 주요사업 연계 색인] 표 — lib/inspections/biz-links.ts). 한 번 읽어 둠 */
export function mgLinkIndex(): LinkIndexRow[] {
  mgLinkIndexRows ??= parseLinkIndex(inspectGuide(MGMT_TRACK));
  return mgLinkIndexRows;
}

/** 경영관리 점검 시스템 프롬프트 = inspection-mg/system.md + 종합점검 지침(경영관리 13) 사본 */
export function inspectMgSystem(prompts: PromptSet = inspectPromptsMg().prompts): string {
  return inspectMgSystemText(prompts, inspectGuide(MGMT_TRACK));
}

export interface InspectionCall {
  output: InspectOutput;
  model: string;
  provider: AiProvider;
  usage: Usage;
}

/** 월간 점검표 초안(지침 14 점검 모드). 답(20행·총평)이 길어 API는 stream, CLI는 제한 시간을 늘림 */
export async function callInspection(input: { card: LooseJson; refs: KnowledgeRef[]; ctx: InspectContext }): Promise<InspectionCall> {
  const { prompts, schema } = inspectPrompts();
  const system = inspectSystem(input.ctx.hasPeerCases, prompts, trackSpecOfUnit(input.ctx.business?.id));
  const prompt = inspectionPrompt(prompts, input.card, input.refs, input.ctx);
  if (aiProvider() === "api") {
    const r = await structuredApi({ feature: "inspection", system, prompt, schema, maxTokens: FEATURE_MAX_TOKENS.inspection });
    return { output: r.output, model: r.model, provider: "api", usage: r.usage };
  }
  // CLI 제한 10분(경영관리와 같음): 2026-10 실측 출력 5~5.9만 토큰 ≈ 6~7분 — 예전 8분 제한은 여유가 적음
  const r = await structuredCli({ feature: "inspection", system, prompt, schema, timeoutMs: 600_000 });
  return { output: r.output, model: r.model, provider: r.provider, usage: r.usage };
}

export interface InspectionMgCall {
  output: InspectMgOutput;
  model: string;
  provider: AiProvider;
  usage: Usage;
}

/** 경영관리 월간 점검표 초안(지침 13 점검 모드) — 답에 체크리스트 항목별 대조가 더해져 주요사업보다 길어 같은 방식(API stream·CLI 제한 시간 늘림) */
export async function callInspectionMg(input: { card: LooseJson; refs: KnowledgeRef[]; ctx: MgmtInspectContext }): Promise<InspectionMgCall> {
  const { prompts, schema } = inspectPromptsMg();
  const system = inspectMgSystem(prompts);
  const prompt = inspectMgPrompt(prompts, input.card, input.refs, input.ctx);
  if (aiProvider() === "api") {
    const r = await structuredApi({ feature: "inspection", system, prompt, schema, maxTokens: FEATURE_MAX_TOKENS.inspection });
    return { output: r.output, model: r.model, provider: "api", usage: r.usage };
  }
  const r = await structuredCli({ feature: "inspection", system, prompt, schema, timeoutMs: 600_000 });
  return { output: r.output, model: r.model, provider: r.provider, usage: r.usage };
}

/** 오류를 사용자에게 보일 문장으로 */
export function aiErrorMessage(e: unknown): string {
  if (e instanceof AiUnavailableError || e instanceof CliUnavailableError || e instanceof CliFailedError || e instanceof AttachmentError || e instanceof BudgetError) return e.message;
  // SDK 오류는 종류별 안내(속도 제한·과부하·서버·시간 초과·연결·키·크레딧·요청 거절 — lib/ai/api-errors.ts)
  const kind = apiErrorKind(e);
  if (kind) return apiErrorMessage(kind);
  return e instanceof Error ? e.message : "AI 작성지원에 실패했습니다.";
}

/** 모델 이름 표시: CLI로 부른 것은 뒤에 표시(평가 전용 Codex는 「codex/」를 떼고 「· Codex」) */
export function modelLabel(call: Pick<WriterCall, "model" | "provider">): string {
  if (call.provider === "codex") return `${call.model.replace(/^codex\//, "")} · Codex`;
  return call.provider === "cli" ? `${call.model} · Claude Code` : call.model;
}
