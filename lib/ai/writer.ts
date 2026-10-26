// 과제관리카드 AI 작성지원 — 담당자 작성지원 지침(09, 주요사업)을 따르는 요청 만들기와 결과 검증(순수 함수).
// AI에 보내는 지시문(적응문·요청 문구·답 필드 설명)은 resources/prompts/card-assist(와 _shared)에 있고, 여기는 조건·반복·데이터 풀이만.
// 모델 호출은 lib/ai/run.ts, 근거 자료 모으기는 lib/ai/context.ts가 합니다.

import { z } from "zod";
import { getAt } from "../cards/edit.ts";
import { isMgmtCard } from "../cards/mgmt-card.ts";
import { BUSINESSES } from "../knowledge/dictionaries.ts";
import { compactKey } from "../knowledge/normalize.ts";
import { flattenHtmlTables } from "../knowledge/rich-text.ts";
import { KB_SECTIONS } from "../knowledge/kb-sections.ts";
import { type Descriptions, type PromptSet, type PromptSpec, described, fillFrom } from "../prompts/template.ts";
import { FOLLOWUP_JUDGMENTS, type FollowupBasis, type VerifiedFollowup, followupBlock, verifyFollowup } from "./followup.ts";
import type { LooseJson } from "../loose-json.ts";

type Json = LooseJson;

/**
 * 요청 종류. label = 기록·프롬프트에 쓰는 이름, short = 칩(한 줄에 들어가게).
 * 지침 09의 정식 모드는 실적 반영(A)·실적 발굴(B)이고, 「개선 제안」은 지침 <작업절차>가 함께 붙이라는
 * 지적사항 환류·전략연계 점검·점검 대비 귀띔을 한 요청으로 묶은 것(옛 「점검 대비 리뷰」·「개선방향 제시」를 합침).
 * 칸 하나 다듬기는 드래그 「AI 수정 요청」(리뷰어)이 맡음
 */
export const WRITER_MODES = {
  improve: { label: "개선 제안", short: "개선 제안", hint: "지적사항 환류·전략연계·점검 기준으로 보완할 칸과 문장을 제안" },
  discover: { label: "실적 발굴(모드 B)", short: "실적 발굴", hint: "이번 달 넣을 활동을 제안(제안 수치는 표시)" },
  reflect: { label: "실적 반영(모드 A)", short: "실적 반영", hint: "첨부한 실적 자료의 수치만으로 이번 달 실적 초안" },
  followup: { label: "보완 점검(모드 C)", short: "보완 점검", hint: "최근 점검표의 보완 요구가 카드에 반영됐는지 스스로 점검(공식 판정 아님)" },
} as const;

/** 카드 반영 제안 상한(우선순위 순으로 받아 코드가 자름) */
export const SUGGESTION_MAX = 8;
export type WriterMode = keyof typeof WRITER_MODES;

/** AI에 붙일 수 있는 실적 자료(서버가 kordoc으로 글을 뽑고, 이미지는 그림 설명으로 글을 만듦 — 참고자료 4단계, API 경로에서만) */
export const ATTACH_EXTS = ["pdf", "hwp", "hwpx", "docx", "xlsx", "xls", "jpg", "jpeg", "png", "webp", "gif"] as const;
export const ATTACH_ACCEPT = ATTACH_EXTS.map((e) => `.${e}`).join(",");
export const ATTACH_LABEL = "PDF·한글(HWP·HWPX)·워드·엑셀·이미지(JPG·PNG)";
export function isAttachableName(name: string): boolean {
  return (ATTACH_EXTS as readonly string[]).includes(name.toLowerCase().split(".").pop() ?? "");
}

/** AI에 넣는 첨부 글(앱이 kordoc으로 뽑은 전체 글 — 자르지 않음, PDF 원본은 보내지 않음: 참고자료 설계 D2) */
export type PromptFile = { name: string; text: string };

/**
 * 첨부 자료 → 프롬프트 줄(작성지원·질문·코멘트 공용). 공통 지식과 같은 <source> 봉투에 key file:N(1부터)으로 넣어
 * 인용(citations·source_keys)도 공통 지식처럼 원문과 대조합니다(lib/ai/material-text.ts fileRefs와 같은 열쇠)
 */
export function filesBlock(p: PromptSet, files: PromptFile[]): string[] {
  if (!files.length) return [];
  return [
    "",
    fillFrom(p, "request", "files.head", { count: files.length }),
    ...files.map((f, i) => `<source key="file:${i + 1}" title="${escapeXml(f.name)}" kind="카드 전용 자료">\n${escapeXml(flattenHtmlTables(f.text))}\n</source>`),
  ];
}

/** 작성지원 프롬프트 파일(resources/prompts/card-assist)에 있어야 하는 절 — files.*는 질문(card-chat)도 같은 이름 */
export const FILES_SECTIONS = ["files.head"] as const;
export const ASSIST_PROMPT_SPEC: PromptSpec = {
  system: ["system"],
  request: ["prompt", "note.given", "note.inPaste", "note.none", "task.improve", "task.discover", "task.reflect", "task.followup", "paste", "followup.head", "followup.row", "followup.recheck", ...FILES_SECTIONS, ...KB_SECTIONS],
  schema: ["headline", "summary", "citations", "citations.key", "citations.quote", "suggestions", "suggestions.target_path", "suggestions.period", "suggestions.proposed", "suggestions.reason", "suggestions.source_keys", "monthly_row", "need_input", "followup", "followup.id", "followup.judgment", "followup.card_quote", "followup.inspection_quote", "followup.remaining"],
};

/** 작성지원 답 스키마. desc(schema.md)를 주면 모델에 보내는 필드 설명을 붙이고, 없으면 구조만(타입·검증용) */
export function writerResultSchema(desc?: Descriptions) {
  const d = <T extends z.ZodType>(s: T, key: string) => described(s, desc, key);
  return z.object({
    headline: d(z.string(), "headline"),
    summary: d(z.string(), "summary"),
    citations: d(z.array(z.object({ key: d(z.string(), "citations.key"), quote: d(z.string(), "citations.quote") })), "citations"),
    suggestions: d(
      z.array(
        z.object({
          kind: z.enum(["replace", "insert_after", "monthly"]),
          target_path: d(z.string().nullable(), "suggestions.target_path"),
          period: d(z.string().nullable(), "suggestions.period"),
          proposed: d(z.array(z.string()), "suggestions.proposed"),
          reason: d(z.string(), "suggestions.reason"),
          source_keys: d(z.array(z.string()), "suggestions.source_keys"),
        }),
      ),
      "suggestions",
    ),
    monthly_row: d(z.object({ month: z.string(), activity: z.string(), quantitative: z.string(), qualitative: z.string(), progress: z.string(), risk: z.string() }).nullable(), "monthly_row"),
    need_input: d(z.string().nullable(), "need_input"),
    followup: d(
      z
        .array(
          z.object({
            id: d(z.string(), "followup.id"),
            judgment: d(z.enum(FOLLOWUP_JUDGMENTS), "followup.judgment"),
            card_quote: d(z.string(), "followup.card_quote"),
            inspection_quote: d(z.string(), "followup.inspection_quote"),
            remaining: d(z.string(), "followup.remaining"),
          }),
        )
        .nullable(),
      "followup",
    ),
  });
}
export const WriterResultSchema = writerResultSchema();
export type WriterResult = z.infer<typeof WriterResultSchema>;

export interface KnowledgeRef {
  key: string;
  title: string;
  unitType: string;
  text: string;
  /** 조각 머리말(문서·지표·평가내용·등급) — 월간 점검 근거에서 위치로 보임 */
  where?: string;
  /** 조각 부가 정보(붙임2 사례: 기관명·주요사업·등급·KCA 여부) */
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 요청 만들기

/** 경영관리 카드 → 칸 경로별 글(과제 개요·전년도 환류·지적 및 개선방안·추진내용·월별 실적·계량 성과지표·추진성과 — Plan·Check·전략 연계성 칸은 없음) */
function mgmtOutline(card: Json, out: string[], put: (path: string, v: unknown) => void, lines: (base: string, arr: Json) => void): string {
  out.push(`## 과제 기본정보`);
  put("title", card.title);
  out.push(`(과제번호 ${card.taskNo}${card.indicatorName ? ` · 지표 ${card.indicatorNo} ${card.indicatorName}` : ""}${card.bundle ? ` · ${card.bundle}` : ""}${card.indicatorNo >= 12 ? " · 혁신가점" : ""})`);
  put("deptText", card.deptText || card.department);
  put("@person", [card.manager, card.writer].filter(Boolean).join(" / "));
  out.push(`## 과제 개요`);
  (card.overview?.cells ?? []).forEach((t: string, i: number) => put(`overview.cells.${i}`, t));
  const pairs = (key: "feedback" | "findings", title: string, left: string, right: string) => {
    out.push(`## ${title}`);
    (card[key]?.rows ?? []).forEach((r: Json, i: number) => {
      out.push(`(${i + 1}행 — ${left})`);
      lines(`${key}.rows.${i}.${left === "지적사항" ? "finding" : "self"}`, r[left === "지적사항" ? "finding" : "self"]);
      out.push(`(${i + 1}행 — ${right})`);
      lines(`${key}.rows.${i}.plan`, r.plan);
    });
  };
  pairs("feedback", "전년도 환류 — '25년 자체평가 | '26년 개선방안", "자체평가", "개선방안");
  pairs("findings", "지적 및 개선방안 — '25년 지적사항 | '26년 개선방안", "지적사항", "개선방안");
  out.push(`## 추진내용`);
  lines("do.lines", card.do?.lines);
  (card.do?.monthly ?? []).forEach((m: Json, i: number) => {
    out.push(`## 월별 실적 — ${m.period}`);
    put(`do.monthly.${i}.period`, m.period);
    lines(`do.monthly.${i}.items`, m.items);
  });
  out.push(`## 계량 성과지표`);
  const cols: string[] = card.kpi?.columns ?? ["name", "prev", "target"];
  (card.kpi?.rows ?? []).forEach((r: Json, i: number) => {
    cols.forEach((c) => put(`kpi.rows.${i}.${c === "name" ? "nameRaw" : c}`, c === "name" ? r.nameRaw : r[c]));
    if (typeof r.sub === "string" && r.sub.trim()) out.push(`(지표 ${i + 1}의 부칸 — 편집 칸 아님 | ${r.sub.replace(/\n/g, " / ")})`);
  });
  out.push(`## 추진성과 — 정량`);
  lines("outcome.quantitative", card.outcome?.quantitative);
  out.push(`## 추진성과 — 정성`);
  lines("outcome.qualitative", card.outcome?.qualitative);
  return out.join("\n");
}

/** 카드 JSON → 칸 경로별 글(모델이 경로를 그대로 쓰도록) */
export function cardOutline(card: Json): string {
  const out: string[] = [];
  const put = (path: string, v: unknown) => {
    if (typeof v === "string" && v.trim()) out.push(`${path} | ${v.replace(/\n/g, " / ")}`);
  };
  const lines = (base: string, arr: Json) => {
    (arr ?? []).forEach((ln: Json, i: number) => {
      if (typeof ln === "string") put(`${base}.${i}`, ln);
      else if (ln && typeof ln === "object" && "table" in ln) {
        out.push(`${base}.${i} | [표]`);
        ln.table.rows.forEach((row: Json[], r: number) =>
          row.forEach((cell: Json, c: number) => lines(`${base}.${i}.table.rows.${r}.${c}.lines`, cell.lines)),
        );
      } else if (ln && typeof ln === "object" && "image" in ln) out.push(`${base}.${i} | [그림]`);
    });
  };
  if (isMgmtCard(card)) return mgmtOutline(card, out, put, lines);
  out.push(`## 과제 기본정보`);
  put("title", card.title);
  const biz = BUSINESSES.find((b) => b.cardGroup && b.cardGroup === card.group);
  out.push(`(과제번호 ${card.taskNo}${biz ? ` · 주요사업 ${biz.name2026}` : ""} · 대상사업 ${card.targetBusiness ?? ""} · 실행과제 ${card.executionTaskNo ?? ""}. ${card.executionTask ?? ""})`);
  put("deptText", card.deptText || card.department);
  put("@person", [card.manager, card.writer].filter(Boolean).join(" / "));
  out.push(`## 과제 개요`);
  (card.overview?.cells ?? []).forEach((t: string, i: number) => put(`overview.cells.${i}`, t));
  out.push(`## 계량 성과지표`);
  put("kpi.categoriesText", card.kpi?.categoriesText);
  const cols: string[] = card.kpi?.columns ?? ["name", "formula", "prev", "target"];
  (card.kpi?.rows ?? []).forEach((r: Json, i: number) => cols.forEach((c) => put(`kpi.rows.${i}.${c === "name" ? "nameRaw" : c}`, c === "name" ? r.nameRaw : r[c])));
  out.push(`## 전략 연계성`);
  (card.strategy?.nationalAgenda ?? []).forEach((a: Json, i: number) => put(`strategy.nationalAgenda.${i}.title`, `${(a.badges ?? []).join(" ")} ${a.title ?? ""}`.trim()));
  put("strategy.esgText", card.strategy?.esgText);
  put("strategy.ai.text", card.strategy?.ai?.text);
  out.push(`## [Act] 전년도 환류 — 경영평가 지적사항`);
  lines("act.findings", card.act?.findings);
  out.push(`## [Act] 전년도 환류 — '25년 추진 결과 자체평가`);
  lines("act.selfAssessment", card.act?.selfAssessment);
  out.push(`## [Plan] 조치 및 개선방향`);
  lines("plan.lines", card.plan?.lines);
  out.push(`## [Do] 추진내용`);
  lines("do.lines", card.do?.lines);
  (card.do?.monthly ?? []).forEach((m: Json, i: number) => {
    out.push(`## [Do] 월별 실적 — ${m.period}`);
    put(`do.monthly.${i}.period`, m.period);
    lines(`do.monthly.${i}.items`, m.items);
  });
  out.push(`## [Check] 성과점검`);
  lines("check.items", card.check?.items);
  out.push(`## 추진성과 — 정량`);
  lines("outcome.quantitative", card.outcome?.quantitative);
  out.push(`## 추진성과 — 정성`);
  lines("outcome.qualitative", card.outcome?.qualitative);
  return out.join("\n");
}

/** kordoc 마크다운의 HTML 표(병합 칸)를 모델이 읽기 쉬운 줄 표(칸 | 칸)로 — 공통 지식 화면과 같은 풀이(lib/knowledge/rich-text.ts) */
export { flattenHtmlTables };

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function knowledgeBlock(refs: KnowledgeRef[]): string {
  if (!refs.length) return "(제공된 근거 자료 없음)";
  // kordoc HTML 표·<br>·이스케이프는 줄 글로 풀어서(태그 잡음 없이). 인용 대조도 같은 풀이로 함(verifyResult)
  return refs.map((r) => `<source key="${escapeXml(r.key)}" title="${escapeXml(r.title)}"${r.where ? ` where="${escapeXml(r.where)}"` : ""}>\n${escapeXml(flattenHtmlTables(r.text))}\n</source>`).join("\n");
}

/** 요청 칸 글자 수 한도: 보통은 요청 내용 2천 자, 실적 반영은 요청 칸에 실적 문장·수치를 붙여 넣으므로 2만 자(화면 maxLength와 서버가 같은 값) */
export const ASSIST_TEXT_MAX = { note: 2000, reflect: 20_000 } as const;

export interface WriterRequest {
  mode: WriterMode;
  note: string;
  periodLabel: string;
  /** 실적 반영: 요청 칸에 붙여 넣은 실적 문장·수치(요청이 함께 적혀 있을 수 있음) */
  attachmentText: string | null;
  /** 첨부 파일(이 카드의 카드 전용 자료 중 사람이 빼지 않은 것 전부 — 전체 글) */
  files: PromptFile[];
  /** 보완 점검: 최종 점검표에서 뽑은 미흡 행(서버가 채움 — followup 요청일 때만) */
  followup?: FollowupBasis | null;
}

/** kb = 이 과제 기준 공통 지식 목록(lib/knowledge/bundle.ts listText — 공통 지식 ①~③ 글은 요청 앞에 따로 붙음) */
export function userPrompt(p: PromptSet, card: Json, kb: string, req: WriterRequest): string {
  const r = (key: string, vars: Record<string, string | number> = {}) => fillFrom(p, "request", key, vars);
  const note = req.note.trim() ? r("note.given", { note: req.note.trim() }) : req.attachmentText ? r("note.inPaste") : r("note.none");
  const parts = [r("prompt", { label: WRITER_MODES[req.mode].label, task: r(`task.${req.mode}`), period: req.periodLabel, note, card: cardOutline(card), refs: kb })];
  if (req.attachmentText) parts.push("", r("paste", { text: escapeXml(req.attachmentText.slice(0, ASSIST_TEXT_MAX.reflect)) }));
  if (req.mode === "followup" && req.followup) parts.push("", followupBlock(p, req.followup));
  parts.push(...filesBlock(p, req.files));
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// 결과 검증: 모델이 만든 인용·경로를 믿지 않고 원문·카드와 대조

export interface VerifiedCitation {
  key: string;
  title: string;
  quote: string;
  verified: boolean;
}

export interface VerifiedSuggestion {
  kind: "replace" | "insert_after" | "monthly";
  targetPath: string | null;
  period: string | null;
  current: string | null;
  proposed: string[];
  reason: string;
  sourceKeys: string[];
  /** 카드에 바로 반영할 수 있는지(경로가 실제 글 칸인지) */
  applicable: boolean;
}

export interface VerifiedResult {
  headline: string;
  summary: string;
  citations: VerifiedCitation[];
  suggestions: VerifiedSuggestion[];
  monthlyRow: WriterResult["monthly_row"];
  needInput: string | null;
  /** 보완 점검의 대조표(다른 요청 종류·옛 기록은 없음/null) */
  followup?: VerifiedFollowup | null;
}

const PATH_RE = /^(title|deptText|@person|overview\.cells\.\d+|kpi\.(categoriesText|rows\.\d+\.(nameRaw|formula|prev|target|expected))|strategy\.(esgText|ai\.text|nationalAgenda\.\d+\.title)|(act\.(findings|selfAssessment)|plan\.lines|feedback\.rows\.\d+\.(self|plan)|findings\.rows\.\d+\.(finding|plan)|do\.lines|check\.items|outcome\.(quantitative|qualitative)|do\.monthly\.\d+\.items)(\.\d+\.table\.rows\.\d+\.\d+\.lines)*\.\d+|do\.monthly\.\d+\.period)$/;

export function verifyResult(result: WriterResult, card: Json, refs: KnowledgeRef[], followup?: FollowupBasis | null): VerifiedResult {
  const byKey = new Map(refs.map((r) => [r.key, r]));
  const citations = result.citations
    .filter((c) => byKey.has(c.key) && c.quote.trim())
    .map((c) => {
      const ref = byKey.get(c.key)!;
      const q = compactKey(c.quote.replace(/[「」]/g, ""));
      return { key: c.key, title: ref.title, quote: c.quote.trim(), verified: q.length >= 6 && compactKey(flattenHtmlTables(ref.text)).includes(q) };
    });
  const suggestions = result.suggestions
    .filter((s) => s.proposed.some((p) => p.trim()))
    .map((s) => {
      const proposed = s.proposed.map((p) => p.trim()).filter(Boolean);
      const sourceKeys = s.source_keys.filter((k) => byKey.has(k));
      if (s.kind === "monthly") {
        return { kind: s.kind, targetPath: null, period: (s.period ?? "").trim() || null, current: null, proposed, reason: s.reason, sourceKeys, applicable: Boolean((s.period ?? "").trim()) };
      }
      const path = (s.target_path ?? "").trim();
      const current = path ? getAt(card, path) : undefined;
      const lineOk = path === "@person" || (PATH_RE.test(path) && typeof current === "string");
      return { kind: s.kind, targetPath: path || null, period: null, current: typeof current === "string" ? current : null, proposed, reason: s.reason, sourceKeys, applicable: lineOk };
    });
  return {
    headline: result.headline,
    summary: result.summary,
    citations,
    suggestions: suggestions.slice(0, SUGGESTION_MAX),
    monthlyRow: result.monthly_row,
    needInput: result.need_input,
    followup: followup ? verifyFollowup(result.followup, followup, cardOutline(card)) : null,
  };
}

/** 보완 점검인데 점검표의 미흡 행이 없을 때 — AI를 부르지 않고 코드가 만든 결과 */
export function noRequirementResult(b: FollowupBasis): VerifiedResult {
  return {
    headline: `${b.period} 점검표에는 보완 요구가 없습니다`,
    summary: "점검표의 미흡 항목이 없어 대조할 보완 요구가 없습니다. 이번 달 실적 정리(모드 A)나 실적 발굴(모드 B)은 도와드릴 수 있습니다.",
    citations: [],
    suggestions: [],
    monthlyRow: null,
    needInput: null,
    followup: verifyFollowup([], { ...b, rows: [] }, ""),
  };
}
