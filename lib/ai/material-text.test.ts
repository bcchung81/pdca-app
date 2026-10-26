import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { type MaterialRow, PARSER_VERSION, fileRefs, materialState, parseColumns } from "./material-text.ts";

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
