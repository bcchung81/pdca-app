// 경영관리 월간 점검 AI 초안 — 성과관리팀 종합점검 지침(13, 경영관리)의 점검 모드를 따르는 요청 만들기와 결과 검증(순수 함수).
// 주요사업 점검(inspect.ts)과 같은 짝이며, 달라지는 점만 둡니다: 정합성 표(model.ts의 MGMT_FORM_TABLES), 사례제안 없음(붙임2 경영관리판 미확보),
// 내부관리형 보정(절대원칙 9) 표지, 5번째 블록(자가진단 체크리스트 대조 — 항목은 checklist.ts가 조각에서 뽑고 AI는 항목별 답만),
// 주요사업 연계 후보·인용 대조(붙임4 자리에 원장 주요사업 카드 발췌 — 후보 고르기는 lib/inspections/biz-links.ts, AI는 행마다 번호·요지만 내고 과제명·시점은 코드가 채움),
// '25 지적의 소관(지침의 「'25 지적 → '26 과제 매핑」 대신 같은 지표 카드들의 「지적 및 개선방안」 행 — 2026-10-12 사용자 결정, 매핑 알림은 버림).
// 모델 호출은 lib/ai/run.ts(callInspectionMg), 근거 조각 모으기는 lib/ai/context.ts(gatherInspectionKnowledge)가 합니다.
// AI에 보내는 지시문은 resources/prompts/inspection-mg에 있습니다.

import { z } from "zod";
import { type BizLinkPack, LINK_REASON_LABEL, bizTaskIdsIn } from "../inspections/biz-links.ts";
import { type ChecklistAnswer, type ChecklistItem, buildChecklist, checklistItemsBlock } from "../inspections/checklist.ts";
import { type BizLink, CHECKLIST_RESULTS, INTERNAL_ITEMS, LINKS_PER_ROW, MGMT_FORM_ID, NOTICE_NO_PEER, TABLE_KEYS } from "../inspections/model.ts";
import { type Descriptions, type PromptSet, type PromptSpec, described, fillFrom } from "../prompts/template.ts";
import { type InspectContext, type InspectOutputLike, type VerifiedInspection, escapeXml, inspectKnowledgeBlock, inspectRowSchema, inspectionCardText, oneLine, verifyInspection } from "./inspect.ts";
import type { KnowledgeRef } from "./writer.ts";
import type { LooseJson } from "../loose-json.ts";


/** 경영관리 월간 점검 프롬프트 파일(resources/prompts/inspection-mg)에 있어야 하는 절 */
export const INSPECT_MG_PROMPT_SPEC: PromptSpec = {
  system: ["system"],
  request: ["head", "period", "pre.yes", "pre.no", "task", "unit", "unit.bonus", "siblings", "siblings.none", "siblings.findings", "dept", "knowledge", "card", "refs", "biz", "biz.noIndex", "biz.none", "biz.more", "biz.unknown", "items"],
  schema: [
    "evidence.key",
    "evidence.quote",
    ...["no", "judgment", "question", "fix", "evidence", "card", "note", "links"].map((k) => `row.${k}`),
    "link.id",
    "link.gist",
    "coherence",
    "axes",
    "patterns",
    "status",
    "direction",
    "internal",
    "checklist",
    ...["id", "mine", "point", "result", "task", "note"].map((k) => `checklist.${k}`),
    "notices",
  ],
};

/** 시스템 프롬프트 = system.md @system(경영관리 점검 적응문) + 성과관리팀 종합점검 지침(13, 경영관리) 사본 */
export function inspectMgSystemText(p: PromptSet, guideline: string): string {
  return fillFrom(p, "system", "system", { caseNoSource: "기준 미확인 — 붙임2 미확보", preMonthNote: "점검월 미도래(사전점검)", guideline });
}

/** 점검 답 스키마(경영관리): 주요사업 답에서 사례제안(case)을 빼고 내부관리형 보정 여부·체크리스트 대조·행마다 주요사업 연계 후보(links)를 더함. desc(schema.md)를 주면 필드 설명을 붙임 */
export function inspectMgOutputSchema(desc?: Descriptions) {
  const d = <T extends z.ZodType>(s: T, key: string) => described(s, desc, key);
  const ChecklistOut = z.object({
    id: d(z.string(), "checklist.id"),
    mine: d(z.boolean(), "checklist.mine"),
    point: d(z.string(), "checklist.point"),
    result: d(z.enum(CHECKLIST_RESULTS), "checklist.result"),
    task: d(z.string(), "checklist.task"),
    note: d(z.string(), "checklist.note"),
  });
  // 행 스키마는 주요사업 점검과 함께 쓰므로(inspect.ts) 연계 후보는 여기서만 덧붙임 — 주요사업 답 스키마는 그대로
  const LinkOut = z.object({ id: d(z.string(), "link.id"), gist: d(z.string(), "link.gist") });
  const RowOut = inspectRowSchema(desc).extend({ links: d(z.array(LinkOut), "row.links") });
  return z.object({
    coherence: d(z.array(RowOut), "coherence"),
    axes: d(z.array(RowOut), "axes"),
    patterns: d(z.array(RowOut), "patterns"),
    status: d(z.string(), "status"),
    direction: d(z.string(), "direction"),
    internal: d(z.boolean(), "internal"),
    checklist: d(z.array(ChecklistOut), "checklist"),
    notices: d(z.array(z.string()), "notices"),
  });
}
export const InspectMgOutputSchema = inspectMgOutputSchema();
export type InspectMgOutput = z.infer<typeof InspectMgOutputSchema>;

export interface MgmtInspectContext extends InspectContext {
  form: typeof MGMT_FORM_ID;
  /** 경영관리 지표(과제번호 앞부분 — 평가단위 MG-N) */
  unit: { id: string; no: number; name: string; bonus: boolean };
  /** 같은 지표의 활성 과제 「과제번호 과제명」(이 과제 포함 — 체크리스트 소관 범위를 나눌 때 씀) */
  siblings: string[];
  /** 같은 지표 다른 활성 과제의 「지적 및 개선방안」 행(원장 — '25 지적 ↔ '26 과제 매핑표 대신, mgSiblingsOf) */
  siblingFindings: SiblingFindings[];
  /** 체크리스트 대조 대상 항목(checklistItems) */
  items: ChecklistItem[];
  /** 붙임4 자리의 원장 주요사업 카드 발췌(pickBizLinks) */
  biz: BizLinkPack;
}

/** 같은 지표 다른 과제 카드 1장의 「지적 및 개선방안」 행(원장 cards.data.findings.rows — 글줄만) */
export interface SiblingFindings {
  taskNo: string;
  title: string;
  rows: Array<{ finding: string[]; plan: string[] }>;
}

/** 같은 지표 카드 조회 행(cards — id·상태·과제번호·과제명·data.findings) */
export interface MgSiblingRow {
  id: string;
  status: string;
  no: string | null;
  title: string | null;
  /** data.findings — 「지적 및 개선방안」 표 */
  findings: { rows?: Array<{ finding?: unknown; plan?: unknown } | null> } | null | undefined;
}

const textLines = (arr: unknown): string[] => (Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string").map(oneLine).filter(Boolean) : []);

/**
 * 같은 지표 카드 → 과제 목록(이 과제 포함)과 다른 과제의 「지적 및 개선방안」 행(이 과제·보관 카드 제외).
 * 이 앱은 지침의 '25 지적 ↔ '26 과제 매핑표(지적사항–과제 연결표)를 쓰지 않고 각 카드의 지적 행으로 소관을 정함(2026-10-12 사용자 결정).
 * 원장 글만 — 카드 전용 자료·작성본은 넣지 않음(금기 4). 이 과제 자신의 지적 행은 「카드」 글에 이미 있음
 */
export function mgSiblingsOf(rows: MgSiblingRow[], selfId: string): { siblings: string[]; findings: SiblingFindings[] } {
  const active = rows.filter((r) => r.status === "active").sort((a, b) => (a.no ?? "").localeCompare(b.no ?? "", "ko", { numeric: true }));
  return {
    siblings: active.map((r) => `${r.no ?? ""} ${r.title ?? ""}`.trim()).filter(Boolean),
    findings: active
      .filter((r) => r.id !== selfId)
      .map((r) => ({
        taskNo: r.no ?? "",
        title: r.title ?? "",
        rows: (Array.isArray(r.findings?.rows) ? r.findings.rows : []).map((x) => ({ finding: textLines(x?.finding), plan: textLines(x?.plan) })).filter((x) => x.finding.length || x.plan.length),
      })),
  };
}

export const isMgmtInspectContext = (ctx: InspectContext): ctx is MgmtInspectContext => ctx.form === MGMT_FORM_ID && "unit" in ctx;

export function inspectMgPrompt(p: PromptSet, card: LooseJson, refs: KnowledgeRef[], ctx: MgmtInspectContext): string {
  const r = (key: string, vars: Record<string, string | number> = {}) => fillFrom(p, "request", key, vars);
  const core = refs.filter((x) => x.unitType === "core_item");
  const knowledge = refs.filter((x) => x.unitType !== "core_item");
  return [
    r("head"),
    r("period", { period: ctx.period, today: ctx.today, pre: r(ctx.preMonth ? "pre.yes" : "pre.no") }),
    r("task", { taskNo: card?.taskNo ?? "", title: card?.title ?? "" }),
    r("unit", { name: ctx.unit.name, no: ctx.unit.no, id: ctx.unit.id, bonus: ctx.unit.bonus ? r("unit.bonus") : "" }),
    ctx.siblings.length > 1 ? r("siblings", { list: ctx.siblings.join(" · ") }) : r("siblings.none"),
    ...siblingFindingsBlock(p, ctx.siblingFindings),
    r("dept", { dept: card?.deptText || card?.department || "—" }),
    r("knowledge", { n: knowledge.length, core: core.length, biz: ctx.biz.cards.length, items: ctx.items.length }),
    "",
    r("card"),
    inspectionCardText(card),
    "",
    r("refs"),
    inspectKnowledgeBlock(refs),
    "",
    ...bizBlock(p, ctx.biz),
    "",
    r("items", { n: ctx.items.length }),
    checklistItemsBlock(ctx.items),
  ].join("\n");
}

/** 같은 지표 다른 과제의 「지적 및 개선방안」 행: 머리 줄 + 과제마다 「- 과제번호 「과제명」」과 행마다 한 줄(지적 → 개선방안) */
function siblingFindingsBlock(p: PromptSet, list: SiblingFindings[]): string[] {
  if (!list.length) return [];
  return [
    fillFrom(p, "request", "siblings.findings", { n: list.length }),
    ...list.flatMap((s) => [
      `- ${s.taskNo} 「${s.title}」`,
      ...(s.rows.length ? s.rows.map((x, i) => `  · ${i + 1}행 지적: ${x.finding.join(" / ") || "—"} → 개선방안: ${x.plan.join(" / ") || "—"}`) : ["  · 지적 행 없음"]),
    ]),
  ];
}

/** 「주요사업 원장 발췌」 블록: 머리 줄 + 카드마다 머리(번호·과제명·부서·원장 시점·고른 이유)와 발췌 글 + 상한 밖 목록 */
function bizBlock(p: PromptSet, biz: BizLinkPack): string[] {
  const r = (key: string, vars: Record<string, string | number> = {}) => fillFrom(p, "request", key, vars);
  const attr = (v: string) => escapeXml(v);
  return [
    biz.cards.length ? r("biz", { n: biz.cards.length }) : r("biz.none"),
    ...(biz.indexed ? [] : [r("biz.noIndex")]),
    ...(biz.unknownCited.length ? [r("biz.unknown", { list: biz.unknownCited.join(" · ") })] : []),
    ...biz.cards.map(
      (c) =>
        `<biz id="${attr(c.id)}" title="${attr(c.title)}" dept="${attr(c.dept)}" asof="${attr(c.asOf)}" why="${attr(c.reasons.map((x) => LINK_REASON_LABEL[x]).join(" · "))}">\n${c.id} 「${c.title}」 · ${c.dept || "—"} · 원장 ${c.asOf}\n${escapeXml(c.text)}\n</biz>`,
    ),
    ...(biz.more.length ? [r("biz.more", { list: biz.more.map((m) => `${m.id} · ${m.title}`).join(" / ") })] : []),
  ];
}

/** 붙임2(경영관리판)는 이 앱에 없음 — 지침 [지식파일 누락]대로 운영 알림 첫 줄. 붙임4는 원장 주요사업 카드로 대체(2026-10-12 사용자 결정) */
export const MGMT_NOTICE_NO_REF = "지식파일 미확보: 붙임2";
/** 이 앱은 '25 지적 ↔ '26 과제 매핑표를 쓰지 않음(2026-10-12 사용자 결정) — 지침의 매핑 알림(「매핑 추가 제안」·「지적 소관 과제 확인 필요」)은 AI가 내도 버림 */
const MAPPING_NOTICE = /^(?:[-∙•▪◦·*]\s*)?(?:매핑 추가 제안|지적 소관 과제 확인 필요)/u;
export const MGMT_NOTICE_INTERNAL = "내부관리형 보정 적용: 7대축 1·4, 질의패턴 2를 내부 수요자(임직원·협력업체 근로자 등) 기준으로 판정";

export interface VerifiedInspectionMg extends VerifiedInspection {
  /** 체크리스트 항목 중 모델이 답하지 않은 수(나머지 항목으로 셈) */
  checklistMissing: number;
}

/** 표 20행·총평은 주요사업 검증(verifyInspection)을 그대로 쓰고, 경영관리 몫(내부관리형 보정 표지·체크리스트 대조·운영 알림)만 더함 */
export function verifyInspectionMg(out: InspectMgOutput, refs: KnowledgeRef[], ctx: MgmtInspectContext, meta: { model: string; at: string }): VerifiedInspectionMg {
  // 매핑 알림은 공용 검증이 알림 수를 자르기 전에 버림(버린 자리만큼 다른 알림이 잘리지 않게)
  const base = verifyInspection({ ...out, notices: (out.notices ?? []).filter((n) => !MAPPING_NOTICE.test(n.trim())) } as InspectOutputLike, refs, { ...ctx, hasPeerCases: false }, meta);
  const result = { ...base.result, axes: [...base.result.axes], patterns: [...base.result.patterns], coherence: [...base.result.coherence] };
  const notices = base.result.notices.filter((n) => n !== NOTICE_NO_PEER && !MAPPING_NOTICE.test(n));
  if (out.internal) {
    // 판정한 행(충족·미흡)에만 — 점검월 미도래로 해당 없음인 행은 그대로
    let tagged = 0;
    for (const s of INTERNAL_ITEMS) {
      const row = result[s.table][s.no - 1];
      if (row.judgment === "충족" || row.judgment === "미흡") {
        result[s.table][s.no - 1] = { ...row, internal: true };
        tagged += 1;
      }
    }
    if (tagged) notices.push(MGMT_NOTICE_INTERNAL);
  }
  notices.push(...applyLinks(result, out, ctx.biz));
  const { block, missing } = buildChecklist(ctx.items, out.checklist as ChecklistAnswer[], ctx.unit.name);
  result.checklist = block;
  if (missing) notices.push(`AI가 답하지 않은 체크리스트 항목 ${missing}개 — 나머지 항목으로 셌습니다. 직접 확인해 주세요.`);
  result.notices = [...new Set([MGMT_NOTICE_NO_REF, ...notices])].slice(0, 20);
  return { ...base, result, checklistMissing: missing };
}

/**
 * 연계 후보 정리(지침 13 [붙임4 사용 규칙] ①): 미흡 행에만, 받은 원장 발췌의 번호만, 행당 2건. 과제명·원장 시점은 AI가 쓴 글이 아니라 원장에서.
 * 발췌에 없는 번호는 버리고 운영 알림, 경영관리 카드가 인용했지만 원장에 없는 번호는 「주요사업 인용 불일치」 알림(②). result 행을 바꾸고 알림을 돌려줌
 */
function applyLinks(result: VerifiedInspection["result"], out: InspectMgOutput, biz: BizLinkPack): string[] {
  const known = new Map(biz.cards.map((c) => [c.id, c]));
  const dropped: string[] = [];
  for (const key of TABLE_KEYS) {
    const given = new Map<number, InspectMgOutput[typeof key][number]>();
    for (const r of out[key] ?? []) if (!given.has(r.no)) given.set(r.no, r);
    result[key] = result[key].map((row, i) => {
      const rest = { ...row };
      delete rest.links;
      if (row.judgment !== "미흡") return rest;
      const links: BizLink[] = [];
      for (const l of given.get(i + 1)?.links ?? []) {
        const id = bizTaskIdsIn(l.id)[0] ?? l.id.trim();
        const c = known.get(id);
        if (!c) {
          if (id && !dropped.includes(id)) dropped.push(id);
          continue;
        }
        const gist = oneLine(l.gist);
        if (!gist || links.some((x) => x.id === id) || links.length >= LINKS_PER_ROW) continue;
        links.push({ id, title: c.title, gist, asOf: c.asOf });
      }
      return links.length ? { ...rest, links } : rest;
    });
  }
  return [...dropped.map((id) => `연계 후보 버림: ${id} — 받은 원장 발췌에 없음`), ...biz.unknownCited.map((id) => `주요사업 인용 불일치: 경영관리 ${biz.task} ↔ ${id} — 원장에 없는 과제번호`)];
}
