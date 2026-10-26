import { MGMT_SECTIONS, isMgmtCard } from "./mgmt-card.ts";
import type { LooseJson } from "../loose-json.ts";
// 원본 양식 위 직접 편집의 데이터 조작(순수 함수). 경로는 render.ts가 단 data-p·data-toggle 값입니다.
//  "title", "deptText", "@person"(관리자 / 작성자), "overview.cells.3", "kpi.rows.0.nameRaw",
//  "plan.lines.2", "do.lines.4.table.rows.1.0.lines.0", "do.monthly.1.period", "axAttachments.0.purpose~.2", 경영관리 "findings.rows.1.plan.0"

type Json = LooseJson;

const clone = <T>(v: T): T => structuredClone(v);

function tokens(path: string): Array<string | number> {
  return path.split(".").map((t) => (/^\d+$/.test(t) ? Number(t) : t));
}

function parentOf(root: Json, toks: Array<string | number>, create = false): Json {
  let cur = root;
  for (let i = 0; i < toks.length - 1; i++) {
    const t = toks[i];
    if (cur[t] === undefined || cur[t] === null) {
      if (!create) throw new Error(`경로 없음: ${toks.slice(0, i + 1).join(".")}`);
      cur[t] = typeof toks[i + 1] === "number" ? [] : {};
    }
    cur = cur[t];
  }
  return cur;
}

export function getAt(root: Json, path: string): Json {
  let cur = root;
  for (const t of tokens(path)) {
    if (cur === undefined || cur === null) return undefined;
    cur = cur[t];
  }
  return cur;
}

const splitPeriod = (p: string) => p.split(/([~∼])/).map((s) => s.trim()).filter(Boolean);

/** "axAttachments.0.purpose~.2" → 글 한 덩어리의 몇째 줄 */
function stringLine(path: string): { base: string; line: number } | null {
  const m = /^(.*)~\.(\d+)$/.exec(path);
  return m ? { base: m[1], line: Number(m[2]) } : null;
}

/** 칸·글줄 글자 바꾸기 */
export function applyText(card: Json, path: string, raw: string): Json {
  const c = clone(card);
  const text = raw.replace(/\r\n?/g, "\n").replace(/ /g, " ");
  const single = text.replace(/\n+/g, " ").trim();
  if (path === "@person") {
    const [manager, ...rest] = single.split(/\s*\/\s*/);
    c.manager = manager ?? "";
    c.writer = rest.join(" / ");
    return c;
  }
  const sl = stringLine(path);
  if (sl) {
    const lines = String(getAt(c, sl.base) ?? "").split("\n");
    lines[sl.line] = single;
    const toks = tokens(sl.base);
    parentOf(c, toks)[toks.at(-1)!] = lines.join("\n");
    return c;
  }
  const toks = tokens(path);
  const parent = parentOf(c, toks, true);
  const key = toks.at(-1)!;
  if (/^do\.monthly\.\d+\.period$/.test(path)) {
    // 월 표시는 「~」 앞뒤에 빈칸을 두지 않음(원본 표기 — 원본 배치 화면에서는 월 글상자 사이가 줄바꿈으로 읽힘)
    const period = single.replace(/\s*([~∼])\s*/g, "$1");
    parent.period = period;
    parent.periodTokens = splitPeriod(period);
    parent.periodLines = splitPeriod(period);
    return c;
  }
  if (/^kpi\.rows\.\d+\.nameRaw$/.test(path)) {
    parent.nameRaw = single;
    const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(single);
    parent.name = m ? m[1] : single;
    parent.unit = m ? m[2] : parent.unit ?? "";
    return c;
  }
  // 여러 줄을 허용하는 칸(계량지표 칸, AI 활용 글)
  const multiline = /^kpi\.rows\.\d+\.\w+$/.test(path) || path === "strategy.ai.text";
  parent[key] = multiline ? text.replace(/\n{3,}/g, "\n\n").trim() : single;
  return c;
}

/** 글줄 목록에서 index 뒤에 새 줄 */
export function insertLineAfter(card: Json, linePath: string, text: string): { card: Json; path: string } {
  const c = clone(card);
  const sl = stringLine(linePath);
  if (sl) {
    const lines = String(getAt(c, sl.base) ?? "").split("\n");
    lines.splice(sl.line + 1, 0, text);
    const toks = tokens(sl.base);
    parentOf(c, toks)[toks.at(-1)!] = lines.join("\n");
    return { card: c, path: `${sl.base}~.${sl.line + 1}` };
  }
  const toks = tokens(linePath);
  const idx = toks.at(-1) as number;
  const arrPath = toks.slice(0, -1).join(".");
  const arr = getAt(c, arrPath);
  if (!Array.isArray(arr)) {
    parentOf(c, toks, true);
    const parent = parentOf(c, tokens(`${arrPath}.0`), true);
    parent[0] = text;
    return { card: c, path: `${arrPath}.0` };
  }
  const at = Math.min(idx + 1, arr.length);
  arr.splice(at, 0, text);
  return { card: c, path: `${arrPath}.${at}` };
}

/** 글줄 지우기. 앞 줄 경로(없으면 null)를 돌려줍니다 */
export function deleteLine(card: Json, linePath: string): { card: Json; focus: string | null } {
  const c = clone(card);
  const sl = stringLine(linePath);
  if (sl) {
    const lines = String(getAt(c, sl.base) ?? "").split("\n");
    if (lines.length <= 1) return { card: c, focus: linePath };
    lines.splice(sl.line, 1);
    const toks = tokens(sl.base);
    parentOf(c, toks)[toks.at(-1)!] = lines.join("\n");
    return { card: c, focus: sl.line > 0 ? `${sl.base}~.${sl.line - 1}` : `${sl.base}~.0` };
  }
  const toks = tokens(linePath);
  const idx = toks.at(-1) as number;
  const arrPath = toks.slice(0, -1).join(".");
  const arr = getAt(c, arrPath);
  if (!Array.isArray(arr)) return { card: c, focus: null };
  arr.splice(idx, 1);
  const prev = [...arr.keys()].slice(0, idx).reverse().find((i) => typeof arr[i] === "string");
  return { card: c, focus: prev !== undefined ? `${arrPath}.${prev}` : null };
}

/** 체크 상자 토글. "overview.cells.0#1"(그 글의 둘째 상자) 또는 "strategy.ai.checked" */
export function toggleBox(card: Json, spec: string): Json {
  const c = clone(card);
  if (spec === "strategy.ai.checked") {
    c.strategy.ai.checked = !c.strategy.ai.checked;
    return c;
  }
  const m = /^(.*)#(\d+)$/.exec(spec);
  if (!m) throw new Error(`토글 표지 형식: ${spec}`);
  const [, path, nStr] = m;
  const n = Number(nStr);
  const toks = tokens(path);
  const parent = parentOf(c, toks);
  const key = toks.at(-1)!;
  let k = -1;
  parent[key] = String(parent[key]).replace(/[☑□☐]/g, (b: string) => {
    k += 1;
    return k === n ? (b === "☑" ? "□" : "☑") : b;
  });
  return c;
}

/** [Do] 월별 실적 상자 하나 더(맨 끝) */
export function addMonthly(card: Json, period: string): { card: Json; path: string } {
  const c = clone(card);
  c.do.monthly = c.do.monthly ?? [];
  c.do.monthly.push({ period, periodTokens: splitPeriod(period), periodLines: splitPeriod(period), items: ["∙ "] });
  return { card: c, path: `do.monthly.${c.do.monthly.length - 1}.items.0` };
}

/** 경영관리 짝 칸 표(전년도 환류 자체평가|개선방안 · 지적 및 개선방안 지적|개선방안)의 두 칸 이름 — render-mgmt.ts pairTable과 같은 순서 */
export const PAIR_SIDES = { feedback: ["self", "plan"], findings: ["finding", "plan"] } as const;
export type PairKey = keyof typeof PAIR_SIDES;

/** 편집 칸 경로 → 짝 칸 표의 행("findings.rows.2.plan.0" → 지적 및 개선방안 2행). 짝 칸 표가 아니면 null */
export function pairRowOf(path: string): { key: PairKey; row: number } | null {
  const m = /^(feedback|findings)\.rows\.(\d+)\./.exec(path);
  return m ? { key: m[1] as PairKey, row: Number(m[2]) } : null;
}

/**
 * 짝 칸 표에 빈 행 하나(after 행 뒤, -1이면 맨 앞). 두 칸은 빈 목록([]) — 편집 화면은 칸마다 빈 첫 줄(data-empty, innerText "")을 그리고
 * 글을 치면 applyText가 그 줄(「….0」)을 만듦. 원본 배치에서는 앞 행을 본떠 행을 복제함(layout-render.ts). 초점 경로(새 행 왼쪽 칸 첫 줄)를 돌려줌
 */
export function insertPairRow(card: Json, key: PairKey, after: number): { card: Json; path: string } {
  const c = clone(card);
  const [a, b] = PAIR_SIDES[key];
  c[key] = c[key] ?? {};
  const rows: Json[] = Array.isArray(c[key].rows) ? c[key].rows : (c[key].rows = []);
  const at = Math.max(0, Math.min(after + 1, rows.length));
  rows.splice(at, 0, { [a]: [], [b]: [] });
  return { card: c, path: `${key}.rows.${at}.${a}.0` };
}

/**
 * 짝 칸 표의 행 지우기. 마지막 한 행은 지우지 않고 두 칸을 비움 — 0행이면 원본 양식이 편집 칸 없는 빈 줄만 그려 행을 다시 더할 자리가 없고,
 * 원본 배치도 본뜰 행이 남지 않음(한글 양식에서도 머리 아래 한 행은 늘 있음). 초점 경로(앞 행, 없으면 첫 행의 왼쪽 칸 첫 줄)를 돌려줌
 */
export function deletePairRow(card: Json, key: PairKey, row: number): { card: Json; focus: string | null } {
  const c = clone(card);
  const [a, b] = PAIR_SIDES[key];
  const rows: Json[] = Array.isArray(c[key]?.rows) ? c[key].rows : [];
  if (row < 0 || row >= rows.length) return { card: c, focus: null };
  if (rows.length === 1) rows[0] = { ...rows[0], [a]: [], [b]: [] };
  else rows.splice(row, 1);
  return { card: c, focus: `${key}.rows.${Math.max(0, row - 1)}.${a}.0` };
}

/** 글에서 파생값을 다시 계산(목록의 과제구분·분류가 원본 양식과 어긋나지 않게) */
export function recomputeDerived(card: Json): Json {
  const c = clone(card);
  const cells: string[] = c.overview?.cells ?? [];
  const has = (re: RegExp) => cells.some((t) => re.test(t));
  if (c.overview) {
    c.overview.checks = {
      advanced: has(/☑\s*고도화/),
      new: has(/☑\s*[’'‘]?\d*\s*년?\s*신규/),
      shortTerm: has(/☑\s*단기/),
      longTerm: has(/☑\s*중장기/),
    };
    c.overview.kind = c.overview.checks.new ? "신규" : c.overview.checks.advanced ? "고도화" : c.overview.kind;
  }
  const cat = String(c.kpi?.categoriesText ?? "");
  if (c.kpi?.categories) {
    c.kpi.categories = {
      midLongTermGoal: /☑\s*중장기/.test(cat),
      ceoContract: /☑\s*기관장/.test(cat),
      pool: /☑\s*(주요사업\s*)?성과지표\s*Pool/i.test(cat),
      representative: /☑\s*(주요사업\s*)?대표/.test(cat),
    };
  }
  const esg = String(c.strategy?.esgText ?? "");
  if (c.strategy?.esg) c.strategy.esg = { environment: /☑\s*환경/.test(esg), social: /☑\s*사회/.test(esg), governance: /☑\s*지배구조/.test(esg) };
  return c;
}

/** 저장 전 확인: 식별 칸은 못 바꾸고, 구역 구조는 유지 */
export function checkEditable(before: Json, after: Json): string | null {
  for (const k of ["id", "group", "taskNo"]) if (before[k] !== after[k]) return `${k}는 바꿀 수 없습니다`;
  for (const k of isMgmtCard(after) ? MGMT_SECTIONS : ["overview", "kpi", "strategy", "act", "plan", "do", "check", "outcome"]) {
    if (!after[k] || typeof after[k] !== "object") return `${k} 구역이 없습니다`;
  }
  if (typeof after.title !== "string" || !after.title.trim()) return "과제명이 비었습니다";
  if (JSON.stringify(after).length > 500_000) return "카드가 너무 큽니다";
  return null;
}

export interface SuggestionLike {
  kind: "replace" | "insert_after" | "monthly";
  targetPath: string | null;
  period: string | null;
  proposed: string[];
}

const isArrayLine = (card: Json, path: string) => {
  const m = /^(.*)\.(\d+)$/.exec(path);
  return Boolean(m && Array.isArray(getAt(card, m[1])));
};
const MULTILINE = (path: string) => /^kpi\.rows\.\d+\.\w+$/.test(path) || path === "strategy.ai.text";

/** AI 제안 반영. 글줄 목록이면 첫 줄로 바꾸고 나머지는 뒤에 이어 넣습니다. 초점 경로를 돌려줍니다 */
export function applySuggestion(card: Json, s: SuggestionLike): { card: Json; focus: string | null } {
  const lines = s.proposed.map((p) => p.trim()).filter(Boolean);
  if (!lines.length) return { card, focus: null };
  if (s.kind === "monthly") {
    const added = addMonthly(card, s.period || "이번 달");
    let c = applyText(added.card, added.path, lines[0]);
    let at = added.path;
    for (const ln of lines.slice(1)) ({ card: c, path: at } = insertLineAfter(c, at, ln));
    return { card: c, focus: at };
  }
  const path = s.targetPath;
  if (!path) return { card, focus: null };
  if (!isArrayLine(card, path)) {
    return { card: applyText(card, path, lines.join(MULTILINE(path) ? "\n" : " ")), focus: path };
  }
  let c = card;
  let at = path;
  let rest = lines;
  if (s.kind === "replace") {
    c = applyText(c, path, lines[0]);
    rest = lines.slice(1);
  }
  for (const ln of rest) ({ card: c, path: at } = insertLineAfter(c, at, ln));
  return { card: c, focus: at };
}
