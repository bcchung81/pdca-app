// 카드 리뷰어 코멘트 → AI 한 번에 처리(report-harness 리뷰어의 「코멘트 → Claude가 문서를 직접 고침」을 카드에 옮긴 것).
// 요청 만들기와 결과 검증만 하는 순수 함수입니다. 모델 호출은 lib/ai/run.ts, 카드에 합치기는 lib/cards/patch.ts. 지시문은 resources/prompts/card-comment.

import { z } from "zod";
import { pathLabel, sectionTitle } from "../cards/path-label.ts";
import { type CardEdit, type EditTarget, valueAt } from "../cards/patch.ts";
import { type Descriptions, type PromptSet, type PromptSpec, described, fillFrom } from "../prompts/template.ts";
import { KB_SECTIONS } from "../knowledge/kb-sections.ts";
import { FILES_SECTIONS, type PromptFile, filesBlock } from "./writer.ts";
import type { LooseJson } from "../loose-json.ts";

type Json = LooseJson;

/** AI에 보내는 코멘트 종류. 「삭제」는 화면에서 바로 지우고, 「좋음」은 유지할 부분으로만 함께 보냅니다 */
export const COMMENT_KINDS = { edit: "수정", ask: "질문" } as const;
export type CommentKind = keyof typeof COMMENT_KINDS;

export interface CommentInput {
  id: string;
  kind: CommentKind;
  /** 고른 글이 있는 첫 칸(없으면 카드 전체) */
  path: string | null;
  /** 고른 글이 걸친 칸들 */
  paths: string[];
  quote: string;
  text: string;
}

export interface KeepInput {
  path: string;
  quote: string;
}

export const COMMENT_LIMITS = { comments: 12, text: 2000, quote: 400, keeps: 20 } as const;

/** 드래그 코멘트 프롬프트 파일(resources/prompts/card-comment)에 있어야 하는 절 */
export const COMMENT_PROMPT_SPEC: PromptSpec = {
  system: ["system"],
  request: ["prompt", "comment.wholeCard", "comment.paths", "comment.quote", "comment.text", "comment.emptyEdit", "comment.empty", "keeps.head", "keeps.item", "refs", ...FILES_SECTIONS, ...KB_SECTIONS],
  schema: ["results", "results.comment_id", "results.outcome", "results.edits", "results.edits.path", "results.edits.lines", "results.reply"],
};

/** 코멘트 처리 답 스키마. desc(schema.md)를 주면 모델에 보내는 필드 설명을 붙이고, 없으면 구조만 */
export function commentResultSchema(desc?: Descriptions) {
  const d = <T extends z.ZodType>(s: T, key: string) => described(s, desc, key);
  return z.object({
    results: d(
      z.array(
        z.object({
          comment_id: d(z.string(), "results.comment_id"),
          outcome: d(z.enum(["edited", "answered", "declined"]), "results.outcome"),
          edits: d(z.array(z.object({ path: d(z.string(), "results.edits.path"), op: z.enum(["replace", "insert_after", "delete"]), lines: d(z.array(z.string()), "results.edits.lines") })), "results.edits"),
          reply: d(z.string(), "results.reply"),
        }),
      ),
      "results",
    ),
  });
}
export const CommentResultSchema = commentResultSchema();
export type CommentResult = z.infer<typeof CommentResultSchema>;

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 편집할 수 있는 칸 전부를 문서 순서로: 경로 [줄|칸] | 글 */
export function commentOutline(card: Json, targets: Map<string, EditTarget>): string {
  const out: string[] = [];
  let section = "";
  for (const [path, t] of targets) {
    const s = sectionTitle(path, card);
    if (s !== section) {
      section = s;
      out.push(`## ${s}`);
    }
    const v = valueAt(card, path);
    const text = typeof v === "string" ? v.replace(/\n/g, " / ") : "";
    out.push(`${path} [${t.line ? "줄" : "칸"}${t.locked ? "·잠김" : ""}] | ${text || "(빈 칸)"}`);
  }
  return out.join("\n");
}

export interface CommentRequest {
  periodLabel: string;
  comments: CommentInput[];
  keeps: KeepInput[];
  /** 이 카드의 카드 전용 자료 전부(전체 글 — 작성지원과 같은 봉투, 참고자료 설계 1단계) */
  files?: PromptFile[];
}

/** kb = 이 과제 기준 공통 지식 목록(lib/knowledge/bundle.ts listText — ①~③ 글은 요청 앞에 따로) */
export function commentPrompt(p: PromptSet, card: Json, targets: Map<string, EditTarget>, kb: string, req: CommentRequest): string {
  const r = (key: string, vars: Record<string, string | number> = {}) => fillFrom(p, "request", key, vars);
  const parts = [r("prompt", { period: req.periodLabel, taskNo: card.taskNo ?? "", title: card.title ?? "", card: commentOutline(card, targets) })];
  for (const c of req.comments) {
    const at = c.path ? `${c.path} (${pathLabel(c.path, card)})` : r("comment.wholeCard");
    parts.push(`<comment id="${escapeXml(c.id)}" kind="${COMMENT_KINDS[c.kind]}" at="${escapeXml(at)}">`);
    if (c.paths.length > 1) parts.push(r("comment.paths", { paths: c.paths.join(", ") }));
    if (c.quote) parts.push(r("comment.quote", { quote: escapeXml(c.quote) }));
    parts.push(r("comment.text", { text: escapeXml(c.text || r(c.kind === "edit" ? "comment.emptyEdit" : "comment.empty")) }));
    parts.push("</comment>");
  }
  if (req.keeps.length) {
    parts.push("", r("keeps.head"));
    for (const k of req.keeps) parts.push(r("keeps.item", { path: k.path, quote: escapeXml(k.quote) }));
  }
  parts.push("", r("refs", { refs: kb }));
  parts.push(...filesBlock(p, req.files ?? []));
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// 결과 검증: 모델이 준 경로·조작을 믿지 않고 카드의 실제 편집 칸과 대조

export interface VerifiedEdit extends CardEdit {
  /** 사람이 읽는 자리 이름 */
  label: string;
  /** 고치기 전 글(없으면 null) */
  before: string | null;
}

export interface VerifiedComment {
  id: string;
  outcome: "edited" | "answered" | "declined";
  reply: string;
  edits: VerifiedEdit[];
  /** 경로·조작이 맞지 않아 뺀 편집 수 */
  dropped: number;
}

const MAX_EDITS = 30;
const MAX_LINES = 20;
const MAX_LINE = 1000;

export function verifyComments(result: CommentResult, card: Json, targets: Map<string, EditTarget>, comments: CommentInput[]): VerifiedComment[] {
  return comments.map((c) => {
    const r = result.results.find((x) => x.comment_id === c.id);
    if (!r) return { id: c.id, outcome: "declined", reply: "AI가 이 코멘트에 답하지 않았습니다. 다시 보내 주세요.", edits: [], dropped: 0 };
    const reply = r.reply.trim().slice(0, 2000);
    if (c.kind === "ask") return { id: c.id, outcome: r.outcome === "declined" ? "declined" : "answered", reply, edits: [], dropped: r.edits.length };
    const seen = new Set<string>();
    const edits: VerifiedEdit[] = [];
    let dropped = 0;
    for (const e of r.edits.slice(0, MAX_EDITS)) {
      const path = e.path.trim();
      const t = targets.get(path);
      const lines = e.op === "delete" ? [] : e.lines.map((l) => l.slice(0, MAX_LINE)).filter((l) => l.trim()).slice(0, MAX_LINES);
      const key = `${path}|${e.op}|${lines.join("\n")}`;
      const bad = !t || t.locked || (!t.line && e.op !== "replace") || (e.op !== "delete" && !lines.length) || seen.has(key);
      const before = t ? valueAt(card, path) : undefined;
      // 바꾸기인데 글이 그대로면 뺌
      const noop = e.op === "replace" && typeof before === "string" && lines.length === 1 && lines[0].trim() === before.trim();
      if (bad || noop) {
        dropped += bad ? 1 : 0;
        continue;
      }
      seen.add(key);
      edits.push({ path, op: e.op, lines, label: pathLabel(path, card), before: typeof before === "string" ? before : null });
    }
    dropped += Math.max(0, r.edits.length - MAX_EDITS);
    if (edits.length) return { id: c.id, outcome: "edited", reply, edits, dropped };
    if (r.outcome === "edited") return { id: c.id, outcome: "declined", reply: `${reply}${reply ? " " : ""}(고칠 칸을 카드에서 확인하지 못해 반영하지 않았습니다.)`, edits: [], dropped };
    return { id: c.id, outcome: r.outcome, reply, edits: [], dropped };
  });
}

/** 서버 액션이 받은 코멘트 한 건(검증 전) */
interface RawComment {
  id?: unknown;
  kind?: unknown;
  path?: unknown;
  paths?: unknown;
  quote?: unknown;
  text?: unknown;
}

/** 요청 검사(서버 액션 입구): 형식·길이·개수 */
export function readCommentInput(raw: unknown): { comments: CommentInput[]; keeps: KeepInput[] } | string {
  if (!raw || typeof raw !== "object") return "코멘트를 읽지 못했습니다.";
  const o = raw as { comments?: unknown; keeps?: unknown };
  if (!Array.isArray(o.comments) || !o.comments.length) return "보낼 코멘트가 없습니다.";
  if (o.comments.length > COMMENT_LIMITS.comments) return `코멘트는 한 번에 ${COMMENT_LIMITS.comments}개까지 보낼 수 있습니다.`;
  const comments: CommentInput[] = [];
  for (const x of o.comments as Array<RawComment | null | undefined>) {
    if (!x || typeof x.id !== "string" || !((x.kind as string) in COMMENT_KINDS)) return "코멘트 형식이 맞지 않습니다.";
    const text = String(x.text ?? "").trim();
    if (x.kind === "ask" && !text) return "질문 내용을 적어 주세요.";
    comments.push({
      id: x.id.slice(0, 40),
      kind: x.kind as CommentInput["kind"],
      path: typeof x.path === "string" && x.path ? x.path.slice(0, 200) : null,
      paths: Array.isArray(x.paths) ? x.paths.filter((p: unknown) => typeof p === "string").slice(0, 30).map((p: string) => p.slice(0, 200)) : [],
      quote: String(x.quote ?? "").slice(0, COMMENT_LIMITS.quote),
      text: text.slice(0, COMMENT_LIMITS.text),
    });
  }
  const keeps: KeepInput[] = Array.isArray(o.keeps)
    ? (o.keeps as Array<{ path?: unknown; quote?: unknown } | null | undefined>)
        .filter((k): k is { path: string; quote?: unknown } => !!k && typeof k.path === "string")
        .slice(0, COMMENT_LIMITS.keeps)
        .map((k) => ({ path: k.path.slice(0, 200), quote: String(k.quote ?? "").slice(0, COMMENT_LIMITS.quote) }))
    : [];
  return { comments, keeps };
}
