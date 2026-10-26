// TS 렌더러가 render_static.py와 같은 원본 양식을 만드는지: 정적 조각 59개와 바이트 비교.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { cardFileStem } from "./file-names.ts";
import { pyFixed2, renderCard } from "./render.ts";
import { HAS_SEED_CARDS, NO_SEED_CARDS, seedCards } from "../testing/originals.ts";

const DIR = resolve(import.meta.dirname, "../../seed/cards/260916");
const cards = seedCards<Record<string, string>>();
const files = new Set(HAS_SEED_CARDS ? readdirSync(join(DIR, "static")) : []);

test("파이썬 '%.2f' 반올림과 같다", () => {
  assert.equal(pyFixed2(100 / 3), "33.33");
  assert.equal(pyFixed2(12.125), "12.12"); // 딱 절반 → 짝수
  assert.equal(pyFixed2(12.375), "12.38");
  assert.equal(pyFixed2(99.995), "100.00"); // 파이썬 실측
  assert.equal(pyFixed2(2.675), "2.67"); // 이진값이 2.67499…
  assert.equal(pyFixed2(1.005), "1.00");
  assert.equal(pyFixed2(100), "100.00");
  assert.equal(pyFixed2(0.005), "0.01");
});

test("보기 모드 출력 = 정적 조각(59장, 바이트 일치)", { skip: NO_SEED_CARDS }, () => {
  let n = 0;
  for (const c of cards) {
    const f = `${cardFileStem(c.group, c.taskNo)}.html`;
    assert.ok(files.has(f), `조각 없음: ${c.id}`);
    const expected = readFileSync(join(DIR, "static", f), "utf8");
    const actual = renderCard(c);
    if (actual !== expected) {
      let i = 0;
      while (i < actual.length && actual[i] === expected[i]) i++;
      assert.fail(`${c.id} ${i}번째 글자부터 다름\n기대: …${expected.slice(Math.max(0, i - 80), i + 80)}\n실제: …${actual.slice(Math.max(0, i - 80), i + 80)}`);
    }
    n += 1;
  }
  assert.equal(n, 59);
});

test("편집 모드는 글줄마다 경로를 달고, 내용 글자는 같다", { skip: NO_SEED_CARDS }, () => {
  const strip = (h: string) => h.replace(/<[^>]+>/g, "");
  const c = cards.find((x) => x.id === "주요사업1/1-가")!;
  const html = renderCard(c, { editable: true });
  assert.ok(html.includes('data-p="title"'));
  assert.ok(html.includes('data-p="plan.lines.0"'));
  assert.ok(html.includes('data-toggle="overview.cells.0#0"'));
  // 모든 카드: 편집 모드도 보이는 글자는 같고(빈 칸 자리표시 제외), 중첩 표 안 글줄에 경로가 붙음
  let nested = 0;
  for (const card of cards) {
    const e = renderCard(card, { editable: true });
    assert.equal(strip(e), strip(renderCard(card)), card.id);
    if (/data-p="do\.lines\.\d+\.table\.rows\.\d+\.\d+\.lines\.\d+"/.test(e)) nested += 1;
  }
  assert.ok(nested > 0, "중첩 표 안 글줄");
});

test("고정 영역 잠금: 잠긴 칸은 고를 수만 있고(contenteditable·토글 없음) 나머지는 그대로 편집", { skip: NO_SEED_CARDS }, () => {
  const c = cards.find((x) => x.id === "주요사업1/1-가")!;
  const html = renderCard(c, { editable: true, locked: ["act", "plan", "kpi"] });
  const attrs = (p: string) => new RegExp(`data-p="${p.replace(/\./g, "\\.")}"([^>]*)>`).exec(html)?.[1] ?? "";
  assert.match(attrs("plan.lines.0"), /data-locked="1"/);
  assert.doesNotMatch(attrs("plan.lines.0"), /contenteditable/);
  assert.ok(!/data-p="(act|plan|kpi)\.[^"]*"[^>]*contenteditable/.test(html), "잠긴 칸에 편집 속성 없음");
  assert.ok(!html.includes('data-toggle="kpi.categoriesText'), "잠긴 칸 체크 상자 토글 없음");
  assert.match(attrs("title"), /contenteditable/);
  assert.ok(html.includes('data-toggle="overview.cells.0#0"'), "잠기지 않은 상자 토글은 그대로");
  assert.equal(html.replace(/<[^>]+>/g, ""), renderCard(c, { editable: true }).replace(/<[^>]+>/g, ""), "보이는 글자는 같음");
});
