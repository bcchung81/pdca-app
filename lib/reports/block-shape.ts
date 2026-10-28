// 경평 초안 블록 「모양 바꾸기」 규칙(순수, 2026-10-12 사용자 요구 「이야기 틀·개별 수정안이 요청에 따라 다양한 프레임워크로」 — 블록 층).
// 블록 고치기(lib/reports/block-edit.ts)가 요청에 따라 블록 종류·모양(kind·variant)을 바꿀 때 코드가 정하는 것:
//  - 이 트랙에서 쓸 수 있는 모양인지(짜임 사전 SHAPES — 표 모양 4종 table:result·bars·chevron·ladder와 핵심 수치 띠(2026-10-28)는 경영관리만)
//  - 이 과제만의 요소(인용·말풍선·정의·우수사례·협업·막대)는 근거 조건이 있을 때만(구성안이 있으면 shapeAvailability, 없으면 집필 때의 도식 후보 — 집필과 같은 기준)
//  - 바꿔 넣을 때 원래 블록의 내용 아닌 필드(배치 등 — 나중에 생길 필드 포함)는 그대로 둠(withContent)
//  - 판면(주요사업)·분량(경영관리) 어림 차이
// 쓰는 곳: block-edit.ts(검증·요청 글), 서버 액션 app/(app)/reports/cards/edit-actions.ts, 과제별 초안 화면의 「다른 모양으로」 목록.

import type { Block, BlockKind } from "./blocks.ts";
import { mgSpecHeight } from "./business-layout.ts";
import { OWN_KINDS, type DiagramHint, isOwnKind } from "./diagram-hints.ts";
import { PAGE_MM, fitReport } from "./fit.ts";
import { type Availability, BIZ_RETIRED_SHAPES, BIZ_RETIRED_WHY, type EvidenceSource, SHAPES, type ShapeGroup, shapeAvailability, shapeCode, shapeName, shapeOf } from "./frameworks.ts";
import type { ReportSectionSpec } from "./section.ts";

/**
 * 경영관리 초안에서만 쓰는 모양 — 표 모양 4종(2025 경영관리 보고서 빈출, 주요사업 프롬프트에는 안 보임 — report-draft/blocks.md 머리 설명)
 * + 주요사업 새 초안에서 고르지 않는 모양(핵심 수치 띠 — frameworks.ts BIZ_RETIRED_SHAPES, 2026-10-28)
 */
export const MG_ONLY_SHAPES: readonly string[] = [...SHAPES.filter((s) => s.kind === "table" && s.variant !== "").map((s) => s.code), ...BIZ_RETIRED_SHAPES];

/** 모양 바꾸기 규칙: 트랙 + 이 과제만의 요소 종류별 근거 조건 */
export interface ShapeRules {
  mg: boolean;
  avail: Partial<Record<BlockKind, Availability>>;
}

/** 근거 조건의 이유 글에서 구성안 안내 꼬리(「— 근거 자료(첨부)를 더한 뒤 구성안을 다시 만들면 …」)를 뗌 — 블록 고치기에서는 맞지 않는 안내 */
const shortWhy = (why: string) => why.split(" — ")[0];

/**
 * 규칙 만들기: 구성안이 있으면 구성안 편집과 같은 근거 조건(shapeAvailability — 원문을 찾은 재료·AI가 그 구성안에서 추천한 모양),
 * 없으면(주요사업 바로 만들기) 집필 때와 같은 도식 후보 중 이 과제만의 요소(sectionHints own — 근거에서 찾은 신호)
 */
export function shapeRules(mg: boolean, composition: EvidenceSource | null, ownHints: DiagramHint[] = []): ShapeRules {
  const avail: Partial<Record<BlockKind, Availability>> = {};
  const base = shapeAvailability(composition ?? { materials: [], blocks: [] });
  for (const kind of OWN_KINDS) {
    if (composition) {
      avail[kind] = { ok: base[kind].ok, why: shortWhy(base[kind].why) };
      continue;
    }
    const hint = ownHints.find((h) => h.kind.split(":")[0] === kind);
    avail[kind] = hint ? { ok: true, why: `근거에서 찾은 신호 — ${hint.why}` } : { ok: false, why: shortWhy(base[kind].why) };
  }
  return { mg, avail };
}

/** 이 블록을 kind·variant 모양으로 바꿔도 되는지 — 같은 모양은 늘 됨 */
export function shapeAllowed(before: Pick<Block, "kind" | "variant">, kind: string, variant: string, rules: ShapeRules): { ok: true } | { ok: false; why: string } {
  const code = shapeCode(kind, variant);
  if (code === shapeCode(before.kind, before.variant)) return { ok: true };
  const info = shapeOf(code);
  if (!info) return { ok: false, why: `모르는 모양(${code})입니다` };
  if (!rules.mg && BIZ_RETIRED_SHAPES.includes(code)) return { ok: false, why: `「${info.name}」 — ${BIZ_RETIRED_WHY}` };
  if (!rules.mg && MG_ONLY_SHAPES.includes(code)) return { ok: false, why: `「${info.name}」은 경영관리 보고서 표 모양이라 주요사업 초안에서는 쓰지 않습니다` };
  if (isOwnKind(info.kind) && info.kind !== before.kind) {
    const a = rules.avail[info.kind];
    if (!a?.ok) return { ok: false, why: `「${info.name}」은 이 과제만의 요소라 근거가 있어야 씁니다 — ${a?.why || "근거 재료가 없음"}` };
  }
  return { ok: true };
}

/**
 * 블록의 내용 필드(AI가 다시 쓰는 것). 이 밖의 필드(배치 등 — 지금 없거나 나중에 생길 것)는 바꿔 넣을 때 원래 블록 값을 그대로 둠.
 * 목록을 blocks.ts의 답 필드에서 끌어오지 않고 여기 적음 — 답 필드가 늘어도 원래 블록의 배치 필드를 AI 기본값으로 덮지 않게
 */
export const CONTENT_FIELDS = ["kind", "label", "title", "variant", "text", "items", "cells", "rows", "series", "badge", "figures"] as const;

/** 원래 블록에서 시작해 내용 필드만 next 값으로(next에 없는 내용 필드는 지움) */
export function withContent(before: Block, next: Block): Block {
  const out: Record<string, unknown> = { ...before };
  const src = next as unknown as Record<string, unknown>;
  for (const k of CONTENT_FIELDS) {
    if (src[k] === undefined) delete out[k];
    else out[k] = src[k];
  }
  return out as unknown as Block;
}

/** 초안 높이 어림: 주요사업 = 판면 어림(fitReport)과 예산, 경영관리 = 높이 어림(mgSpecHeight — 사업 조판과 같은 셈)과 배정 쪽 × 255mm(없으면 null) */
export function draftHeight(spec: ReportSectionSpec): { total: number; budget: number | null } {
  if (spec.mg) return { total: Math.round(mgSpecHeight(spec)), budget: spec.mg.pages && spec.mg.pages > 0 ? Math.round(spec.mg.pages * PAGE_MM.height) : null };
  const f = fitReport(spec);
  return { total: Math.round(f.total), budget: Math.round(f.budget) };
}

/** 블록 하나를 바꾸면 초안 높이 어림이 얼마나 달라지는지(mm) */
export function shapeDelta(spec: ReportSectionSpec, index: number, block: Block): { before: number; after: number; delta: number; budget: number | null } {
  const was = draftHeight(spec);
  const now = draftHeight({ ...spec, blocks: (spec.blocks ?? []).map((b, i) => (i === index ? block : b)) });
  return { before: was.total, after: now.total, delta: now.total - was.total, budget: now.budget };
}

/** 화면 「다른 모양으로」의 모양 목록 한 줄. ok = null이면 근거 조건을 요청 때 서버가 봄(구성안 없는 초안) */
export interface ShapeMenuItem {
  code: string;
  name: string;
  group: ShapeGroup;
  use: string;
  ok: boolean | null;
  why: string;
}

/** 이 트랙에서 고를 수 있는 모양 목록(경영관리 전용 표 모양·핵심 수치 띠는 경영관리만). rules가 없으면 이 과제만의 요소는 ok = null */
export function shapeMenu(mg: boolean, rules: ShapeRules | null): ShapeMenuItem[] {
  return SHAPES.filter((s) => mg || !MG_ONLY_SHAPES.includes(s.code)).map((s) => {
    if (!isOwnKind(s.kind)) return { code: s.code, name: s.name, group: s.group, use: s.use, ok: true, why: "" };
    const a = rules?.avail[s.kind];
    return { code: s.code, name: s.name, group: s.group, use: s.use, ok: a ? a.ok : null, why: a?.why ?? "근거는 요청 때 확인" };
  });
}

/** 모양 이름(코드 → 쉬운 이름) — 블록에서 */
export const blockShapeName = (b: Pick<Block, "kind" | "variant">) => shapeName(b.kind, b.variant);
export const blockShapeCode = (b: Pick<Block, "kind" | "variant">) => shapeCode(b.kind, b.variant);
