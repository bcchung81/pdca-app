// 원본 배치 ↔ 카드 JSON 짝짓기: 묶음 여럿의 카드가 섞여 있어도(합본 — 과제번호가 묶음마다 1-가부터) 배치의 묶음(layout.lead) 카드와만 + 저장소 한도를 넘는 배치 그림 바꾸기
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { readHwp5 } from "../hwp/hwp5.ts";
import { encodePng } from "./hwp/image.ts";
import { type BuiltLayout, buildLayouts, fitLayoutImages } from "./layout-build.ts";
import { cardSourceFile } from "./file-names.ts";
import { NO_SEED_CARDS, seedCards } from "../testing/originals.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const file = join(ROOT, "data/cards/260916", cardSourceFile(1));

test("다른 묶음 카드가 앞에 섞여 있어도 같은 과제번호의 같은 묶음 카드와 짝지음", { skip: NO_SEED_CARDS || (!existsSync(file) && "원본 한글 파일 없음") }, () => {
  const seed = seedCards<{ group: string; taskNo: string }>();
  const g1 = seed.filter((c) => c.group === "주요사업1");
  const mixed = [...seed.filter((c) => c.group === "주요사업2"), ...g1];
  const { built, skipped } = buildLayouts(readHwp5(readFileSync(file)), mixed);
  assert.deepEqual(skipped, []);
  assert.equal(built.length, g1.length);
  assert.ok(built.every((b) => mixed[b.index].group === "주요사업1"));
});

test("fitLayoutImages: 한도를 넘는 배치 그림만 흰 바탕 JPEG로 — 저장 이름(내용 해시 .jpg)과 배치가 가리키는 이름을 함께 바꿈(합성)", () => {
  const rgba = new Uint8Array(16 * 16 * 4).fill(200);
  const big = encodePng(rgba, 16, 16, false);
  const small = encodePng(rgba.slice(0, 4 * 4 * 4), 4, 4, false);
  const b = {
    index: 0,
    stats: {},
    layout: { bins: [{ id: 1, ext: "png", src: 7, key: "hwp-big.png" }, { id: 2, ext: "png", src: 8, key: "hwp-small.png" }, { id: 3, ext: "png", src: 7, key: "hwp-big.png" }] },
    images: [{ key: "hwp-big.png", data: big, mime: "image/png" }, { key: "hwp-small.png", data: small, mime: "image/png" }],
  } as unknown as BuiltLayout;
  const fitted = fitLayoutImages(b, small.byteLength, 1_000_000);
  assert.equal(fitted.length, 1);
  const [f] = fitted;
  assert.match(f.to ?? "", /^hwp-[0-9a-f]{16}\.jpg$/);
  assert.deepEqual([f.from, f.before, f.quality], ["hwp-big.png", big.byteLength, 90]);
  assert.deepEqual(b.images.map((im) => [im.key, im.mime]), [[f.to, "image/jpeg"], ["hwp-small.png", "image/png"]]);
  assert.deepEqual(b.layout.bins.map((x) => x.key), [f.to, "hwp-small.png", f.to], "배치 참조도 같은 이름");
  assert.deepEqual(fitLayoutImages(b), [], "한도 안이면 그대로");
});
