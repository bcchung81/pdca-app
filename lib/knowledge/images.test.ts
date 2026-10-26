import assert from "node:assert/strict";
import { test } from "node:test";
import { CHUNK_IMAGE_MAX, IMAGE_MIN_BYTES, type KnowledgeImage, chunkImages, imagePages, imageRefs, knowledgeImagePath, metaImages, orphanImages, referencedImages, withChunkImages, GENERIC_CHUNK_IMAGE_MAX } from "./images.ts";

test("imageRefs: 마크다운 ![…](이름)과 표 칸 HTML <img src>를 나온 순서대로", () => {
  assert.deepEqual(imageRefs('앞 ![image](image_001.png) 글 <td><img src="image_002.bmp" alt="image"></td> ![x](image_003.jpg)'), ["image_001.png", "image_002.bmp", "image_003.jpg"]);
  assert.deepEqual(imageRefs("그림 없음 [링크](a.png)"), []);
});

test("imagePages: 그림 이름마다 처음 나온 조각의 쪽, 쪽·글이 없는 조각은 건너뜀", () => {
  const m = imagePages([
    { page: 3, text: "![image](image_001.png)" },
    { page: 4, text: "![image](image_001.png) ![image](image_002.png)" },
    { page: null, text: "![image](image_009.png)" },
    { page: 5, text: null },
  ]);
  assert.deepEqual([...m], [
    ["image_001.png", 3],
    ["image_002.png", 4],
  ]);
});

const img = (file: string, page: number, bytes = 10_000): KnowledgeImage => ({ file, ref: file, page, mime: "image/png", bytes });

test("chunkImages: 조각 쪽 범위 안 그림을 쪽·이름 순으로, 장식(작은 그림) 빼고, 상한까지", () => {
  const list = [img("p012-2.png", 12), img("p010-1.png", 10), img("p012-1.png", 12), img("p011-1.png", 11, IMAGE_MIN_BYTES - 1), img("p013-1.png", 13)];
  assert.deepEqual(chunkImages(list, 10, 12), ["p010-1.png", "p012-1.png", "p012-2.png"], "작은 그림(p011)과 범위 밖(p013)은 뺌");
  assert.deepEqual(chunkImages(list, 13, null), ["p013-1.png"], "끝 쪽이 없으면 시작 쪽 한 쪽");
  assert.deepEqual(chunkImages(list, 12, 11), ["p012-1.png", "p012-2.png"], "끝이 시작보다 앞이면 시작 쪽만");
  assert.deepEqual(chunkImages(list, null, 12), [], "쪽이 없는 조각은 그림 없음");
  const many = Array.from({ length: CHUNK_IMAGE_MAX + 5 }, (_, i) => img(`p020-${String(i).padStart(2, "0")}.png`, 20));
  assert.equal(chunkImages(many, 20, 20).length, CHUNK_IMAGE_MAX);
});

test("metaImages·knowledgeImagePath: 저장 이름만(경로 문자·다른 모양은 버림), 버킷 경로는 <doc_id>/images/<이름>", () => {
  assert.deepEqual(metaImages({ images: ["p001-1.jpg", "../x.png", 3, "a b.png", "image_002.png"] }), ["p001-1.jpg", "image_002.png"]);
  assert.deepEqual(metaImages(null), []);
  assert.deepEqual(metaImages({ images: "p001-1.jpg" }), []);
  assert.equal(knowledgeImagePath("att3-2604", "p017-1.jpg"), "att3-2604/images/p017-1.jpg");
});

test("withChunkImages·referencedImages: 쪽 범위에 든 그림만 meta.images에(기존 meta·글·쪽은 그대로), 그림 없는 조각은 같은 객체, 올릴 것은 붙은 그림뿐", () => {
  const img = (file: string, page: number, bytes = 9000): KnowledgeImage => ({ file, ref: file, page, mime: "image/png", bytes });
  const images = [img("p001-1.png", 1), img("p002-1.png", 2), img("p002-2.png", 2, 100), img("p009-1.png", 9)];
  const chunks = [
    { chunk_key: "a", pdf_page_start: 1, pdf_page_end: 2, meta: { usage: "x" } },
    { chunk_key: "b", pdf_page_start: 3, pdf_page_end: 4, meta: { usage: "y" } },
    { chunk_key: "c", pdf_page_start: null, pdf_page_end: null },
  ];
  const out = withChunkImages(chunks, images);
  assert.deepEqual(out[0].meta, { usage: "x", images: ["p001-1.png", "p002-1.png"] }, "4KB 미만 장식(p002-2)은 뺌");
  assert.equal(out[0].chunk_key, "a");
  assert.equal(out[1], chunks[1], "붙일 그림이 없으면 같은 객체");
  assert.equal(out[2], chunks[2]);
  assert.deepEqual(referencedImages(out, images).map((i) => i.file), ["p001-1.png", "p002-1.png"], "p009·장식은 안 올림");
});

test("withChunkImages 상한: 기본은 CHUNK_IMAGE_MAX(12), 일반 문서는 GENERIC_CHUNK_IMAGE_MAX(30)까지", () => {
  const images: KnowledgeImage[] = Array.from({ length: 20 }, (_, i) => ({ file: `p${String(i + 1).padStart(3, "0")}-1.png`, ref: "x", page: i + 1, mime: "image/png", bytes: 9000 }));
  const chunk: Array<{ pdf_page_start: number; pdf_page_end: number; meta?: unknown }> = [{ pdf_page_start: 1, pdf_page_end: 20 }];
  assert.equal((withChunkImages(chunk, images)[0].meta as { images: string[] }).images.length, CHUNK_IMAGE_MAX);
  assert.equal((withChunkImages(chunk, images, GENERIC_CHUNK_IMAGE_MAX)[0].meta as { images: string[] }).images.length, 20);
});

test("orphanImages: 버킷에 있지만 지금 조각 meta.images가 가리키지 않는 그림만(이름 순) — 판을 바꿔 다시 적재한 뒤 남은 옛 그림(개선 계획 P2-10)", () => {
  const chunks = [{ meta: { images: ["b.png", "a.jpg"] } }, { meta: { other: 1 } }, { meta: null }, {}];
  assert.deepEqual(orphanImages(["z.png", "a.jpg", "b.png", "old.png"], chunks), ["old.png", "z.png"]);
  assert.deepEqual(orphanImages(["a.jpg"], []), ["a.jpg"], "조각이 없으면 전부");
  assert.deepEqual(orphanImages([], chunks), []);
});
