import assert from "node:assert/strict";
import { test } from "node:test";
import { plainShapes, sourceLabel } from "./outline-text.ts";

test("sourceLabel: 카드 칸 경로·0부터 센 줄 번호를 읽는 자리 이름으로, 첨부·전년 절·평가 근거 이름은 그대로", () => {
  const cases: Array<[string, string]> = [
    ["카드 do.lines.3", "카드 · [Do] 4번째 줄"],
    ["카드 do.lines.1~2", "카드 · [Do] 2~3번째 줄"],
    ["카드 계량지표 kpi.rows.0.prev", "카드 · 계량 성과지표 · 1행 ’25년 실적"],
    ["계량 성과지표 kpi.rows.0", "카드 · 계량 성과지표 · 1행"],
    ["카드 outcome.quantitative.1", "카드 · 추진성과 · 정량 성과 · 2번째 줄"],
    ["카드 overview.cells.5", "카드 · 과제 개요 · 6번째 칸"],
    ["카드 월별 실적 1월~8월 / do.lines.0", "카드 · 월별 실적 1월~8월 / [Do] 1번째 줄"],
    ["[Act] ’25년 추진 결과 자체평가 0", "카드 · [Act] ’25년 추진 결과 자체평가 · 1번째 줄"],
    ["[Do] 월별 실적 1월~8월 1", "카드 · [Do] 월별 실적 1월~8월 · 2번째 줄"],
    ["추진성과 — 정량 1", "카드 · 추진성과 · 정량 · 2번째 줄"],
    ["[Check] 성과점검 0･1", "카드 · [Check] 성과점검 · 1·2번째 줄"],
    ["과제 개요 4･5", "카드 · 과제 개요 · 5·6번째 칸"],
    ["카드 [Plan] 조치 및 개선방향", "카드 · [Plan] 조치 및 개선방향"],
    ["카드 월별 실적(1월~9월)", "카드 · 월별 실적(1월~9월)"],
    ["첨부3 의견조사 결과", "첨부3 의견조사 결과"],
    ["’25 실사 질의응답 Q8", "’25 실사 질의응답 Q8"],
    ["전년 1 추진배경", "전년 1 추진배경"],
    ["관리계획 Ⅰ 2. ’25년도 KCA 경영평가 결과 총평", "관리계획 Ⅰ 2. ’25년도 KCA 경영평가 결과 총평"],
    ["첨부1 주요 개발 포인트 / 카드 do.lines.3", "첨부1 주요 개발 포인트 / 카드 · [Do] 4번째 줄"],
    ["", ""],
  ];
  for (const [src, want] of cases) assert.equal(sourceLabel(src), want, src);
});

test("plainShapes: 영문 도식 코드를 쉬운 이름으로(괄호 코드는 빼고, 조사는 받침에 맞춤)", () => {
  assert.equal(
    plainShapes("원문이 없어 voices는 빼고 추진실적 cards는 협업 구조(hub)와 핵심 수치 띠(stats)로 바꾸고, 막대(chart)도 뺐습니다."),
    "원문이 없어 현장 목소리는 빼고 추진실적 칸 도식은 협업 구조와 핵심 수치 띠로 바꾸고, 막대도 뺐습니다.",
  );
  assert.equal(plainShapes("steps로 잇고 timeline을 앞에"), "단계 흐름으로 잇고 연도 흐름을 앞에");
  assert.equal(plainShapes("stats이다"), "핵심 수치 띠이다", "뒤가 한글이면 조사로 보지 않음");
  assert.equal(plainShapes("AI 어드바이저 bulletsX"), "AI 어드바이저 bulletsX", "낱말 일부는 그대로");
});
