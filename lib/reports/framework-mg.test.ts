// 경영관리 프레임워크 읽기(lib/reports/framework-mg.ts)와 만들어 둔 데이터(resources/knowledge/_derived/framework-mg.json — git 밖) 시험.
// 읽기 규칙은 가짜 마크다운으로, 데이터는 12종 요약(평가내용별 대주제 수 — 다시 만들 때 달라지면 알림)과 구판 대조표(frameworks-mg.ts)로 지킵니다.
// 데이터 파일이 없는 곳(새로 받은 저장소·배포)에서는 데이터 시험만 건너뜀 — 만들기: node scripts/knowledge/framework-mg.ts

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { MG_FRAMEWORK_REVISION, isStaleFramework } from "./frameworks-mg.ts";
import { type FrameworkMgEntry, cellText, isLabel, parseFrameworkMg } from "./framework-mg.ts";

const DATA_FILE = resolve(import.meta.dirname, "../../resources/knowledge/_derived/framework-mg.json");
const FRAMEWORK_MG_DATA: FrameworkMgEntry[] = existsSync(DATA_FILE) ? JSON.parse(readFileSync(DATA_FILE, "utf8")) : [];
const NO_DATA = FRAMEWORK_MG_DATA.length ? false : "프레임워크 생성 데이터 없음(git 밖) — node scripts/knowledge/framework-mg.ts로 만듦";

const FIXTURE = `
| | 가중치 | | 평가방법 |
| --- | --- | --- | --- |
| | 1점(기관) | | 9등급 |

시험 지표

<table>
<tr><th>세부 평가내용</th><th></th><th rowspan="2">01</th><th rowspan="2">시험 평가내용 하나를 위한 노력과 성과</th></tr>
<tr><td></td><td></td></tr>
</table>

<table>
<tr><th></th><th></th><td>평가내용 1</td><td>시험 평가내용 하나를 위한 노력과 성과</td></tr>
</table>

1. 시험 대주제 하나

<table>
<tr><td>환경분석</td><td>외부환경</td><td>내부환경</td></tr>
<tr><td>00000</td><td>1</td><td>추진전략</td></tr>
<tr><td>\\~ 체계 (PDCA 구조로 서술)</td></tr>
</table>

2. 시험 대주제 둘

가. 첫 절 제목

| 추진배경 | |
| --- | --- |
| 추진내용 | '24년 |

□ 00000 (소제목)

나.【둘째 절 제목】

<table>
<tr><td>구분</td><td>주요내용</td><td>추진실적</td></tr>
<tr><td>구분</td><td>내용 1</td><td></td></tr>
</table>
As-is
`;

test("parseFrameworkMg: 표지·평가내용·대주제·절·라벨·메모", () => {
  const t = parseFrameworkMg(FIXTURE);
  assert.equal(t.indicator, "시험 지표");
  assert.equal(t.weight, "1점(기관)");
  assert.equal(t.evals.length, 1);
  const e = t.evals[0];
  assert.equal(e.no, 1);
  assert.equal(e.title, "시험 평가내용 하나를 위한 노력과 성과");
  assert.deepEqual(
    e.themes.map((x) => [x.no, x.title, x.sections.length]),
    [
      [1, "시험 대주제 하나", 0],
      [2, "시험 대주제 둘", 2],
    ],
  );
  assert.deepEqual(e.themes[0].labels, ["환경분석", "외부환경", "내부환경", "추진전략"], "자리표시(00000)·숫자는 라벨이 아님");
  assert.deepEqual(e.themes[0].memos, ["~ 체계 (PDCA 구조로 서술)"], "마크다운 이스케이프를 풀고 메모는 라벨에서 뺌");
  const [a, b] = e.themes[1].sections;
  assert.deepEqual([a.mark, a.title, a.labels], ["가", "첫 절 제목", ["추진배경", "추진내용"]]);
  assert.deepEqual([b.mark, b.title], ["나", "둘째 절 제목"]);
  assert.deepEqual(b.labels, ["구분", "주요내용", "추진실적", "As-is"], "「내용 1」 같은 칸 번호는 라벨이 아님, As-is는 표 밖 줄이어도 라벨");
});

test("cellText·isLabel", () => {
  assert.equal(cellText("<b>추진</b>&nbsp;배경<br/>"), "추진 배경");
  assert.equal(cellText("\\~시스템"), "~시스템");
  assert.ok(isLabel("추진성과"));
  assert.ok(!isLabel(""));
  assert.ok(!isLabel("00000"));
  assert.ok(!isLabel("'23년"));
  assert.ok(!isLabel("①"));
  assert.ok(!isLabel("재난관리시스템(예방·대응·복구) 구축·운영 등을 통해 국민의 생명·재산을 보호하기 위한 노력과 성과"), "문장은 라벨이 아님");
});

// 12종 요약: 파일 번호 → 평가내용마다 대주제 수 (2026-10-09 처음 읽은 값)
const SHAPE: Record<string, number[]> = {
  "1-(1)": [2, 4, 6, 3, 3],
  "1-(2)": [5, 1, 3],
  "1-(3)": [2],
  "2-(1)": [2, 3, 1, 3],
  "2-(2)": [4],
  "2-(3)": [4],
  "2-(4)": [1, 1, 1, 1],
  "2-(5)": [3, 1, 1],
  "3-(1)": [4, 3, 1],
  "4-(1)": [4, 1, 3, 2, 1],
  "4-(2)": [2, 2, 1],
  "4-(3)": [3, 1],
};

test("FRAMEWORK_MG_DATA: 12종, 평가단위 짝(국민소통만 없음), 평가내용별 대주제 수", { skip: NO_DATA }, () => {
  assert.equal(FRAMEWORK_MG_DATA.length, 12);
  assert.deepEqual(
    FRAMEWORK_MG_DATA.map((x) => x.file),
    Object.keys(SHAPE),
  );
  const units = FRAMEWORK_MG_DATA.map((x) => x.unit).filter((u) => u !== null);
  assert.equal(new Set(units).size, units.length, "평가단위가 겹치지 않음");
  assert.deepEqual(FRAMEWORK_MG_DATA.filter((x) => x.unit === null).map((x) => x.file), ["1-(3)"]);
  for (const x of FRAMEWORK_MG_DATA) assert.deepEqual(x.template.evals.map((e) => e.themes.length), SHAPE[x.file], x.file);
});

test("FRAMEWORK_MG_DATA: 자리표시·빈 글이 라벨로 남지 않고 모든 평가내용에 제목이 있음", { skip: NO_DATA }, () => {
  for (const x of FRAMEWORK_MG_DATA) {
    assert.ok(x.template.indicator && !x.template.indicator.startsWith("#"), `${x.file} 지표 이름`);
    for (const e of x.template.evals) {
      assert.ok(e.title, `${x.file} 평가내용 ${e.no} 제목`);
      for (const th of e.themes) for (const l of [...th.labels, ...th.sections.flatMap((s) => s.labels)]) assert.ok(isLabel(l), `${x.file} 라벨 「${l}」`);
    }
  }
});

test("FRAMEWORK_MG_DATA: 안전·재난 틀 — 첫 대주제는 체계 틀, 가·나·다 절은 라벨 사다리", { skip: NO_DATA }, () => {
  const t = FRAMEWORK_MG_DATA.find((x) => x.file === "2-(2)")!.template;
  const [first, second] = t.evals[0].themes;
  for (const l of ["환경분석", "시사점", "전략목표", "추진전략", "중점과제", "성과지표"]) assert.ok(first.labels.includes(l), `전략수립 대주제에 「${l}」`);
  assert.ok(first.memos.some((m) => m.includes("PDCA")));
  assert.deepEqual(second.sections.map((s) => s.mark), ["가", "나", "다"]);
  for (const l of ["추진배경", "추진내용", "추진성과"]) assert.ok(second.sections[0].labels.includes(l), `가 절에 「${l}」`);
});

test("구판 대조표: 12종 모두 있고 프레임워크 가중치가 표지에서 읽은 값과 같음", { skip: NO_DATA }, () => {
  for (const x of FRAMEWORK_MG_DATA) {
    const r = MG_FRAMEWORK_REVISION[x.file];
    assert.ok(r, `${x.file} 대조표 행`);
    assert.equal(r.unit, x.unit, `${x.file} 평가단위`);
    assert.equal(parseFloat(x.template.weight), r.frameworkWeight, `${x.file} 표지 가중치 ${x.template.weight}`);
  }
});

test("isStaleFramework: 가중치가 다르거나 평가내용 수가 다르거나 보고서가 없으면 구판, 같으면 아님", () => {
  assert.equal(isStaleFramework("1-(1)"), true);
  assert.equal(isStaleFramework("1-(3)"), true);
  assert.equal(isStaleFramework("2-(2)"), true);
  for (const f of ["1-(2)", "2-(1)", "2-(4)", "3-(1)"]) assert.equal(isStaleFramework(f), false, f);
  assert.equal(isStaleFramework("없는 번호"), true);
});
