// 과제관리카드 「한글(화면 그대로)」 숨은 사본 재료(lib/cards/hwpx-copy.ts) 테스트 — 합성 값 + (원본이 있으면) 59장.
// 지키는 것: 원본 배치 쪽 정의 → 변환기 쪽 정의(mm, 한쪽 제본·가로 용지) · 쪽 본문 폭 = 용지 − 좌우 여백 · 내려받을 카드 JSON·판 기준(부서 담당자는 그 팀 카드의
// 열린 작성본, 그 밖은 원장 — 원본 배치 내려받기와 같음) ·
// 59장: 사본 본문은 맨 위 묶음 제목 표 + 편집 표시 없음 + 본문 틀 폭 = 쪽 본문 폭, 카드 화면(lead 없음)은 묶음 제목 표를 그리지 않음
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { readHwp5 } from "../hwp/hwp5.ts";
import type { CardLayout } from "../hwp/layout.ts";
import type { PageDef } from "../hwp/model.ts";
import { NO_SEED_CARDS, seedCards } from "../testing/originals.ts";
import { cardSourceFile } from "./file-names.ts";
import { cardBodyWidthMm, cardCopyBody, cardPageMm, hwpxBasis } from "./hwpx-copy.ts";
import { CARD_COPY_FRAME_ATTR } from "./hwpx-copy-marks.ts";
import { buildLayouts } from "./layout-build.ts";
import { renderLayoutCard } from "./layout-render.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const HU = 7200 / 25.4;
const hu = (mm: number) => Math.round(mm * HU);
const A4: PageDef = { width: hu(210), height: hu(297), left: hu(20), right: hu(20), top: hu(15), bottom: hu(15), header: hu(10), footer: hu(10), gutter: 0, landscape: false };
const empty = (page?: PageDef): CardLayout => ({ v: 1, faces: {} as any, charPrs: [], paraPrs: [], borderFills: [null], tabDefs: [], bullets: [], numberings: [], bins: [], textWidth: hu(170), ...(page ? { page } : {}), blocks: [] });

test("쪽 정의: 원본 배치 용지·여백 → mm(한쪽 제본) · 본문 폭 = 용지 − 좌우 여백 · 가로 용지는 폭·높이를 바꿈", () => {
  const p = cardPageMm(empty(A4));
  assert.deepEqual([p.width, p.height, p.inside, p.outside, p.top, p.bottom, p.header, p.footer, p.gutterType].map((v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v)), [210, 297, 20, 20, 15, 15, 10, 10, "LEFT_ONLY"]);
  assert.equal(Math.round(cardBodyWidthMm(empty(A4)) * 100) / 100, 170);
  const wide = cardPageMm(empty({ ...A4, landscape: true }));
  assert.deepEqual([Math.round(wide.width), Math.round(wide.height)], [297, 210]);
  // 쪽 정보가 없는 옛 배치: A4 세로, 본문 폭(textWidth)이 가운데(layout-hwpx.ts pageOf)
  assert.equal(Math.round(cardBodyWidthMm(empty())), 170);
});

test("내려받을 카드 JSON·판: 부서 담당자 + 그 팀 카드 + 열린 작성본 → 작성본, 그 밖(다른 팀·작성본 없음·성과관리팀)은 원장", () => {
  const card = { teamId: 7, data: { title: "원장" }, updatedAt: "2026-10-28T01:00:00Z" };
  const open = { id: 31, data: { title: "작성본" }, updatedAt: "2026-10-28T02:00:00Z", createdAt: "2026-10-27T00:00:00Z" };
  assert.deepEqual(hwpxBasis({ role: "dept_user", teamId: 7 }, card, open), { data: { title: "작성본" }, version: "v31:2026-10-28T02:00:00Z" });
  assert.deepEqual(hwpxBasis({ role: "dept_user", teamId: 7 }, card, { ...open, updatedAt: null }).version, "v31:2026-10-27T00:00:00Z");
  for (const [me, o] of [
    [{ role: "dept_user", teamId: 8 }, open],
    [{ role: "dept_user", teamId: null }, open],
    [{ role: "dept_user", teamId: 7 }, null],
    [{ role: "pmo", teamId: 7 }, open],
    [{ role: "admin", teamId: null }, open],
  ] as const)
    assert.deepEqual(hwpxBasis(me, card, o), { data: { title: "원장" }, version: "c:2026-10-28T01:00:00Z" }, JSON.stringify(me));
});

const ROOT = resolve(import.meta.dirname, "../..");
const file = (g: number) => join(ROOT, "data/cards/260916", cardSourceFile(g));
const has = [1, 2, 3].every((g) => existsSync(file(g)));

test("59장: 사본 본문 = 본문 틀(쪽 본문 폭) + 맨 위 묶음 제목 표 + 편집 표시 없음 · 카드 화면(lead 없음)은 묶음 제목 표를 그리지 않음", { skip: NO_SEED_CARDS || (!has && "원본 한글 파일 없음") }, () => {
  const cards = seedCards();
  let n = 0;
  for (const g of [1, 2, 3]) {
    const cs = cards.filter((c) => c.id.startsWith(`주요사업${g}/`));
    for (const b of buildLayouts(readHwp5(readFileSync(file(g))), cs).built) {
      const card = cs[b.index];
      const body = cardCopyBody(card, b.layout, () => null)!;
      assert.ok(body.startsWith(`<div ${CARD_COPY_FRAME_ATTR}="" style="width:${cardBodyWidthMm(b.layout)}mm">`), card.id);
      assert.ok(!/data-p=|contenteditable|data-locked|tabindex/.test(body), `${card.id}: 편집 표시 없음`);
      // 덩이(hw-blk) 하나 더 — 맨 앞 덩이가 묶음 제목 표(글은 글자 조각으로 나뉘어 있음)
      const blocks = (h: string) => h.split('class="hw-blk"');
      const screen = renderLayoutCard(card, b.layout, {})!;
      assert.equal(blocks(body).length, blocks(screen).length + 1, `${card.id}: 덩이 하나 더`);
      const first = blocks(body)[1].replace(/<[^>]*>/g, "");
      assert.match(first, new RegExp(`\\(주요사업${g}\\)`), `${card.id}: 맨 앞 덩이가 묶음 제목 표`);
      assert.doesNotMatch(blocks(screen)[1].replace(/<[^>]*>/g, ""), /\(주요사업\d\)/, `${card.id}: 화면 맨 앞은 카드 표`);
      n++;
    }
  }
  assert.equal(n, 59);
});
