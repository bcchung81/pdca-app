import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { type MaterialRow, PARSER_VERSION, type ParseOutcome, fileRefs, materialState, parseColumns, saveParsed } from "./material-text.ts";

const row = (over: Partial<MaterialRow> = {}): MaterialRow => ({
  id: "m1",
  file_name: "실적.hwpx",
  storage_path: "u/a.hwpx",
  bytes: 10,
  parsed_text: "전체 글",
  parse_status: "parsed",
  parser_version: PARSER_VERSION,
  parse_error: null,
  ...over,
});

test("파서 판: 설치된 kordoc 판을 담음(kordoc을 올리면 판이 바뀌어 첨부를 다시 읽음)", () => {
  const { version } = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../node_modules/kordoc/package.json"), "utf8"));
  assert.ok(PARSER_VERSION.startsWith(`kordoc-${version}/`), PARSER_VERSION);
});

test("저장본 상태: 같은 판의 읽은 글은 그대로, 같은 판의 실패는 다시 안 읽음, 판이 다르거나 아직이면 다시 읽음", () => {
  assert.equal(materialState(row()), "ready");
  assert.equal(materialState(row({ parse_status: "failed", parsed_text: null, parse_error: "글자 없음" })), "failed");
  assert.equal(materialState(row({ parse_status: "pending", parsed_text: null, parser_version: null })), "stale", "이미 올린 첨부(1단계 전)");
  assert.equal(materialState(row({ parser_version: "kordoc-0.0.1/att-1" })), "stale", "판이 바뀜");
  assert.equal(materialState(row({ parse_status: "failed", parser_version: "kordoc-0.0.1/att-1" })), "stale", "예전 판의 실패도 다시 시도");
  assert.equal(materialState(row({ parsed_text: null })), "stale", "읽었다는데 글이 없으면 다시");
});

test("저장 칸: 읽은 글·글자 수·판·시각, 실패는 글 없이 사유", () => {
  const at = new Date("2026-09-29T00:00:00Z");
  assert.deepEqual(parseColumns({ status: "parsed", text: "가나다", error: null, sha256: "h" }, at), {
    sha256: "h",
    parsed_text: "가나다",
    parse_status: "parsed",
    parser_version: PARSER_VERSION,
    parsed_at: at.toISOString(),
    parse_error: null,
    parsed_chars: 3,
  });
  const failed = parseColumns({ status: "failed", text: "", error: "글자를 읽지 못함", sha256: "h" }, at);
  assert.equal(failed.parsed_text, null);
  assert.equal(failed.parsed_chars, null);
  assert.equal(failed.parse_error, "글자를 읽지 못함");
});

test("첨부 봉투 열쇠: file:N(1부터), 제목은 파일 이름, 글은 자르지 않음", () => {
  const long = "가".repeat(90_000);
  const refs = fileRefs([
    { id: "a", kind: "card", name: "a.hwp", text: long },
    { id: "b", kind: "report", name: "b.pdf", text: "나" },
  ]);
  assert.deepEqual(
    refs.map((r) => [r.key, r.title, r.unitType, r.text.length]),
    [
      ["file:1", "a.hwp", "card_material", 90_000],
      ["file:2", "b.pdf", "report_material", 1],
    ],
  );
});

/** 가짜 클라이언트(사용자 권한): 읽기는 rows(사용자에게 보이는 행), 쓰기는 calls에 남기고 writable(RLS가 허락한 행)이면 1행 */
function fakeDb(rows: Array<{ id: string; storage_path: string }>, calls: Array<{ table: string; patch: unknown; eq: Array<[string, unknown]> }>, writable = true) {
  return {
    from(table: string) {
      const eq: Array<[string, unknown]> = [];
      let patch: unknown = null;
      const q = {
        select: () => q,
        update: (p: unknown) => ((patch = p), q),
        eq: (k: string, v: unknown) => (eq.push([k, v]), q),
        maybeSingle: async () => ({ data: rows.find((r) => eq.every(([k, v]) => (r as Record<string, unknown>)[k] === v)) ?? null, error: null }),
        then: (res: (v: unknown) => unknown) => {
          calls.push({ table, patch, eq });
          return Promise.resolve({ data: writable ? [{ id: eq[0]?.[1] }] : [], error: null }).then(res);
        },
      };
      return q;
    },
  } as unknown as Parameters<typeof saveParsed>[0];
}

test("읽은 글 저장(saveParsed — 20261117170000): 사용자 권한 클라이언트로, 보이는 행이고 경로가 같을 때만 그 칸을 씀", async () => {
  const o: ParseOutcome = { status: "parsed", text: "전체 글", error: null, sha256: "h" };
  const now = new Date("2026-11-17T00:00:00Z");
  const visible = [{ id: "m1", storage_path: "u/a.hwpx" }];

  const calls: Array<{ table: string; patch: unknown; eq: Array<[string, unknown]> }> = [];
  assert.equal(await saveParsed(fakeDb(visible, calls), "card_materials", "m1", "u/a.hwpx", o, now), true);
  assert.deepEqual(calls, [{ table: "card_materials", patch: parseColumns(o, now), eq: [["id", "m1"], ["storage_path", "u/a.hwpx"]] }], "그 행·그 경로만, 읽은 글 칸만");

  const none: typeof calls = [];
  assert.equal(await saveParsed(fakeDb(visible, none), "report_materials", "m2", "u/a.hwpx", o, now), false, "보이지 않는(남의) 행");
  assert.equal(await saveParsed(fakeDb(visible, none), "card_materials", "m1", "u/b.hwpx", o, now), false, "방금 읽은 파일과 경로가 다른 행");
  assert.equal(await saveParsed(fakeDb(visible, none), "card_materials", "m1", "u/a.hwpx", { ...o, sha256: "" }, now), false, "파일을 못 내려받음(읽은 것 없음)");
  assert.deepEqual(none, [], "쓰기 시도 없음");

  const locked: typeof calls = [];
  assert.equal(await saveParsed(fakeDb(visible, locked, false), "card_materials", "m1", "u/a.hwpx", o, now), false, "RLS가 0행(잠긴 근거·쓰기 권한 없음)이면 저장 안 됨");
  assert.equal(locked.length, 1);
});
