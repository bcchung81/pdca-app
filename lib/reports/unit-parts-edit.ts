// 경영관리 지표 단위 부분 저장 앞 단계(R5b 뒷단, 순수 — 입출력 없음). 설계 docs/plan/경영관리-R5-지표단위-설계.md §3.2·§3.3.
// ① 부분 하나 만들기(freshUnitPart) ② 「재료로 다시 채우기」 병합(mergeUnitPart — code 칸만 새 값, ai·human 칸은 저장된 값)
// ③ 칸 고치기(applyUnitPartEdits — 허용 경로만, ai·human 칸만, code 칸은 거절) ④ 저장된 spec 읽기(readUnitPart).
// 서버 액션(app/(app)/reports/business/[unit]/parts/actions.ts)이 부르고, 저장은 버전 조건(lib/reports/draft-store.ts saveUnitPartRow).

import { compactKey } from "../knowledge/normalize.ts";
import type { UnitPartKey } from "../tracks/index.ts";
import {
  type ContactRow,
  type MgUnitMaterials,
  type OutcomePart,
  type UnitPart,
  buildCoverPart,
  buildFindingsPart,
  buildOutcomePart,
  buildPriorPart,
  mgUnitPartKeys,
  outcomeWarnings,
} from "./unit-parts-mg.ts";
import { UNIT_PART_CONTACT_MAX, UNIT_PART_LINES_MAX, UNIT_PART_LINE_MAX, UNIT_PART_TEXT_MAX } from "./input-limits.ts";
import type { LooseJson } from "../loose-json.ts";


/** DB 가드 트리거(supabase/migrations/20261016100000_unit_report_parts.sql guard_unit_report_part)와 같은 문구 */
export const UNIT_PART_CONFIRM_MSG = "지표 단위 부분 확정은 성과관리팀만 할 수 있습니다";
export const UNIT_PART_KEY_MSG = "지표 단위 부분의 지표·연도·부분은 바꿀 수 없습니다";

/** 화면 이름(경고·안내 글) */
export const UNIT_PART_LABEL: Record<UnitPartKey, string> = { cover: "표지", findings: "지적사항 조치실적", prior: "전년 대비 주요 추진실적", outcome: "성과분석 및 환류" };

/** 재료 → 부분 하나와 그 부분 경고(이 지표에 없는 부분이면 null). code 칸은 재료 그대로, ai·human 칸은 코어 출발값 */
export function freshUnitPart(m: MgUnitMaterials, key: UnitPartKey): { part: UnitPart; warnings: string[] } | null {
  if (!mgUnitPartKeys(m.unit).includes(key)) return null;
  if (key === "cover") return buildCoverPart(m);
  if (key === "findings") return buildFindingsPart(m);
  if (key === "prior") return buildPriorPart(m);
  return buildOutcomePart(m);
}

/** 저장된 spec(jsonb) → 그 부분(모양이 어긋나면 null — 다시 채우기는 새로 만든 것으로) */
export function readUnitPart(input: unknown, key: UnitPartKey): UnitPart | null {
  const raw = input as Record<string, unknown> | null | undefined;
  if (!raw || typeof raw !== "object" || raw.part !== key) return null;
  const arrays: Record<UnitPartKey, string[]> = { cover: [], findings: ["rows"], prior: ["rows"], outcome: ["kpi", "qual", "plan"] };
  if (key === "cover" && !(raw.code && raw.human)) return null;
  return arrays[key].every((k) => Array.isArray(raw[k])) ? (raw as unknown as UnitPart) : null;
}

// ---------------------------------------------------------------------------
// 다시 채우기 병합

interface AnyRow {
  id: string;
  code: LooseJson;
  human?: Record<string, unknown>;
  ai?: Record<string, unknown>;
}

/** 칸 글 수(ai·human 칸의 글 배열·글 — 사라진 행 경고에 「쓴 글 N줄」) */
const written = (r: AnyRow) =>
  [...Object.values(r.ai ?? {}), ...Object.values(r.human ?? {})].reduce<number>((n, v) => n + (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).length : 0), 0);

/** 행 이름(경고 글) · 행 정체 글(같은 id인데 이 글이 바뀌면 남긴 칸이 새 행과 맞는지 확인) */
const ROW_KIND = {
  findings: { label: (r: AnyRow) => `지적 ${r.code.taskNo} ${Number(r.code.rowIndex) + 1}행`, identity: (r: AnyRow) => (r.code.finding ?? []).join(" ") },
  prior: { label: (r: AnyRow) => `전년 대비 평가내용${r.code.evalNo}`, identity: (r: AnyRow) => String(r.code.title ?? "") },
  kpi: { label: (r: AnyRow) => `계량 ${r.code.taskNo} 「${r.code.name}」`, identity: (r: AnyRow) => String(r.code.name ?? "") },
  qual: { label: (r: AnyRow) => `비계량 평가내용${r.code.evalNo}`, identity: (r: AnyRow) => String(r.code.title ?? "") },
  plan: { label: (r: AnyRow) => `향후 개선계획 평가내용${r.code.evalNo}`, identity: (r: AnyRow) => String(r.code.title ?? "") },
} as const;

/** 저장된 행 ↔ 새 행 짝(새 행 → 저장된 행): 같은 id */
function pairById<R extends AnyRow>(saved: R[], fresh: R[]): Map<R, R> {
  const old = new Map(saved.map((r) => [r.id, r]));
  return new Map(fresh.flatMap((r) => (old.has(r.id) ? [[r, old.get(r.id)!] as [R, R]] : [])));
}

/**
 * 지적 행 짝(원장에서 행을 끼우거나 빼도 번호가 밀린 다른 행과 짝짓지 않게): ① 같은 id(카드 id#지적 글 열쇠)
 * ② 같은 카드·같은 지적 글(옛 id 「카드 id#행 순번」 — 2026-10-17 전 저장분 — 의 이행, 같은 글이 여럿이면 차례대로)
 * ③ 같은 카드에서 둘 다 짝이 없는 행 중 같은 행 번호(글을 고친 행 — 예전처럼 남기고 「행 글이 바뀜」 경고). ①·② 뒤에 남은 것끼리만이라 행이 밀려도 다른 지적을 덮지 않음
 */
function pairFindingRows<R extends AnyRow>(saved: R[], fresh: R[]): Map<R, R> {
  const out = pairById(saved, fresh);
  const used = new Set(out.values());
  const textKey = (r: AnyRow) => `${r.code.cardId}\u0000${compactKey((r.code.finding ?? []).join(" "))}`;
  for (const r of fresh) {
    if (out.has(r)) continue;
    const s = saved.find((x) => !used.has(x) && textKey(x) === textKey(r));
    if (s) {
      out.set(r, s);
      used.add(s);
    }
  }
  for (const r of fresh) {
    if (out.has(r)) continue;
    const s = saved.find((x) => !used.has(x) && x.code.cardId === r.code.cardId && x.code.rowIndex === r.code.rowIndex);
    if (s) {
      out.set(r, s);
      used.add(s);
    }
  }
  return out;
}

/**
 * 행 병합: 행 목록·순서·code 칸·id는 새로 만든 것(fresh), 짝(지적은 pairFindingRows, 나머지는 같은 id)인 행은 저장된 ai·human 칸을 남김(새 코어에 생긴 칸은 출발값으로 채움).
 * saved가 없으면(처음 채우기) 경고 없음. 새 행·사라진 행·짝인데 정체 글이 바뀐 행은 경고
 */
function mergeRows<R extends AnyRow>(saved: R[] | null, fresh: R[], kind: keyof typeof ROW_KIND, warn: string[]): R[] {
  if (!saved) return fresh;
  const { label, identity } = ROW_KIND[kind];
  const pairs = kind === "findings" ? pairFindingRows(saved, fresh) : pairById(saved, fresh);
  const out = fresh.map((r) => {
    const s = pairs.get(r);
    if (!s) {
      warn.push(`새 행: ${label(r)} — 재료에 새로 생김(AI·사람 칸은 비어 있음)`);
      return r;
    }
    if (identity(s) !== identity(r)) warn.push(`행 글이 바뀜: ${label(r)} — 남긴 칸(AI·사람이 쓴 글)이 새 행 글과 맞는지 확인`);
    return { ...r, ...(r.human ? { human: { ...r.human, ...(s.human ?? {}) } } : {}), ...(r.ai ? { ai: { ...r.ai, ...(s.ai ?? {}) } } : {}) };
  });
  // 사라진 행: 지적은 짝이 안 된 저장 행, 나머지는 예전처럼 새 목록에 같은 id가 없는 저장 행
  const kept = new Set(pairs.values());
  const ids = new Set(fresh.map((r) => r.id));
  for (const s of saved) {
    if (kind === "findings" ? kept.has(s) : ids.has(s.id)) continue;
    const n = written(s);
    warn.push(`사라진 행: ${label(s)} — 재료에서 빠짐${n ? `(쓴 글 ${n}줄이 함께 빠짐)` : ""}`);
  }
  return out;
}

/** 성과분석 경고 갈아 끼우기: 계량 표 경고(outcomeWarnings — 사람이 고른 행·극성에 따라 다름)만 지금 부분으로 다시 셈, 나머지 경고는 그대로 */
export function refreshOutcomeWarnings(warnings: string[], before: OutcomePart, after: OutcomePart): string[] {
  const stale = new Set(outcomeWarnings(before));
  return [...warnings.filter((w) => !stale.has(w)), ...outcomeWarnings(after)];
}

/**
 * 「재료로 다시 채우기」: fresh(재료로 새로 만든 부분)의 code 칸으로 바꾸되 saved(저장된 부분)의 human 칸(사람이 줄이거나 고른 값 — ’25까지 글·계량 행 고르기·극성·구분·담당자 표)과
 * ai 칸(AI·사람이 쓴 문장)은 남김. 행은 정체(지적 = 카드 id#지적 글 열쇠 — 옛 「카드 id#행 번호」는 같은 글로 이행, 전년 대비·비계량·개선계획 = 평가내용 번호, 계량 = kpiKey)로 짝지음.
 * 경고 = 부분 경고(계량 표 경고는 병합 뒤 행으로 다시 셈) + 병합 경고(새 행·사라진 행·행 글이 바뀜)
 */
export function mergeUnitPart(saved: UnitPart | null, fresh: { part: UnitPart; warnings: string[] }): { part: UnitPart; warnings: string[] } {
  const f = fresh.part;
  const s = saved && saved.part === f.part ? saved : null;
  const warn: string[] = [];
  let part: UnitPart;
  let warnings = fresh.warnings;
  if (f.part === "cover") {
    part = s?.part === "cover" ? { ...f, human: { ...f.human, ...s.human } } : f;
  } else if (f.part === "findings") {
    part = { ...f, rows: mergeRows(s?.part === "findings" ? s.rows : null, f.rows, "findings", warn) };
  } else if (f.part === "prior") {
    part = { ...f, rows: mergeRows(s?.part === "prior" ? s.rows : null, f.rows, "prior", warn) };
  } else {
    const o = s?.part === "outcome" ? s : null;
    const merged: OutcomePart = {
      ...f,
      kpi: mergeRows(o?.kpi ?? null, f.kpi, "kpi", warn),
      qual: mergeRows(o?.qual ?? null, f.qual, "qual", warn),
      plan: mergeRows(o?.plan ?? null, f.plan, "plan", warn),
    };
    warnings = refreshOutcomeWarnings(warnings, f, merged);
    part = merged;
  }
  return { part, warnings: [...warnings, ...warn] };
}

// ---------------------------------------------------------------------------
// 칸 고치기

export interface UnitPartEdit {
  /** 부분 spec 안 경로(행은 번호 — 「rows.0.ai.actions」) */
  path: string;
  value: unknown;
}

type FieldKind = "lines" | "text" | "bool" | "polarity" | "contacts";

/** 고칠 수 있는 칸(ai·human만 — code 칸은 「재료로 다시 채우기」가 정함) */
const FIELDS: Record<UnitPartKey, Array<[RegExp, FieldKind]>> = {
  cover: [[/^human\.contacts$/, "contacts"]],
  findings: [[/^rows\.\d{1,3}\.ai\.actions$/, "lines"]],
  prior: [[/^rows\.\d{1,3}\.(?:human\.upTo|ai\.(?:now|effect))$/, "lines"]],
  outcome: [
    [/^kpi\.\d{1,3}\.human\.checked$/, "bool"],
    [/^kpi\.\d{1,3}\.human\.polarity$/, "polarity"],
    [/^kpi\.\d{1,3}\.ai\.analysis$/, "lines"],
    [/^(?:qual|plan)\.\d{1,3}\.human\.label$/, "text"],
    [/^qual\.\d{1,3}\.ai\.(?:result|analysis)$/, "lines"],
    [/^plan\.\d{1,3}\.ai\.(?:self|plan)$/, "lines"],
  ],
};

/** 칸 글 한 줄 정리: 태그 꺾쇠를 빼고 공백을 한 칸으로(앞 「- 」 하위 줄 표기는 그대로 — ’25까지 글이 씀) */
const clean = (s: unknown, max: number) =>
  String(s ?? "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const CONTACTS_MAX = 10;

/** 값 → 칸 값(형식이 틀리면 undefined) */
function fieldValue(kind: FieldKind, v: unknown): unknown {
  if (kind === "lines") return Array.isArray(v) ? v.map((x) => clean(x, UNIT_PART_LINE_MAX)).filter(Boolean).slice(0, UNIT_PART_LINES_MAX) : undefined;
  if (kind === "text") return typeof v === "string" ? clean(v, UNIT_PART_TEXT_MAX) : undefined;
  if (kind === "bool") return typeof v === "boolean" ? v : undefined;
  if (kind === "polarity") return v === "up" || v === "down" ? v : undefined;
  if (!Array.isArray(v)) return undefined;
  return (v as Array<Record<string, unknown> | null | undefined>)
    .map((r): ContactRow => ({ role: clean(r?.role, UNIT_PART_CONTACT_MAX), name: clean(r?.name, UNIT_PART_CONTACT_MAX), phone: clean(r?.phone, UNIT_PART_CONTACT_MAX), email: clean(r?.email, UNIT_PART_CONTACT_MAX) }))
    .filter((r) => r.role || r.name || r.phone || r.email)
    .slice(0, CONTACTS_MAX);
}

export type UnitPartEditResult = { ok: true; part: UnitPart; changed: number } | { ok: false; message: string };

/**
 * 칸 고치기(부분 하나 — 모두 적용해 본 뒤 하나라도 잘못되면 아무것도 안 바꿈): 허용 경로(FIELDS)의 ai·human 칸만, 칸 형식에 맞는 값만.
 * code 칸(재료에서 오는 값 — 지적 글·숫자·평가내용 제목 등)은 거절. 행은 이미 있는 것만(행 더하기·빼기는 재료가 정함)
 */
export function applyUnitPartEdits(part: UnitPart, edits: UnitPartEdit[]): UnitPartEditResult {
  const next = JSON.parse(JSON.stringify(part)) as Record<string, LooseJson>;
  let changed = 0;
  for (const e of edits) {
    const path = String(e?.path ?? "");
    const kind = FIELDS[part.part].find(([re]) => re.test(path))?.[1];
    if (!kind) return { ok: false, message: /(?:^|\.)code(?:\.|$)/.test(path) ? "재료에서 채우는 칸은 고칠 수 없습니다 — 「재료로 다시 채우기」로 바뀝니다." : "여기서는 고칠 수 없는 칸입니다." };
    const keys = path.split(".");
    let parent: LooseJson = next;
    for (const k of keys.slice(0, -1)) parent = parent && typeof parent === "object" ? parent[k] : undefined;
    const last = keys.at(-1)!;
    if (!parent || typeof parent !== "object" || !(last in parent)) return { ok: false, message: "고칠 칸을 찾지 못했습니다 — 화면을 새로 고쳐 주세요." };
    const value = fieldValue(kind, e?.value);
    if (value === undefined) return { ok: false, message: "값 형식이 칸과 맞지 않습니다." };
    if (JSON.stringify(parent[last]) === JSON.stringify(value)) continue;
    parent[last] = value;
    changed += 1;
  }
  return { ok: true, part: next as UnitPart, changed };
}
