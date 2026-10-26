// 문서별 파서를 작은 합성 입력으로 확인합니다(원본 파일 없이 돌아감).

import assert from "node:assert/strict";
import { test } from "node:test";
import type { SourceBlock } from "../source.ts";
import { toLineItems } from "../source.ts";
import { parseAtt3, splitBlocks } from "./att3.ts";
import { parseMidreportBiz } from "./midreport-biz.ts";
import { isFindingMarker, parseBizChecklist, parseBizEvaluatorComments, parseBizTaskList } from "./plan.ts";

const block = (text: string, page = 1, id = "c"): SourceBlock => ({ id, type: "text", text, page, breadcrumb: [] });
const sectionTitle = (t: string) => `<table>\n<tr><th><table>\n<tr><th rowspan="2">${t}</th></tr>\n<tr></tr>\n</table></th></tr>\n</table>`;

test("붙임5: 절 제목 → 사업, 행 → 지적, 계량 태그와 부서, 중복 표시", () => {
  const r = parseMidreportBiz([
    block(sectionTitle("3. ICT산업 활성화 지원"), 5),
    block("| No | 지적사항 | 책임부서 | 협업부서 |\n| --- | --- | --- | --- |\n| 1 | 서면 자문만으로 운영 | ICT기금<br>관리본부 |  |\n| 2 | 서면 자문만으로 운영 | ICT기금관리본부 |  |", 5),
    block(sectionTitle("4. 계량지표 구성의 적합성 및 목표의 도전성"), 7),
    block("| No | 지적사항 | 책임부서 | 협업부서 |\n| --- | --- | --- | --- |\n| 1<br>(기금 지표) | 가중치 재검토 | 기금운용팀 | 성과<br>관리팀 |", 7),
  ]);
  assert.equal(r.chunks.length, 3);
  const [a, b, c] = r.chunks;
  assert.equal(a.chunk_key, "mid25-biz/BZ-3/01");
  assert.deepEqual(a.dept_resp, ["ICT기금관리본부"]);
  assert.equal(b.meta.duplicate_of, "mid25-biz/BZ-3/01");
  assert.equal(c.business, "BZ-4");
  assert.equal(c.meta.metric_2025, "ICT기금 재정 효율화 성과");
  assert.equal(c.meta.related_business, "BZ-3");
  assert.deepEqual(c.dept_coop, ["성과관리팀"]);
  assert.ok(c.context_prefix.includes("방송통신미디어") === false); // BZ-4 머리말은 공통지표
});

test("지적 번호와 문장 속 열거를 가른다", () => {
  assert.equal(isFindingMarker("다만, 기준"), true);
  assert.equal(isFindingMarker(" 다만, 현행"), true);
  assert.equal(isFindingMarker(" 기관이 법정"), true);
  assert.equal(isFindingMarker(" 공공성, ②"), false);
});

test("붙임1: 평가내용 머리, 이어지는 문단, 지적 번호 순서, 등급", () => {
  const items = toLineItems([
    block("| 붙임1 |  | ’25년도 경영실적 평가보고서 지적사항 |\n| --- | --- | --- |", 101),
    block("2 주요사업\n(4) 전파이용 기회 확대 사업 성과관리의 적정성\n- ① 주요사업별 추진계획은 구체적이고 적정하게 수립되었는가?\n- - 기관은 ① 공공성, ② 효율성을 기준으로 삼았다. ①다만, 기준이 모호하다.\n- ② 주요사업별 추진계획이 적절하게 집행되었는가?\n- - 실행 노력은 인정된다.", 114),
    block("②다만, 협업이 부족하다.\n- - 이상의 결과를 종합하여 볼 때, 전파 이용기회 확대 사업 성과관리의 적정성에 대한 기관의 노력을 “C”로 평가한다.\n3 공공기관 혁신 노력과 성과 가점", 115),
  ]);
  const r = parseBizEvaluatorComments(items);
  assert.equal(r.chunks.length, 2);
  const [p1, p2] = r.chunks;
  assert.equal(p1.eval_item, "계획");
  assert.deepEqual(p1.meta.finding_nos, [1]); // 문장 속 열거 ①②는 번호 순서가 맞지 않아 첫 ①만 지적
  assert.equal(p1.blocks.length, 2);
  assert.equal(p2.eval_item, "집행");
  assert.equal(p2.text, "실행 노력은 인정된다. ②다만, 협업이 부족하다.".replace(" ②", "\n\n②"));
  assert.deepEqual(p2.meta.finding_nos, [2]);
  assert.equal(p2.meta.grade_2025, "C");
  assert.equal(p2.pdf_page_end, 115);
});

test("체크리스트: 세부평가내용 → 구분 묶음, 추진일정 행에서 멈춤", () => {
  const items = toLineItems([
    block("| 대분류 | 주요사업 |  | 담당부서 | 사업부서, 성과관리팀 |\n| --- | --- | --- | --- | --- |", 97),
    block("- ◇ 세부평가내용❹ 사업 환류 활동은 적절하게 수행되었는가?", 97),
    block(`<table>
<tr><th colspan="2">구분</th><th>지표 담당자 점검사항</th><th>점검결과</th><th>반영과제</th></tr>
<tr><td colspan="2" rowspan="2">환류</td><td>우수과제는 확산하였다.</td><td>예<br>아니오</td><td></td></tr>
<tr><td>개선조치가 이행되었다.</td><td>예<br>아니오</td><td></td></tr>
<tr><td>3</td><td colspan="4">’26년도 경영평가 추진일정</td></tr>
</table>`, 97),
  ]);
  const r = parseBizChecklist(items);
  assert.equal(r.chunks.length, 1);
  assert.equal(r.chunks[0].eval_item, "환류");
  assert.deepEqual(r.chunks[0].blocks, ["우수과제는 확산하였다.", "개선조치가 이행되었다."]);
  assert.deepEqual(r.chunks[0].dept_resp, ["사업부서", "성과관리팀"]);
});

test("붙임3: 병합 칸을 이어받아 과제 행을 읽고 표지 라벨을 뗀다", () => {
  const items = toLineItems([
    block("| 붙임3 |  | ’26년도 과제관리카드 |\n| --- | --- | --- |", 153),
    block(`<table>\n<tr><th rowspan="2">(주요사업1) 전파이용 기회 확대 (2개)</th></tr>\n<tr></tr>\n</table>`, 155),
    block(`<table>
<tr><th>대상사업</th><th>실행과제</th><th colspan="2">‘26년도 추진과제</th><th>담당부서</th></tr>
<tr><td rowspan="2">전파품질<br>향상<br>(2개)</td><td rowspan="2">1. AI 검사 체계</td><td colspan="2">1-가. 안테나 자동판독<br>【지역과제 3개】【AX 연계과제】</td><td>전파기반본부</td></tr>
<tr><td colspan="2">1-나. 통합플랫폼 고도화 【신규과제★】</td><td>전파기반본부</td></tr>
</table>`, 155),
    block("| 참고1 |  | 양식 |\n| --- | --- | --- |", 158),
  ]);
  const r = parseBizTaskList(items);
  assert.equal(r.chunks.length, 2);
  const tasks = r.extras!.tasks as Array<Record<string, unknown>>;
  assert.equal(tasks[1].task_no, "1-나");
  assert.equal(tasks[1].exec_task, "AI 검사 체계");
  assert.equal(tasks[1].target_business, "전파품질 향상");
  assert.deepEqual(tasks[0].labels, ["지역과제 3개", "AX 연계과제"]);
  assert.equal(tasks[0].title, "안테나 자동판독");
  assert.equal(r.chunks[0].searchable, false);
  assert.deepEqual(r.checks[0].actual, { 주요사업1: 2 });
});

test("첨부3: 앞 표에 붙은 질문 머리(P2)로 표를 나누고 목차와 맞춘다", () => {
  const head = (no: number, q: string) =>
    `<tr><th>전파이용 기회 확대 사업</th><th>질문 답변자료</th><th>보고서 P.129</th></tr>\n<tr><td colspan="3">${no}. ${q}</td></tr>`;
  const r = parseAtt3([
    block("# 전파이용\n# 기회 확대", 141),
    block("|  | 전파이용 기회 확대 사업 |\n| --- | --- |", 141),
    block("| Ⅰ | 질문 답변자료 |\n| --- | --- |", 142),
    block("1. [경평지적사항] 테스트베드 확대 ····· 123\n2. (p.129) 6G 대역 채택 노력을", 142),
    block("설명해 주시기 바랍니다. ·· 175", 142),
    block("Ⅰ. 질문 답변자료", 148),
    block(`<table>\n${head(1, "테스트베드를 확대한 결과를 설명해 주시기 바랍니다.")}\n</table>`, 148),
    block("☑ 수도권 접근성 제고를 위해 1곳에서", 148),
    block("3곳으로 확대하였습니다.", 148),
    block(`<table>\n<tr><td>구분</td><td>2025</td></tr>\n<tr><td>테스트베드</td><td>3곳</td></tr>\n${head(2, "(p.129) 6G 대역 채택 노력을 설명해 주시기 바랍니다.")}\n</table>`, 149),
    block("☑ WRC-23에서 신규 의제를 채택했습니다.", 200),
    block("| 증빙 2-1 | 6G 추진 실적 | 보고서 P.129 |\n| --- | --- | --- |", 201),
  ]);
  const qa = r.chunks.filter((c) => c.unit_type === "qa_pair");
  assert.equal(qa.length, 2);
  assert.equal(qa[0].chunk_key, "att3-2604/s4/Q01");
  assert.deepEqual(qa[0].q_type, ["경평지적사항"]); // 본문에 태그가 없어도 목차에서 가져옴
  assert.equal(qa[0].printed_page, 123);
  assert.ok(qa[0].blocks[1].startsWith("☑ 수도권 접근성 제고를 위해 1곳에서 3곳으로"));
  assert.ok(qa[0].blocks.some((b) => b.includes("테스트베드") && b.startsWith("<table>")), "앞 표의 나머지 행은 1번 답변에 남음");
  assert.equal(qa[1].eval_item, "집행");
  assert.equal(qa[1].printed_page, 175);
  assert.deepEqual(qa[1].q_type, ["보고서쪽질문"]);
  const ev = r.chunks.find((c) => c.unit_type === "evidence_image")!;
  assert.equal(ev.meta.parent_key, "att3-2604/s4/Q02");
  assert.equal(ev.meta.has_text, false);
});

test("긴 답변은 □ 경계에서 먼저 나눈다", () => {
  const b = (text: string) => ({ text, table: false, size: text.length });
  const blocks = [b("☑ " + "가".repeat(1200)), b("□ " + "나".repeat(1200)), b("ㅇ " + "다".repeat(600)), b("□ " + "라".repeat(900))];
  const parts = splitBlocks(blocks, 2500);
  assert.equal(parts.length, 3);
  assert.ok(parts[1][0].text.startsWith("□") && parts[2][0].text.startsWith("□"));
  assert.equal(parts[1].length, 2, "□ 아래 ㅇ는 같은 조각");
});
