import assert from "node:assert/strict";
import { test } from "node:test";
import type { SourceBlock } from "../source.ts";
import { parseReport25 } from "./report25.ts";

const b = (text: string, page: number, i: number): SourceBlock => ({ id: `c${i}`, type: text.startsWith("|") || text.startsWith("<table") ? "table" : text.startsWith("#") ? "heading" : "text", text, page, breadcrumb: [] });
const flow = (...items: Array<[string, number]>) => items.map(([t, p], i) => b(t, p, i));

test("2025 보고서 평가내용2: 실행과제(### N-M + 앞 글상자 / ## N-M 제목) 아래 가.·나.만 조각, 마커·쪽 머리·꼬리 걷음, 정형 절(3 | …)에서 끝남", () => {
  const r = parseReport25(
    flow(
      ["| 평가내용 1 |  | ‘전파이용 기회 확대’ 사업 … |\n| --- | --- | --- |", 9],
      ["### 가. 평가내용1 소항목(빼야 함)", 9],
      ["| 평가내용 2 |  | ‘전파이용 기회 확대’ 사업 추진계획이 적절하게 집행되었는가? |\n| --- | --- | --- |", 14],
      ["| 대상사업1 |  | 전파품질 향상 |\n| --- | --- | --- |", 14],
      ["AI･디지털 스마트 전파 검사 체계로 현장 안전･효율 혁신 <u>BP</u>", 14],
      ["### 1-1", 14],
      ["### 가. “철탑 오름 없이 안전하게” AI 이미지 분석 기술로 현장 위험 원천 차단 신규 AI", 14],
      ['<table>\n<tr><th>추진배경</th><td>∙ 안테나 검사를 위한 사다리･철탑 작업은 추락 위험 상시 노출<br>∙ 2차 피해 발생 위험 존재</td></tr>\n<tr><td>’24년 기술 연구</td><td>’25년 개발 및 시범 운영</td><td>’26년 확대 운영</td></tr>\n</table>', 14],
      ["주\n요\n사\n업\nⅠ", 14],
      ["| 119 | ∙ 2025년도 경영실적보고서 |\n| --- | --- |", 14],
      ["|  | 전파이용 기회 확대 사업 |\n| --- | --- |", 15],
      ["추진성과 안전사고 Zero, 3만회 고소 현장위험 원천 해소, 연 1만 시간 절감(3만국 × 20분)", 15],
      ["| ∙ | 120 |\n| --- | --- |", 15],
      ["## 1-2 이동통신 취약지역 해소를 통한 국민 통신품질 개선", 16],
      ["### 가. [고속철도] 시속 300km에도 더 이상 지연 없는 영상 이용 환경 완성 신규", 16],
      ["∙ 고속철도 통신 미흡구간 3곳 집중 개선으로 통신품질 11.7% 향상, 5G 기지국 재배치와 핸드오버 최적화 협업", 16],
      ["|  | 3 |  | 사업 추진활동의 생산성･공공성 등 제고를 위한 노력 |\n| --- | --- | --- | --- |", 29],
      ["### 가. 업무 생산성 향상 노력(정형 — 빼야 함)", 29],
    ),
  );
  assert.deepEqual(
    r.chunks.map((c) => c.chunk_key),
    ["rpt25-biz/BZ-1/1-1/가", "rpt25-biz/BZ-1/1-2/가"],
  );
  const [a, g] = r.chunks;
  assert.equal(a.title, "2025 보고서 1-1 가. “철탑 오름 없이 안전하게” AI 이미지 분석 기술로 현장 위험 원천 차단");
  assert.deepEqual((a.meta as { markers: string[] }).markers, ["신규", "AI"]);
  assert.equal((a.meta as { task_title: string }).task_title, "AI･디지털 스마트 전파 검사 체계로 현장 안전･효율 혁신", "앞 글상자 제목(BP 표시는 걷음)");
  assert.equal(a.report_page_2025, 119);
  assert.match(a.context_prefix, /전파이용 기회 확대 · 대상사업1 전파품질 향상 · 1-1 .* \(p\.119~120\)$/);
  assert.ok(a.text.includes("’24년 기술 연구 | ’25년 개발 및 시범 운영 | ’26년 확대 운영"), a.text);
  assert.ok(a.text.includes("연 1만 시간 절감"), "쪽을 넘겨 이어진 글");
  assert.ok(!/경영실적보고서|^주$|전파이용 기회 확대 사업/m.test(a.text), "쪽 머리·꼬리·옆 탭 없음");
  assert.equal((g.meta as { task_title: string }).task_title, "이동통신 취약지역 해소를 통한 국민 통신품질 개선", "## N-M 제목");
  assert.ok(r.checks.some((c) => c.name.includes("소항목 수") && !c.ok), "합성 흐름은 실제 기대값(62)과 다름");
});
