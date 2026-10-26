import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { decodeEntities, flattenHtmlTables, parseChunkBlocks, snippetText, unescapeMarkdown } from "./rich-text.ts";

test("글·표 조각: 병합 칸(colspan·rowspan)·머리 칸·칸 안 줄바꿈, 표 밖 글은 그대로", () => {
  const text = [
    "1. 조기개선 국수 산정 방식",
    "<table>",
    '<tr><th>구 분</th><th colspan="2">기 존</th></tr>',
    '<tr><td rowspan="2">지표명</td><td>5G<br>활성화</td><td>&lt;가&gt; &amp; 나</td></tr>',
    "<tr><td>’19년</td><td>’25년</td></tr>",
    "</table>",
    "답변 끝",
  ].join("\n");
  const s = parseChunkBlocks(text);
  assert.deepEqual(
    s.map((x) => x.kind),
    ["para", "table", "para"],
  );
  assert.equal(s[0].kind === "para" && s[0].text, "1. 조기개선 국수 산정 방식");
  const t = s[1].kind === "table" ? s[1].rows : [];
  assert.deepEqual(t[0], [
    { text: "구 분", colspan: 1, rowspan: 1, head: true },
    { text: "기 존", colspan: 2, rowspan: 1, head: true },
  ]);
  assert.deepEqual(t[1][0], { text: "지표명", colspan: 1, rowspan: 2, head: false });
  assert.equal(t[1][1].text, "5G\n활성화");
  assert.equal(t[1][2].text, "<가> & 나", "문자 참조는 글자로(화면은 React가 이스케이프)");
  assert.equal(t[2].length, 2);
});

test("안쪽 표는 칸 글(줄 표)로, 닫히지 않은 표는 표로 보지 않음, 이스케이프·태그는 걷음", () => {
  const s = parseChunkBlocks("<table><tr><td>밖<table><tr><td>안1</td><td>안2</td></tr></table></td><td>옆</td></tr></table>");
  const rows = s[0].kind === "table" ? s[0].rows : [];
  assert.equal(rows.length, 1);
  assert.deepEqual(
    rows[0].map((c) => c.text),
    ["밖\n안1 | 안2 |", "옆"],
  );
  const open = parseChunkBlocks("앞 글 <table><tr><td>끝 없음");
  assert.deepEqual(open, [{ kind: "para", text: "앞 글 끝 없음" }]);
  assert.equal(unescapeMarkdown("\\*강조\\* a\\|b"), "*강조* a|b");
  assert.equal(decodeEntities("&#39;25&#x27; &quot;x&quot; &nbsp;"), "'25' \"x\"  ");
});

test("줄 표 풀이(AI·인용 대조·미리보기): 칸 | 칸, <br>는 /, 이스케이프 걷음", () => {
  assert.equal(flattenHtmlTables("<table><tr><td>A<br>B</td><td>\\*C</td></tr></table>"), "A / B | *C |\n");
  assert.equal(snippetText("<table><tr><td>가</td></tr></table>\n나   다", 20), "가 | 나 다");
});

test("줄 표 풀이: 아래 행으로 이어지는 칸(rowspan)은 「〃」로 자리를 채워 열이 어긋나지 않고, 가로 병합은 한 번만, 칸 글은 안 반복", () => {
  const t = (rows: string) => flattenHtmlTables(`<table>${rows}</table>`);
  assert.equal(
    t(`<tr><th>항 목</th><th>기술사항</th><th>기술요령</th></tr><tr><td rowspan="3">2. 주파수 대역</td><td>1) 대역</td><td>가</td></tr><tr><td>2) 용도</td><td>나</td></tr><tr><td>3) 지역</td><td>다</td></tr>`),
    "항 목 | 기술사항 | 기술요령 |\n2. 주파수 대역 | 1) 대역 | 가 |\n〃 | 2) 용도 | 나 |\n〃 | 3) 지역 | 다 |\n",
  );
  assert.equal(t(`<tr><td>구분</td><td>값</td></tr><tr><td rowspan="2">서울</td><td>1</td></tr><tr><td>2</td></tr><tr><td>부산</td><td>3</td></tr>`), "구분 | 값 |\n서울 | 1 |\n〃 | 2 |\n부산 | 3 |\n", "범위가 끝나면 다음 행은 그대로");
  assert.equal(t(`<tr><td>A</td><td rowspan="2">B</td><td>C</td></tr><tr><td>D</td><td>E</td></tr>`), "A | B | C |\nD | 〃 | E |\n", "가운데 열의 이어진 칸도 그 자리에");
  assert.equal(t(`<tr><td rowspan="2" colspan="2">AB</td><td>C</td></tr><tr><td>D</td></tr>`), "AB | C |\n〃 | D |\n", "가로·세로 병합 칸은 한 번만 적고 이어짐은 하나로");
  assert.equal(t(`<tr><td>A</td><td colspan="2">BC</td></tr>`), "A | BC |\n", "가로 병합은 한 번만");
  assert.equal(t(`<tr><td>A</td><td rowspan="2">B</td></tr><tr><td>C</td></tr>`), "A | B |\nC | 〃 |\n", "맨 끝 열의 이어진 칸");
});

test("줄 표 풀이: 글 속 사설 영역 문자(수식 글리프 찌꺼기)는 지움, 표 밖 글·닫히지 않은 표는 예전과 같음", () => {
  assert.equal(flattenHtmlTables("측정 산식 : 활용률 \uE000\uE008 제작지원비"), "측정 산식 : 활용률  제작지원비");
  assert.equal(flattenHtmlTables("앞 글\n<table><tr><td>가</td></tr>\n뒤 글"), "앞 글\n가 |\n뒤 글", "닫히지 않은 표는 표로 보지 않고 태그만 걷음");
  assert.equal(flattenHtmlTables("| a | b |\n| --- | --- |\n| 1<br>2 | 3 |"), "| a | b |\n| --- | --- |\n| 1 / 2 | 3 |", "마크다운 표 칸의 <br>는 예전처럼 /");
});

test("칸 안에 표가 둘 이상 있고 그 사이에 「< 제목 >」 글이 있어도 글이 지워지지 않음(안쪽 표를 범위별로 풀고, 풀린 글의 꺾쇠를 태그로 안 봄)", () => {
  const md = "<table><tr><th>설명<br>&lt; 가입자 전망 (출처: A) &gt;<br><table><tr><td>연도</td><td>26년</td></tr></table><br>&lt; 가입자 현황 (출처: B) &gt;<br><table><tr><td>연도</td><td>20년</td></tr></table></th></tr></table>";
  const out = flattenHtmlTables(md);
  for (const piece of ["< 가입자 전망 (출처: A) >", "< 가입자 현황 (출처: B) >", "연도 | 26년 |", "연도 | 20년 |"]) assert.ok(out.includes(piece), piece);
  const rich = parseChunkBlocks(md);
  assert.ok(rich[0].kind === "table" && rich[0].rows[0][0].text.includes("< 가입자 현황 (출처: B) >"), "화면 칸 글도 같음");
});

test("실제 첨부3 조각: 표가 있는 조각도 화면 조각에 HTML 태그가 남지 않음(원본이 없으면 건너뜀)", (t) => {
  const file = join(resolve(import.meta.dirname, "../.."), "resources/knowledge/_chunks/att3-2604.jsonl");
  if (!existsSync(file)) return t.skip("원본 조각 없음");
  const chunks = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { text: string });
  let tables = 0;
  for (const c of chunks) {
    for (const s of parseChunkBlocks(c.text)) {
      const texts = s.kind === "table" ? s.rows.flat().map((x) => x.text) : [s.text];
      for (const x of texts) assert.doesNotMatch(x, /<\/?(table|tr|td|th|br)\b/i, x.slice(0, 80));
      if (s.kind === "table") tables++;
    }
    assert.doesNotMatch(flattenHtmlTables(c.text), /<\/?(table|tr|td|th|br)\b/i);
  }
  assert.ok(tables >= 100, `표 ${tables}개`);
});

// ── 화면 블록(parseChunkBlocks): 일반 문서(PDF 슬라이드)의 마크다운 파이프 표·제목·그림 참조·문단 간격(2026-10-09)

test("마크다운 파이프 표는 표로: 머리 줄이 모두 비면 머리 없이, 칸이 모두 빈 행은 버리고, 이스케이프된 파이프는 칸 경계가 아님", () => {
  const md = [
    "|  |  |  | ☞ 핵심질문 : “ 어떻게 작성해야 좋은 득점을 받지? ” |  |  |",
    "| --- | --- | --- | --- | --- | --- |",
    "| 1 | \\` \\` | 2 | 5 | 3 | 4 |",
    "|  |  |  |  |  |  |",
    "|  | 4단 구조 | 시각정보로 | 문단 앞쪽에 | 흥미감성형 | 개선성과를 |",
  ].join("\n");
  const b = parseChunkBlocks(md);
  assert.equal(b.length, 1);
  assert.ok(b[0].kind === "table");
  // 머리 줄(☞ 핵심질문…)은 글이 있어 머리로, 칸이 모두 빈 행은 없음
  assert.equal(b[0].rows.length, 3);
  assert.equal(b[0].rows[0][3].text, "☞ 핵심질문 : “ 어떻게 작성해야 좋은 득점을 받지? ”");
  assert.equal(b[0].rows[0][0].head, true);
  assert.equal(b[0].rows[1][0].text, "1");

  const esc = parseChunkBlocks("| 구분 | 값 |\n| --- | --- |\n| a \\| b | 2 |");
  assert.ok(esc[0].kind === "table");
  assert.deepEqual(esc[0].rows[1].map((c) => c.text), ["a | b", "2"]);

  const noHead = parseChunkBlocks("|  |  |\n| --- | --- |\n| 가 | 나 |");
  assert.ok(noHead[0].kind === "table" && noHead[0].rows.length === 1 && noHead[0].rows[0][0].head === false, "머리가 비면 머리 없이 본문 행만");
});

test("구분 줄이 없는 | 줄은 표로 보지 않고 글로 둠", () => {
  const b = parseChunkBlocks("| 가 | 나 |\n| 다 | 라 |");
  assert.equal(b.length, 1);
  assert.ok(b[0].kind === "para" && b[0].text.includes("| 가 | 나 |"));
});

test("제목(#)은 제목 블록으로, 빈 줄마다 문단을 나누고, 그림 참조는 걷음", () => {
  const md = "## 가. 비계량보고서 작성이 왜 중요한가?\n\nA 성과의 내용과\t기술방식에 따라 점수\n\n![image](image_001.png)\n\n![image](image_002.png) 글 뒤 그림\n\n### 소제목 ###\n끝 문단";
  const b = parseChunkBlocks(md);
  assert.deepEqual(b, [
    { kind: "heading", level: 2, text: "가. 비계량보고서 작성이 왜 중요한가?" },
    { kind: "para", text: "A 성과의 내용과  기술방식에 따라 점수" },
    { kind: "para", text: "글 뒤 그림" },
    { kind: "heading", level: 3, text: "소제목" },
    { kind: "para", text: "끝 문단" },
  ]);
});

test("HTML 표와 파이프 표가 한 조각에 섞여도 순서대로 표 둘 + 문단", () => {
  const md = "앞 글\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n<table><tr><th>머리</th><td>값<br>둘째 줄</td></tr></table>\n\n뒤 글 <img src=\"x.png\">";
  const b = parseChunkBlocks(md);
  assert.deepEqual(b.map((x) => x.kind), ["para", "table", "table", "para"]);
  const html = b[2];
  assert.ok(html.kind === "table" && html.rows[0][1].text === "값\n둘째 줄");
  assert.ok(b[3].kind === "para" && b[3].text === "뒤 글");
});

test("실제 조각(신수행 강의 「가. 비계량보고서 작성이 왜 중요한가?」 모양): 글자 | 가 표 밖에 남지 않음", () => {
  const md = "## 가. 비계량보고서 작성이 왜 중요한가?\n\nA 성과의 내용과\n\n|  |  |  | ☞ 핵심질문 : “ 어떻게? ” |  |  |\n| --- | --- | --- | --- | --- | --- |\n| 1 | \\` \\` | 2 | 5 | 3 | 4 |\n|  | 4단 구조(계획→ | 시각정보로 | 문단 앞쪽에 | 흥미감성형 | 개선성과를 |\n\n<table>\n<tr><th>비계량지표 작성 핵심 포인트</th><th rowspan=\"3\">구조</th></tr>\n</table>\n\n3.\n\n## 나";
  const b = parseChunkBlocks(md);
  for (const x of b) if (x.kind !== "table") assert.doesNotMatch(x.kind === "heading" ? x.text : x.text, /\|\s*---|^\s*\|/m);
  assert.equal(b.filter((x) => x.kind === "table").length, 2);
});

test("snippetText: 제목 기호(#)·마크다운 표 구분 줄·빈 칸 파이프·그림 참조를 걷고 한 줄로", () => {
  const md = "## 가. 비계량보고서 작성이 왜 중요한가?\n\n![image](image_001.png)\n\n|  |  |  | ☞ 핵심질문 |  |\n| --- | --- | --- | --- | --- |\n| 1 | 2 |\n\n### 다. 소제목";
  assert.equal(snippetText(md, 200), "가. 비계량보고서 작성이 왜 중요한가? | ☞ 핵심질문 | 1 | 2 | 다. 소제목");
});
