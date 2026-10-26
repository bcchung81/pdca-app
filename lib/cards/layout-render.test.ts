// 원본 배치로 카드 그리기: 59장 모두 잇기·그리기가 되고, 고치기·줄 넣기·지우기·상자 토글·월별 상자·지표 행·AX 붙임 변화를 원본 모양으로 따라감
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { readHwp5 } from "../hwp/hwp5.ts";
import type { CardLayout } from "../hwp/layout.ts";
import { addMonthly, applyText, deleteLine, insertLineAfter, toggleBox } from "./edit.ts";
import { buildLayouts, layoutTaskNo } from "./layout-build.ts";
import { keyOf, targetsOf } from "./layout-bind.ts";
import { renderLayoutCard } from "./layout-render.ts";
import { cardSourceFile } from "./file-names.ts";
import { NO_SEED_CARDS, seedCards } from "../testing/originals.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ROOT = resolve(import.meta.dirname, "../..");
const file = (g: number) => join(ROOT, "data/cards/260916", cardSourceFile(g));
const has = [1, 2, 3].every((g) => existsSync(file(g)));
const seed = { cards: seedCards() };

const built = new Map<string, { card: any; layout: CardLayout }>();
function all() {
  if (built.size) return built;
  for (const g of [1, 2, 3]) {
    const cards = seed.cards.filter((c) => c.id.startsWith(`주요사업${g}/`));
    const { built: b, skipped } = buildLayouts(readHwp5(readFileSync(file(g))), cards);
    assert.deepEqual(skipped, [], `주요사업${g} 건너뜀 없음`);
    for (const x of b) built.set(cards[x.index].id, { card: cards[x.index], layout: x.layout });
  }
  return built;
}
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const paths = (html: string) => new Set([...html.matchAll(/ data-p="([^"]+)"/g)].map((m) => m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&")));

test("59장: 과제번호로 짝짓고, 글이 있는 편집 칸은 모두 원본 문단에 이어지며, 고치지 않은 카드는 원본 줄 배치 그대로", { skip: NO_SEED_CARDS || (!has && "원본 한글 파일 없음") }, () => {
  const b = all();
  assert.equal(b.size, 59);
  for (const { card, layout } of b.values()) {
    assert.equal(layoutTaskNo(layout)?.replace(/\s/g, ""), String(card.taskNo).replace(/\s/g, ""), card.id);
    const html = renderLayoutCard(card, layout, { editable: true });
    assert.ok(html, `${card.id} 그림`);
    assert.equal((html.match(/hw-flow/g) ?? []).length, 0, `${card.id}: 고치지 않았는데 흘려 그린 문단`);
    const got = paths(html);
    const missing = targetsOf(card)
      .filter((t) => keyOf(t.text) || t.text.trim())
      .filter((t) => !got.has(t.path))
      .map((t) => t.path);
    assert.deepEqual(missing, [], `${card.id}: 편집 칸 없음`);
  }
});

test("고치기·줄 넣기·줄 지우기·상자 토글: 바뀐 문단만 달라지고 순서·모양 유지", { skip: NO_SEED_CARDS || (!has && "원본 한글 파일 없음") }, () => {
  const { card, layout } = all().get("주요사업1/1-가")!;
  const base = renderLayoutCard(card, layout, { editable: true })!;
  const rows = (h: string) => (h.match(/<tr /g) ?? []).length;

  const edited = renderLayoutCard(applyText(card, "plan.lines.1", "→ 무선국검사관리시스템(RIMS) 안테나 AI 분석 기능 도입(’26년 下) 및 운영 확대"), layout, { editable: true })!;
  assert.ok(text(edited).includes("및 운영 확대"));
  assert.ok(!text(edited).includes("전국 대상 운영 확산"), "고친 글로 바뀜");

  const inserted = renderLayoutCard(insertLineAfter(card, "do.lines.2", "- 새 줄 시험: 추가 세부 내용").card, layout, { editable: true })!;
  const t = text(inserted);
  assert.ok(t.indexOf("새 줄 시험") > t.indexOf("예외처리 기준") && t.indexOf("새 줄 시험") < t.indexOf("기존 수도권(북서울본부)"), "바로 뒤에 끼움");
  assert.match(inserted, /class="hw-p hw-flow kc-ln" data-p="do\.lines\.3" contenteditable/, "새 줄도 편집 칸");

  const deleted = renderLayoutCard(deleteLine(card, "do.lines.3").card, layout, { editable: true })!;
  assert.ok(!text(deleted).includes("기존 수도권(북서울본부)"));
  assert.ok(paths(deleted).has("do.lines.3") && paths(deleted).has("do.lines.6"), "뒤 줄 경로가 당겨짐");

  const toggled = renderLayoutCard(toggleBox(card, "overview.cells.1#0"), layout, { editable: true })!;
  assert.match(toggled, /data-toggle="overview\.cells\.1#0"[^>]*>☑/);
  assert.equal((toggled.match(/hw-flow/g) ?? []).length, 0, "상자만 바뀌면 원본 줄 배치 그대로");
  assert.equal(rows(toggled), rows(base));
});

test("월별 실적 상자·계량지표 행: 늘면 앞 행을 복제해 새 글로, 월 딱지는 새 기간으로", { skip: NO_SEED_CARDS || (!has && "원본 한글 파일 없음") }, () => {
  const { card, layout } = all().get("주요사업1/1-가")!;
  const rows = (h: string) => (h.match(/<tr /g) ?? []).length;
  const base = renderLayoutCard(card, layout, { editable: true })!;
  let c = addMonthly(card, "9월").card;
  c = applyText(c, "do.monthly.1.items.0", "∙ (9월 시험) 새 월별 실적");
  const monthly = renderLayoutCard(c, layout, { editable: true })!;
  assert.equal(rows(monthly), rows(base) + 1, "상자 행 하나 더");
  assert.ok(text(monthly).includes("(9월 시험) 새 월별 실적"));
  assert.ok(paths(monthly).has("do.monthly.1.items.0") && paths(monthly).has("do.monthly.1.period"));
  // 새 상자의 월 딱지: 「9월」 하나(원래 「1월 ~ 8월」의 나머지 딱지·물결은 뺌)
  const periods = [...monthly.matchAll(/data-p="do\.monthly\.1\.period"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => text(m[1]).trim()).filter(Boolean);
  assert.deepEqual(periods, ["9월"], "새 기간");

  const k = structuredClone(card);
  k.kpi.rows.push({ ...k.kpi.rows[0], nameRaw: "새 지표(건)", name: "새 지표", formula: "시험 산식", prev: "1건", target: "2건" });
  const kpi = renderLayoutCard(k, layout, { editable: true })!;
  assert.equal(rows(kpi), rows(base) + 1);
  assert.ok(text(kpi).includes("새 지표(건)") && paths(kpi).has("kpi.rows.1.formula"));
});

test("AX 붙임: 새로 늘면 원본 양식으로 이어 그리고, 빼면 그 붙임 표를 뺌", { skip: NO_SEED_CARDS || (!has && "원본 한글 파일 없음") }, () => {
  const { card, layout } = all().get("주요사업1/1-가")!;
  const add = structuredClone(card);
  add.axAttachments.push({ ...add.axAttachments[0], title: "새 AX 시험", no: 7, seq: 7 });
  const added = renderLayoutCard(add, layout, { editable: true })!;
  assert.ok(added.includes("kc-axsec") && text(added).includes("새 AX 시험"));
  const del = structuredClone(card);
  del.axAttachments.splice(1, 1);
  const removed = renderLayoutCard(del, layout, { editable: true })!;
  assert.ok(!text(removed).includes("검사현장 안전위험요소"));
  assert.ok(paths(removed).has("axAttachments.1.title"), "뒤 붙임 번호가 당겨짐");
});

test("잠근 영역·읽기 전용: 편집 표시가 원본 양식 렌더러와 같은 뜻", { skip: NO_SEED_CARDS || (!has && "원본 한글 파일 없음") }, () => {
  const { card, layout } = all().get("주요사업1/1-가")!;
  const locked = renderLayoutCard(card, layout, { editable: true, locked: ["act", "plan", "kpi"] })!;
  assert.match(locked, /data-p="plan\.lines\.0" tabindex="0" data-locked="1"/);
  assert.match(locked, /data-p="do\.lines\.0" contenteditable="plaintext-only"/);
  const ro = renderLayoutCard(card, layout, { selectable: true })!;
  assert.ok(!ro.includes("contenteditable"), "읽기 전용은 고를 수만");
  const view = renderLayoutCard(card, layout, {})!;
  assert.ok(!view.includes("data-p="), "보기만");
});
