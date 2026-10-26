// 경평 초안 구성안 화면에 내려보내는 값(순수 — 서버 컴포넌트·서버 액션이 셈). 화면(클라이언트) 번들에 판면 계산·스키마 모듈을 싣지 않으려고
// 모양 표·견본 그림·판면 어림을 서버가 만들어 넘깁니다(components/reports/outline-*.tsx).
//  - outlineView: 지금 구성안(또는 편집을 적용한 구성안)의 판면 어림·블록 높이 예산·구성안 판면 HTML·경고·모양 이름
//  - shapeTable: 모양 25가지(이름·무리·쓰임·칸 범위·보통 칸 수·전폭 여부) — 화면이 칩·칸 −/+ 를 그림
//  - outlineCatalog: 틀 갤러리·도식 목록의 견본 그림(본문 렌더러로 보통 모양 블록을 그림 — 한 번 만들어 둠)

import { REPORT_CSS } from "./section-css.ts";
import { blocksSampleHtml } from "./section-html.ts";
import type { BlockKind } from "./blocks.ts";
import { isOwnKind } from "./diagram-hints.ts";
import { compositionSheetHtml, mgSheetHtml } from "./composition-sheet.ts";
import { type Composition, blockBudgets, compositionFit, compositionIssues } from "./composition.ts";
import { type HeadMode, canonicalBlock } from "./fit.ts";
import { FRAMEWORKS, FULL_WIDTH_KINDS, SHAPES, type ShapeGroup, cellRange, defaultCells, shapeAvailability, shapeCode, shapeName } from "./frameworks.ts";
import { MG_FRAMEWORKS } from "./frameworks-mg.ts";
import { FRAMEWORK_PATTERNS, patternSource } from "./framework-patterns.ts";
import { patternBlockText } from "./framework-pick.ts";
import { mgCompositionIssues } from "./mg-outline.ts";

/** 구성안 화면 값(판면·예산·판면 HTML·경고) */
export interface OutlineView {
  fit: { total: number; budget: number };
  /** 블록마다 높이 예산(mm, 블록 순서대로) */
  budgets: number[];
  /** 구성안 판면 HTML(블록마다 data-block = 순서) */
  sheetHtml: string;
  warnings: string[];
  shapeNames: string[];
  shapeCodes: string[];
  /** 모양 종류마다 고를 수 있는지(근거 조건) */
  avail: Record<string, { ok: boolean; why: string }>;
  /** 사람이 고친 블록 수 */
  human: number;
  /** 그림 자리 수 */
  figures: number;
}

export function outlineView(c: Composition, module: number, head: HeadMode, materialWarnings: string[] = []): OutlineView {
  // 경영관리: 판면 어림·높이 예산 없음(R4 보류 — fit 0/0이면 화면이 판면 칩을 숨김), 판면은 절 머리가 든 와이어프레임, 점검은 절 단위
  if (c.mg)
    return {
      fit: { total: 0, budget: 0 },
      budgets: c.blocks.map(() => 0),
      sheetHtml: mgSheetHtml(c),
      warnings: [...materialWarnings, ...mgCompositionIssues(c)],
      shapeNames: c.blocks.map((b) => shapeName(b.kind, b.variant)),
      shapeCodes: c.blocks.map((b) => shapeCode(b.kind, b.variant)),
      avail: shapeAvailability(c),
      human: c.blocks.filter((b) => b.by === "human").length,
      figures: c.blocks.reduce((n, b) => n + b.figures.length, 0),
    };
  return {
    fit: compositionFit(c, module, head),
    budgets: blockBudgets(c, module, head),
    sheetHtml: compositionSheetHtml(c, module, head),
    warnings: [...materialWarnings, ...compositionIssues(c, module, head)],
    shapeNames: c.blocks.map((b) => shapeName(b.kind, b.variant)),
    shapeCodes: c.blocks.map((b) => shapeCode(b.kind, b.variant)),
    avail: shapeAvailability(c),
    human: c.blocks.filter((b) => b.by === "human").length,
    figures: c.blocks.reduce((n, b) => n + b.figures.length, 0),
  };
}

/** 화면이 쓰는 모양 표 한 줄 */
export interface ShapeRow {
  code: string;
  kind: BlockKind;
  variant: string;
  name: string;
  group: ShapeGroup;
  use: string;
  min: number;
  max: number;
  /** 새로 넣거나 이 모양으로 바꿀 때 칸 수 */
  def: number;
  /** 전폭 블록(라벨이 사다리 행을 만들지 않음) */
  full: boolean;
  /** 칸 단위 이름(칸·행·줄·막대) */
  unit: string;
}

export const cellUnit = (kind: string) => (kind === "compare" || kind === "table" ? "행" : kind === "bullets" || kind === "case" ? "줄" : kind === "chart" ? "막대" : kind === "qa" ? "쌍" : kind === "strategy" ? "열" : "칸");

export function shapeTable(): ShapeRow[] {
  return SHAPES.map((s) => ({ ...s, ...cellRange(s.kind, s.variant), def: defaultCells(s.kind, s.variant), full: FULL_WIDTH_KINDS.includes(s.kind), unit: cellUnit(s.kind) }));
}

/** 견본 그림이 든 틀·모양 카드 */
export interface CatalogShape {
  code: string;
  html: string;
}
export interface CatalogFramework {
  story: string;
  no: string;
  fit: string;
  example: string;
  /** 블록 순서(쉬운 이름, 라벨 있으면 [라벨] 이름) */
  steps: string[];
  /** 이 틀의 이 과제만의 요소 종류(근거 조건 셈 — 화면이 avail로 준비 정도를 셈) */
  own: string[];
  html: string;
}
/** 구성 패턴 카드(lib/reports/framework-patterns.ts — 2026-10-12) */
export interface CatalogPattern {
  id: string;
  name: string;
  /** 출처 짧은 이름(도식 Pool 정의서 · 표준보고서 p.N) */
  source: string;
  ref: string;
  when: string;
  /** 단 구성(「도입(배경·목적) → …」) */
  stages: string;
  /** 권장 블록 한 줄씩 */
  steps: string[];
  html: string;
  pages?: number;
  avoid?: boolean;
}
export interface OutlineCatalog {
  css: string;
  shapes: CatalogShape[];
  frameworks: CatalogFramework[];
  patterns: CatalogPattern[];
}

/** 견본 그림 글은 흐린 회색(줄여 보면 줄 모양만) */
const SAMPLE_CSS = `.ol-sample .kca-dg-doc{color:#8a8f99}.ol-sample .kca-dg-doc .k-paper{box-shadow:none;margin:0;padding:0;min-height:0}`;

let catalogCache: OutlineCatalog | null = null;
let catalogMgCache: OutlineCatalog | null = null;

/** 틀 갤러리·도식 목록 견본 — mg면 경영관리 이야기 틀(lib/reports/frameworks-mg.ts, 블록 어휘는 같음) */
export function outlineCatalog(mg = false): OutlineCatalog {
  if (mg) {
    const base = outlineCatalog();
    catalogMgCache ??= {
      ...base,
      frameworks: MG_FRAMEWORKS.map((f) => ({
        story: f.story,
        no: f.no,
        fit: f.fit,
        example: f.examples.join(" · "),
        steps: f.blocks.map((b) => `${b.label ? `[${b.label}] ` : ""}${shapeName(b.kind, b.variant ?? "")}`),
        own: [...new Set(f.blocks.map((b) => b.kind).filter(isOwnKind))],
        html: f.blocks.length ? blocksSampleHtml(f.blocks.map((b) => canonicalBlock(b.kind, b.variant ?? "", defaultCells(b.kind, b.variant ?? ""), b.label ?? ""))) : "",
      })),
    };
    return catalogMgCache;
  }
  if (catalogCache) return catalogCache;
  catalogCache = {
    css: REPORT_CSS + SAMPLE_CSS,
    shapes: SHAPES.map((s) => ({ code: s.code, html: blocksSampleHtml([canonicalBlock(s.kind, s.variant, defaultCells(s.kind, s.variant), "")]) })),
    frameworks: FRAMEWORKS.map((f) => ({
      story: f.story,
      no: f.no,
      fit: f.fit,
      example: f.example,
      steps: f.blocks.map((b) => `${b.label ? `[${b.label}] ` : ""}${shapeName(b.kind, b.variant ?? "")}`),
      own: [...new Set(f.blocks.map((b) => b.kind).filter(isOwnKind))],
      html: f.blocks.length ? blocksSampleHtml(f.blocks.map((b) => canonicalBlock(b.kind, b.variant ?? "", defaultCells(b.kind, b.variant ?? ""), b.label ?? ""))) : "",
    })),
    // 구성 패턴(두 트랙 같은 목록): 권장 블록을 그 칸 수·배치 그대로 보통 모양으로 그린 견본
    patterns: FRAMEWORK_PATTERNS.map((p) => ({
      id: p.id,
      name: p.name,
      source: patternSource(p),
      ref: p.ref,
      when: p.when,
      stages: p.stages.map((s) => `${s.name}(${s.role})`).join(" → "),
      steps: p.blocks.map(patternBlockText),
      html: blocksSampleHtml(p.blocks.map((b) => canonicalBlock(b.kind, b.variant ?? "", b.cells, b.label, [], undefined, { ...(b.layout ? { layout: b.layout } : {}), ...(b.span ? { span: b.span } : {}) }))),
      ...(p.pages ? { pages: p.pages } : {}),
      ...(p.avoid ? { avoid: true } : {}),
    })),
  };
  return catalogCache;
}
