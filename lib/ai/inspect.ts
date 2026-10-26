// 월간 점검 AI 초안 — 성과관리팀 종합점검 지침(14, 주요사업)의 점검 모드를 따르는 요청 만들기와 결과 검증(순수 함수).
// 모델 호출은 lib/ai/run.ts, 근거 조각 모으기는 lib/ai/context.ts(gatherInspectionKnowledge)가 합니다.
// 양식 고정 칸(구분·항목·정의)·사전점검 항목·사례제안(붙임2 미확보)·원문 대조는 모델이 아니라 이 코드가 정합니다.
// AI에 보내는 지시문(적응문·요청 문구·답 필드 설명)은 resources/prompts/inspection에 있습니다.

import { z } from "zod";
import { compactKey } from "../knowledge/normalize.ts";
import { flattenHtmlTables } from "../knowledge/rich-text.ts";
import {
  CASE_NO_SOURCE,
  type Evidence,
  FORM_ID,
  type FormId,
  type InspectionResult,
  JUDGMENTS,
  NOTICE_NO_PEER,
  PRE_MONTH_NOTE,
  type RowResult,
  TABLE_KEYS,
  type TableKey,
  applyPreMonth,
  cleanRow,
  emptyResult,
  emptyRow,
  formTablesOf,
} from "../inspections/model.ts";
import { type Descriptions, type PromptSet, type PromptSpec, described, fillFrom } from "../prompts/template.ts";
import { type KnowledgeRef, cardOutline } from "./writer.ts";
import type { LooseJson } from "../loose-json.ts";

type Json = LooseJson;

/** 월간 점검 프롬프트 파일(resources/prompts/inspection)에 있어야 하는 절 */
export const INSPECT_PROMPT_SPEC: PromptSpec = {
  system: ["system", "peer.none", "peer.ready", "peerNotice.none", "peerNotice.ready"],
  request: ["head", "period", "pre.yes", "pre.no", "task", "business", "sub", "sub.withList", "kind", "kind.none", "dept", "knowledge", "knowledge.peer", "knowledge.noPeer", "card", "refs", "peers"],
  schema: [
    "evidence.key",
    "evidence.quote",
    ...["no", "judgment", "question", "fix", "evidence", "card", "note"].map((k) => `row.${k}`),
    "coherence",
    "axes",
    "patterns",
    "status",
    "direction",
    "case",
    "case.key",
    "case.summary",
    "case.insight",
    "notices",
  ],
};

/**
 * 시스템 프롬프트 = system.md @system(점검 적응문 — 붙임2 유무로 두 벌) + 성과관리팀 종합점검 지침(14) 사본.
 * 적응문의 사례제안 안내·운영 알림 줄은 붙임2가 있을 때(peer.ready)와 없을 때(peer.none)로 갈림
 */
export function inspectSystemText(p: PromptSet, peer: boolean, guideline: string): string {
  const which = peer ? "ready" : "none";
  return fillFrom(p, "system", "system", {
    peer: fillFrom(p, "system", `peer.${which}`, { caseNoSource: CASE_NO_SOURCE }),
    peerNotice: fillFrom(p, "system", `peerNotice.${which}`),
    preMonthNote: PRE_MONTH_NOTE,
    guideline,
  });
}

/** 표 한 행의 답(판단·보완 재료) 스키마 — 주요사업·경영관리 점검 답이 함께 씀. desc를 주면 필드 설명을 붙임 */
export function inspectRowSchema(desc?: Descriptions) {
  const d = <T extends z.ZodType>(s: T, key: string) => described(s, desc, key);
  const EvidenceOut = z.object({ key: d(z.string(), "evidence.key"), quote: d(z.string(), "evidence.quote") });
  return z.object({
    no: d(z.number().int(), "row.no"),
    judgment: d(z.enum(JUDGMENTS), "row.judgment"),
    question: d(z.string(), "row.question"),
    fix: d(z.string(), "row.fix"),
    evidence: d(z.array(EvidenceOut), "row.evidence"),
    card: d(z.string(), "row.card"),
    note: d(z.string(), "row.note"),
  });
}

/** 점검 답 스키마. desc(schema.md)를 주면 모델에 보내는 필드 설명을 붙이고, 없으면 구조만(타입·검증용) */
export function inspectOutputSchema(desc?: Descriptions) {
  const d = <T extends z.ZodType>(s: T, key: string) => described(s, desc, key);
  const RowOut = inspectRowSchema(desc);
  return z.object({
    coherence: d(z.array(RowOut), "coherence"),
    axes: d(z.array(RowOut), "axes"),
    patterns: d(z.array(RowOut), "patterns"),
    status: d(z.string(), "status"),
    direction: d(z.string(), "direction"),
    case: d(z.object({ key: d(z.string(), "case.key"), summary: d(z.string(), "case.summary"), insight: d(z.string(), "case.insight") }), "case"),
    notices: d(z.array(z.string()), "notices"),
  });
}
export const InspectOutputSchema = inspectOutputSchema();
export type InspectOutput = z.infer<typeof InspectOutputSchema>;
/** 검증이 받는 답: 경영관리 점검 답(inspect-mg.ts)은 사례제안(case)이 없음 */
export type InspectOutputLike = Omit<InspectOutput, "case"> & Partial<Pick<InspectOutput, "case">>;

export interface InspectContext {
  /** 점검월 YYYY-MM */
  period: string;
  /** 점검일자 YYYY-MM-DD(서울) */
  today: string;
  preMonth: boolean;
  business: { id: string; name2026: string; name2025: string } | null;
  /** 이 주요사업의 세부 대상사업(카드 기본정보 '대상사업' 칸에 쓰는 이름들, 앱의 원장에서 모음) */
  subBusinesses: string[];
  /** 붙임2(유관기관 평가보고서 정리) 사례 조각이 근거에 있는가(refs에 unit_type peer_case) */
  hasPeerCases: boolean;
  /** 점검표 양식(비면 주요사업 biz14). 경영관리는 inspect-mg.ts의 MgmtInspectContext가 mgmt13으로 채움 */
  form?: FormId;
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 「붙임2 사례」: key·기관명·주요사업·등급·구분·KCA 여부와 잘한 점·아쉬운 점 */
export function peerCaseBlock(refs: KnowledgeRef[]): string {
  const peers = refs.filter((r) => r.unitType === "peer_case");
  if (!peers.length) return "(붙임2 미확보)";
  const attr = (v: unknown) => escapeXml(String(v ?? ""));
  return peers
    .map((r) => `<case key="${attr(r.key)}" org="${attr(r.meta?.org)}" business="${attr(r.meta?.business)}" grade="${attr(r.meta?.grade)}" kind="${attr(r.meta?.kind)}" kca="${r.meta?.kca ? "true" : "false"}">\n${escapeXml(r.text)}\n</case>`)
    .join("\n");
}

/** 「지식 조각」: key·제목·위치(조각 머리말)와 원문 */
export function inspectKnowledgeBlock(refs: KnowledgeRef[]): string {
  if (!refs.length) return "(제공된 지식 조각 없음)";
  return refs.map((r) => `<source key="${escapeXml(r.key)}" title="${escapeXml(r.title)}" where="${escapeXml(r.where ?? "")}">\n${escapeXml(flattenHtmlTables(r.text))}\n</source>`).join("\n");
}

const AX_BUDGET = 6_000;

/** 점검용 카드 글: 칸별 글(작성지원과 같은 풀이) + 붙임 · AX 연계과제 */
export function inspectionCardText(card: Json): string {
  const out = [cardOutline(card)];
  const ax: Json[] = Array.isArray(card?.axAttachments) && card.axAttachments.length ? card.axAttachments : card?.axAttachment ? [card.axAttachment] : [];
  if (ax.length) {
    out.push("## 붙임 · AX 연계과제");
    let left = AX_BUDGET;
    for (const a of ax) {
      const text = [
        `${a.marker ?? ""} ${a.title ?? ""}`.trim(),
        a.purpose ? `목적: ${a.purpose}` : "",
        ...(Array.isArray(a.sections) ? a.sections : []).flatMap((s: Json) => [s?.heading ? `[${s.heading}]` : "", ...(Array.isArray(s?.items) ? s.items : [])]),
      ]
        .filter((x) => typeof x === "string" && x.trim())
        .join("\n");
      if (text.length > left) {
        out.push(`${text.slice(0, Math.max(0, left))}\n(이하 줄임)`);
        break;
      }
      out.push(text);
      left -= text.length;
    }
  }
  return out.join("\n");
}

export function inspectionPrompt(p: PromptSet, card: Json, refs: KnowledgeRef[], ctx: InspectContext): string {
  const r = (key: string, vars: Record<string, string | number> = {}) => fillFrom(p, "request", key, vars);
  const b = ctx.business;
  const kind = [card?.overview?.kind, card?.overview?.term].filter(Boolean).join(" · ") || r("kind.none");
  const target = card?.targetBusiness ?? "—";
  const knowledge = refs.filter((x) => x.unitType !== "peer_case");
  const peers = refs.filter((x) => x.unitType === "peer_case");
  return [
    r("head"),
    r("period", { period: ctx.period, today: ctx.today, pre: r(ctx.preMonth ? "pre.yes" : "pre.no") }),
    r("task", { taskNo: card?.taskNo ?? "", title: card?.title ?? "" }),
    ...(b ? [r("business", { name2026: b.name2026, id: b.id, name2025: b.name2025 })] : []),
    ctx.subBusinesses.length ? r("sub.withList", { target, list: ctx.subBusinesses.join(" · ") }) : r("sub", { target }),
    r("kind", { kind, exec: [card?.executionTaskNo, card?.executionTask].filter(Boolean).join(". ") || "—" }),
    r("dept", { dept: card?.deptText || card?.department || "—" }),
    r("knowledge", { n: knowledge.length, peer: ctx.hasPeerCases ? r("knowledge.peer", { n: peers.length }) : r("knowledge.noPeer") }),
    "",
    r("card"),
    inspectionCardText(card),
    "",
    r("refs"),
    inspectKnowledgeBlock(knowledge),
    ...(ctx.hasPeerCases ? ["", r("peers"), peerCaseBlock(refs)] : []),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// 결과 검증: 양식 칸·사전점검·사례제안은 코드가 정하고, 인용은 원문과 대조

/** 인용이 원문에 있는가: 띄어쓰기·문장부호 무시, 「…」로 줄인 조각은 순서대로 모두 있어야 함 */
export function quoteFound(quote: string, text: string): boolean {
  const parts = quote
    .replace(/[「」『』]/g, "")
    .split(/…|\.{3}|⋯/)
    .map(compactKey)
    .filter((p) => p.length >= 2);
  if (parts.join("").length < 6) return false;
  // 조각의 HTML 표는 프롬프트와 같이 줄 글로 풀어 대조(태그 이름 글자가 끼지 않게)
  const hay = compactKey(flattenHtmlTables(text));
  let from = 0;
  for (const p of parts) {
    const i = hay.indexOf(p, from);
    if (i < 0) return false;
    from = i + p.length;
  }
  return true;
}

/** 근거 한 개를 지식 조각과 대조: 준 key에서 먼저 찾고, 없으면 다른 조각에서 찾아 바로잡음. 대조할 수 없는(키도 원문도 없는) 근거는 null */
export function checkEvidence(e: { key?: string | null; quote: string; source?: string }, refs: KnowledgeRef[]): Evidence {
  const quote = e.quote.trim().replace(/^「|」$/g, "");
  const source = e.source?.trim() ?? "";
  const byKey = e.key ? refs.find((r) => r.key === e.key) : undefined;
  if (byKey && quoteFound(quote, byKey.text)) return { source: source || byKey.title, quote, key: byKey.key, verified: true };
  const other = refs.find((r) => quoteFound(quote, r.text));
  if (other) return { source: other.title, quote, key: other.key, verified: true };
  if (byKey) return { source: source || byKey.title, quote, key: byKey.key, verified: false };
  return { source: source || "출처 확인 안 됨", quote, key: null, verified: e.key ? false : null };
}

/** 한 줄로: 줄마다 앞 글머리(-·∙·•·▪ 등)를 떼고 ' · '로 이음(지침 보완방안 칸은 ▸ 항목마다 한 줄) */
export function oneLine(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .split("\n")
    .map((l) => l.trim().replace(/^(?:[-∙•▪◦·*]|\d+[.)])\s+/u, "").trim())
    .filter(Boolean)
    .join(" · ");
}

/** 개선방향 줄머리를 ★ 하나로(○·▸·- 등 다른 기호는 ★로 바꿈) */
export function normalizeDirection(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `★${l.replace(/^(?:[★☆○●◦▸▶•·\-*]|\d+[.)])\s*/u, "").trim()}`)
    .join("\n");
}

export const CASE_NONE = "해당 없음 — 붙임2에 유사 유형 사례 없음";

/**
 * ★사례제안 칸 글: 「기관명 — 사업명(등급): 잘한 점 요약\n▸ 인사이트: …」. 기관명·사업명·등급은 모델이 아니라 붙임2 조각에서(지어낸 사례 차단).
 * key가 없으면 해당 없음, 붙임2에 없는 key·KCA 행이면 해당 없음 + 알림
 */
export function caseText(c: { key: string; summary: string; insight: string } | undefined, refs: KnowledgeRef[]): { text: string; notice: string | null } {
  const key = (c?.key ?? "").trim();
  if (!key) return { text: CASE_NONE, notice: null };
  const ref = refs.find((r) => r.key === key && r.unitType === "peer_case");
  if (!ref) return { text: CASE_NONE, notice: "사례제안: 붙임2에 없는 사례를 골라 뺐습니다." };
  if (ref.meta?.kca) return { text: CASE_NONE, notice: "사례제안: KCA 행(지적 요약)은 사례가 아니라 뺐습니다." };
  const org = String(ref.meta?.org ?? "").trim();
  const business = String(ref.meta?.business ?? "").trim();
  const grade = String(ref.meta?.grade ?? "").trim();
  const head = `${org}${business ? ` — ${business}` : ""}${grade ? `(${grade})` : ""}`;
  // 잘한 점 요약은 2~3줄 그대로(지침: 요약 2~3줄 + 줄 바꿔 인사이트)
  const summary = (c?.summary ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
  const insight = (c?.insight ?? "")
    .replace(/^\s*▸?\s*인사이트\s*[:：]\s*/, "")
    .replace(/\s*\n\s*/g, " ")
    .trim();
  return { text: `${head}: ${summary || "잘한 점 요약 없음"}${insight ? `\n▸ 인사이트: ${insight}` : ""}`, notice: summary ? null : "사례제안: 잘한 점 요약이 비었습니다." };
}

export interface VerifiedInspection {
  result: InspectionResult;
  /** 원문과 다른 인용 수 */
  unverified: number;
  /** 모델이 빠뜨린 행 수 */
  missing: number;
}

export function verifyInspection(out: InspectOutputLike, refs: KnowledgeRef[], ctx: InspectContext, meta: { model: string; at: string }): VerifiedInspection {
  const form = ctx.form ?? FORM_ID;
  const tables = formTablesOf(form);
  let result = emptyResult(form);
  let missing = 0;
  let unverified = 0;
  for (const key of TABLE_KEYS) {
    const given = new Map<number, InspectOutput[TableKey][number]>();
    for (const r of out[key] ?? []) if (!given.has(r.no)) given.set(r.no, r);
    result[key] = tables[key].rows.map((f): RowResult => {
      const r = given.get(f.no);
      if (!r) {
        missing += 1;
        return emptyRow();
      }
      const row = cleanRow(key, { ...r, question: oneLine(r.question), fix: oneLine(r.fix), card: oneLine(r.card), note: oneLine(r.note), evidence: [] });
      if (row.judgment === "미흡") {
        row.evidence = r.evidence
          .filter((e) => e.quote.trim())
          .slice(0, 3)
          .map((e) => checkEvidence(e, refs));
        unverified += row.evidence.filter((e) => e.verified === false).length;
      }
      return row;
    });
  }
  if (ctx.preMonth) result = applyPreMonth(result);
  const status = out.status.replace(/<br\s*\/?>/gi, "\n").trim();
  result.overview = {
    status: ctx.preMonth && !status.startsWith("사전점검") ? `사전점검(점검월 미도래) — 점검월 ${ctx.period} ≠ 점검일자 ${ctx.today}\n${status}` : status,
    direction: normalizeDirection(out.direction),
    case: ctx.hasPeerCases ? caseText(out.case, refs).text : CASE_NO_SOURCE,
  };
  const caseNote = ctx.hasPeerCases ? caseText(out.case, refs).notice : null;
  const notices = [...(ctx.hasPeerCases ? [] : [NOTICE_NO_PEER]), ...(caseNote ? [caseNote] : []), ...out.notices.map((n) => n.trim()).filter(Boolean)];
  if (unverified) notices.push(`원문과 다른 인용 ${unverified}개 — 보내기 전 근거를 확인해 주세요.`);
  if (missing) notices.push(`AI가 판단하지 않은 항목 ${missing}개 — 직접 판단해 주세요.`);
  result.notices = [...new Set(notices)].slice(0, 20);
  result.ai = { model: meta.model, at: meta.at, sources: refs.length };
  return { result, unverified, missing };
}

/** 저장 전: 사람이 고친 인용도 원문과 다시 대조 */
export function recheckEvidence(res: InspectionResult, refs: KnowledgeRef[]): InspectionResult {
  const next = { ...res };
  for (const key of TABLE_KEYS) next[key] = res[key].map((r) => (r.judgment === "미흡" ? { ...r, evidence: r.evidence.filter((e) => e.quote || e.source).map((e) => checkEvidence(e, refs)) } : r));
  return next;
}
