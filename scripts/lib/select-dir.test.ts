import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { selectionFromDir, trackDigestId } from "./select-dir.ts";

// 합성 폴더: 주요사업 카드 둘(1/1-가는 규칙 문서 있음, 3/1-가는 BZ-3 규칙 문서 없음)·경영관리 카드 하나 선별, 규칙 문서는 track-biz·BZ-1·track-mg만(BZ-3·MG-3 없음)
const dir = mkdtempSync(join(tmpdir(), "select-dir-"));
after(() => rmSync(dir, { recursive: true, force: true }));
mkdirSync(join(dir, "rules"));
writeFileSync(join(dir, "selection.json"), JSON.stringify({ cards: { "주요사업1/1-가": { keys: ["b/2", "a/1"] }, "주요사업3/1-가": { keys: ["c/1"] }, "경영관리3/3-1": { keys: ["m/2", "m/1"] }, "주요사업2/1-가": { keys: "틀림" } } }));
writeFileSync(join(dir, "rules", "track-biz.md"), "트랙 공통 규칙");
writeFileSync(join(dir, "rules", "BZ-1.md"), "BZ-1 규칙");
writeFileSync(join(dir, "rules", "track-mg.md"), "경영관리 공통 규칙");

const src = selectionFromDir(dir);
const REQ = { purpose: "card", feature: "writer" } as const;

test("trackDigestId: 평가단위 id로 트랙 공통 규칙 문서 id", () => {
  assert.equal(trackDigestId("BZ-2"), "track-biz");
  assert.equal(trackDigestId("MG-14"), "track-mg");
});

test("selectionFromDir: 선별된 카드는 고른 키 순서 그대로 + 트랙 공통·평가단위 규칙 문서 글", async () => {
  assert.deepEqual(await src({ id: "주요사업1/1-가", evalUnitId: "BZ-1", unit: "BZ-1" }, REQ), { keys: ["b/2", "a/1"], digest: { track: "트랙 공통 규칙", unit: "BZ-1 규칙" } });
});

test("selectionFromDir: selection.json에 없는 카드는 null(통째로 넣기)", async () => {
  assert.equal(await src({ id: "주요사업3/5-가", evalUnitId: "BZ-1", unit: "BZ-1" }, REQ), null);
});

test("selectionFromDir: 평가단위 규칙 파일이 없으면 null", async () => {
  assert.equal(await src({ id: "주요사업3/1-가", evalUnitId: "BZ-3", unit: "BZ-3" }, REQ), null);
});

test("selectionFromDir: 기준류를 원문 그대로 두는 경영관리(raw)는 규칙 파일 없이 고른 키만 — 규칙 문서 글은 빈 글", async () => {
  assert.deepEqual(await src({ id: "경영관리3/3-1", evalUnitId: "MG-3", unit: "MG-3" }, REQ), { keys: ["m/2", "m/1"], digest: { track: "", unit: "" } });
  rmSync(join(dir, "rules", "track-mg.md"));
  try {
    assert.deepEqual(await src({ id: "경영관리3/3-1", evalUnitId: "MG-3", unit: "MG-3" }, REQ), { keys: ["m/2", "m/1"], digest: { track: "", unit: "" } }, "트랙 공통 규칙 파일도 안 읽음");
  } finally {
    writeFileSync(join(dir, "rules", "track-mg.md"), "경영관리 공통 규칙");
  }
});

test("selectionFromDir(asDb): 파일에 없는 카드는 undefined(기본 DB 출처로 넘김) — selection.json이 없으면 모두", async () => {
  const both = selectionFromDir(dir, { asDb: true });
  const saved = process.env.KNOWLEDGE_SELECT_TRACKS;
  delete process.env.KNOWLEDGE_SELECT_TRACKS;
  after(() => (saved === undefined ? delete process.env.KNOWLEDGE_SELECT_TRACKS : (process.env.KNOWLEDGE_SELECT_TRACKS = saved)));
  assert.equal(await both({ id: "주요사업3/5-가", evalUnitId: "BZ-3", unit: "BZ-3" }, REQ), undefined);
  assert.equal(await both({ id: "경영관리3/3-1", evalUnitId: "MG-3", unit: "MG-3" }, REQ), null, "파일에 있는 카드는 DB로 넘기지 않음(2건 — 최소 개수 미만이라 통째로 넣기)");
  const empty = mkdtempSync(join(tmpdir(), "select-dir-db-"));
  try {
    assert.equal(await selectionFromDir(empty, { asDb: true })({ id: "주요사업1/1-가", evalUnitId: "BZ-1", unit: "BZ-1" }, REQ), undefined, "selection.json이 없으면 모두 DB로");
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test("selectionFromDir(asDb): 파일에 있는 카드도 DB 출처처럼 트랙 설정(용도·기능별)과 최소 개수(SELECT_MIN_KEYS)를 따름", async () => {
  const many = mkdtempSync(join(tmpdir(), "select-dir-asdb-"));
  const saved = process.env.KNOWLEDGE_SELECT_TRACKS;
  try {
    writeFileSync(join(many, "selection.json"), JSON.stringify({ cards: { "경영관리3/3-1": { keys: ["m/1", "m/2", "m/3", "m/4", "m/5"] }, "경영관리3/3-2": { keys: ["m/1", "m/2", "m/3", "m/4"] } } }));
    const asDb = selectionFromDir(many, { asDb: true });
    const mg = (id: string) => ({ id, evalUnitId: "MG-3", unit: "MG-3" });
    process.env.KNOWLEDGE_SELECT_TRACKS = "주요사업,경영관리:card";
    assert.deepEqual((await asDb(mg("경영관리3/3-1"), { purpose: "card", feature: "chat" }))?.keys, ["m/1", "m/2", "m/3", "m/4", "m/5"]);
    assert.equal(await asDb(mg("경영관리3/3-1"), { purpose: "report" }), null, "경영관리:card — 경평은 통째로 넣기");
    assert.equal(await asDb(mg("경영관리3/3-2"), { purpose: "card", feature: "chat" }), null, "4건 → 통째로 넣기");
    process.env.KNOWLEDGE_SELECT_TRACKS = "주요사업";
    assert.equal(await asDb(mg("경영관리3/3-1"), { purpose: "card", feature: "chat" }), null, "목록에 없는 트랙");
    assert.ok(await src(mg("경영관리3/3-1"), { purpose: "report" }) !== undefined, "asDb가 아니면 트랙 설정을 안 봄(예전 실험 그대로)");
  } finally {
    if (saved === undefined) delete process.env.KNOWLEDGE_SELECT_TRACKS;
    else process.env.KNOWLEDGE_SELECT_TRACKS = saved;
    rmSync(many, { recursive: true, force: true });
  }
});

test("selectionFromDir: 트랙 공통 규칙 파일이 없으면 null", async () => {
  rmSync(join(dir, "rules", "track-biz.md"));
  try {
    assert.equal(await src({ id: "주요사업1/1-가", evalUnitId: "BZ-1", unit: "BZ-1" }, REQ), null);
  } finally {
    writeFileSync(join(dir, "rules", "track-biz.md"), "트랙 공통 규칙");
  }
});

test("selectionFromDir: selection.json이 없으면 모든 카드 null", async () => {
  const empty = mkdtempSync(join(tmpdir(), "select-dir-empty-"));
  try {
    assert.equal(await selectionFromDir(empty)({ id: "주요사업1/1-가", evalUnitId: "BZ-1", unit: "BZ-1" }, REQ), null);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test("selectionFromDir: keys가 문자열 목록이 아니면 오류(조용히 통째로 넣기로 가지 않음)", async () => {
  await assert.rejects(src({ id: "주요사업2/1-가", evalUnitId: "BZ-2", unit: "BZ-2" }, REQ), /문자열 목록/);
});
