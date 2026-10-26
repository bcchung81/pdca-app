import assert from "node:assert/strict";
import { test } from "node:test";
import type { LineItem } from "../source.ts";
import { cleanNarrativeLine, parsePlanNarrative } from "./plan-narrative.ts";

const L = (text: string, page = 5): LineItem => ({ kind: "line", text, page });
const T = (text: string, page = 5): LineItem => ({ kind: "table", text, page });

test("관리계획 서술: 절(번호·참고 머리 표)·□ 소제목·<경영관리>/<주요사업> 묶음, 끊긴 줄 잇기, 경영관리 트랙, 운영방안·Ⅲ 앞에서 멈춤", () => {
  const items: LineItem[] = [
    L("# 2026년도"),
    L("# Ⅰ. ’25년도 경영평가 결과"),
    T("| 1 | ’25년도 KCA 경영평가 결과 요약 |\n| --- | --- |"),
    L("## □ 경영평가 결과"),
    L("## ㅇ 기관 평가 : 보통(77.62점)"),
    L("- - 경영관리(8위), 주요사업(10위)"),
    T("| 2 | ’25년도 KCA 경영평가 결과 총평 |\n| --- | --- |", 6),
    L("<경영관리>", 6),
    L("[전략기획] 국정과제 이행지수를", 6),
    L("신설하였으며 긍정적이다.", 6),
    L("<주요사업>", 6),
    L("기관은 ‘안테나 AI 자동 판독 시스템’을 도입하는 등", 6),
    L("성과가 인정된다.", 6),
    L("![image](image_002.png)", 6),
    T("| 참고1 |  | 지표별 세부 득점 |\n| --- | --- | --- |", 13),
    T("<table>\n<tr><th>구분</th><th>등급</th></tr>\n<tr><td>주요사업1</td><td>C</td></tr>\n</table>", 13),
    L("# Ⅱ. ’26년도 경영평가 변화 및 대응방향", 23),
    T("| 1 | ’26년도 경영평가 지표 변화 |\n| --- | --- |", 23),
    L("## □ 경영관리 지표 변화(공통)", 23),
    L("## ㅇ (재무예산관리) 일반관리비 폐지", 23),
    L("## □ 주요사업 지표 변화(KCA 限)", 24),
    L("## ㅇ (근로자 무사고 달성 노력) 안전 범례 적용", 24),
    L("## ’26년도 경영평가 AI활용 과제관리카드 운영방안", 31),
    L("넣지 않는 줄", 31),
    L("# Ⅲ. ’26년도 경영평가 세부 추진계획", 39),
  ];
  const r = parsePlanNarrative(items);
  assert.deepEqual(
    r.chunks.map((c) => [c.chunk_key, c.track, c.title]),
    [
      ["plan-2607/narr/I/1/s1", "주요사업", "관리계획 Ⅰ 1. '25년도 KCA 경영평가 결과 요약 · 경영평가 결과"],
      ["plan-2607/narr/I/2/s1", "경영관리", "관리계획 Ⅰ 2. '25년도 KCA 경영평가 결과 총평 · <경영관리>"],
      ["plan-2607/narr/I/2/s2", "주요사업", "관리계획 Ⅰ 2. '25년도 KCA 경영평가 결과 총평 · <주요사업>"],
      ["plan-2607/narr/I/ref1/s1", "주요사업", "관리계획 Ⅰ 참고1 지표별 세부 득점"],
      ["plan-2607/narr/II/1/s1", "경영관리", "관리계획 Ⅱ 1. '26년도 경영평가 지표 변화 · 경영관리 지표 변화(공통)"],
      ["plan-2607/narr/II/1/s2", "주요사업", "관리계획 Ⅱ 1. '26년도 경영평가 지표 변화 · 주요사업 지표 변화(KCA 限)"],
    ],
  );
  assert.equal(r.chunks[2].text, "기관은 ‘안테나 AI 자동 판독 시스템’을 도입하는 등 성과가 인정된다.", "끊긴 줄 잇고 그림 줄 뺌");
  assert.equal(r.chunks[3].text, "구분 | 등급\n\n주요사업1 | C", "표는 행마다 한 줄");
  assert.ok(!r.chunks.some((c) => c.text.includes("넣지 않는 줄")));
  assert.equal(r.chunks[0].unit_type, "plan_section");
  assert.match(r.chunks[2].context_prefix, /^2026 경영평가 관리계획\(7월판\) Ⅰ\. ’25년도 경영평가 결과 · Ⅰ 2\./);
  assert.equal(r.checks[0].actual, 4, "절 수(시험 자료)");
  assert.equal(cleanNarrativeLine("- - (주요사업) 국민체감 \\`25년"), "- (주요사업) 국민체감 '25년", "목록 흔적·이스케이프 걷고 연도 부호 맞춤");
});
