// 경영관리 이야기 틀(lib/reports/frameworks-mg.ts) 시험: 틀 목록·블록 순서(resources/prompts/report-draft-mg/stories.md 대조), 블록 종류·모양이 주요사업 블록 사전 안에 있음.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { BLOCK_KINDS, VARIANTS } from "./blocks.ts";
import { MG_FRAMEWORKS, MG_MAIN_STORIES, MG_STORIES } from "./frameworks-mg.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const storiesLines = readFileSync(resolve(ROOT, "resources/prompts/report-draft-mg/stories.md"), "utf8").split("\n");

test("MG_FRAMEWORKS: story 목록 = MG_STORIES와 같은 순서·같은 원소, 번호는 ①~⑫(섞음은 빈 글 — ⑨~⑪은 2026-10-10, ⑫는 2026-10-13)", () => {
  assert.deepEqual(MG_FRAMEWORKS.map((f) => f.story), MG_STORIES);
  assert.deepEqual(MG_FRAMEWORKS.map((f) => f.no), ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", ""]);
});

test("MG_MAIN_STORIES: 주 틀 12종 = 섞음을 뺀 MG_STORIES(섞음은 옛 구성안 읽기용만 — 2026-10-12), stories.md는 섞음 대신 주 틀 + 보조 틀", () => {
  assert.deepEqual([...MG_MAIN_STORIES, "섞음"], [...MG_STORIES]);
  const text = storiesLines.join("\n");
  assert.doesNotMatch(text, /고르거나 섞습니다/);
  assert.match(text, /주 틀 \+ 보조 틀 — 「섞음」은 없음/);
});

test("stories.md(경영관리): 생애 단계 순환은 ⑤ PDCA 체계형이 아니라 ⑩ 생애주기형으로(2026-10-10 — 분석 §8.7 「⑤로 셌지만 PDCA가 아님」)", () => {
  const pdca = storiesLines.find((l) => l.trimStart().startsWith("⑤"))!;
  assert.doesNotMatch(pdca, /생애주기 단계여도 됨/);
  assert.match(pdca, /생애 단계면 ⑩/);
});

test("MG_FRAMEWORKS: 블록 종류·모양이 주요사업 블록 사전(BLOCK_KINDS·VARIANTS) 안에 있고 전략수립형만 대주제 단계", () => {
  for (const fw of MG_FRAMEWORKS) {
    for (const b of fw.blocks) {
      assert.ok((BLOCK_KINDS as readonly string[]).includes(b.kind), `${fw.story}: 모르는 블록 ${b.kind}`);
      if (b.variant) assert.ok(VARIANTS[b.kind]?.includes(b.variant), `${fw.story}: ${b.kind}에 모양 ${b.variant} 없음`);
    }
    assert.equal(fw.level === "theme", fw.story === "전략수립형", fw.story);
  }
});

test("MG_FRAMEWORKS: 틀마다(섞음 제외) 블록 종류 순서가 stories.md의 그 틀 줄에 같은 순서로 나옴(bullets는 뺌)", () => {
  for (const fw of MG_FRAMEWORKS) {
    if (fw.story === "섞음") continue;
    const line = storiesLines.find((l) => l.trimStart().startsWith(fw.no));
    assert.ok(line, `틀 「${fw.story}」(${fw.no}) 줄이 stories.md에 없음`);
    assert.ok(line!.includes(fw.story), `틀 「${fw.story}」 이름이 줄에 없음: ${line}`);
    let cursor = 0;
    for (const kind of fw.blocks.map((b) => b.kind).filter((k) => k !== "bullets")) {
      const idx = line!.indexOf(kind, cursor);
      assert.ok(idx >= 0, `틀 「${fw.story}」: 「${kind}」을(를) 줄에서 순서대로 못 찾음 — 줄: ${line}`);
      cursor = idx;
    }
  }
});

test("MG_FRAMEWORKS: 틀마다 어울리는 절 설명이 있고 예시는 「지표 평가내용-대주제(-절)」 모양 — 14개 지표 육안 판정(분석 §8.8)과 같고 stories.md 그 틀 줄에도 그대로(섞음 제외)", () => {
  for (const fw of MG_FRAMEWORKS) {
    assert.ok(fw.fit.length > 5, fw.story);
    if (fw.story === "섞음") continue;
    // ⑫ AX 전환형은 KCA 2025 경영관리 보고서에서 확인한 위치가 없어 예시가 빈 목록(타기관 사례에서 뽑음 — stories.md 줄에 「2025 예: 없음」)
    if (fw.story === "AX 전환형") {
      assert.deepEqual(fw.examples, []);
      assert.match(storiesLines.find((l) => l.trimStart().startsWith(fw.no))!, /\(2025 예: 없음 — 타기관 AX 사례에서 뽑음\)/);
      continue;
    }
    assert.ok(fw.examples.length >= 2, `${fw.story} 사례`);
    const line = storiesLines.find((l) => l.trimStart().startsWith(fw.no))!;
    for (const e of fw.examples) {
      assert.match(e, /^[가-힣· ]+ \d+-\d+(-[가-하])?$/, e);
      assert.ok(line.includes(e), `${fw.story}: 예시 「${e}」가 stories.md 줄에 없음`);
    }
  }
});

test("stories.md(경영관리): 틀 줄의 예시는 모델이 볼 수 없는 PDF 쪽 번호 대신 지표·위치 이름으로(2026-10-09)", () => {
  for (const fw of MG_FRAMEWORKS) {
    if (fw.story === "섞음") continue;
    const line = storiesLines.find((l) => l.trimStart().startsWith(fw.no))!;
    assert.doesNotMatch(line, /\bp\d/, `${fw.story}: 쪽 번호가 남음 — ${line}`);
    assert.match(line, /\(2025 예: [^)]+\)/, `${fw.story}: 예시 표기`);
  }
});
