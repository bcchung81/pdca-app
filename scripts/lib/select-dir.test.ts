import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { selectionFromDir, trackDigestId } from "./select-dir.ts";

// 합성 폴더: 주요사업 카드 하나·경영관리 카드 하나 선별, 규칙 문서는 track-biz·BZ-1·track-mg만(MG-3 없음)
const dir = mkdtempSync(join(tmpdir(), "select-dir-"));
after(() => rmSync(dir, { recursive: true, force: true }));
mkdirSync(join(dir, "rules"));
writeFileSync(join(dir, "selection.json"), JSON.stringify({ cards: { "주요사업1/1-가": { keys: ["b/2", "a/1"] }, "경영관리3/3-1": { keys: [] }, "주요사업2/1-가": { keys: "틀림" } } }));
writeFileSync(join(dir, "rules", "track-biz.md"), "트랙 공통 규칙");
writeFileSync(join(dir, "rules", "BZ-1.md"), "BZ-1 규칙");
writeFileSync(join(dir, "rules", "track-mg.md"), "경영관리 공통 규칙");

const src = selectionFromDir(dir);

test("trackDigestId: 평가단위 id로 트랙 공통 규칙 문서 id", () => {
  assert.equal(trackDigestId("BZ-2"), "track-biz");
  assert.equal(trackDigestId("MG-14"), "track-mg");
});

test("selectionFromDir: 선별된 카드는 고른 키 순서 그대로 + 트랙 공통·평가단위 규칙 문서 글", async () => {
  assert.deepEqual(await src({ id: "주요사업1/1-가", evalUnitId: "BZ-1", unit: "BZ-1" }), { keys: ["b/2", "a/1"], digest: { track: "트랙 공통 규칙", unit: "BZ-1 규칙" } });
});

test("selectionFromDir: selection.json에 없는 카드는 null(통째로 넣기)", async () => {
  assert.equal(await src({ id: "주요사업3/5-가", evalUnitId: "BZ-1", unit: "BZ-1" }), null);
});

test("selectionFromDir: 평가단위 규칙 파일이 없으면 null", async () => {
  assert.equal(await src({ id: "경영관리3/3-1", evalUnitId: "MG-3", unit: "MG-3" }), null);
});

test("selectionFromDir: 트랙 공통 규칙 파일이 없으면 null", async () => {
  rmSync(join(dir, "rules", "track-biz.md"));
  try {
    assert.equal(await src({ id: "주요사업1/1-가", evalUnitId: "BZ-1", unit: "BZ-1" }), null);
  } finally {
    writeFileSync(join(dir, "rules", "track-biz.md"), "트랙 공통 규칙");
  }
});

test("selectionFromDir: selection.json이 없으면 모든 카드 null", async () => {
  const empty = mkdtempSync(join(tmpdir(), "select-dir-empty-"));
  try {
    assert.equal(await selectionFromDir(empty)({ id: "주요사업1/1-가", evalUnitId: "BZ-1", unit: "BZ-1" }), null);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test("selectionFromDir: keys가 문자열 목록이 아니면 오류(조용히 통째로 넣기로 가지 않음)", async () => {
  await assert.rejects(src({ id: "주요사업2/1-가", evalUnitId: "BZ-2", unit: "BZ-2" }), /문자열 목록/);
});
