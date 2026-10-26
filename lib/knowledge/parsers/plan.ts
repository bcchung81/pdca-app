// (260731) 2026년도 경영평가 관리계획 — 주요사업 부분 + 경영관리 부분(체크리스트·평가위원 의견·편람은 plan-mg-*.ts, 2026-10-07, 조각은 맨 뒤에 붙임).
//  1) Ⅲ-2 주요사업 공통 자가진단 체크리스트 → checklist_group
//  2) 붙임1 '25 평가보고서 주요사업 평가위원 문단 → evaluator_comment (지적 번호 ①… 추출)
//  3) 붙임2 '26 편람 주요사업 범주 → handbook_indicator
//  4) 붙임3 '26 과제관리카드 목록(주요사업) → task_list_row (검색 제외, 대응표 전용)
// 근거: docs/analysis/공통지식-5종-분석.md §1-1, §3-1

import { makeChunk, finalizeChunks } from "../chunk.ts";
import {
  BUSINESSES,
  EVAL_ITEMS_BIZ,
  EVAL_ITEMS_BZ4,
  METRICS_2025,
  NEW_METRICS_2026,
  businessLabel,
  businessShort,
  resolveBusiness,
} from "../dictionaries.ts";
import { CIRCLED, DINGBAT, cellText, circledToNumber, compactKey, normalizeText, pad2, splitDepartments } from "../normalize.ts";
import type { LineItem, SourceBlock } from "../source.ts";
import { toLineItems } from "../source.ts";
import { expandGrid, parseHtmlTables, parsePipeTable } from "../table.ts";
import type { BusinessId, Check, EvalItem, KnowledgeChunk, ParseResult } from "../types.ts";

import { parseMgmtChecklist } from "./plan-mg-checklist.ts";
import { parseMgmtEvaluatorComments, parseMgmtHandbook } from "./plan-mg-eval.ts";
import { parsePlanNarrative } from "./plan-narrative.ts";
const DOC = "plan-2607";
const DOC_LABEL = "2026 경영평가 관리계획(7월판)";

/** 붙임1 첫 표('25 지적건수)에 적힌 주요사업 지적 건수. 본문 번호와 다를 수 있어 경고로만 대조 */
export const EVAL25_SUMMARY_COUNTS: Record<BusinessId, number> = { "BZ-1": 11, "BZ-2": 15, "BZ-3": 7, "BZ-4": 19 };

export const PLAN_EXPECTED = {
  checklistItems: 12,
  checklistGroups: 5,
  /** 붙임3 머리 "(주요사업n) … (k개)"에서 읽은 값과 대조 */
  tasks: 48,
};

export interface PlanTask {
  business: BusinessId;
  group: string;
  target_business: string;
  exec_task_no: string;
  exec_task: string;
  task_no: string;
  title: string;
  labels: string[];
  dept: string;
}

export interface PlanMetric2026 {
  business: BusinessId;
  no: number;
  name: string;
  method: string;
  weight: number;
  measure: "계량" | "비계량";
}

export function parsePlan(blocks: SourceBlock[]): ParseResult {
  const items = toLineItems(blocks);
  const checks: Check[] = [];
  const chunks: KnowledgeChunk[] = [];

  const checklist = parseBizChecklist(items);
  chunks.push(...checklist.chunks);
  checks.push(...checklist.checks);

  const evaluator = parseBizEvaluatorComments(items);
  chunks.push(...evaluator.chunks);
  checks.push(...evaluator.checks);

  const handbook = parseBizHandbook(items);
  chunks.push(...handbook.chunks);
  checks.push(...handbook.checks);

  const tasks = parseBizTaskList(items);
  chunks.push(...tasks.chunks);
  checks.push(...tasks.checks);

  // 서술 Ⅰ·Ⅱ(월간 점검 3순위 근거) — 기존 조각 순서를 지키려고 맨 뒤에
  const narrative = parsePlanNarrative(items);
  chunks.push(...narrative.chunks);
  checks.push(...narrative.checks);

  // 경영관리 부분(2026-10-07) — 기존 주요사업 조각의 문서 안 순서(seq)가 바뀌지 않게 맨 끝에 붙임(층 안 순서가 seq라 요청 글이 바뀌면 안 됨)
  for (const part of [parseMgmtChecklist(items), parseMgmtEvaluatorComments(items), parseMgmtHandbook(items)]) {
    chunks.push(...part.chunks);
    checks.push(...part.checks);
  }

  return {
    chunks: finalizeChunks(chunks),
    checks,
    extras: {
      grades_2025: evaluator.extras?.grades,
      metrics_2026: handbook.extras?.metrics,
      tasks: tasks.extras?.tasks,
    },
  };
}

function indexOfItem(items: LineItem[], test: (it: LineItem) => boolean, from = 0): number {
  for (let i = from; i < items.length; i++) if (test(items[i])) return i;
  return -1;
}

const lineIs = (re: RegExp) => (it: LineItem) => it.kind === "line" && re.test(it.text);
const tableIs = (re: RegExp) => (it: LineItem) => it.kind === "table" && re.test(it.text);

// ---------------------------------------------------------------------------
// 1) Ⅲ-2 주요사업 공통 자가진단 체크리스트

const SD_LINE = /◇\s*세부평가내용\s*([❶-❿])\s*(.*)$/;

export function parseBizChecklist(items: LineItem[]): ParseResult {
  const chunks: KnowledgeChunk[] = [];
  const start = indexOfItem(items, tableIs(/^\|\s*대분류\s*\|\s*주요사업\s*\|/));
  if (start < 0) throw new Error("관리계획: 주요사업 체크리스트 머리표를 찾지 못했습니다");
  const head = parsePipeTable(items[start].text).rows[0] ?? [];
  const deptIdx = head.findIndex((c) => c.includes("담당부서"));
  const deptText = deptIdx >= 0 ? cellText(head[deptIdx + 1] ?? "") : "";

  let sd: { no: number; desc: string; page: number } | null = null;
  let itemCount = 0;
  let stop = false;
  for (let i = start + 1; i < items.length && !stop; i++) {
    const it = items[i];
    if (it.kind === "line") {
      const m = SD_LINE.exec(it.text);
      if (m) {
        let desc = m[2].trim();
        if (!desc && items[i + 1]?.kind === "line" && !SD_LINE.test(items[i + 1].text)) desc = items[++i].text.trim();
        sd = { no: circledToNumber(m[1])!, desc: normalizeText(desc), page: it.page };
      }
      continue;
    }
    if (!it.text.trimStart().startsWith("<table")) break; // 다음 파이프 표(다른 지표·붙임) → 끝
    const table = parseHtmlTables(it.text)[0];
    if (!table) continue;
    const grid = expandGrid(table);
    const header = grid[0] ?? [];
    const itemCol = header.findIndex((h) => h.includes("점검사항"));
    if (itemCol < 0) break; // 체크리스트가 아닌 표(추진일정) → 끝
    if (!sd) throw new Error("관리계획: 세부평가내용 없이 점검표가 나왔습니다");

    const groups: Array<{ label: string; items: string[] }> = [];
    for (const row of grid.slice(1)) {
      // 절 머리 "3 | ’26년도 경영평가 추진일정"이 표 끝 행으로 붙은 경우(P11)
      if (/^\d$/.test(row[0] ?? "") && /추진일정/.test(row.join(" "))) {
        stop = true;
        break;
      }
      const label = [...new Set(row.slice(0, itemCol).filter(Boolean))].join(" ");
      const text = row[itemCol];
      if (!text) continue;
      const g = groups.at(-1);
      if (g && g.label === label) g.items.push(text);
      else groups.push({ label, items: [text] });
    }
    groups.forEach((g, gi) => {
      itemCount += g.items.length;
      const evalItem = EVAL_ITEMS_BIZ[sd!.no];
      const sdMark = DINGBAT[sd!.no - 1];
      chunks.push(
        makeChunk({
          chunk_key: `${DOC}/checklist/BZ/sd${sd!.no}/g${gi + 1}`,
          doc_id: DOC,
          unit_type: "checklist_group",
          track: "주요사업",
          business: null,
          eval_item: evalItem,
          measure: "비계량",
          q_type: ["자가진단"],
          title: `'26 자가진단 · 주요사업 공통 · 세부평가내용${sdMark} ${g.label}`,
          context_prefix: `${DOC_LABEL} Ⅲ-2 지표별 자가진단 체크리스트 · 주요사업 공통 · 세부평가내용${sdMark} ${sd!.desc} · 구분: ${g.label}`,
          blocks: g.items,
          pdf_page_start: it.page,
          dept_resp: splitDepartments(deptText),
          meta: {
            applies_to: ["BZ-1", "BZ-2", "BZ-3"],
            sd_no: sd!.no,
            sd_desc: sd!.desc,
            group_label: g.label,
            dept_text: deptText,
            item_count: g.items.length,
          },
        }),
      );
    });
  }

  const checks: Check[] = [
    { name: "관리계획 주요사업 점검 문항 수", level: "error", ok: itemCount === PLAN_EXPECTED.checklistItems, expected: PLAN_EXPECTED.checklistItems, actual: itemCount },
    { name: "관리계획 주요사업 점검 묶음 수", level: "error", ok: chunks.length === PLAN_EXPECTED.checklistGroups, expected: PLAN_EXPECTED.checklistGroups, actual: chunks.length },
  ];
  return { chunks, checks };
}

// ---------------------------------------------------------------------------
// 2) 붙임1 '25 평가보고서 — 주요사업 평가위원 문단

const BIZ_SCOPE = /^\((\d)\)\s*(.+?)\s*성과관리의\s*적정성$/;
const BZ4_START = /^##\s*주요사업 계량지표 구성의 적합성/;
const BZ4_SUB = /^\((\d)\)\s*(.+?)\s*계량지표 구성의 적합성 및 목표의 도전성$/;
const BZ4_TOTAL = /^\(\d\)\s*총평$/;
const EVAL_HEAD = /^(?:-\s)?([①-④])\s*(주요사업.*)$/;
const GRADE = /이상의 결과를 종합하여 볼 때.*?[“"]\s*([A-E][0-9+⁺]*)\s*[”"]\s*로\s*평가/;

interface Paragraph {
  scope: BusinessId;
  related: BusinessId | "total" | null;
  evalItem: EvalItem;
  evalNo: number;
  question: string;
  text: string;
  page: number;
  pageEnd: number;
}

export function parseBizEvaluatorComments(items: LineItem[]): ParseResult {
  const anchor = indexOfItem(items, tableIs(/^\|\s*붙임1\s*\|/));
  const start = indexOfItem(items, lineIs(/^2 주요사업$/), Math.max(0, anchor));
  const end = indexOfItem(items, lineIs(/^3 공공기관 혁신/), start);
  if (anchor < 0 || start < 0 || end < 0) throw new Error("관리계획: 붙임1 주요사업 범위를 찾지 못했습니다");

  const paragraphs: Paragraph[] = [];
  const grades: Record<string, string> = {};
  let scope: BusinessId | null = null;
  let related: BusinessId | "total" | null = null;
  let evalState: { item: EvalItem; no: number; question: string } | null = null;

  for (let i = start + 1; i < end; i++) {
    const it = items[i];
    if (it.kind !== "line") continue;
    const text = it.text.trim();
    if (/^!\[/.test(text) || /^##\s*및 목표의 도전성/.test(text)) continue;

    let m: RegExpExecArray | null;
    if ((m = BIZ_SCOPE.exec(text)) && scope !== "BZ-4") {
      scope = resolveBusiness(m[2]);
      if (!scope) throw new Error(`붙임1: 주요사업 이름을 풀 수 없습니다: ${m[2]}`);
      related = null;
      evalState = null;
      continue;
    }
    if (BZ4_START.test(text)) {
      scope = "BZ-4";
      related = null;
      evalState = null;
      continue;
    }
    if (scope === "BZ-4" && (m = BZ4_SUB.exec(text))) {
      related = resolveBusiness(m[2]);
      evalState = null;
      continue;
    }
    if (scope === "BZ-4" && BZ4_TOTAL.test(text)) {
      related = "total";
      evalState = null;
      continue;
    }
    if ((m = EVAL_HEAD.exec(text))) {
      const no = circledToNumber(m[1])!;
      const item = scope === "BZ-4" ? EVAL_ITEMS_BZ4[no] : EVAL_ITEMS_BIZ[no];
      if (!item) throw new Error(`붙임1: 평가내용 번호를 풀 수 없습니다: ${text}`);
      evalState = { item, no, question: normalizeText(m[2]) };
      continue;
    }
    if (!scope || !evalState) continue;

    const grade = GRADE.exec(text);
    if (grade) {
      const key = scope === "BZ-4" && related === "total" ? `BZ-4/${evalState.item}` : scope;
      grades[key] = grade[1];
      continue;
    }

    const body = normalizeText(text.replace(/^(?:-\s)+/, ""));
    const prev = paragraphs.at(-1);
    const isNew = /^-\s/.test(text);
    if (!isNew && prev && prev.scope === scope && prev.related === related && prev.evalItem === evalState.item) {
      prev.text = `${prev.text} ${body}`; // 쪽 넘김으로 끊긴 문단(P1)
      prev.pageEnd = it.page;
    } else {
      paragraphs.push({ scope, related, evalItem: evalState.item, evalNo: evalState.no, question: evalState.question, text: body, page: it.page, pageEnd: it.page });
    }
  }

  // 지적 번호: 사업(BZ-4는 전체) 안에서 ①부터 차례대로 나오는 것만 받습니다.
  const expected: Record<string, number> = {};
  const unexpected: Record<string, number> = {};
  const chunks: KnowledgeChunk[] = [];
  const counters: Record<string, number> = {};
  for (const p of paragraphs) {
    const segs: Array<{ no: number | null; text: string }> = [{ no: null, text: "" }];
    const chars = Array.from(p.text);
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const n = CIRCLED.includes(ch) ? circledToNumber(ch) : null;
      const next = (expected[p.scope] ?? 0) + 1;
      if (n !== null && n === next && isFindingMarker(chars.slice(i + 1, i + 12).join(""))) {
        expected[p.scope] = n;
        segs.push({ no: n, text: ch });
      } else {
        if (n !== null) unexpected[p.scope] = (unexpected[p.scope] ?? 0) + 1;
        segs[segs.length - 1].text += ch;
      }
    }
    const blocks = segs.map((s) => s.text.trim()).filter(Boolean);
    const findings = segs.filter((s) => s.no !== null).map((s) => ({ no: s.no!, text: s.text.trim() }));

    const evalCode = p.scope === "BZ-4" ? (p.evalItem === "지표 적합성" ? "fit" : "chal") : `e${p.evalNo}`;
    const relCode = p.scope === "BZ-4" ? `${p.related === "total" ? "total" : p.related}/` : "";
    const counterKey = `${p.scope}/${relCode}${evalCode}`;
    counters[counterKey] = (counters[counterKey] ?? 0) + 1;
    const relLabel = p.scope === "BZ-4" ? (p.related === "total" ? " · 총평" : p.related ? ` · ${businessShort(p.related)} 계량지표` : "") : "";
    const findingMarks = findings.map((f) => CIRCLED[f.no - 1]).join("");

    chunks.push(
      makeChunk({
        chunk_key: `${DOC}/eval25/${counterKey}/p${pad2(counters[counterKey])}`,
        doc_id: DOC,
        unit_type: "evaluator_comment",
        track: "주요사업",
        business: p.scope,
        eval_item: p.evalItem,
        measure: "비계량",
        q_type: findings.length ? ["평가보고서지적"] : ["평가보고서"],
        title: `'25 평가보고서 · ${businessShort(p.scope)}${relLabel} · ${p.evalItem}${findingMarks ? ` ${findingMarks}` : ""}`,
        context_prefix: `2025 경영실적 평가보고서(최종) 평가위원 의견 · ${businessLabel(p.scope)}${relLabel} · ${CIRCLED[p.evalNo - 1]} ${p.question}`,
        blocks,
        pdf_page_start: p.page,
        pdf_page_end: p.pageEnd,
        meta: {
          edition: "2025 평가보고서(최종)",
          eval_no: p.evalNo,
          eval_question: p.question,
          related_business: p.related === "total" ? null : p.related,
          is_total: p.related === "total",
          finding_nos: findings.map((f) => f.no),
          findings,
          page_basis: "pdf-start",
        },
      }),
    );
  }
  // 등급은 사업 단위로 모든 문단에 붙입니다.
  for (const c of chunks) {
    const g = c.business === "BZ-4" ? grades[`BZ-4/${c.eval_item}`] : grades[c.business!];
    c.meta.grade_2025 = g ?? null;
    if (g) c.context_prefix += ` · 등급 ${g}`;
  }

  const checks: Check[] = [];
  const found: Record<string, number> = {};
  for (const b of ["BZ-1", "BZ-2", "BZ-3", "BZ-4"] as BusinessId[]) found[b] = expected[b] ?? 0;
  checks.push({
    name: "붙임1 주요사업 지적 번호(본문, 연속)",
    level: "error",
    ok: Object.values(found).every((n) => n > 0),
    actual: found,
    note: "사업마다 ①부터 끊김 없이 이어진 번호만 셉니다",
  });
  checks.push({
    name: "붙임1 지적 건수 요약표와 대조",
    level: "warn",
    ok: Object.entries(EVAL25_SUMMARY_COUNTS).every(([b, n]) => found[b] === n),
    expected: EVAL25_SUMMARY_COUNTS,
    actual: found,
    note: "요약표('25 지적건수)와 본문 번호 수가 다르면 원문 차이. 본문 번호를 기준으로 적재",
  });
  const gradeKeys = ["BZ-1", "BZ-2", "BZ-3", "BZ-4/지표 적합성", "BZ-4/목표 도전성"];
  checks.push({ name: "붙임1 주요사업 등급 문장", level: "error", ok: gradeKeys.every((k) => grades[k]), expected: gradeKeys, actual: grades });
  checks.push({ name: "붙임1 번호 순서 밖 원문자(참고)", level: "warn", ok: true, actual: unexpected, note: "평가내용 머리를 뺀 뒤 순서에 맞지 않아 지적으로 보지 않은 원문자 수" });
  return { chunks, checks, extras: { grades } };
}

/**
 * 지적 번호와 문장 속 열거("① 공공성, ② 효율성")를 가릅니다.
 * 지적 번호는 바로 글자가 붙거나("④다만", "②기관의") 띄어 쓴 뒤 접속어·주어가 옵니다("⑤ 다만", "④ 기관이").
 */
export function isFindingMarker(after: string): boolean {
  if (after && !/^\s/.test(after)) return true;
  return /^\s+(다만|그러나|하지만|또한|특히|아울러|기관)/.test(after);
}

// ---------------------------------------------------------------------------
// 3) 붙임2 '26 편람 — 주요사업 범주

const METRIC_HEAD = /^\((\d+)\)\s*(.+?)\s*\(\s*평가방식\s*:\s*(.+?)\s*,\s*가중치\s*:\s*([\d.]+)\s*점\s*\)$/;

export function parseBizHandbook(items: LineItem[]): ParseResult {
  const anchor = indexOfItem(items, tableIs(/^\|\s*붙임2\s*\|/));
  const start = indexOfItem(items, lineIs(/^2\. 주요사업 범주$/), Math.max(0, anchor));
  const end = indexOfItem(items, (it) => (it.kind === "line" && /^3\. 공공기관 혁신/.test(it.text)) || (it.kind === "table" && /^\|\s*붙임3\s*\|/.test(it.text)), start);
  if (anchor < 0 || start < 0 || end < 0) throw new Error("관리계획: 붙임2 주요사업 범주를 찾지 못했습니다");

  const chunks: KnowledgeChunk[] = [];
  const metrics: PlanMetric2026[] = [];
  const checks: Check[] = [];
  const businessPoints: Partial<Record<BusinessId, number>> = {};
  let heading: { kind: "bz4" | "common" | "biz"; business?: BusinessId; points?: number; page: number } | null = null;
  let definition = "";

  for (let i = start + 1; i < end; i++) {
    const it = items[i];
    if (it.kind === "line") {
      const t = it.text.trim();
      let m: RegExpExecArray | null;
      if (/^##\s*주요사업 계량지표 구성의 적합성/.test(t)) heading = { kind: "bz4", page: it.page };
      else if (/^##\s*주요사업 성과관리의 적정성/.test(t)) heading = { kind: "common", page: it.page };
      else if ((m = /^##\s*주요사업\s*(.+?)\s*\[(\d+)점\]$/.exec(t))) {
        const b = resolveBusiness(m[1]);
        if (!b) throw new Error(`붙임2: 주요사업 이름을 풀 수 없습니다: ${m[1]}`);
        heading = { kind: "biz", business: b, points: Number(m[2]), page: it.page };
        businessPoints[b] = Number(m[2]);
        definition = "";
      }
      continue;
    }
    if (!heading) continue;
    if (it.text.trimStart().startsWith("|")) {
      const row = parsePipeTable(it.text).rows[0] ?? [];
      if (compactKey(row[0] ?? "") === "사업정의") definition = cellText(row[1] ?? "");
      continue;
    }
    const table = parseHtmlTables(it.text)[0];
    if (!table) continue;

    if (heading.kind === "bz4" || heading.kind === "common") {
      chunks.push(...handbookCriteriaChunks(table, heading.kind, it.page));
      heading = null;
      continue;
    }

    // 사업별 계량·비계량 지표 표
    const b = heading.business!;
    const found = splitMetricTable(table);
    const overview: string[] = [];
    if (definition) overview.push(`사업정의: ${definition}`);
    overview.push(`배점: ${heading.points}점`);
    for (const f of found) {
      metrics.push({ business: b, no: f.no, name: f.name, method: f.method, weight: f.weight, measure: f.measure });
      overview.push(`(${f.no}) ${f.name} — ${f.measure}, 평가방식 ${f.method}, 가중치 ${f.weight}점`);
      if (f.measure === "비계량") continue;
      const known = METRICS_2025.find((x) => x.name2026 && compactKey(x.name2026) === compactKey(f.name));
      const added = NEW_METRICS_2026.find((x) => compactKey(x.name) === compactKey(f.name));
      chunks.push(
        makeChunk({
          chunk_key: `${DOC}/handbook26/${b}/m${f.no}`,
          doc_id: DOC,
          unit_type: "handbook_indicator",
          track: "주요사업",
          business: b,
          eval_item: null,
          measure: "계량",
          q_type: ["편람"],
          title: `'26 편람 · ${businessShort(b)} 계량 · ${f.name}`,
          context_prefix: `2026 경영평가편람('26.1.29) · ${businessLabel(b)} · 계량지표 (${f.no}) ${f.name} · 평가방식 ${f.method} · 가중치 ${f.weight}점`,
          blocks: f.rows.map(([k, v]) => `${k}: ${v}`),
          pdf_page_start: it.page,
          meta: { metric_2026: f.name, metric_no: f.no, method: f.method, weight: f.weight, metric_2025: known?.name2025 ?? null, metric_relation: known?.relation ?? (added ? "신설" : "사전 없음"), note: added?.note ?? null },
        }),
      );
    }
    chunks.push(
      makeChunk({
        chunk_key: `${DOC}/handbook26/${b}`,
        doc_id: DOC,
        unit_type: "handbook_indicator",
        track: "주요사업",
        business: b,
        eval_item: null,
        measure: null,
        q_type: ["편람"],
        title: `'26 편람 · ${businessShort(b)} 사업 정의와 지표 구성`,
        context_prefix: `2026 경영평가편람('26.1.29) · ${businessLabel(b)} [${heading.points}점]`,
        blocks: overview,
        pdf_page_start: heading.page,
        meta: { points: heading.points, definition, metric_count: found.length },
      }),
    );
    heading = null;
  }

  for (const b of ["BZ-1", "BZ-2", "BZ-3"] as BusinessId[]) {
    const sum = metrics.filter((m) => m.business === b).reduce((s, m) => s + m.weight, 0);
    checks.push({ name: `편람 ${businessShort(b)} 가중치 합 = 배점`, level: "error", ok: sum === businessPoints[b], expected: businessPoints[b], actual: sum });
  }
  const known2026 = new Set([...METRICS_2025.map((m) => m.name2026), ...NEW_METRICS_2026.map((m) => m.name)].filter((n): n is string => Boolean(n)).map(compactKey));
  const unknown = metrics.filter((m) => m.measure === "계량" && !known2026.has(compactKey(m.name))).map((m) => `${m.business} ${m.name}`);
  checks.push({ name: "편람 '26 계량지표가 명칭 사전에 있음", level: "warn", ok: unknown.length === 0, actual: unknown, note: "없으면 dictionaries.ts METRICS_2025(대응) 또는 NEW_METRICS_2026(신설)에 추가" });
  checks.push({ name: "편람 주요사업 기준 조각", level: "error", ok: chunks.some((c) => c.chunk_key.includes("/BZ-4/")) && chunks.some((c) => c.chunk_key.includes("/common/")), note: "공통지표·성과관리의 적정성 세부평가내용" });
  return { chunks, checks, extras: { metrics } };
}

/** 편람 기준표(지표정의·적용대상·세부평가내용) → 지표 머리 1개 + 평가항목(①…)마다 1개 */
function handbookCriteriaChunks(table: ReturnType<typeof parseHtmlTables>[number], kind: "bz4" | "common", page: number): KnowledgeChunk[] {
  const rows: Array<[string, string]> = [];
  for (const r of table.rows.slice(1)) {
    const cells = r.cells;
    const valueCell = cells.at(-1)!;
    const label = cellText(cells.at(-2)?.html ?? "");
    rows.push([label.replace(/\s+/g, ""), cellText(valueCell.html, "\n")]);
  }
  const def = rows.find(([k]) => k === "지표정의")?.[1] ?? "";
  const target = rows.find(([k]) => k.startsWith("적용대상"))?.[1] ?? "";
  const detail = rows.find(([k]) => k === "세부평가내용")?.[1] ?? "";
  const name = kind === "bz4" ? "주요사업 계량지표 구성의 적합성 및 목표의 도전성" : "주요사업 성과관리의 적정성";
  const business: BusinessId | null = kind === "bz4" ? "BZ-4" : null;
  const key = kind === "bz4" ? "BZ-4" : "common";
  const base = {
    doc_id: DOC,
    unit_type: "handbook_indicator" as const,
    track: "주요사업" as const,
    business,
    measure: "비계량" as const,
    q_type: ["편람"],
    pdf_page_start: page,
  };
  const out: KnowledgeChunk[] = [
    makeChunk({
      ...base,
      chunk_key: `${DOC}/handbook26/${key}`,
      eval_item: null,
      title: `'26 편람 · ${name}`,
      context_prefix: `2026 경영평가편람('26.1.29) · 주요사업 범주 · ${name}`,
      blocks: [`지표정의: ${def}`, `적용대상(배점): ${target}`],
      meta: { indicator: name, applies_to: kind === "common" ? ["BZ-1", "BZ-2", "BZ-3"] : ["BZ-4"] },
    }),
  ];
  // 세부평가내용을 ①…로 나눕니다.
  const parts = detail.split(/\n(?=[①-⑨]\s)/).map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const no = circledToNumber(part[0]);
    if (!no) continue;
    const evalItem = kind === "bz4" ? EVAL_ITEMS_BZ4[no] : EVAL_ITEMS_BIZ[no];
    const lines = part.split("\n").map((l) => l.trim()).filter(Boolean);
    out.push(
      makeChunk({
        ...base,
        chunk_key: `${DOC}/handbook26/${key}/c${no}`,
        eval_item: evalItem ?? null,
        title: `'26 편람 · ${name} · ${lines[0]}`,
        context_prefix: `2026 경영평가편람('26.1.29) · 주요사업 범주 · ${name} · 세부평가내용`,
        blocks: joinContinuation(lines),
        meta: { indicator: name, criterion_no: no, applies_to: kind === "common" ? ["BZ-1", "BZ-2", "BZ-3"] : ["BZ-4"] },
      }),
    );
  }
  return out;
}

/** 셀 안 줄바꿈으로 끊긴 "- 항목" 줄을 잇습니다 */
function joinContinuation(lines: string[]): string[] {
  const out: string[] = [];
  for (const l of lines) {
    if (out.length && !/^[-*※①-⑨•]/.test(l)) out[out.length - 1] += ` ${l}`;
    else out.push(l);
  }
  return out;
}

interface MetricBlock {
  no: number;
  name: string;
  method: string;
  weight: number;
  measure: "계량" | "비계량";
  rows: Array<[string, string]>;
}

function splitMetricTable(table: ReturnType<typeof parseHtmlTables>[number]): MetricBlock[] {
  const out: MetricBlock[] = [];
  for (const r of table.rows) {
    const texts = r.cells.map((c) => c.text).filter(Boolean);
    const whole = normalizeText(texts.join(" "));
    const m = r.cells.length === 1 ? METRIC_HEAD.exec(whole) : null;
    if (m) {
      const name = normalizeText(m[2]);
      out.push({ no: Number(m[1]), name, method: m[3], weight: Number(m[4]), measure: /성과관리의\s*적정성/.test(name) ? "비계량" : "계량", rows: [] });
      continue;
    }
    const cur = out.at(-1);
    if (!cur || r.cells.length < 2) continue;
    const label = cellText(r.cells[0].html).replace(/\s+/g, " ");
    const value = r.cells
      .slice(1)
      .map((c) => cellText(c.html.replace(/<table[\s\S]*?<\/table>/gi, (t) => `<br>${flattenInline(t)}<br>`), "\n"))
      .filter(Boolean)
      .join("\n");
    cur.rows.push([label, value]);
  }
  return out;
}

/** 산식 분수 표(①|이름|=|분자 / 분모) → "① 이름 = 분자 / 분모" */
function flattenInline(tableHtml: string): string {
  const t = parseHtmlTables(tableHtml)[0];
  if (!t) return cellText(tableHtml);
  return t.rows.map((r) => r.cells.map((c) => c.text).filter(Boolean).join(" ")).join(" / ");
}

// ---------------------------------------------------------------------------
// 4) 붙임3 '26 과제관리카드 목록 — 주요사업

const GROUP_HEAD = /^\((주요사업\d)\)\s*(.+?)\s*\((\d+)개\)$/;
const TASK_CELL = /^(\d+-[가-힣])\.\s*(.+)$/;
const EXEC_CELL = /^(\d+)\.\s*(.+)$/;
const TARGET_CELL = /^(.+?)\s*\((\d+)개\)$/;

export function parseBizTaskList(items: LineItem[]): ParseResult {
  const anchor = indexOfItem(items, tableIs(/^\|\s*붙임3\s*\|/));
  if (anchor < 0) throw new Error("관리계획: 붙임3을 찾지 못했습니다");
  const end = indexOfItem(items, tableIs(/^\|\s*참고1\s*\|/), anchor);
  const tasks: PlanTask[] = [];
  const declared: Record<string, number> = {};
  let group: { name: string; business: BusinessId; title: string } | null = null;
  let page = 0;

  for (let i = anchor + 1; i < (end < 0 ? items.length : end); i++) {
    const it = items[i];
    if (it.kind !== "table" || !it.text.trimStart().startsWith("<table")) continue;
    const table = parseHtmlTables(it.text)[0];
    if (!table) continue;
    const first = table.rows[0]?.cells.map((c) => c.text) ?? [];
    const gm = first.length === 1 ? GROUP_HEAD.exec(first[0]) : null;
    if (gm) {
      const business = BUSINESSES.find((b) => b.cardGroup === gm[1])?.id;
      if (!business) throw new Error(`붙임3: 묶음 이름을 풀 수 없습니다: ${gm[1]}`);
      group = { name: gm[1], business, title: gm[2] };
      declared[gm[1]] = Number(gm[3]);
      continue;
    }
    if (first.length === 1) {
      group = null; // 경영관리 묶음 머리
      continue;
    }
    if (!group || !first.some((c) => c.includes("대상사업"))) continue;
    page = it.page;
    let target = "";
    let exec = { no: "", title: "" };
    for (const r of table.rows.slice(1)) {
      const cells = r.cells.map((c) => c.text);
      const taskIdx = cells.findIndex((c) => TASK_CELL.test(c));
      if (taskIdx < 0) continue;
      for (const c of cells.slice(0, taskIdx)) {
        const tm = TARGET_CELL.exec(c);
        const em = EXEC_CELL.exec(c);
        if (em) exec = { no: em[1], title: em[2] };
        else if (tm) target = tm[1];
      }
      const tm = TASK_CELL.exec(cells[taskIdx])!;
      const labels = [...tm[2].matchAll(/【([^】]+)】/g)].map((x) => x[1].trim());
      const title = normalizeText(tm[2].replace(/【[^】]*】/g, " "));
      tasks.push({
        business: group.business,
        group: group.name,
        target_business: target,
        exec_task_no: exec.no,
        exec_task: exec.title,
        task_no: tm[1],
        title,
        labels,
        dept: cells.at(-1) === cells[taskIdx] ? "" : cells.at(-1)!,
      });
    }
  }

  const chunks = tasks.map((t) =>
    makeChunk({
      chunk_key: `${DOC}/tasks/${t.business}/${t.task_no}`,
      doc_id: DOC,
      unit_type: "task_list_row",
      track: "주요사업",
      business: t.business,
      eval_item: null,
      measure: null,
      title: `'26 과제 목록(7월) · ${t.group} ${t.task_no}. ${t.title}`,
      context_prefix: `${DOC_LABEL} 붙임3 '26년도 과제관리카드 목록 · ${t.group} · ${t.target_business} · ${t.exec_task_no}. ${t.exec_task}`,
      blocks: [`${t.task_no}. ${t.title}`],
      searchable: false,
      pdf_page_start: page,
      dept_resp: t.dept ? [t.dept] : [],
      meta: { ...t, new_task: t.labels.some((l) => l.includes("신규")), ax: t.labels.some((l) => l.includes("AX")) },
    }),
  );

  const perGroup: Record<string, number> = {};
  for (const t of tasks) perGroup[t.group] = (perGroup[t.group] ?? 0) + 1;
  const checks: Check[] = [
    { name: "붙임3 주요사업 과제 수(묶음 머리와 대조)", level: "error", ok: Object.entries(declared).length === 3 && Object.entries(declared).every(([g, n]) => perGroup[g] === n), expected: declared, actual: perGroup },
    { name: "붙임3 주요사업 과제 합계", level: "error", ok: tasks.length === PLAN_EXPECTED.tasks, expected: PLAN_EXPECTED.tasks, actual: tasks.length },
  ];
  return { chunks, checks, extras: { tasks } };
}
