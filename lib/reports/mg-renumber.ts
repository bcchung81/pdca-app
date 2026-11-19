// 경영관리 평가내용 번호 옮기기(순수, 2026-11-19 사용자 결정 D1 안 2·D2): 2025 연번으로 저장된 구성안·초안·목차 글·지표 단위 부분을 '26 편람(11.13 수정) 번호로.
// 번호가 실제로 밀리는 지표는 상생(MG-7) 하나(옛 2 → 3, 옛 3 → 4 — mg-items.ts MG_ITEM_PLAN의 from ≠ no). 다른 지표는 사상이 없어 아무것도 바꾸지 않음.
// 변환 대상은 평가내용 제목이 그 2025 번호의 2025 제목과 같은 것만(새 구성안이 만든 ②(지역업체) 등 '26 번호로 저장된 것은 제목이 달라 그대로) — 그래서 두 번 돌려도 결과가 같음.
// 한 번에 동시 사상(2 → 3과 3 → 4를 같은 원래 값에서 셈 — 연쇄 없음). 쓰는 곳: 운영 변환 스크립트 scripts/reports/mg-renumber.ts, 판 되돌리기(version-actions.ts restoreDraftVersion).

import { MG_ITEM_PLAN } from "./mg-items.ts";
import { mgPartKey } from "./mg-types.ts";
import type { LooseJson } from "../loose-json.ts";

type Json = LooseJson;

/** 변환 맥락: 지표·2025 번호별 2025 제목(rpt25-mg 조각 eval_title)·'26 번호별 제목(편람 항목표 mg-items.ts mgItems) */
export interface MgRenumberCtx {
  unit: string;
  titles2025: ReadonlyMap<number, string>;
  titles26: ReadonlyMap<number, string>;
}

/** 이 지표의 2025 → '26 번호 사상(번호가 다른 것만 — 없으면 빈 맵, 상생 MG-7만 {2→3, 3→4}) */
export function renumberMap(unit: string): Map<number, number> {
  return new Map((MG_ITEM_PLAN[unit] ?? []).flatMap((x) => (x.from !== undefined && x.from !== x.no ? [[x.from, x.no] as const] : [])));
}

/** 제목 비교(띄어쓰기·가운뎃점 변형 무시) */
const norm = (s: unknown) => String(s ?? "").replace(/[\s･·ㆍ・]/g, "");

/** 옮길 평가내용인지: 사상에 있는 번호이고 제목이 그 2025 번호의 2025 제목과 같음 → 새 번호, 아니면 null */
function target(no: unknown, title: unknown, ctx: MgRenumberCtx, map: Map<number, number>): number | null {
  const n = Number(no);
  const to = map.get(n);
  if (to === undefined) return null;
  const t25 = ctx.titles2025.get(n);
  return t25 && norm(title) === norm(t25) ? to : null;
}

/** 절 목록(구성안 mg.parts·초안 spec.mg.parts) 옮기기 → 새 목록·옛 열쇠 → 새 열쇠. 새 열쇠가 옮기지 않는 절과 겹치면 그 절은 옮기지 않고 notes에 */
function renumberParts(parts: Json[], ctx: MgRenumberCtx, map: Map<number, number>, notes: string[]): { parts: Json[]; keys: Map<string, string> } {
  const keys = new Map<string, string>();
  const plan = parts.map((p) => target(p?.evalNo, p?.evalTitle, ctx, map));
  const stay = new Set(parts.filter((_, i) => plan[i] === null).map((p) => String(p?.key ?? "")));
  const out = parts.map((p, i) => {
    const to = plan[i];
    if (to === null) return p;
    const key = mgPartKey(to, Number(p.themeNo), String(p.mark ?? ""));
    if (stay.has(key)) {
      notes.push(`절 ${p.key} → ${key}: 같은 열쇠의 절이 이미 있어 옮기지 않음(확인 필요)`);
      return p;
    }
    keys.set(String(p.key), key);
    return { ...p, key, evalNo: to, evalTitle: ctx.titles26.get(to) ?? p.evalTitle };
  });
  return { parts: out, keys };
}

const mapKey = (keys: Map<string, string>) => (k: unknown) => (typeof k === "string" && keys.has(k) ? keys.get(k)! : k);

/** 구성안(card_report_drafts.outline — Composition) 옮기기: mg.parts·블록 at·mg.coverage의 절 열쇠. 경영관리 골격이 없거나 옮길 절이 없으면 그대로(changed 0) */
export function renumberComposition(c: Json, ctx: MgRenumberCtx): { value: Json; changed: number; notes: string[] } {
  const map = renumberMap(ctx.unit);
  const notes: string[] = [];
  if (!map.size || !c?.mg || !Array.isArray(c.mg.parts)) return { value: c, changed: 0, notes };
  const { parts, keys } = renumberParts(c.mg.parts, ctx, map, notes);
  if (!keys.size) return { value: c, changed: 0, notes };
  const k = mapKey(keys);
  const blocks = Array.isArray(c.blocks) ? c.blocks.map((b: Json) => (b && typeof b.at === "string" && keys.has(b.at) ? { ...b, at: k(b.at) } : b)) : c.blocks;
  const mg = { ...c.mg, parts, ...(Array.isArray(c.mg.coverage) ? { coverage: c.mg.coverage.map((x: Json) => (x?.part && keys.has(x.part) ? { ...x, part: k(x.part) } : x)) } : {}) };
  return { value: { ...c, blocks, mg }, changed: keys.size, notes };
}

/** 초안(card_report_drafts.spec — ReportSectionSpec) 옮기기: spec.mg.parts·at·finding. 옮길 절이 없으면 그대로 */
export function renumberSpec(spec: Json, ctx: MgRenumberCtx): { value: Json; changed: number; notes: string[] } {
  const map = renumberMap(ctx.unit);
  const notes: string[] = [];
  if (!map.size || !spec?.mg || !Array.isArray(spec.mg.parts)) return { value: spec, changed: 0, notes };
  const { parts, keys } = renumberParts(spec.mg.parts, ctx, map, notes);
  if (!keys.size) return { value: spec, changed: 0, notes };
  const k = mapKey(keys);
  const mg = { ...spec.mg, parts, ...(Array.isArray(spec.mg.at) ? { at: spec.mg.at.map(k) } : {}), ...(Array.isArray(spec.mg.finding) ? { finding: spec.mg.finding.map(k) } : {}) };
  return { value: { ...spec, mg }, changed: keys.size, notes };
}

/**
 * 목차 행(report_outline.section·subsection — mg-page-plan.ts buildMgOutline이 적는 「평가내용 N. 제목」·「평가내용 a·b에 걸침」) 옮기기: 1단 글의 번호·제목이 옮길 평가내용이면
 * 「평가내용 새 번호. '26 제목」, 그 행의 2단 「걸침」 번호도 같은 사상으로(동시). 1단은 그대로인데 2단에 옮길 번호가 있으면 바꾸지 않고 notes에(사람 확인 — 제목이 없어 판정 못 함)
 */
export function renumberOutlineRow(row: { section: string | null; subsection: string | null }, ctx: MgRenumberCtx): { section: string | null; subsection: string | null; changed: boolean; notes: string[] } {
  const map = renumberMap(ctx.unit);
  const notes: string[] = [];
  const same = { section: row.section, subsection: row.subsection, changed: false, notes };
  if (!map.size) return same;
  const m = /^평가내용 (\d+)\.\s*(.*)$/.exec(row.section ?? "");
  const to = m ? target(m[1], m[2], ctx, map) : null;
  const span = /^평가내용\s*([\d·,\s]+)에 걸침(.*)$/.exec(row.subsection ?? "");
  if (to === null) {
    if (span && span[1].split(/[·,\s]+/).some((x) => map.has(Number(x)))) notes.push(`목차 2단 「${row.subsection}」: 1단(「${row.section}」)이 옮길 평가내용이 아니라 바꾸지 않음(확인 필요)`);
    return same;
  }
  const section = `평가내용 ${to}. ${ctx.titles26.get(to) ?? m![2]}`.trim();
  const subsection = span ? `평가내용 ${span[1].split(/[·,\s]+/).filter(Boolean).map((x) => map.get(Number(x)) ?? Number(x)).join("·")}에 걸침${span[2]}` : row.subsection;
  return { section, subsection, changed: true, notes };
}

/**
 * 지표 단위 부분(eval_unit_report_parts.spec — 전년 대비 prior·성과분석 outcome의 평가내용 행) 옮기기: 행 code.evalNo·code.title이 옮길 평가내용이면 id(prior/N·qual/N·plan/N)·번호·제목을 바꿈
 * (사람·AI 칸은 그대로 — 「재료로 다시 채우기」가 번호로 짝지으므로 옮기지 않으면 옛 ②의 글이 새 ②(지역업체)에 붙음). 표지·지적은 평가내용 번호가 없어 그대로
 */
export function renumberUnitPart(spec: Json, ctx: MgRenumberCtx): { value: Json; changed: number; notes: string[] } {
  const map = renumberMap(ctx.unit);
  const notes: string[] = [];
  if (!map.size || !spec || (spec.part !== "prior" && spec.part !== "outcome")) return { value: spec, changed: 0, notes };
  let changed = 0;
  const rows = (list: unknown) => {
    if (!Array.isArray(list)) return list;
    const plan = list.map((r: Json) => target(r?.code?.evalNo, r?.code?.title, ctx, map));
    const stay = new Set(list.filter((_, i) => plan[i] === null).map((r: Json) => String(r?.id ?? "")));
    return list.map((r: Json, i: number) => {
      const to = plan[i];
      if (to === null) return r;
      const id = String(r.id ?? "").replace(/\/\d+$/, `/${to}`);
      if (stay.has(id)) {
        notes.push(`행 ${r.id} → ${id}: 같은 id의 행이 이미 있어 옮기지 않음(확인 필요)`);
        return r;
      }
      changed += 1;
      return { ...r, id, code: { ...r.code, evalNo: to, title: ctx.titles26.get(to) ?? r.code.title } };
    });
  };
  const value = spec.part === "prior" ? { ...spec, rows: rows(spec.rows) } : { ...spec, qual: rows(spec.qual), plan: rows(spec.plan) };
  return changed ? { value, changed, notes } : { value: spec, changed: 0, notes };
}

/** 초안 행 하나(구성안·초안 둘 다 — 판 되돌리기·변환 스크립트 공용): 바뀐 칸만 돌려줌 */
export function renumberDraftRow(row: { outline?: Json; spec?: Json }, ctx: MgRenumberCtx): { outline?: Json; spec?: Json; changed: number; notes: string[] } {
  const o = row.outline ? renumberComposition(row.outline, ctx) : null;
  const s = row.spec ? renumberSpec(row.spec, ctx) : null;
  return { ...(o?.changed ? { outline: o.value } : {}), ...(s?.changed ? { spec: s.value } : {}), changed: (o?.changed ?? 0) + (s?.changed ?? 0), notes: [...(o?.notes ?? []), ...(s?.notes ?? [])] };
}
