// 새 블록 두 종류(2026-10-09) 시험: strategy(전략체계도 — 목표 띠 → 전략 열 → 과제·지표, 층 이름은 자유)·pdca(P·D·C·A 순환 4칸 + 환류 띠, 단계 이름은 자유).
// 근거: 경영관리 2025 보고서의 평가내용 첫 「전략수립」 대주제(분석 §8.3·§8.7 — 정식 체계도 5건, 행 이름이 지표마다 다름)와 PDCA 체계 도식(MG-9·MG-3·MG-5, 생애주기 순환 포함).

import assert from "node:assert/strict";
import { test } from "node:test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { BLOCK_KINDS, type Block, type BlockOutput, cleanBlocks } from "./blocks.ts";
import { blockCosts, blockHeight, blockWidth, canonicalBlock, fitReport, slotOf } from "./fit.ts";
import { SHAPES, cellRange, defaultCells, shapeName } from "./frameworks.ts";
import { MG_FRAMEWORKS } from "./frameworks-mg.ts";
import { diagramHints } from "./diagram-hints.ts";
import { blocksSampleHtml } from "./section-html.ts";
import { applyDraftText } from "./draft-text.ts";

const out = (b: Omit<Partial<BlockOutput>, "kind"> & { kind: any }): BlockOutput => ({ label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", evidence: "", figures: [], ...b }) as BlockOutput;
const cell = (head: string, bullets: string[] = [], note = "", tag = "") => ({ head, tag, bullets, note });
const line = (s: unknown, max = 400) => String(s ?? "").trim().slice(0, max);
const blk = (kind: Block["kind"], x: Partial<Block> = {}): Block => ({ kind, label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...x });

test("BLOCK_KINDS·SHAPES: strategy·pdca가 있고 기본 도식 무리, 칸 범위 strategy 2~4·pdca 4", () => {
  assert.ok(BLOCK_KINDS.includes("strategy" as any) && BLOCK_KINDS.includes("pdca" as any));
  for (const code of ["strategy", "pdca"]) {
    const s = SHAPES.find((x) => x.code === code);
    assert.ok(s, code);
    assert.equal(s!.group, "base");
  }
  assert.deepEqual(cellRange("strategy" as any), { min: 2, max: 4 });
  assert.deepEqual(cellRange("pdca" as any), { min: 4, max: 4 });
  assert.equal(defaultCells("strategy" as any), 3);
  assert.equal(defaultCells("pdca" as any), 4);
  assert.equal(shapeName("strategy", ""), "전략체계도");
  assert.equal(shapeName("pdca", ""), "PDCA 순환");
});

test("cleanBlocks strategy: 열 2~4칸(5칸이면 4칸까지), 층 이름(items) 4개까지, 목표 띠(text), 열이 1칸뿐이면 뺌", () => {
  const { blocks } = cleanBlocks(
    [
      out({ kind: "strategy", text: "국민 신뢰 1등 전파 전문기관", items: ["비전", "전략목표", "전략과제", "성과지표", "남는 층"], cells: [cell("디지털 혁신", ["AI 검사"], "검사 자동화율"), cell("안전", ["재난 대응"]), cell("상생", ["협력"]), cell("소통", ["참여"]), cell("다섯째", ["x"])] }),
      out({ kind: "strategy", cells: [cell("하나뿐", ["x"])] }),
    ],
    line,
    () => true,
  );
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].cells.length, 4);
  assert.deepEqual(blocks[0].items, ["비전", "전략목표", "전략과제", "성과지표"]);
  assert.equal(blocks[0].text, "국민 신뢰 1등 전파 전문기관");
});

test("cleanBlocks pdca: 4칸이면 그대로(환류 띠 text), 4칸이 아니면 단계 흐름(steps)으로 바꿈", () => {
  const four = [cell("계획수립", ["목표 설정"]), cell("평가운영", ["분기 점검"]), cell("성과점검", ["결과 분석"]), cell("보상·환류", ["인센티브"])];
  const { blocks } = cleanBlocks([out({ kind: "pdca", text: "점검 결과를 다음 해 계획에 반영", cells: four }), out({ kind: "pdca", cells: four.slice(0, 3) })], line, () => true);
  assert.deepEqual(blocks.map((b) => b.kind), ["pdca", "steps"]);
  assert.equal(blocks[0].text, "점검 결과를 다음 해 계획에 반영");
});

test("판면 어림: 두 블록 모두 높이 > 0, 띠·꼬리 줄·층 이름 열이 있으면 높아지거나 같음, 칸 글이 길면 높아짐", () => {
  const w = blockWidth({ label: "전략체계", kind: "strategy" as any });
  const base = blk("strategy" as any, { label: "전략체계", cells: [cell("가", ["과제"]), cell("나", ["과제"]), cell("다", ["과제"])] });
  const h0 = blockHeight(base, w);
  assert.ok(h0 > 0);
  assert.ok(blockHeight({ ...base, text: "비전 한 줄" }, w) > h0, "목표 띠");
  assert.ok(blockHeight({ ...base, cells: base.cells.map((c) => ({ ...c, note: "지표" })) }, w) > h0, "성과지표 줄");
  assert.ok(blockHeight({ ...base, cells: base.cells.map((c) => ({ ...c, bullets: ["가".repeat(80)] })) }, w) > h0, "긴 과제");
  const withTiers = { ...base, items: ["목표", "전략", "과제"] };
  assert.ok(slotOf(withTiers, w).body < slotOf(base, w).body, "층 이름 열만큼 칸이 좁아짐");
  const p = blk("pdca" as any, { cells: [cell("계획", ["a"]), cell("실행", ["b"]), cell("점검", ["c"]), cell("환류", ["d"])] });
  const hp = blockHeight(p, 170);
  assert.ok(hp > 0);
  assert.ok(blockHeight({ ...p, text: "환류 한 줄" }, 170) > hp, "환류 띠");
});

test("canonicalBlock·fitReport·blockCosts: 보통 모양으로 어림이 되고, 비용 안내에 두 블록이 있음", () => {
  const s = canonicalBlock("strategy" as any, "", 3, "전략체계");
  assert.equal(s.cells.length, 3);
  assert.ok(s.text && s.items.length >= 3);
  const p = canonicalBlock("pdca" as any, "", 4, "");
  assert.equal(p.cells.length, 4);
  const r = fitReport({ sub: { title: "제목" }, blocks: [s, p], results: [], module: 1 });
  assert.ok(r.total > 0 && r.rows.length === 2);
  assert.ok(blockCosts().some((l) => /strategy \d+mm/.test(l) && /pdca \d+mm/.test(l)), blockCosts().join("\n"));
});

test("HTML: 전략체계도는 층 이름 열·목표 띠·열 머리·과제·지표 줄, PDCA는 P·D·C·A 표지(비우면 기본)·화살표·환류 띠", () => {
  const html = blocksSampleHtml([
    blk("strategy" as any, { text: "국민 신뢰 기관", items: ["비전", "전략목표", "전략과제", "성과지표"], cells: [cell("디지털 혁신", ["AI 검사"], "자동화율"), cell("안전", ["재난 대응"], "대응 시간")] }),
    blk("pdca" as any, { text: "다음 해 계획에 반영", cells: [cell("계획수립", ["목표"]), cell("평가운영", ["점검"]), cell("성과점검", ["분석"]), cell("보상·환류", ["보상"], "", "A")] }),
  ]);
  assert.match(html, /class="k-strat"/);
  assert.match(html, /<th scope="row"[^>]*>비전<\/th>/);
  assert.match(html, /국민 신뢰 기관/);
  assert.match(html, /디지털 혁신/);
  assert.match(html, /자동화율/);
  assert.match(html, /class="k-pdca"/);
  for (const t of ["P", "D", "C", "A"]) assert.match(html, new RegExp(`k-pdca__m[^>]*>${t}<`));
  assert.match(html, /k-pdca__fb[^>]*>[^<]*다음 해 계획에 반영/);
});

test("직접 고치기: 새 블록의 칸 머리·과제·층 이름·띠 글도 고칠 수 있음", () => {
  const spec: any = { version: 3, sub: { title: "t" }, blocks: [blk("strategy" as any, { text: "비전", items: ["목표", "전략"], cells: [cell("가", ["과제"]), cell("나", ["과제"])] })], results: [] };
  for (const [path, text] of [["blocks.0.text", "새 비전"], ["blocks.0.items.1", "추진전략"], ["blocks.0.cells.1.head", "다"], ["blocks.0.cells.0.bullets.0", "새 과제"]]) {
    const r = applyDraftText(spec, { path, text });
    assert.ok(r.ok && r.changed, path);
  }
});

test("경영관리 틀: ① 전략수립형은 strategy, ⑤ PDCA 체계형은 pdca 블록을 씀", () => {
  assert.ok(MG_FRAMEWORKS.find((f) => f.story === "전략수립형")!.blocks.some((b) => b.kind === ("strategy" as any)));
  assert.ok(MG_FRAMEWORKS.find((f) => f.story === "PDCA 체계형")!.blocks.some((b) => b.kind === ("pdca" as any)));
});

test("도식 후보: 비전·전략목표·전략과제 낱말 2개 이상이면 strategy, 계획·실행(운영)·점검·환류가 모두 있거나 PDCA면 pdca(기본 도식)", () => {
  const s = diagramHints("비전 아래 전략목표 3개와 전략과제 9개를 세웠다");
  assert.ok(s.some((h) => h.kind === "strategy" && !h.own));
  assert.ok(!diagramHints("전략목표 하나만").some((h) => h.kind === "strategy"));
  // 경영관리 1-1처럼 「전략목표」 없이 경영목표·세부목표·전략체계로 적은 카드(2026-10-09 연기 시험에서 놓침)
  assert.ok(diagramHints("미션·비전–경영목표–세부목표 재설정과 Two-Track 전략체계").some((h) => h.kind === "strategy"));
  assert.ok(diagramHints("경영목표 아래 전략과제 12개").some((h) => h.kind === "strategy"));
  assert.ok(!diagramHints("□ 중장기 경영목표 □ 기관장 경영계약").some((h) => h.kind === "strategy"), "지표 범주 칸의 경영목표 하나는 신호가 아님");
  assert.ok(diagramHints("계획 수립 → 운영 → 점검 → 환류 체계").some((h) => h.kind === "pdca" && !h.own));
  assert.ok(diagramHints("PDCA 기반 성과관리").some((h) => h.kind === "pdca"));
  assert.ok(!diagramHints("계획대로 점검했다").some((h) => h.kind === "pdca"));
});
