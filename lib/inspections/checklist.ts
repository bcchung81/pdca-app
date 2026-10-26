// 경영관리 점검표 5번째 블록(□ 자가진단 체크리스트 대조)의 항목 — 관리계획 7월판 Ⅲ-2 자가진단 체크리스트 조각(checklist_group)에서 코드가 뽑습니다(순수 함수).
// 항목 목록·구분(지적 N / ①-N)·원문은 조각에서 정해지고, AI는 항목마다 이 과제 소관 여부·결과(예/부분/아니오/해당 없음)·반영과제·비고만 냅니다(지침 13 [자가진단 체크리스트 대조 — 5블록]).
// 이 블록은 7대축·질의패턴·정합성 판정과 집계에 넣지 않습니다(model.ts가 보장).

import { type ChecklistBlock, type ChecklistResult, type ChecklistRow, CHECKLIST_RESULTS } from "./model.ts";

/** 체크리스트 조각(checklist_group) 중 이 모듈이 읽는 칸 */
export interface ChecklistRef {
  key: string;
  unitType: string;
  text: string;
  meta?: Record<string, unknown>;
}

export interface ChecklistItem {
  /** 요청에서 항목을 가리키는 번호(c1~) — 조각 순서대로 */
  id: string;
  /** 점검표 「구분」 열: 지적은 「지적 N」, 착안사항은 「세부평가내용 번호-구분 번호」(예 ①-4) */
  label: string;
  /** 착안사항 항목이 속한 구분 이름(지적 항목은 빈 글) */
  group: string;
  /** 체크리스트 점검사항 원문(공백 정리만) */
  text: string;
  /** 출처 조각 key */
  key: string;
}

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
export const circled = (n: number): string => CIRCLED[n - 1] ?? `(${n})`;

const flat = (s: string): string => s.replace(/\s+/g, " ").trim();
const blocksOf = (text: string): string[] => text.split(/\n\s*\n/).map(flat).filter(Boolean);

/**
 * 조각 목록에서 체크리스트 항목 뽑기. 지적 조각(kind=issues)은 블록 하나가 지적 하나(「N. …」), 착안사항 조각(kind=sd_group)은
 * 블록 하나가 점검사항 하나이며 구분은 「세부평가내용 번호-구분 번호」. 입력 순서(적재 순서)를 지킴
 */
export function checklistItems(refs: readonly ChecklistRef[]): ChecklistItem[] {
  const out: ChecklistItem[] = [];
  const add = (label: string, group: string, text: string, key: string) => out.push({ id: `c${out.length + 1}`, label, group, text, key });
  for (const r of refs) {
    if (r.unitType !== "checklist_group") continue;
    const kind = r.meta?.kind;
    if (kind === "issues") {
      const numbers = Array.isArray(r.meta?.issue_numbers) ? (r.meta!.issue_numbers as unknown[]) : [];
      blocksOf(r.text).forEach((b, i) => {
        const m = /^(\d+)\.\s*([\s\S]*)$/.exec(b);
        const n = m ? Number(m[1]) : Number(numbers[i]) || i + 1;
        add(`지적 ${n}`, "", m ? m[2] : b, r.key);
      });
    } else if (kind === "sd_group") {
      const sd = Number(r.meta?.sd_no);
      const label = typeof r.meta?.group_label === "string" ? flat(r.meta.group_label) : "";
      const m = /^(\d+)\.\s*([\s\S]*)$/.exec(label);
      const mark = `${Number.isFinite(sd) && sd > 0 ? circled(sd) : ""}${m ? `-${m[1]}` : ""}` || "착안사항";
      for (const b of blocksOf(r.text)) add(mark, m ? m[2] : label, b, r.key);
    }
  }
  return out;
}

const escapeXml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 요청 글에 넣는 항목 목록: 줄마다 `<item id label [group]>점검사항</item>` */
export function checklistItemsBlock(items: readonly ChecklistItem[]): string {
  if (!items.length) return "(제공된 체크리스트 항목 없음)";
  return items.map((i) => `<item id="${i.id}" label="${escapeXml(i.label)}"${i.group ? ` group="${escapeXml(i.group)}"` : ""}>${escapeXml(i.text)}</item>`).join("\n");
}

/** AI가 항목마다 낸 답 */
export interface ChecklistAnswer {
  id: string;
  /** 이 과제 점검표에 싣는 항목인가(같은 지표의 다른 과제가 맡는 항목이면 false) */
  mine: boolean;
  /** 점검사항 요지(체크리스트 문장을 한 줄로 줄인 것) */
  point: string;
  result: ChecklistResult;
  task: string;
  note: string;
}

const POINT_MAX = 90;
/** 요지가 비었을 때 원문을 한 줄로 줄여 씀(문장 중간에서 끊으면 …) */
export const shortPoint = (text: string): string => {
  const t = flat(text);
  return t.length <= POINT_MAX ? t : `${t.slice(0, POINT_MAX - 1)}…`;
};

/**
 * 답 → 점검표 블록. 구분·표시 순서는 조각 순서(코드), 소관이 아닌 항목(mine=false)과 답에 없는 항목은 「나머지 항목」으로 셈.
 * missing = 답에 아예 없는 항목 수(모델이 빠뜨림). 같은 id가 여럿이면 첫 답만, 모르는 id·잘못된 결과 값은 무시
 */
export function buildChecklist(items: readonly ChecklistItem[], answers: readonly ChecklistAnswer[], sub: string): { block: ChecklistBlock; missing: number } {
  const given = new Map<string, ChecklistAnswer>();
  for (const a of answers) if (!given.has(a.id)) given.set(a.id, a);
  const rows: ChecklistRow[] = [];
  let missing = 0;
  for (const it of items) {
    const a = given.get(it.id);
    if (!a) {
      missing += 1;
      continue;
    }
    if (!a.mine) continue;
    rows.push({
      label: it.label,
      point: flat(a.point) || shortPoint(it.text),
      result: CHECKLIST_RESULTS.includes(a.result) ? a.result : null,
      task: flat(a.task) || "—",
      note: flat(a.note),
    });
  }
  return { block: { sub, rows, others: items.length - rows.length }, missing };
}
