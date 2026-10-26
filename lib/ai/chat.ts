// 과제관리카드 「AI 작성지원 › 질문」 — 담당자 작성지원 지침(09)을 채팅으로(개선안을 마크다운으로 받아 보기). 순수 함수.
// 같은 옆 창의 요청 종류(구조화 제안·반영 버튼)와 한 대화 흐름이고(앞의 요청·답을 이력으로 받음), 카드는 고치지 않고 개선안만 보여 줍니다.
// 리뷰어(드래그 → AI 직접 수정)와는 별개입니다.
// 모델 호출은 lib/ai/run.ts(callChat), 근거 자료는 lib/ai/context.ts(gatherCardKnowledge)가 모읍니다. 지시문은 resources/prompts/card-chat.

import { z } from "zod";
import { type InspectionResult, TABLE_KEYS, directionLines, formTablesOf, remedyText, tally } from "../inspections/model.ts";
import { type Descriptions, type PromptSet, type PromptSpec, described, fillFrom } from "../prompts/template.ts";
import { KB_SECTIONS } from "../knowledge/kb-sections.ts";
import { FILES_SECTIONS, type PromptFile, cardOutline, filesBlock } from "./writer.ts";
import type { LooseJson } from "../loose-json.ts";


/** 질문 프롬프트 파일(resources/prompts/card-chat)에 있어야 하는 절 */
export const CHAT_PROMPT_SPEC: PromptSpec = {
  system: ["system"],
  request: ["prompt", "history.head", "history.user", "history.ai", "question", ...FILES_SECTIONS, ...KB_SECTIONS],
  schema: ["answer"],
};

/** 질문 답 스키마. desc(schema.md)를 주면 모델에 보내는 필드 설명을 붙이고, 없으면 구조만 */
export function chatResultSchema(desc?: Descriptions) {
  return z.object({ answer: described(z.string(), desc, "answer") });
}
export const ChatResultSchema = chatResultSchema();
export type ChatResult = z.infer<typeof ChatResultSchema>;

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

/** 질문 예시(지침 09의 작업) — 화면의 빠른 질문 단추는 요청 종류와 겹쳐 없앴고, 연기 시험(scripts/smoke/ai-chat-smoke.ts)의 질문으로만 씀 */
export const QUICK_PROMPTS = [
  {
    key: "improve",
    label: "카드 전체 개선안",
    text: "지침의 점검기준(정합성 5·우수사례 7대 축·평가위원 질의 패턴 8)과 지적사항 환류·전략연계 점검에 비추어 이 카드의 개선안을 정리해 주세요. 먼저 보완할 칸 3~5개를 우선순위로 표(칸 | 지금 | 보완안 | 근거)로 보여 주고, 칸마다 바로 옮길 문장 예시를 붙여 주세요.",
  },
  { key: "discover", label: "이번 달 실적 발굴(모드 B)", text: "모드 B: 이번 달 카드에 넣을 실적과 다음 단계를 제안해 주세요. 제안 수치는 라벨로 구분해 주세요." },
  { key: "findings", label: "지적사항 환류 점검", text: "지적사항 환류: 이 과제와 관련된 지적사항을 근거 자료에서 인용하고, [Act] 전년도 환류와 [Plan] 조치 및 개선방향이 1:1로 이어지는지 점검해 개선방향을 제시해 주세요." },
  { key: "strategy", label: "전략연계 점검", text: "전략연계 점검: 국정과제·ESG·AI활용(AX) 연계가 카드에 제대로 적혀 있는지 보고, 빠지거나 약한 곳을 보완해 주세요." },
  { key: "inspection", label: "점검결과 보기", text: "점검결과 보여줘: 성과관리팀의 최근 점검 결과를 보여 주세요." },
] as const;

export const CHAT_LIMITS = { question: 4000, turns: 8, answer: 6000, history: 24_000 } as const;

/** 받은 대화 이력 정리: 역할·글만, 최근 턴만, 길이 제한 */
export function cleanHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns = (raw as Array<{ role?: unknown; text?: unknown } | null | undefined>)
    .filter((t): t is { role: ChatTurn["role"]; text: string } => !!t && (t.role === "user" || t.role === "assistant") && typeof t.text === "string" && !!t.text.trim())
    .map((t) => ({ role: t.role, text: String(t.text).slice(0, t.role === "user" ? CHAT_LIMITS.question : CHAT_LIMITS.answer) }))
    .slice(-CHAT_LIMITS.turns);
  // 뒤에서부터 합계 제한
  const out: ChatTurn[] = [];
  let total = 0;
  for (const t of [...turns].reverse()) {
    if (total + t.text.length > CHAT_LIMITS.history) break;
    out.unshift(t);
    total += t.text.length;
  }
  return out;
}

/** 점검표 → 대화 근거(총평·수치·미흡 항목 보완방안) */
export function inspectionBrief(ins: { period: string; status: string; result: InspectionResult } | null): string {
  if (!ins) return "(받은 점검 없음)";
  const r = ins.result;
  const t = tally(r);
  const lines = [
    `${ins.period} 점검(${ins.status === "draft" ? "초안" : ins.status === "sent" ? "부서에 보냄" : "부서 확인함"}) — 7대축 ${t.tables.axes.met}/7 · 질의패턴 ${t.tables.patterns.met}/8 · 정합성 ${t.tables.coherence.met}/5 · 보완 ${t.needs}건${t.focus ? " · 집중보완" : ""}`,
    `추진현황: ${r.overview.status || "—"}`,
    `개선방향: ${directionLines(r.overview.direction).join(" / ") || "—"}`,
  ];
  const tables = formTablesOf(r.form);
  for (const k of TABLE_KEYS)
    r[k].forEach((row, i) => {
      if (row.judgment === "미흡") lines.push(`[${tables[k].short} ${i + 1} ${tables[k].rows[i].name} — 미흡] ${remedyText(k, row).replace(/\n/g, " / ")}`);
    });
  return lines.join("\n");
}

export interface ChatRequest {
  question: string;
  history: ChatTurn[];
  periodLabel: string;
  inspection: string;
  /** 이 질문에 붙인 카드 전용 자료(작성지원과 같은 표기 — writer.filesBlock) */
  files?: PromptFile[];
}

/** kb = 이 과제 기준 공통 지식 목록(lib/knowledge/bundle.ts listText — ①~③ 글은 요청 앞에 따로) */
export function chatPrompt(p: PromptSet, card: LooseJson, kb: string, req: ChatRequest): string {
  const r = (key: string, vars: Record<string, string | number> = {}) => fillFrom(p, "request", key, vars);
  const parts = [r("prompt", { period: req.periodLabel, card: cardOutline(card), inspection: req.inspection, refs: kb }), ...filesBlock(p, req.files ?? [])];
  if (req.history.length) {
    parts.push("", r("history.head"));
    for (const t of req.history) parts.push(r(t.role === "user" ? "history.user" : "history.ai", { text: t.text }));
  }
  parts.push("", r("question", { question: req.question.trim() }));
  return parts.join("\n");
}

// 대화 내려받기(.md)는 요청 종류와 질문을 함께 담는 lib/ai/assist-thread.ts의 threadMarkdown
