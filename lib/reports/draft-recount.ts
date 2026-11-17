// 저장된 과제별 초안의 「없는 숫자」 다시 세기(순수, 2026-11-16 시큐어 코딩 2차 점검 후속).
// card_report_drafts의 unknown_numbers·warnings는 초안을 쓸 수 있는 사람이 앱 밖에서도 바꿀 수 있는 저장값이라(쓰기 RLS = can_write_card),
// 검토 화면·HTML 내려받기·보고서 검토는 그 값을 그대로 믿지 않고 저장 경로(edit-actions.ts recheck)와 같은 다시 점검으로 셉니다. 근거 글 읽기는 draft-recount-queries.ts.
// 보이는 값 = 저장값 ∪ 다시 센 값: 저장값을 지워도 다시 센 숫자는 남고, 저장 뒤 근거가 늘어 다시 센 값에서 빠진 숫자는 예전처럼 남음(정상 초안은 화면·내려받기가 그대로)
// 실패하면 막힘(2026-11-17 3차): spec도 앱 밖에서 바꿀 수 있어 모양이 앱이 쓰는 꼴이 아니거나(빈 행 객체·null·글이 아닌 칸) 글 칸이 저장 경로 한도를 크게 넘으면
// 다시 세지 않고, 다시 세기·근거 읽기가 던져도 저장값을 그대로 믿지 않고 「없는 숫자 확인 불가」(막힘 — warning-levels.ts)를 앞에 붙임.
// 모양 검사(specIssue)는 화면이 그리기 전에도 씀(readDraftSpec) — 걸린 초안은 그리지 않고 같은 까닭을 보임

import type { LooseJson } from "../loose-json.ts";
import { BLOCK_KINDS, FIGURE_KINDS, FIGURE_POS, FIGURE_SIZES } from "./blocks.ts";
import { BLOCK_LAYOUTS, BLOCK_SPANS } from "./layout.ts";
import { recheckMgSection } from "./mg-draft.ts";
import { type ReportSectionSpec, readSection, recheckSection } from "./section.ts";

// ---------------------------------------------------------------------------
// 모양·크기 검사

/** 글 칸 하나 상한 — 저장 경로 한도(AI 정리 cleanLine 기본 400자·직접 고침 DRAFT_TEXT_MAX 600자·짜임 요청 FRAME_REQUEST_MAX 500자)의 3배 넘게 여유 */
export const SPEC_STRING_MAX = 2_000;
/** 초안 글 전체 상한(글자) — 앱이 쓰는 초안은 많아야 수만 자 */
export const SPEC_TEXT_MAX = 300_000;
/** 초안 값 개수 상한(배열·객체·글·수 모두) — 앱이 쓰는 초안은 수천 개 */
export const SPEC_NODES_MAX = 50_000;

const fmt = (n: number) => n.toLocaleString("ko-KR");

/** 크기 검사(재귀 없이 — 깊게 겹친 값에서도 스택을 넘지 않음) */
function sizeIssue(root: unknown): string | null {
  const stack: unknown[] = [root];
  let nodes = 0;
  let chars = 0;
  while (stack.length) {
    const v = stack.pop();
    nodes++;
    if (typeof v === "string") {
      if (v.length > SPEC_STRING_MAX) return `글 칸 하나가 ${fmt(v.length)}자로 한도 ${fmt(SPEC_STRING_MAX)}자를 넘음`;
      chars += v.length;
      if (chars > SPEC_TEXT_MAX) return `초안 글이 모두 ${fmt(SPEC_TEXT_MAX)}자를 넘음`;
      continue;
    }
    if (typeof v !== "object" || v === null) continue;
    const kids = Array.isArray(v) ? v : Object.values(v);
    if (nodes + stack.length + kids.length > SPEC_NODES_MAX) return `초안 값이 ${fmt(SPEC_NODES_MAX)}개를 넘음`;
    for (const k of kids) stack.push(k);
  }
  return null;
}

type Obj = Record<string, unknown>;
type Check = (x: unknown) => boolean;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const isStr: Check = (x) => typeof x === "string";
const isNum: Check = (x) => typeof x === "number" && Number.isFinite(x);
const strList: Check = (x) => Array.isArray(x) && x.every(isStr);
const objList =
  (ok: (o: Obj) => boolean): Check =>
  (x) =>
    Array.isArray(x) && x.every((v) => isObj(v) && ok(v));
const obj =
  (ok: (o: Obj) => boolean): Check =>
  (x) =>
    isObj(x) && ok(x);
/** 없거나(이 칸이 생기기 전 초안) 맞는 타입 */
const opt =
  (ok: Check): Check =>
  (x) =>
    x === undefined || ok(x);
/** 없거나 null이거나 맞는 타입 */
const nullable =
  (ok: Check): Check =>
  (x) =>
    x == null || ok(x);
/** 글 칸들: 있어야 하고 글 */
const strs = (o: Obj, ...keys: string[]) => keys.every((k) => isStr(o[k]));
/** 글 칸들: 없거나(이 칸이 생기기 전 초안) 글 */
const optStrs = (o: Obj, ...keys: string[]) => keys.every((k) => o[k] === undefined || isStr(o[k]));
/** 정해진 값 중 하나 */
const oneOf =
  (values: readonly string[]): Check =>
  (x) =>
    typeof x === "string" && values.includes(x);

// 모양 — 앱이 쓰는 칸(section.ts ReportSectionSpec·blocks.ts Block·mg-types.ts MgDraftMeta). 타입 정의의 필수 칸은 있어야 하고(앱이 늘 채움 — 그리기·다시 세기가
// 빠진 칸에서 던짐), 선택 칸(옛 초안에 없을 수 있음)은 있으면 타입만 봄. 블록 종류·그림 종류·크기·자리·배치는 정해진 값만(모르는 값에서 그리기가 던짐)
const pair = (r: Obj) => strs(r, "key") && strList(r.before) && strList(r.after);
const series = (s: Obj) => strs(s, "label", "value");
const chart = (c: Obj) => strs(c, "title", "badge") && objList(series)(c.series);
const cell = (c: Obj) => strs(c, "head", "tag", "note") && strList(c.bullets) && (c.focus === undefined || typeof c.focus === "boolean");
const figure = (f: Obj) => oneOf(FIGURE_KINDS)(f.kind) && strs(f, "desc") && oneOf(FIGURE_POS)(f.pos) && oneOf(FIGURE_SIZES)(f.size);
const block = (b: Obj) =>
  oneOf(BLOCK_KINDS)(b.kind) &&
  strs(b, "label", "title", "variant", "text", "badge") &&
  strList(b.items) &&
  objList(cell)(b.cells) &&
  objList(pair)(b.rows) &&
  objList(series)(b.series) &&
  opt(objList(figure))(b.figures) &&
  opt(oneOf(BLOCK_LAYOUTS))(b.layout) &&
  opt(oneOf(BLOCK_SPANS))(b.span) &&
  opt(isNum)(b.year);
const step = (s: Obj) => strs(s, "title", "note") && strList(s.bullets);
const diagram = (d: Obj) => strs(d, "type", "title") && objList(pair)(d.rows) && objList(step)(d.steps) && objList((a) => strs(a, "effort", "result"))(d.actions);
const row = (r: Obj) => strs(r, "label") && strList(r.bullets) && nullable(obj(diagram))(r.diagram) && nullable(obj(chart))(r.chart);
const part = (p: Obj) =>
  strs(p, "key", "evalTitle", "themeTitle", "mark", "title") && isNum(p.evalNo) && isNum(p.themeNo) && optStrs(p, "story", "why", "subStory", "chip") && opt(isObj)(p.frame);
const mgMeta = (m: Obj) =>
  strs(m, "indicator") && objList(part)(m.parts) && strList(m.at) && opt(isNum)(m.pages) && opt(strList)(m.finding) && opt(objList((c) => strs(c, "item", "drop", "keep", "why")))(m.conflicts);

const SPEC_FIELDS: ReadonlyArray<readonly [string, Check]> = [
  ["card", obj((c) => strs(c, "id", "taskNo", "title"))],
  ["business", obj((b) => strs(b, "name") && opt(isNum)(b.no))],
  ["task", obj((t) => strs(t, "no", "title"))],
  ["sub", obj((s) => strs(s, "mark", "title") && strList(s.markers) && optStrs(s, "chip"))],
  ["rows", objList(row)],
  ["results", strList],
  ["blocks", opt(objList(block))],
  ["caption", isStr],
  ["module", isNum],
  ["banner", opt(isStr)],
  ["resultBand", opt(isStr)],
  ["story", opt(isStr)],
  ["promptVersion", opt(isStr)],
  ["head", opt(isStr)],
  ["context", opt(objList((c) => strs(c, "chip", "title", "quote", "cite")))],
  ["cases", opt(objList((c) => strs(c, "tab", "title") && strList(c.items)))],
  ["resultCards", opt(objList((c) => strs(c, "tag", "headline", "figure")))],
  ["resultChart", nullable(obj(chart))],
  ["sources", opt(objList((s) => strs(s, "kind", "id", "name") && optStrs(s, "stamp", "at")))],
  ["priorKeys", opt(strList)],
  ["fit", opt(obj((f) => isNum(f.total) && isNum(f.budget) && opt(isNum)(f.passes)))],
  ["ground", opt(obj((g) => strList(g.weak) && isNum(g.checked)))],
  ["plan", opt(obj((p) => strs(p, "story") && optStrs(p, "subStory") && isNum(p.matched) && isNum(p.total)))],
  ["humanEdits", opt((x) => Array.isArray(x) && x.every(isNum))],
  ["mg", opt(obj(mgMeta))],
];

/**
 * 저장된 초안(spec)이 앱이 쓰는 꼴인가 — 아니면 까닭(화면 글), 맞으면 null. 크기(글 칸 하나 SPEC_STRING_MAX·전체 SPEC_TEXT_MAX·값 개수 SPEC_NODES_MAX)를 먼저 보고
 * 칸 타입을 봄. 걸린 초안은 다시 세지도 그리지도 않음(다시 세기의 2제곱 정규식·그리기의 TypeError를 앞에서 막는 이중 장치)
 */
export function specIssue(spec: unknown): string | null {
  const size = sizeIssue(spec);
  if (size) return size;
  if (!isObj(spec)) return "초안 형식이 아님";
  const bad = SPEC_FIELDS.find(([key, ok]) => !ok(spec[key]));
  return bad ? `초안 칸 「${bad[0]}」의 형식이 앱이 쓰는 꼴과 다름` : null;
}

/** 화면용 초안 읽기: 판이 맞고(readSection) 모양 검사를 지난 것만 spec. 걸리면 spec 없이 까닭 — 초안이 없으면 둘 다 null */
export function readDraftSpec(raw: unknown): { spec: ReportSectionSpec | null; issue: string | null } {
  const spec = readSection(raw);
  if (!spec) return { spec: null, issue: null };
  const issue = specIssue(spec);
  return issue ? { spec: null, issue } : { spec, issue: null };
}

// ---------------------------------------------------------------------------
// 다시 세기

/** 저장 경로와 같은 다시 점검(트랙별)으로 센 근거에 없는 숫자. known = 숫자 근거 글(카드 글은 함수가 따로 셈) */
export function recountUnknown(spec: ReportSectionSpec, card: unknown, known: string): string[] {
  return (spec.mg ? recheckMgSection(spec, card as LooseJson, known) : recheckSection(spec, card as LooseJson, known)).unknownNumbers;
}

export interface UnknownView {
  /** 칠하고 셀 숫자 = 저장값 ∪ 다시 센 값(저장값 순서 먼저) */
  unknown: string[];
  /** 다시 셌더니 저장값에 없던 숫자 — 저장 뒤 근거가 줄었거나 초안을 앱 밖에서 고친 흔적 */
  added: string[];
}

/** 저장값에서 받는 숫자 조각 수·길이 상한(앱이 저장하는 없는 숫자는 수십 개·조각마다 몇 글자 — 칠하기가 이 목록으로 찾기를 만듦) */
const STORED_MAX = 300;
const STORED_LEN_MAX = 40;

/** 저장값(배열이 아니면 빈 값, 글 조각만)과 다시 센 값을 합침 */
export function unknownView(stored: unknown, fresh: readonly string[]): UnknownView {
  const list = Array.isArray(stored) ? stored.filter((x): x is string | number => (typeof x === "string" || typeof x === "number") && String(x).length <= STORED_LEN_MAX).slice(0, STORED_MAX) : [];
  const base = [...new Set(list.map(String))];
  const have = new Set(base);
  const added = [...new Set(fresh)].filter((x) => !have.has(x));
  return { unknown: [...base, ...added], added };
}

/** 초안 경고의 없는 숫자 줄(section.ts·mg-draft.ts 「…에 없는 숫자 N개 — …」, 등급은 warning-levels.ts 글 규칙으로 막힘) */
const UNKNOWN_LINE = /에 없는 숫자 \d+개/;

/**
 * 다시 센 숫자가 저장값에 없으면 경고의 없는 숫자 줄을 보이는 값으로 바꿈(줄이 없으면 맨 앞에 더함). 저장값과 같으면 경고 그대로.
 * 앞머리 없이 같은 글 모양이라 등급(막힘)·경고 표가 그대로 받음. where = 숫자 근거가 있으면 「카드·첨부 자료」, 없으면 「카드」(다시 점검과 같은 말)
 */
export function unknownWarnings(warnings: readonly string[], v: UnknownView, where: string): string[] {
  if (!v.added.length) return [...warnings];
  const rest = v.unknown.filter((x) => !v.added.includes(x));
  const line = `${where}에 없는 숫자 ${v.unknown.length}개(저장된 점검 결과에 없던 ${v.added.length}개를 다시 셈 — 저장 뒤 근거가 바뀌었거나 초안을 앱 밖에서 고쳤을 수 있음) — 원자료로 확인하거나 지워 주세요: ${[...v.added, ...rest].slice(0, 8).join(", ")}`;
  const at = warnings.findIndex((w) => UNKNOWN_LINE.test(w));
  return at < 0 ? [line, ...warnings] : warnings.map((w, i) => (i === at ? line : w));
}

/** 다시 세지 못했을 때 경고 앞머리(막힘 — warning-levels.ts WARNING_HEADS) */
export const RECOUNT_FAIL_HEAD = "없는 숫자 확인 불가";

/** 과제 하나를 다시 세지 못했을 때 경고(막힘) — reason은 화면 글(specIssue 까닭·「근거 자료를 읽지 못함」 등) */
export function recountFailWarning(reason: string): string {
  return `없는 숫자 확인 불가: ${reason} — 저장된 점검 결과만으로는 근거에 없는 숫자를 확인할 수 없습니다(붉은 점선·건수가 빠졌을 수 있음). 원자료로 숫자를 확인하거나 초안을 다시 만들어 주세요.`;
}

/** 여러 과제 중 다시 세지 못한 것 한 줄(보고서 검토 확인 목록·사업 조판 알림, 막힘). 없으면 null */
export function recountFailNote(items: ReadonlyArray<{ taskNo: string }>): string | null {
  if (!items.length) return null;
  return `없는 숫자 확인 불가: 과제 ${items.length}건(${items.map((x) => x.taskNo).join("·")}) — 다시 세지 못해 붉은 점선·건수가 빠졌을 수 있습니다. 과제별 초안을 열어 확인해 주세요.`;
}

export interface RecountView extends UnknownView {
  /** 보일 경고(다시 세지 못했으면 맨 앞에 「없는 숫자 확인 불가」) */
  warnings: string[];
  /** 다시 세지 못한 까닭(화면 글) — 있으면 unknown은 저장값뿐 */
  failed?: string;
  /** 다시 세다가 던진 오류(로그용 — 화면에 내지 않음) */
  error?: unknown;
}

/** 다시 세지 못한 초안의 보기: 칠할 숫자는 저장값(믿지 않는다는 막힘 경고와 함께), 경고 맨 앞에 「없는 숫자 확인 불가」 */
export function recountFailed(stored: { unknown: unknown; warnings: readonly string[] }, reason: string, error?: unknown): RecountView {
  return { ...unknownView(stored.unknown, []), warnings: [recountFailWarning(reason), ...stored.warnings], failed: reason, ...(error === undefined ? {} : { error }) };
}

/** 저장된 초안 하나를 다시 셈: 칠할 숫자·경고(저장값 그대로 넘기면 됨). 모양 검사에 걸리거나 다시 세기가 던지면 막힘(recountFailed) — 던지지 않음 */
export function recountDraft(spec: ReportSectionSpec, card: unknown, known: string, stored: { unknown: unknown; warnings: readonly string[] }): RecountView {
  const issue = specIssue(spec);
  if (issue) return recountFailed(stored, issue);
  let fresh: string[];
  try {
    fresh = recountUnknown(spec, card, known);
  } catch (e) {
    return recountFailed(stored, "다시 세다가 오류가 남", e);
  }
  const v = unknownView(stored.unknown, fresh);
  return { ...v, warnings: unknownWarnings(stored.warnings, v, known.trim() ? "카드·첨부 자료" : "카드") };
}
