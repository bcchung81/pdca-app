// 구성 패턴 카탈로그(lib/reports/framework-patterns.ts) 시험 — 2026-10-12 「같은 양식 찍어내기」 ②:
// 넣은 패턴은 앱 블록·배치로 그릴 수 있는 것만(종류·모양·칸 수·배치 값이 렌더러·정리 규칙과 맞음), 도식 Pool 판정표 줄은 넣거나 이유를 적어 빼서 빠짐이 없고,
// 근거(판정표 줄 · 표준보고서 쪽)가 적혀 있음.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { BLOCK_KINDS, VARIANTS } from "./blocks.ts";
import { COMPOSITION_LIMITS, RESULT_SHAPES } from "./composition.ts";
import { FRAMEWORK_PATTERNS, PATTERN_EXCLUDED, patternOf, patternSource } from "./framework-patterns.ts";
import { cellRange } from "./frameworks.ts";
import { FULL_KINDS, dropLoneSpans, layoutFields } from "./layout.ts";
import { outlineCatalog } from "./outline-view.ts";

test("구성 패턴: id가 겹치지 않고, 넣은 것·뺀 것이 겹치지 않음, patternOf로 찾음", () => {
  const ids = FRAMEWORK_PATTERNS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const x of PATTERN_EXCLUDED) assert.ok(!ids.includes(x.id), x.id);
  for (const p of FRAMEWORK_PATTERNS) assert.equal(patternOf(p.id), p);
  assert.equal(patternOf("없는-패턴"), null);
  assert.ok(FRAMEWORK_PATTERNS.length >= 15, `패턴 ${FRAMEWORK_PATTERNS.length}개`);
});

test("구성 패턴: 블록은 앱이 그릴 수 있는 것만 — 종류·모양·칸 수 범위·배치 값(정리 규칙이 그대로 두는 값)·가로 반씩 짝·블록 수", () => {
  for (const p of FRAMEWORK_PATTERNS) {
    assert.ok(p.blocks.length >= 1 && p.blocks.length <= (p.pages && p.pages <= 0.5 ? 4 : 8) && p.blocks.length <= COMPOSITION_LIMITS.blocks, `${p.id} 블록 ${p.blocks.length}개`);
    assert.ok(RESULT_SHAPES.includes(p.close), `${p.id} 마무리 ${p.close}`);
    assert.ok(p.stages.length >= 2 && p.stages.every((s) => s.name && s.role), `${p.id} 단 구성`);
    for (const b of p.blocks) {
      const where = `${p.id} [${b.label}] ${b.kind}:${b.variant ?? ""}`;
      assert.ok(BLOCK_KINDS.includes(b.kind), where);
      const vs = VARIANTS[b.kind];
      if (vs) assert.ok(vs.includes(b.variant ?? vs[0]), `${where} — 모양`);
      else assert.ok(!b.variant, `${where} — 모양 없는 종류`);
      const r = cellRange(b.kind, b.variant ?? vs?.[0] ?? "");
      assert.ok(b.cells >= r.min && b.cells <= r.max, `${where} — 칸 ${b.cells}(${r.min}~${r.max})`);
      // 배치 값은 정리(layoutFields)가 지우지 않는 값만 — 지우면 고른 배치가 구성안에서 사라짐
      assert.deepEqual(layoutFields(b), { ...(b.layout ? { layout: b.layout } : {}), ...(b.span ? { span: b.span } : {}) }, `${where} — 배치`);
    }
    const copy = p.blocks.map((b) => ({ ...b }));
    assert.equal(dropLoneSpans(copy), 0, `${p.id} — 짝 없는 가로 반씩`);
    // 단 띠를 쓰면 라벨 있는 블록은 모두 단 띠(사다리와 섞으면 골격이 흐려짐 — report-draft/blocks.md 배치 고르기)
    if (p.blocks.some((b) => b.layout === "stage")) for (const b of p.blocks.filter((x) => x.label && !FULL_KINDS.has(x.kind))) assert.equal(b.layout, "stage", `${p.id} [${b.label}] 단 띠 섞임`);
  }
});

test("구성 패턴: 도식 Pool 판정표(report-harness 사본) 줄마다 넣거나 이유를 적어 뺐음 — 빠진 줄·없는 줄 없음", () => {
  const md = readFileSync(join(import.meta.dirname, "../../resources/harness/report-harness/diagram-pool.md"), "utf8");
  const table = md.slice(md.indexOf("## 판정표"), md.indexOf("## 부속 자산"));
  const rows = table
    .split("\n")
    .filter((l) => /^\|\s*\d단/.test(l))
    .map((l) => l.split("|")[1].trim());
  assert.ok(rows.length >= 12, `판정표 ${rows.length}줄`);
  const covered = [...FRAMEWORK_PATTERNS.filter((p) => p.source === "pool").map((p) => p.row), ...PATTERN_EXCLUDED.filter((x) => x.row).map((x) => x.row)];
  assert.deepEqual([...covered].sort(), [...rows].sort());
  for (const p of FRAMEWORK_PATTERNS.filter((x) => x.source === "pool")) assert.match(p.ref, /도식 Pool 정의서/, p.id);
  for (const x of PATTERN_EXCLUDED) assert.ok(x.why.length > 20, `${x.id} 뺀 이유`);
});

test("구성 패턴: 표준보고서 유형은 견본·예시 쪽(p.N·N+1)과 분량을 적음, 출처 짧은 이름", () => {
  const std = FRAMEWORK_PATTERNS.filter((p) => p.source === "std");
  assert.ok(std.length >= 8);
  for (const p of std) {
    const m = /p\.(\d+)·(\d+)/.exec(p.ref);
    assert.ok(m && Number(m[2]) === Number(m[1]) + 1 && Number(m[1]) >= 3 && Number(m[2]) <= 22, `${p.id} ${p.ref}`);
    assert.ok(p.pages === 0.5 || p.pages === 1, `${p.id} 분량`);
    assert.match(patternSource(p), /^표준보고서 p\.\d+·\d+$/);
  }
  assert.equal(patternSource(FRAMEWORK_PATTERNS.find((p) => p.source === "pool")!), "도식 Pool 정의서");
});

test("구성 패턴 견본(틀 갤러리): 패턴마다 본문 렌더러가 그린 견본·단 구성·블록 줄, 두 트랙 같은 목록", () => {
  const biz = outlineCatalog();
  const mg = outlineCatalog(true);
  assert.equal(biz.patterns.length, FRAMEWORK_PATTERNS.length);
  assert.deepEqual(mg.patterns.map((p) => p.id), biz.patterns.map((p) => p.id));
  for (const p of biz.patterns) {
    assert.match(p.html, /k-/, `${p.id} 견본`);
    assert.equal(p.steps.length, patternOf(p.id)!.blocks.length);
    assert.match(p.stages, /→/);
  }
  // 단 띠·전폭 배치가 견본에도 그대로(배치 골격 — lib/reports/layout.ts)
  assert.match(biz.patterns.find((p) => p.id === "std-2-2")!.steps[0], /단 띠/);
  assert.match(biz.patterns.find((p) => p.id === "std-1-6")!.steps[2], /전폭/);
});
