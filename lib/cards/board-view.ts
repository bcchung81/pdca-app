// 과제 목록 보기 설정(탭·검색·정렬·필터) ↔ 주소 쿼리, 즉시 검색. 서버가 첫 화면을 같은 설정으로 그리고, 카드를 닫으면 같은 보기로 돌아옵니다.

import { compactKey } from "../knowledge/normalize.ts";
import type { CardRow } from "./queries.ts";

export const SORT_KEYS = ["title", "business", "taskNo", "department", "person", "kind", "inspection", "updated"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export const FILTER_KEYS = ["department", "kind", "draft"] as const;
/** 작성본 필터 값 — 목록 칩 글자(`versionLabel`)와 같은 말 + 칩이 없는 「시작 전」 */
export const DRAFT_FILTER_VALUES = ["시작 전", "작성 중", "돌려받음", "제출", "확정"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

export interface BoardView {
  unit: string;
  q: string;
  sort: { key: SortKey; dir: "asc" | "desc" } | null;
  filters: Record<FilterKey, string[]>;
}

export const EMPTY_VIEW: BoardView = { unit: "", q: "", sort: null, filters: { department: [], kind: [], draft: [] } };

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseView(sp: Params, units: string[]): BoardView {
  const unit = units.includes(one(sp.unit)) ? one(sp.unit) : "";
  const [k, d] = one(sp.sort).split(".");
  const sort = (SORT_KEYS as readonly string[]).includes(k) ? { key: k as SortKey, dir: d === "desc" ? ("desc" as const) : ("asc" as const) } : null;
  const filters = { ...EMPTY_VIEW.filters };
  for (const f of FILTER_KEYS) {
    const raw = one(sp[`f_${f}`]);
    filters[f] = raw ? raw.split("|").map((s) => s.trim()).filter(Boolean).slice(0, 30) : [];
  }
  return { unit, q: one(sp.q).slice(0, 80), sort, filters };
}

export function viewParams(v: BoardView): URLSearchParams {
  const p = new URLSearchParams();
  if (v.unit) p.set("unit", v.unit);
  if (v.q.trim()) p.set("q", v.q.trim());
  if (v.sort) p.set("sort", `${v.sort.key}.${v.sort.dir}`);
  for (const f of FILTER_KEYS) if (v.filters[f].length) p.set(`f_${f}`, v.filters[f].join("|"));
  return p;
}

/** 목록이 놓인 화면(과제 원장 /cards, 내 과제 /my)과 늘 붙일 쿼리(부서 화면 ?team=) */
export interface BoardBase {
  path: string;
  keep?: Record<string, string>;
}

/** 보기 설정을 유지한 채 카드 옆 창을 여는 주소 / 닫는 주소 */
export function boardHref(v: BoardView, peek?: string, base: BoardBase = { path: "/cards" }): string {
  const p = viewParams(v);
  for (const [k, val] of Object.entries(base.keep ?? {})) p.set(k, val);
  if (peek) p.set("peek", peek);
  const s = p.toString();
  return s ? `${base.path}?${s}` : base.path;
}

/** 즉시 검색: 가운뎃점·띄어쓰기·대소문자와 상관없이, 낱말마다 어느 열에든 있으면(AND) */
export function matchesQuery(r: CardRow, q: string): boolean {
  const terms = q.split(/\s+/).map(compactKey).filter(Boolean);
  if (!terms.length) return true;
  const hay = compactKey([r.title, r.business, r.taskNo, r.department, r.team ?? "", r.person, r.kind ?? ""].join(" "));
  return terms.every((t) => hay.includes(t));
}
