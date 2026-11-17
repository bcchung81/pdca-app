import assert from "node:assert/strict";
import { test } from "node:test";
import { ORPHAN_MIN_AGE_MS, PRUNE_BUCKETS, type RefIndex, addRefs, importFilePaths, isPruneBucket, originalReferenced, planOrphans } from "./orphans.ts";

const NOW = Date.parse("2026-11-18T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const DAY = ORPHAN_MIN_AGE_MS;

test("planOrphans: 참조 없고 하루 넘은 것만 고아, 참조 있음·하루 미만·만든 시각 모름·이상한 시각은 남김", () => {
  const refs = new Set(["u1/a.pdf", "u1/old-but-used.pdf"]);
  const plan = planOrphans(
    [
      { path: "u1/a.pdf", createdAt: ago(10 * DAY) },
      { path: "u1/old-but-used.pdf", createdAt: ago(100 * DAY) },
      { path: "u1/z-orphan.pdf", createdAt: ago(2 * DAY) },
      { path: "u1/b-orphan.hwp", createdAt: ago(DAY) },
      { path: "u1/uploading.pdf", createdAt: ago(DAY - 1) },
      { path: "u1/unknown.pdf", createdAt: null },
      { path: "u1/bad-date.pdf", createdAt: "어제" },
    ],
    (p) => refs.has(p),
    NOW,
  );
  assert.deepEqual(plan, { orphans: ["u1/b-orphan.hwp", "u1/z-orphan.pdf"], referenced: 2, young: 3 });
});

test("planOrphans: 기준 나이를 바꿀 수 있고 빈 목록은 빈 결과", () => {
  assert.deepEqual(planOrphans([{ path: "x", createdAt: ago(60_000) }], () => false, NOW, 30_000).orphans, ["x"]);
  assert.deepEqual(planOrphans([], () => false, NOW), { orphans: [], referenced: 0, young: 0 });
});

test("importFilePaths: files 배열의 비지 않은 path만(지운 원본의 빈 path·모양이 다른 값은 뺌)", () => {
  assert.deepEqual(
    importFilePaths([
      { n: 1, name: "가.hwp", path: "12/1.hwp" },
      { n: 2, name: "나.hwpx", path: "", removedAt: "2026-11-01" },
      { n: 3, path: 7 },
      null,
      "12/9.hwp",
      { n: 4, path: "12/4.hwpx" },
    ]),
    ["12/1.hwp", "12/4.hwpx"],
  );
  assert.deepEqual(importFilePaths(null), []);
  assert.deepEqual(importFilePaths({ path: "12/1.hwp" }), []);
});

test("addRefs·originalReferenced: 카드 JSON의 적재·현행화 그림(…/{biz|imp}N/{파일})과 배치 그림 키(hwp-…)를 자기 폴더에서만 인정", () => {
  const index: RefIndex = new Map();
  // 카드 원장(data의 그림 src, 원본 배치 bins[].key, 원본 양식 조각 html)
  addRefs(index, "uid-1", { blocks: [{ img: { src: "../images/biz3/image_001.jpg", kordoc: "image1.bmp" } }] });
  addRefs(index, "uid-1", { bins: [{ id: 1, key: "hwp-0123456789abcdef.png" }, { id: 2, key: null }] });
  addRefs(index, "uid-1", '<div class="kca-card"><img src="../images/biz3/image_002.png" alt=""></div>');
  // 현행화 항목(parsed의 src는 images/impN/…)
  addRefs(index, "uid-2", { title: "과제", pics: [{ src: "images/imp12/image_003.png" }] });

  assert.equal(originalReferenced(index, "uid-1/biz3-image_001.jpg"), true);
  assert.equal(originalReferenced(index, "uid-1/biz3-image_002.png"), true, "원본 양식 조각 html 안의 src");
  assert.equal(originalReferenced(index, "uid-1/hwp-0123456789abcdef.png"), true);
  assert.equal(originalReferenced(index, "uid-2/imp12-image_003.png"), true);

  assert.equal(originalReferenced(index, "uid-2/biz3-image_001.jpg"), false, "다른 폴더의 행이 가리키는 이름은 인정 안 함");
  assert.equal(originalReferenced(index, "uid-1/imp99-image_001.png"), false, "어느 행도 안 가리키는 현행화 그림");
  assert.equal(originalReferenced(index, "uid-1/imp-쓰레기.pdf"), false, "한글·직접 올린 이름");
  assert.equal(originalReferenced(index, "uid-9/hwp-0123456789abcdef.png"), false, "행이 없는 폴더");
  assert.equal(originalReferenced(index, "uid-1/sub/biz3-image_001.jpg"), false, "하위 폴더 객체는 앱이 만들지 않음");
  assert.equal(originalReferenced(index, "biz3-image_001.jpg"), false, "맨 위 객체");
  assert.equal(originalReferenced(index, "uid-1/"), false);
});

test("addRefs: 객체 키·깊은 배열·한글 사이에 붙은 이름도 모으고, 폴더·값이 없으면 아무것도 안 함", () => {
  const index: RefIndex = new Map();
  addRefs(index, "u", { "hwp-aaaaaaaaaaaaaaaa.jpg": { w: 1 }, deep: [[["그림hwp-bbbbbbbbbbbbbbbb.png이"]]], n: 3, ok: true });
  assert.equal(originalReferenced(index, "u/hwp-aaaaaaaaaaaaaaaa.jpg"), true);
  assert.equal(originalReferenced(index, "u/hwp-bbbbbbbbbbbbbbbb.png"), true);
  addRefs(index, null, { src: "../images/biz1/image_001.jpg" });
  addRefs(index, "", { src: "../images/biz1/image_001.jpg" });
  addRefs(index, "v", null);
  assert.deepEqual([...index.keys()], ["u"]);
});

test("PRUNE_BUCKETS: 정리하는 버킷 넷(knowledge는 범위 밖), isPruneBucket은 그 넷만", () => {
  assert.deepEqual([...PRUNE_BUCKETS], ["card-materials", "report-materials", "card-imports", "card-originals"]);
  assert.equal(isPruneBucket("card-originals"), true);
  assert.equal(isPruneBucket("knowledge"), false);
  assert.equal(isPruneBucket(""), false);
});
