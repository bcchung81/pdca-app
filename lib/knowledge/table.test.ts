import assert from "node:assert/strict";
import { test } from "node:test";
import { expandGrid, htmlFragmentText, linearizeGrid, parseHtmlTables, parsePipeTable, tableSearchText } from "./table.ts";

test("rowspan·colspan을 펼친 격자", () => {
  const [t] = parseHtmlTables(`<table>
<tr><th>구분</th><th>점검사항</th><th>결과</th></tr>
<tr><td rowspan="2">성과지표</td><td>가</td><td>예</td></tr>
<tr><td>나</td><td>예</td></tr>
<tr><td colspan="2">환류</td><td>아니오</td></tr>
</table>`);
  assert.deepEqual(expandGrid(t), [
    ["구분", "점검사항", "결과"],
    ["성과지표", "가", "예"],
    ["성과지표", "나", "예"],
    ["환류", "환류", "아니오"],
  ]);
  assert.deepEqual(linearizeGrid(expandGrid(t)).slice(-1), ["구분=환류; 결과=아니오"]);
});

test("중첩 표는 셀 글자 안에서 행을 ' / '로 잇는다(편람 산식 분수)", () => {
  const html = `<table><tr><td>측정</td><td><table>
<tr><th rowspan="2">①</th><th rowspan="2">기여도</th><th rowspan="2">=</th><th>조기개선 국수</th></tr>
<tr><td>총 불합격 수</td></tr>
</table><br>② 설명</td></tr></table>`;
  const [t] = parseHtmlTables(html);
  assert.equal(t.rows.length, 1);
  assert.equal(t.rows[0].cells[1].text, "① 기여도 = 조기개선 국수 / 총 불합격 수 ② 설명");
  assert.equal(htmlFragmentText("가<br>나"), "가 나");
});

test("여러 최상위 표와 재귀 호출이 서로의 위치를 망가뜨리지 않는다", () => {
  const html = `<table><tr><td><table><tr><td>안</td></tr></table></td><td>밖1</td></tr></table>
<table><tr><td>둘째</td></tr></table>`;
  const tables = parseHtmlTables(html);
  assert.equal(tables.length, 2);
  assert.deepEqual(tables[0].rows[0].cells.map((c) => c.text), ["안", "밖1"]);
  assert.equal(tables[1].rows[0].cells[0].text, "둘째");
});

test("파이프 표: 구분선은 버리고 이스케이프된 | 는 칸을 나누지 않는다", () => {
  const { rows } = parsePipeTable("| No | 지적사항 |\n| --- | --- |\n| 1<br>(기금 지표) | A \\| B |");
  assert.deepEqual(rows, [["No", "지적사항"], ["1<br>(기금 지표)", "A \\| B"]]);
  assert.equal(tableSearchText("| 구분 | 값 |\n| --- | --- |\n| 2025년 | 11,836국 |"), "구분=2025년; 값=11,836국");
});
