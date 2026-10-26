// 붙임2 파서 시험 — 표 모양만 본뜬 시험용 가상 자료입니다(실제 기관 평가 내용 아님).
import assert from "node:assert/strict";
import { test } from "node:test";
import { findHeader, gridsFromMarkdown, normalizeGrade, peerCasesFromGrid, peerCasesFromMarkdown, peerChunks, peerLabel, peerSummary } from "./peer.ts";

const HEAD = ["구분", "기관명", "주요사업", "등급", "잘한 점(성과)", "아쉬운 점(지적사항)"];
const grid = [
  ["2025년도 유관기관 평가보고서 정리", "", "", "", "", ""],
  HEAD,
  ["기관", "가상기관A", "시험 서비스 사업", "B+", "국민 의견을 제도 개선까지 반영", "성과지표 대표성 보완 필요"],
  ["", "", "시험 지원 사업", "B 0", "협업 성과를 건수와 효과로 입증", ""],
  ["기관", "가상연구재단", "시험 연구 사업", "-", "사후관리 체계 마련", "확산 계획 부족"],
  ["기관", "한국방송통신전파진흥원", "전파이용 기회 확대 사업", "C", "", "내부 효율에 치중"],
  ["", "", "", "", "", ""],
  ["공통", "가상기관B", "", "", "환류 체계 공통 우수", ""],
];

test("머리 행 찾기·등급 맞춤", () => {
  assert.deepEqual(findHeader(grid)?.row, 1);
  assert.equal(normalizeGrade("B 0"), "B0");
  assert.equal(normalizeGrade("Bo"), "B0");
  assert.equal(normalizeGrade("b+"), "B+");
  assert.equal(normalizeGrade("B＋"), "B+");
  assert.equal(normalizeGrade("-"), "");
  assert.equal(normalizeGrade("C"), "C");
});

test("머리 행: 표 위 병합 설명 줄(머리 낱말이 다 들어 있음)은 건너뛰고 진짜 머리 행으로(실제 붙임2 모양)", () => {
  const title = "주요사업 범주(비계량) — 기관별 · 사업별 정리";
  const sub = "각 기관 주요사업 단위 잘한 점/아쉬운 점 + 사업별 등급 (계량 실적 제외)";
  const g = [
    Array(6).fill(title),
    Array(6).fill(sub),
    ["구분", "기관명", "주요사업", "등급", "잘한 점 (성과)", "아쉬운 점 (지적사항)"],
    ["기관", "가나공사", "수출지원", "C", "· 잘한 일", "· 아쉬운 일"],
  ];
  assert.deepEqual(findHeader(g), { row: 2, cols: { kind: 0, org: 1, business: 2, grade: 3, good: 4, bad: 5 } });
  const { cases } = peerCasesFromGrid(g);
  assert.deepEqual(cases.map((c) => [c.org, c.business, c.grade, c.good, c.bad]), [["가나공사", "수출지원", "C", "· 잘한 일", "· 아쉬운 일"]]);
});

test("사례 행: 기관명·구분 이어받기, KCA 행 표시, 빈 행 건너뜀", () => {
  const { cases, problems } = peerCasesFromGrid(grid);
  assert.deepEqual(problems, []);
  assert.deepEqual(
    cases.map((c) => [c.org, c.business, c.grade, c.kind, c.kca]),
    [
      ["가상기관A", "시험 서비스 사업", "B+", "기관", false],
      ["가상기관A", "시험 지원 사업", "B0", "기관", false],
      ["가상연구재단", "시험 연구 사업", "", "기관", false],
      ["한국방송통신전파진흥원", "전파이용 기회 확대 사업", "C", "기관", true],
      ["가상기관B", "", "", "공통", false],
    ],
  );
  assert.deepEqual(peerSummary(cases), { rows: 5, orgs: 4, candidates: 4, kca: 1, grades: { "B+": 1, B0: 1, "등급 없음": 2, C: 1 } });
  assert.equal(peerLabel(cases[1]), "가상기관A — 시험 지원 사업(B0)");
  assert.equal(peerLabel(cases[2]), "가상연구재단 — 시험 연구 사업");
});

test("마크다운 표(HTML 병합·파이프, 여러 쪽에 나뉜 표) → 사례 → 조각", () => {
  const html = `<table><tr><th>구분</th><th>기관명</th><th>주요사업</th><th>등급</th><th>잘한 점(성과)</th><th>아쉬운 점(지적사항)</th></tr>
<tr><td rowspan="2">기관</td><td rowspan="2">가상기관A</td><td>시험 서비스 사업</td><td>B+</td><td>국민 의견 반영</td><td>대표성 보완</td></tr>
<tr><td>시험 지원 사업</td><td>B0</td><td>협업 성과 입증</td><td></td></tr></table>`;
  const pipe = ["| 기관 | 가상기관C | 시험 기금 사업 | C | 기금 운용 개선 | 목표 도전성 부족 |", "| --- | --- | --- | --- | --- | --- |"].join("\n");
  const md = `# 붙임2\n\n${html}\n\n다음 쪽\n\n${pipe}\n`;
  assert.equal(gridsFromMarkdown(md).length, 2);
  const { cases, problems } = peerCasesFromMarkdown(md);
  assert.deepEqual(problems, []);
  assert.deepEqual(
    cases.map((c) => [c.seq, c.org, c.business, c.grade]),
    [
      [1, "가상기관A", "시험 서비스 사업", "B+"],
      [2, "가상기관A", "시험 지원 사업", "B0"],
      [3, "가상기관C", "시험 기금 사업", "C"],
    ],
  );
  const chunks = peerChunks(cases);
  assert.equal(chunks[0].chunk_key, "peer25-biz/001");
  assert.equal(chunks[0].unit_type, "peer_case");
  assert.equal(chunks[0].title, "붙임2 · 가상기관A — 시험 서비스 사업(B+)");
  assert.match(chunks[0].text, /^잘한 점\(성과\): 국민 의견 반영\n\n아쉬운 점\(지적사항\): 대표성 보완$/);
  assert.deepEqual(chunks[1].meta, { org: "가상기관A", business: "시험 지원 사업", grade: "B0", kind: "기관", kca: false });
  assert.ok(chunks[0].search_text.includes("가상기관a") || chunks[0].search_text.includes("가상기관A"));
  assert.match(peerCasesFromMarkdown("표 없음").problems[0], /찾지 못했습니다/);
});
