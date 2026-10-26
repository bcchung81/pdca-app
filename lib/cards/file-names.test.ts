import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { cardFileStem, cardSourceFile, cardSourceFiles, groupSlug, taskSlug } from "./file-names.ts";
import { NO_SEED_CARDS } from "../testing/originals.ts";

const DIR = resolve(import.meta.dirname, "../../seed/cards/260916");

test("카드 묶음·과제번호 → 영문 파일 이름(NFD로 들어와도 같음), 모르는 글자는 오류", () => {
  assert.equal(groupSlug("주요사업1"), "biz1");
  assert.equal(groupSlug("주요사업3".normalize("NFD")), "biz3");
  assert.equal(taskSlug("1-가"), "1-ga");
  assert.equal(taskSlug("10-라"), "10-ra");
  assert.equal(taskSlug("2-다".normalize("NFD")), "2-da");
  assert.equal(cardFileStem("주요사업2", "4-나"), "biz2_4-na");
  assert.throws(() => groupSlug("경영관리"), /카드 묶음/);
  assert.throws(() => taskSlug("1-힣"), /과제번호 글자/);
});

test("카드 원본 파일 이름: 묶음마다 hwp·pdf와 기관 원본 이름", () => {
  assert.equal(cardSourceFile(2), "cards-260916-biz2.hwp");
  assert.equal(cardSourceFile(1, "pdf"), "cards-260916-biz1.pdf");
  assert.deepEqual(cardSourceFiles()[0], { group: "주요사업1", hwp: "cards-260916-biz1.hwp", pdf: "cards-260916-biz1.pdf", original: "(260916) 과제관리카드(주요사업1)★" });
});

test("seed 카드 59장이 모두 서로 다른 정적 조각 파일(영문 이름)에 짝지어짐", { skip: NO_SEED_CARDS }, () => {
  const cards = (JSON.parse(readFileSync(join(DIR, "biz-260916.json"), "utf8")) as { cards: Array<{ group: string; taskNo: string }> }).cards;
  const files = new Set(readdirSync(join(DIR, "static")));
  const stems = cards.map((c) => `${cardFileStem(c.group, c.taskNo)}.html`);
  assert.equal(cards.length, 59);
  assert.equal(new Set(stems).size, 59);
  for (const s of stems) assert.ok(files.has(s), `조각 없음: ${s}`);
  assert.equal(files.size, 59, "쓰지 않는 조각 파일이 없음");
  for (const f of files) assert.match(f, /^[a-z0-9_-]+\.html$/, `영문 이름이 아님: ${f}`);
});
