// 기능별 AI 프롬프트 묶음(서버·스크립트·테스트) — resources/prompts/<기능>/를 읽어 절 묶음과 모델용 답 스키마(필드 설명 붙임)를 돌려줌.
// 기능 모듈(writer·chat·comments·inspect·section)은 순수로 두고 이 묶음을 인자로 받습니다.

import { CHAT_PROMPT_SPEC, chatResultSchema } from "../ai/chat.ts";
import { COMMENT_PROMPT_SPEC, commentResultSchema } from "../ai/comments.ts";
import { DESCRIBE_PROMPT_SPEC, describeResultSchema } from "../ai/describe.ts";
import { MATCH_PROMPT_SPEC, matchResultSchema } from "../ai/match.ts";
import { INSPECT_PROMPT_SPEC, inspectOutputSchema } from "../ai/inspect.ts";
import { INSPECT_MG_PROMPT_SPEC, inspectMgOutputSchema } from "../ai/inspect-mg.ts";
import { ASSIST_PROMPT_SPEC, writerResultSchema } from "../ai/writer.ts";
import { OUTLINE_PROMPT_SPEC, compositionOutSchema } from "../reports/composition.ts";
import { BLOCK_EDIT_MG_PROMPT_SPEC, BLOCK_EDIT_PROMPT_SPEC, blockAskSchema, blockEditSchema, blockShapesSchema, resultEditSchema } from "../reports/block-edit.ts";
import { REPORT_PROMPT_SPEC, sectionOutputSchema } from "../reports/section.ts";
import { MG_DRAFT_PROMPT_SPEC, mgDraftOutSchema } from "../reports/mg-draft.ts";
import { MG_OUTLINE_PROMPT_SPEC, mgOutlineOutSchema } from "../reports/mg-outline.ts";
import { UNIT_AI_PROMPT_SPEC, unitAiOutSchema } from "../reports/unit-parts-ai.ts";
import { cachedPrompt, readPromptSet } from "./load.ts";
import type { PromptSet, PromptSpec } from "./template.ts";

/** 기능 폴더 이름 → 필요한 절(테스트·README 표와 같은 목록) */
export const PROMPT_FEATURES: Record<string, PromptSpec> = {
  "card-assist": ASSIST_PROMPT_SPEC,
  "card-chat": CHAT_PROMPT_SPEC,
  "card-comment": COMMENT_PROMPT_SPEC,
  // 경영관리 트랙(지침 08) — 주요사업 폴더와 같은 절 구성, 글만 경영관리용(주요사업 프롬프트·판은 안 건드림)
  "card-assist-mg": ASSIST_PROMPT_SPEC,
  "card-chat-mg": CHAT_PROMPT_SPEC,
  "card-comment-mg": COMMENT_PROMPT_SPEC,
  inspection: INSPECT_PROMPT_SPEC,
  "inspection-mg": INSPECT_MG_PROMPT_SPEC,
  "report-draft": REPORT_PROMPT_SPEC,
  "report-outline": OUTLINE_PROMPT_SPEC,
  "report-block": BLOCK_EDIT_PROMPT_SPEC,
  // 경영관리 경평 초안(평가내용 → 대주제 → 절 — 2026-10-09 R3) — 주요사업 폴더·판은 그대로
  "report-draft-mg": MG_DRAFT_PROMPT_SPEC,
  "report-outline-mg": MG_OUTLINE_PROMPT_SPEC,
  "report-block-mg": BLOCK_EDIT_MG_PROMPT_SPEC,
  // 경영관리 지표 단위 부분(카드 밖 표)의 문장 칸 채우기(R5c, 2026-10-16 — 지표당 1회)
  "report-unit-mg": UNIT_AI_PROMPT_SPEC,
  "match-knowledge": MATCH_PROMPT_SPEC,
  "describe-image": DESCRIBE_PROMPT_SPEC,
};

function set<S>(feature: string, schema: (p: PromptSet) => S): () => { prompts: PromptSet; schema: S } {
  return () =>
    cachedPrompt(feature, () => {
      const prompts = readPromptSet(feature, PROMPT_FEATURES[feature]);
      return { prompts, schema: schema(prompts) };
    });
}

/** 과제원장 AI 작성지원(개선 제안·실적 발굴·실적 반영) */
export const assistPrompts = set("card-assist", (p) => writerResultSchema(p.schema));
/** AI 작성지원 「질문」 */
export const chatPrompts = set("card-chat", (p) => chatResultSchema(p.schema));
/** 드래그 「AI 수정 요청」·「질문」 코멘트 처리 */
export const commentPrompts = set("card-comment", (p) => commentResultSchema(p.schema));
/** 경영관리 카드용(지침 08) — 작성지원·질문·코멘트. run.ts가 카드 종류로 고름 */
export const assistPromptsMg = set("card-assist-mg", (p) => writerResultSchema(p.schema));
export const chatPromptsMg = set("card-chat-mg", (p) => chatResultSchema(p.schema));
export const commentPromptsMg = set("card-comment-mg", (p) => commentResultSchema(p.schema));
/** 월간 점검 AI 초안 */
export const inspectPrompts = set("inspection", (p) => inspectOutputSchema(p.schema));
/** 경영관리 월간 점검 AI 초안(지침 13) — 주요사업 폴더와 별개라 주요사업 프롬프트·판은 그대로 */
export const inspectPromptsMg = set("inspection-mg", (p) => inspectMgOutputSchema(p.schema));
/** 경평 초안 과제별 초안 */
export const reportDraftPrompts = set("report-draft", (p) => sectionOutputSchema(p.schema));
/** 경평 초안 구성안(재료표·짜임 — 사람 승인 뒤 집필) */
export const reportOutlinePrompts = set("report-outline", (p) => compositionOutSchema(p.schema));
/** 경평 초안 블록 고치기(드래그 「AI 수정 요청」·「질문」) — 블록 안 필드 설명은 report-draft schema.md의 block.*. result = 추진성과 상자 고치기(2026-10-13, 주요사업만) */
export const reportBlockPrompts = set("report-block", (p) => ({ edit: blockEditSchema(p.schema, reportDraftPrompts().prompts.schema), ask: blockAskSchema(p.schema), shapes: blockShapesSchema(p.schema, reportDraftPrompts().prompts.schema), result: resultEditSchema(p.schema) }));
/** 경영관리 경평 초안 집필(승인된 구성안의 절마다) — 블록 안 필드 설명은 report-draft schema.md의 block.*를 끼움 */
export const reportDraftPromptsMg = set("report-draft-mg", (p) => mgDraftOutSchema(p.schema));
/** 경영관리 경평 초안 구성안(평가내용·대주제·절 + 절마다 블록·재료) */
export const reportOutlinePromptsMg = set("report-outline-mg", (p) => mgOutlineOutSchema(p.schema));
/** 경영관리 경평 초안 블록 고치기 — 주요사업과 같은 답 스키마, 블록 필드 설명은 경영관리 집필(report-draft-mg schema.md의 block.* — 표 모양이 든 variant 설명, 2026-10-12) */
export const reportBlockPromptsMg = set("report-block-mg", (p) => ({ edit: blockEditSchema(p.schema, reportDraftPromptsMg().prompts.schema), ask: blockAskSchema(p.schema), shapes: blockShapesSchema(p.schema, reportDraftPromptsMg().prompts.schema) }));

/** 경영관리 지표 단위 부분(지적사항 조치실적·전년 대비·성과분석 및 환류)의 AI 문장 칸 채우기(R5c — 행 열쇠·칸별 글) */
export const reportUnitPromptsMg = set("report-unit-mg", (p) => unitAiOutSchema(p.schema));

/** 과제 대응 매칭(카드 × 공통 지식 조각 — 백그라운드 처리기, light 모델) */
export const matchPrompts = set("match-knowledge", (p) => matchResultSchema(p.schema));

/** 첨부 그림 설명(이미지·스캔 PDF를 글로 옮김 — 올릴 때·요청 때 API 경로, light 모델) */
export const describePrompts = set("describe-image", (p) => describeResultSchema(p.schema));
