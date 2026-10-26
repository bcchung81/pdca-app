// 카드 JSON에 줄·칸 편집을 한꺼번에 적용하고(AI 코멘트 반영), 기다리는 동안 사용자가 고친 곳은 덮지 않게 합칩니다(순수 함수).
// 경로는 render.ts 편집 모드의 data-p 값입니다. 편집 하나하나는 edit.ts의 조작(applyText·insertLineAfter·deleteLine)을 씁니다.
//
// 묶음(container): 편집이 닿는 가장 작은 독립 단위. 글줄이면 그 줄이 든 가장 바깥 줄 목록(표 안 줄도 바깥 목록),
// 칸이면 그 칸입니다. 묶음끼리는 겹치지 않으므로, 묶음마다 "보낼 때 값 = 지금 값"이면 AI 결과로 바꾸고 아니면 충돌로 둡니다.

import { applyText, deleteLine, getAt, insertLineAfter } from "./edit.ts";
import { canonicalJson } from "./fixed.ts";
import { renderCard } from "./render.ts";
import type { LooseJson } from "../loose-json.ts";

type Json = LooseJson;

export type EditOp = "replace" | "insert_after" | "delete";

export interface CardEdit {
  path: string;
  op: EditOp;
  lines: string[];
}

/** 코멘트에서 나온 편집 */
export interface TaggedEdit extends CardEdit {
  commentId: string;
}

export interface EditTarget {
  /** 글줄(kc-ln) — 줄 넣기·지우기가 됨. 아니면 칸(바꾸기만) */
  line: boolean;
  /** 확정된 고정 영역(고칠 수 없음) */
  locked: boolean;
}

/** 편집 모드 원본 양식에서 고칠 수 있는 곳: data-p 경로 → 글줄인지·잠겼는지(문서 순서) */
export function editTargets(card: Json, locked?: string[]): Map<string, EditTarget> {
  const html = renderCard(card, { editable: true, locked });
  const out = new Map<string, EditTarget>();
  for (const m of html.matchAll(/<[a-z]+\b([^>]*?)\sdata-p="([^"]+)"([^>]*)>/g)) {
    out.set(m[2], { line: /\bclass="[^"]*\bkc-ln\b/.test(m[1]), locked: /\bdata-locked="1"/.test(m[3]) });
  }
  return out;
}

const tokens = (path: string) => path.split(".").map((t) => (/^\d+$/.test(t) ? Number(t) : t));
const STRING_LINE = /^(.*)~\.(\d+)$/;

/** 경로의 지금 값. "@person"은 "관리자 / 작성자", "…~.N"은 여러 줄 글의 N째 줄, 묶음 경로면 배열·글 */
export function valueAt(card: Json, path: string): unknown {
  if (path === "@person") return `${card.manager ?? ""}${card.writer ? ` / ${card.writer}` : ""}`;
  const sl = STRING_LINE.exec(path);
  if (sl) return String(getAt(card, sl[1]) ?? "").split("\n")[Number(sl[2])];
  return getAt(card, path);
}

function setAt(card: Json, path: string, value: unknown): Json {
  const c = structuredClone(card);
  const toks = tokens(path);
  let cur = c;
  for (let i = 0; i < toks.length - 1; i++) {
    if (cur[toks[i]] === undefined || cur[toks[i]] === null) cur[toks[i]] = typeof toks[i + 1] === "number" ? [] : {};
    cur = cur[toks[i]];
  }
  cur[toks.at(-1)!] = structuredClone(value);
  return c;
}

const isLineItem = (v: unknown) => typeof v === "string" || (Boolean(v) && typeof v === "object" && !Array.isArray(v) && ("table" in (v as object) || "image" in (v as object)));

/** 편집이 닿는 묶음 경로 */
export function containerOf(card: Json, path: string, target: EditTarget | undefined): string {
  if (!target?.line) return path;
  const sl = STRING_LINE.exec(path);
  if (sl) return sl[1];
  const toks = path.split(".");
  for (let i = 1; i < toks.length; i++) {
    if (!/^\d+$/.test(toks[i])) continue;
    const prefix = toks.slice(0, i).join(".");
    const v = getAt(card, prefix);
    if (Array.isArray(v) && v.every(isLineItem)) return prefix;
  }
  return toks.slice(0, -1).join(".");
}

/** 여러 줄을 한 칸에 두는 칸(계량지표 칸·AI 활용 글) — edit.ts와 같은 기준 */
const MULTILINE_CELL = (path: string) => /^kpi\.rows\.\d+\.\w+$/.test(path) && !path.endsWith(".nameRaw") ? true : path === "strategy.ai.text";

const OP_RANK: Record<EditOp, number> = { insert_after: 0, replace: 1, delete: 2 };

/** 뒤쪽 경로부터(같은 목록의 앞 번호가 밀리지 않게). 같은 경로면 넣기 → 바꾸기 → 지우기 */
function compareDesc(a: string, b: string): number {
  const ta = a.split(".");
  const tb = b.split(".");
  for (let i = 0; i < Math.min(ta.length, tb.length); i++) {
    if (ta[i] === tb[i]) continue;
    const na = /^\d+$/.test(ta[i]);
    const nb = /^\d+$/.test(tb[i]);
    if (na && nb) return Number(tb[i]) - Number(ta[i]);
    return ta[i] < tb[i] ? 1 : -1;
  }
  return tb.length - ta.length;
}

const cleanLine = (s: string) => s.replace(/\r\n?/g, "\n").replace(/\s*\n\s*/g, " ").trim();

function applyOne(card: Json, e: CardEdit, t: EditTarget | undefined): Json {
  if (!t || t.locked) return card;
  if (!t.line) {
    if (e.op !== "replace") return card;
    const multi = MULTILINE_CELL(e.path);
    const text = (multi ? e.lines.map((l) => l.replace(/\r\n?/g, "\n").trim()) : e.lines.map(cleanLine)).filter(Boolean).join(multi ? "\n" : " ");
    return applyText(card, e.path, text);
  }
  if (e.op === "delete") return deleteLine(card, e.path).card;
  const lines = e.lines.map(cleanLine).filter(Boolean);
  if (!lines.length) return card;
  let c = card;
  let at = e.path;
  let rest = lines;
  if (e.op === "replace") {
    c = applyText(c, e.path, lines[0]);
    rest = lines.slice(1);
  }
  for (const ln of rest) ({ card: c, path: at } = insertLineAfter(c, at, ln));
  return c;
}

/** 같은 카드 기준의 편집들을 한꺼번에 적용(경로는 모두 적용 전 카드 기준) */
export function applyEdits(card: Json, edits: CardEdit[], targets: Map<string, EditTarget>): Json {
  const order = edits.map((e, i) => ({ e, i })).sort((a, b) => compareDesc(a.e.path, b.e.path) || OP_RANK[a.e.op] - OP_RANK[b.e.op] || a.i - b.i);
  let c = card;
  for (const { e } of order) c = applyOne(c, e, targets.get(e.path));
  return c;
}

function setContainer(card: Json, container: string, value: unknown, targets: Map<string, EditTarget>): Json {
  const t = targets.get(container);
  // 칸은 applyText로(계량지표 이름의 단위, 월별 기간 표지, 관리자/작성자 나누기까지 같이)
  if (t && !t.line) return applyText(card, container, String(value ?? ""));
  return setAt(card, container, value ?? []);
}

const same = (a: unknown, b: unknown) => canonicalJson(a ?? null) === canonicalJson(b ?? null);

export interface MergeResult {
  card: Json;
  /** 코멘트별 반영한 묶음 */
  applied: Record<string, string[]>;
  /** 코멘트별로 그사이 사용자가 고쳐 반영하지 않은 묶음 */
  conflicts: Record<string, string[]>;
}

/**
 * AI 편집(보낼 때 카드 snapshot 기준)을 지금 카드(current)에 합칩니다.
 * 묶음마다 지금 값이 보낼 때 값과 같을 때만 바꾸고, 다르면(기다리는 동안 사용자가 고침) 그 묶음은 두고 충돌로 알립니다.
 */
export function mergeEdits(current: Json, snapshot: Json, edits: TaggedEdit[], targets: Map<string, EditTarget>): MergeResult {
  const groups = new Map<string, TaggedEdit[]>();
  for (const e of edits) {
    const t = targets.get(e.path);
    if (!t || t.locked) continue;
    const c = containerOf(snapshot, e.path, t);
    const list = groups.get(c);
    if (list) list.push(e);
    else groups.set(c, [e]);
  }
  const applied: Record<string, string[]> = {};
  const conflicts: Record<string, string[]> = {};
  const add = (m: Record<string, string[]>, id: string, c: string) => (m[id] ??= []).includes(c) || m[id].push(c);
  let card = current;
  for (const [c, list] of groups) {
    const ids = [...new Set(list.map((e) => e.commentId))];
    if (!same(valueAt(current, c), valueAt(snapshot, c))) {
      for (const id of ids) add(conflicts, id, c);
      continue;
    }
    const next = valueAt(applyEdits(snapshot, list, targets), c);
    if (same(next, valueAt(snapshot, c))) continue;
    card = setContainer(card, c, next, targets);
    for (const id of ids) add(applied, id, c);
  }
  return { card, applied, conflicts };
}

/** 한 번 보낸 코멘트 묶음(되돌리기·다시 반영에 씀) */
export interface CommentBatch {
  snapshot: Json;
  edits: TaggedEdit[];
  targets: Map<string, EditTarget>;
  /** 코멘트별 반영한 묶음과 지금 반영 상태 */
  state: Record<string, { containers: string[]; applied: boolean }>;
}

function containerValue(b: CommentBatch, container: string, on: Set<string>): unknown {
  const list = b.edits.filter((e) => on.has(e.commentId) && b.state[e.commentId]?.containers.includes(container) && containerOf(b.snapshot, e.path, b.targets.get(e.path)) === container);
  return valueAt(applyEdits(b.snapshot, list, b.targets), container);
}

/**
 * 코멘트 하나를 되돌리거나(on=false) 다시 반영(on=true). 그 코멘트가 바꾼 묶음마다 지금 값이 "반영된 코멘트들의 결과"와
 * 같을 때만 바꿉니다 — 그 뒤 사용자·다른 AI 반영이 같은 묶음을 고쳤으면 막고(blocked) 아무것도 바꾸지 않습니다.
 */
export function toggleComment(current: Json, b: CommentBatch, id: string, on: boolean): { ok: true; card: Json } | { ok: false; blocked: string[] } {
  const me = b.state[id];
  if (!me || me.applied === on) return { ok: true, card: current };
  const now = new Set(Object.entries(b.state).filter(([, s]) => s.applied).map(([k]) => k));
  const next = new Set(now);
  if (on) next.add(id);
  else next.delete(id);
  const blocked = me.containers.filter((c) => !same(valueAt(current, c), containerValue(b, c, now)));
  if (blocked.length) return { ok: false, blocked };
  let card = current;
  for (const c of me.containers) card = setContainer(card, c, containerValue(b, c, next), b.targets);
  return { ok: true, card };
}
