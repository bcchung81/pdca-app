import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanCell, parsePasteRows, parsePasteTable, parseTsv } from "./paste.ts";
import { PASTE_MAX_ROWS } from "./types.ts";

test("parseTsv: 엑셀 복사(CRLF, 끝 줄바꿈)와 LF·CR을 모두 받는다", () => {
  assert.deepEqual(parseTsv("a\tb\r\nc\td\r\n"), [["a", "b"], ["c", "d"]]);
  assert.deepEqual(parseTsv("a\tb\nc\td"), [["a", "b"], ["c", "d"]]);
  assert.deepEqual(parseTsv("a\tb\rc\td"), [["a", "b"], ["c", "d"]]);
  assert.deepEqual(parseTsv(""), []);
});

test("parseTsv: 따옴표로 감싼 칸의 줄바꿈·탭·따옴표를 푼다", () => {
  assert.deepEqual(parseTsv('"a\nb"\tc\r\n'), [["a\nb", "c"]]);
  assert.deepEqual(parseTsv('"a\tb"\tc'), [["a\tb", "c"]]);
  assert.deepEqual(parseTsv('"5"" 팀"\tc'), [['5" 팀', "c"]]);
  assert.deepEqual(parseTsv('""\tc'), [["", "c"]], "빈 따옴표 칸");
  assert.deepEqual(parseTsv('5" 팀\tc'), [['5" 팀', "c"]], "칸 중간의 따옴표는 그대로");
});

test("cleanCell: NBSP·줄바꿈·연속 공백을 한 칸 공백으로, 앞뒤는 지운다", () => {
  assert.equal(cleanCell(" 홍길동  \n 차장 "), "홍길동 차장");
});

test("머리글이 있으면 열 순서와 상관없이 이름 그대로 찾는다", () => {
  const a = parsePasteRows("이름\t이메일\t팀명\r\n홍길동\thong@kca.kr\t검사기획팀\r\n김영희\tkim@kca.kr\t자격기획팀\r\n");
  assert.equal(a.hadHeader, true);
  assert.deepEqual(a.rows, [
    { line: 1, name: "홍길동", email: "hong@kca.kr", teamText: "검사기획팀" },
    { line: 2, name: "김영희", email: "kim@kca.kr", teamText: "자격기획팀" },
  ]);
  const b = parsePasteRows("팀명\t이메일 주소\t성명\n검사기획팀\thong@kca.kr\t홍길동");
  assert.equal(b.hadHeader, true);
  assert.deepEqual(b.rows, [{ line: 1, name: "홍길동", email: "hong@kca.kr", teamText: "검사기획팀" }]);
});

test("머리글이 없으면 @가 든 열을 이메일로 보고 나머지를 앞에서부터 이름·팀으로 본다", () => {
  const a = parsePasteRows("홍길동\thong@kca.kr\t검사기획팀\n김영희\tkim@kca.kr\t자격기획팀");
  assert.equal(a.hadHeader, false);
  assert.deepEqual(a.rows.map((r) => [r.name, r.email, r.teamText]), [["홍길동", "hong@kca.kr", "검사기획팀"], ["김영희", "kim@kca.kr", "자격기획팀"]]);
  const b = parsePasteRows("hong@kca.kr\t홍길동\t검사기획팀");
  assert.deepEqual(b.rows.map((r) => [r.name, r.email, r.teamText]), [["홍길동", "hong@kca.kr", "검사기획팀"]]);
});

test("팀 열이 없어도 줄은 만든다(팀은 화면에서 고름). 세 열보다 많으면 알린다", () => {
  const a = parsePasteRows("홍길동\thong@kca.kr");
  assert.deepEqual(a.rows, [{ line: 1, name: "홍길동", email: "hong@kca.kr", teamText: "" }]);
  const b = parsePasteRows("홍길동\thong@kca.kr\t검사기획팀\t메모\t또메모");
  assert.equal(b.rows.length, 1);
  assert.ok(b.warnings.some((w) => w.includes("세 열")));
});

test("셀 안 줄바꿈, 빈 줄, 끝 줄바꿈을 정리한다", () => {
  const a = parsePasteRows('이름\t이메일\t팀명\n"홍길동\n(차장)"\thong@kca.kr\t"검사기획팀"\n\n\t\t\n');
  assert.deepEqual(a.rows, [{ line: 1, name: "홍길동 (차장)", email: "hong@kca.kr", teamText: "검사기획팀" }]);
});

test("빈 글은 빈 결과, 이메일 열이 없는 머리글은 알린다", () => {
  assert.deepEqual(parsePasteRows("  \n\t\n").rows, []);
  const a = parsePasteRows("이름\t팀명\n홍길동\t검사기획팀");
  assert.ok(a.warnings.some((w) => w.includes("이메일 열")));
});

test("한 번에 처리하는 줄 수를 넘으면 앞부분만 읽고 알린다", () => {
  const lines = Array.from({ length: PASTE_MAX_ROWS + 5 }, (_, i) => `사람${i}\tp${i}@kca.kr\t검사기획팀`).join("\n");
  const a = parsePasteRows(lines);
  assert.equal(a.rows.length, PASTE_MAX_ROWS);
  assert.ok(a.warnings.some((w) => w.includes(String(PASTE_MAX_ROWS))));
});

test("parsePasteTable: 이미 칸으로 나뉜 표(격자 붙여넣기)도 같은 규칙 — 머리글 줄 버림·이메일 열 찾기·셀 안 줄바꿈 정리", () => {
  const a = parsePasteTable([
    ["이름", "이메일", "팀명"],
    ["홍길동", "hong@kca.kr", "전파기반본부\n(검사기획팀)"],
  ]);
  assert.equal(a.hadHeader, true);
  assert.deepEqual(a.rows.map((r) => [r.name, r.email, r.teamText]), [["홍길동", "hong@kca.kr", "전파기반본부 (검사기획팀)"]]);
  const b = parsePasteTable([["hong@kca.kr", "홍길동", "검사기획팀"]]);
  assert.deepEqual(b.rows.map((r) => [r.name, r.email, r.teamText]), [["홍길동", "hong@kca.kr", "검사기획팀"]]);
  assert.deepEqual(parsePasteTable([]).rows, []);
});
