import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { cardImageRefs, rewriteCardImages } from "./original-html.ts";
import { NO_SEED_CARDS } from "../testing/originals.ts";

test("원본 조각의 그림 경로를 찾고 서명 URL로 바꾼다", () => {
  const html = '<div class="kca-card"><img alt="a" src="../images/biz1/image_001.jpg"><img src="../images/biz1/image_001.jpg"><img src="https://x.test/y.png"></div>';
  const refs = cardImageRefs(html);
  assert.deepEqual(refs, [{ src: "../images/biz1/image_001.jpg", seedPath: "biz1/image_001.jpg", objectName: "biz1-image_001.jpg" }]);
  const out = rewriteCardImages(html, new Map([["../images/biz1/image_001.jpg", "https://s.test/sign?a=1&b=2"]]));
  assert.equal(out, '<div class="kca-card"><img alt="a" src="https://s.test/sign?a=1&amp;b=2"><img src="https://s.test/sign?a=1&amp;b=2"><img src=""></div>');
});

test("seed 카드 조각의 그림은 모두 알려진 형식이고 파일이 있다", { skip: NO_SEED_CARDS }, () => {
  const dir = resolve(import.meta.dirname, "../../seed/cards/260916");
  let n = 0;
  for (const f of readdirSync(join(dir, "static")).filter((x) => x.endsWith(".html"))) {
    const html = readFileSync(join(dir, "static", f), "utf8");
    const all = [...html.matchAll(/<img\b[^>]*\ssrc="([^"]*)"/gi)].length;
    const refs = cardImageRefs(html);
    assert.equal(new Set(refs.map((r) => r.src)).size, new Set([...html.matchAll(/<img\b[^>]*\ssrc="([^"]*)"/gi)].map((m) => m[1])).size, `${f}: 알 수 없는 그림 경로`);
    for (const r of refs) readFileSync(join(dir, "images", r.seedPath));
    n += all;
  }
  assert.ok(n >= 10);
});

test("원본 배치 렌더러가 넣은 서명 URL(알려진 주소)은 그대로, 모르는 주소는 비움", () => {
  const signed = "https://s.test/sign?k=hwp-1&t=2";
  const html = `<img src="https://s.test/sign?k=hwp-1&amp;t=2"><img src="https://evil.test/x.png">`;
  const out = rewriteCardImages(html, new Map([["hwp:hwp-1.png", signed]]));
  assert.equal(out, '<img src="https://s.test/sign?k=hwp-1&amp;t=2"><img src="">');
});
