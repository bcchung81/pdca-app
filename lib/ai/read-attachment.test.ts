import assert from "node:assert/strict";
import { test } from "node:test";
import { DESCRIBE_IMAGE_MAX_BYTES, DESCRIBE_MARK, type DescribeInput } from "./describe.ts";
import { type DescribeCallResult, type ReadDeps, readAttachmentWith } from "./read-attachment.ts";
import { PARSER_VERSION, type MaterialRow, materialState, parseColumns } from "./material-text.ts";
import { ATTACH_LABEL, isAttachableName } from "./writer.ts";

const usage = { input: 1200, output: 300, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0 };
const bytes = (n: number) => new Uint8Array(n).fill(7);

/** 호출 기록을 남기는 가짜 의존성 */
function deps(over: { kordoc?: ReadDeps["kordoc"]; describe?: (i: DescribeInput) => Promise<DescribeCallResult> } = {}) {
  const calls = { kordoc: 0, describe: [] as DescribeInput[] };
  const d: ReadDeps = {
    kordoc: async (b) => {
      calls.kordoc++;
      return over.kordoc ? over.kordoc(b) : { ok: true, markdown: "본문 ".repeat(40) };
    },
    describe: async (i) => {
      calls.describe.push(i);
      return over.describe ? over.describe(i) : { ok: true, description: "현장 점검 사진: 작업자 2명, 철탑 12m 지점", model: "claude-sonnet-5-5", usage };
    },
    isAttachable: isAttachableName,
    attachLabel: ATTACH_LABEL,
  };
  return { d, calls };
}

test("허용 형식이 아니면 읽지 않고 실패(모델도 안 부름)", async () => {
  const { d, calls } = deps();
  const r = await readAttachmentWith(bytes(10), "메모.txt", d);
  assert.equal(r.status, "failed");
  assert.match(r.error!, /AI가 읽는 형식이 아닙니다/);
  assert.match(r.error!, /이미지/);
  assert.deepEqual([calls.kordoc, calls.describe.length], [0, 0]);
});

test("이미지 첨부: kordoc은 안 부르고 그림 설명으로 글을 만든다(머리 표지·모델·토큰 기록, mime 전달)", async () => {
  const { d, calls } = deps();
  const r = await readAttachmentWith(bytes(2000), "현장 사진.JPG", d);
  assert.equal(r.status, "parsed");
  assert.ok(r.text.startsWith(DESCRIBE_MARK));
  assert.match(r.text, /작업자 2명/);
  assert.ok(typeof r.describe?.ms === "number" && r.describe.ms >= 0, "설명 호출 소요 시간이 남음");
  assert.deepEqual({ ...r.describe, ms: undefined }, { model: "claude-sonnet-5-5", usage, ms: undefined });
  assert.equal(r.sha256.length, 64);
  assert.equal(calls.kordoc, 0);
  assert.deepEqual(calls.describe.map((c) => [c.kind, c.mime, c.name]), [["image", "image/jpeg", "현장 사진.JPG"]]);
});

test("이미지가 API 한도(5MB)를 넘으면 모델을 안 부르고 실패", async () => {
  const { d, calls } = deps();
  const r = await readAttachmentWith(bytes(DESCRIBE_IMAGE_MAX_BYTES + 1), "큰 사진.png", d);
  assert.equal(r.status, "failed");
  assert.match(r.error!, /이미지가 너무 큽니다/);
  assert.equal(calls.describe.length, 0);
});

test("API가 아니라 그림 설명을 못 만들면(unavailable) 보류(pending) — 글·describe 없이 사유만, 모델 오류는 실패(failed)", async () => {
  const cli = deps({ describe: async () => ({ ok: false, unavailable: true, error: "그림 설명은 API 경로에서만 만들 수 있습니다" }) });
  const p = await readAttachmentWith(bytes(100), "a.png", cli.d);
  assert.deepEqual([p.status, p.text, p.describe], ["pending", "", undefined]);
  assert.match(p.error!, /API 경로/);
  const broken = deps({ describe: async () => ({ ok: false, unavailable: false, error: "모델 오류" }) });
  const f = await readAttachmentWith(bytes(100), "a.png", broken.d);
  assert.deepEqual([f.status, f.error], ["failed", "모델 오류"]);
});

test("설명이 너무 짧으면 실패하되 이미 나간 호출(모델·토큰)은 남긴다", async () => {
  const short = deps({ describe: async () => ({ ok: true, description: "사진", model: "claude-sonnet-5-5", usage }) });
  const r = await readAttachmentWith(bytes(100), "a.webp", short.d);
  assert.equal(r.status, "failed");
  assert.match(r.error!, /비어 있습니다/);
  assert.ok(typeof r.describe?.ms === "number" && r.describe.ms >= 0, "설명 호출 소요 시간이 남음");
  assert.deepEqual({ ...r.describe, ms: undefined }, { model: "claude-sonnet-5-5", usage, ms: undefined });
});

test("글이 있는 PDF·한글·워드는 kordoc 글만 쓰고 모델을 안 부른다", async () => {
  for (const name of ["보고.pdf", "보고.hwp", "보고.docx"]) {
    const { d, calls } = deps();
    const r = await readAttachmentWith(bytes(100), name, d);
    assert.equal(r.status, "parsed", name);
    assert.ok(!r.text.startsWith(DESCRIBE_MARK));
    assert.equal(r.describe, undefined);
    assert.equal(calls.describe.length, 0, name);
  }
});

test("글이 거의 없는 PDF(스캔 문서)는 PDF를 그림 설명으로 읽는다(mime application/pdf, 「스캔한 문서 쪽」 표지)", async () => {
  const { d, calls } = deps({ kordoc: async () => ({ ok: true, markdown: "  \n" }), describe: async () => ({ ok: true, description: "— 1쪽 — 공문: 2026년 9월 점검 계획 시행 알림 …", model: "claude-sonnet-5-5", usage }) });
  const r = await readAttachmentWith(bytes(5000), "스캔 공문.pdf", d);
  assert.equal(r.status, "parsed");
  assert.match(r.text, /AI가 스캔한 문서 쪽을 보고/);
  assert.deepEqual(calls.describe.map((c) => [c.kind, c.mime]), [["pdf", "application/pdf"]]);
  assert.equal(calls.kordoc, 1, "kordoc으로 먼저 읽어 글이 없는지 확인");
});

test("글이 없는 한글·워드 파일은 그림 설명 대상이 아니라 실패, kordoc 오류·예외도 던지지 않고 실패", async () => {
  const empty = deps({ kordoc: async () => ({ ok: true, markdown: "" }) });
  const r = await readAttachmentWith(bytes(100), "빈.hwpx", empty.d);
  assert.equal(r.status, "failed");
  assert.match(r.error!, /글자를 읽지 못했습니다/);
  assert.equal(empty.calls.describe.length, 0);
  const bad = deps({ kordoc: async () => ({ ok: false, code: "PASSWORD" }) });
  assert.match((await readAttachmentWith(bytes(100), "a.pdf", bad.d)).error!, /읽지 못했습니다\(PASSWORD\)/);
  const boom = deps({ kordoc: async () => { throw new Error("손상"); } });
  assert.match((await readAttachmentWith(bytes(100), "a.pdf", boom.d)).error!, /손상되었거나 암호/);
});

test("저장 칸: 보류는 pending·글 없음·사유만 저장하고 같은 판이어도 「아직 안 읽음」이라 요청 때 다시 읽는다, 성공·실패는 지금처럼", () => {
  const pending = parseColumns({ status: "pending", text: "", error: "API 경로에서만", sha256: "h" });
  assert.deepEqual([pending.parse_status, pending.parsed_text, pending.parse_error, pending.parsed_chars, pending.parser_version], ["pending", null, "API 경로에서만", null, PARSER_VERSION]);
  const row = (over: Partial<MaterialRow>): MaterialRow => ({ id: "1", file_name: "a.png", storage_path: "p", bytes: 1, parsed_text: null, parse_status: "pending", parser_version: PARSER_VERSION, parse_error: "x", ...over });
  assert.equal(materialState(row({})), "stale");
  assert.equal(materialState(row({ parse_status: "parsed", parsed_text: "글" })), "ready");
  assert.equal(materialState(row({ parse_status: "failed" })), "failed");
  assert.equal(parseColumns({ status: "parsed", text: "글", error: null, sha256: "h" }).parse_status, "parsed");
});

test("파서 판에 그림 설명 판이 들어 있어 바뀌면 이미 올린 첨부도 다시 읽는다", () => {
  assert.match(PARSER_VERSION, /describe-\d+$/);
  assert.equal(materialState({ id: "1", file_name: "a.png", storage_path: "p", bytes: 1, parsed_text: "글", parse_status: "parsed", parser_version: "kordoc-4.15.3/att-1", parse_error: null }), "stale");
});
