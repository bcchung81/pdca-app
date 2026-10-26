import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import type { LineItem } from "../source.ts";
import { loadKordocChunks, toLineItems } from "../source.ts";
import { MGMT_CHECKLIST_EXPECTED, parseMgmtChecklist } from "./plan-mg-checklist.ts";
import { parseBizChecklist } from "./plan.ts";

const L = (text: string, page = 5): LineItem => ({ kind: "line", text, page });
const T = (text: string, page = 5): LineItem => ({ kind: "table", text, page });

const head = (major: string, sub: string, dept: string, issues: number) =>
  T(`<table>\n<tr><th>대분류</th><th>${major}</th><th rowspan="2"></th><th>페이지</th><th>5p</th><th>지적사항</th><th>${issues}개</th></tr>\n<tr><td>소분류</td><td>${sub}</td><td>담당부서</td><td colspan="3">${dept}</td></tr>\n</table>`);
const issues = (rows: string[]) => T(`| No | 지적사항 | 점검결과 | 반영과제 |\n| --- | --- | --- | --- |\n${rows.join("\n")}`);
const chk = (rows: string) => T(`<table>\n<tr><th>구분</th><th>지표 담당자 점검사항</th><th>점검결과</th><th>반영과제</th></tr>\n${rows}\n</table>`);
const row = (label: string, text: string, span = 1) => `<tr><td${span > 1 ? ` rowspan="${span}"` : ""}>${label}</td><td>${text}</td><td>예<br>아니오</td><td></td></tr>`;
const more = (text: string) => `<tr><td>${text}</td><td>예<br>아니오</td><td></td></tr>`;

const SYNTH: LineItem[] = [
  L("# 앞쪽 글"),
  head("□4 조직 운영 및 관리", "(1-2) 일･가정 양립(0.5점)", "인사총무팀", 3),
  L("1. ’25년도 경영평가단 지적사항 조치계획 자가진단"),
  issues(["| 1<br>2 | 첫째 지적<br>둘째 지적 | 예<br>아니오<br>예<br>아니오 |  |", "| 3 | 셋째 지적 | 예<br>아니오 |  |"]),
  L("2. ’26년도 경영평가보고서 고도화 착안사항 자가진단"),
  L("- ◇ 세부평가내용❶"),
  L("육아휴직 활용 등 일‧가정 양립을 위한"),
  L("다양한 노력과 성과"),
  chk(`${row("1. 지원제도<br>활용도", "활용도 점검 하나", 2)}\n${more("활용도 점검 둘")}\n${row("2. 조직문화", "문화 점검")}`),
  // ◇ 표지가 빠진 ❷
  L("두 번째 설명 줄"),
  T("| 구분 | 지표 담당자 점검사항 | 점검결과 | 반영과제 |\n| --- | --- | --- | --- |\n| 1. 파이프 구분 | 파이프 점검 | 예<br>아니오 |  |"),
  head("혁신가점", "(2) AI 활용 혁신(1.5점)", "AI디지털심화팀", 1),
  L("1. ’25년도 경영평가단 지적사항 조치계획 자가진단"),
  issues(["| 1 | AI 지적 | 예<br>아니오 |  |"]),
  L("- ◇ 세부평가내용❶ 한 줄 설명"),
  chk(row("1. AI 전환", "AI 점검")),
  // 여기부터는 주요사업 공통 자가진단 — 읽지 않음
  T("| 대분류 | 주요사업 |  | 담당부서 | 사업부서, 성과관리팀 |\n| --- | --- | --- | --- | --- |"),
  L("- ◇ 세부평가내용❶ 사업 추진계획은 구체적이고 적정하게 수립 되었는가?"),
  chk(row("1. 주요사업 구분", "주요사업 점검")),
];

test("경영관리 체크리스트: 경계(주요사업 머리표 앞까지), 지표 단위·트랙·키·메타", () => {
  const r = parseMgmtChecklist(SYNTH);
  assert.deepEqual(
    r.chunks.map((c) => c.chunk_key),
    [
      "plan-2607/checklist/MG-9/s1-2/issues",
      "plan-2607/checklist/MG-9/s1-2/sd1/g1",
      "plan-2607/checklist/MG-9/s1-2/sd1/g2",
      "plan-2607/checklist/MG-9/s1-2/sd2/g1",
      "plan-2607/checklist/MG-13/s2/issues",
      "plan-2607/checklist/MG-13/s2/sd1/g1",
    ],
  );
  for (const c of r.chunks) {
    assert.equal(c.doc_id, "plan-2607");
    assert.equal(c.unit_type, "checklist_group");
    assert.equal(c.track, "경영관리");
    assert.equal(c.meta.related_business, undefined);
  }
  assert.equal(r.chunks[0].business, "MG-9");
  assert.equal(r.chunks[4].business, "MG-13"); // 혁신가점도 경영관리 트랙
  assert.equal(r.chunks[4].meta.bonus, true);
  assert.deepEqual(r.chunks[0].dept_resp, ["인사총무팀"]);
});

test("경영관리 체크리스트: 인용 단위(점검사항 한 줄, 지적 한 행·합쳐진 번호), 구분 묶음, 표지 누락 추정, 파이프 표", () => {
  const r = parseMgmtChecklist(SYNTH);
  const [iss, g1, g2, sd2, aiIss, aiG] = r.chunks;
  assert.deepEqual(iss.blocks, ["1·2. 첫째 지적 둘째 지적", "3. 셋째 지적"]);
  assert.equal(iss.meta.issue_count, 3);
  assert.deepEqual(iss.meta.merged_rows, [[1, 2]]);
  assert.deepEqual(g1.blocks, ["활용도 점검 하나", "활용도 점검 둘"]); // rowspan 구분은 한 묶음
  assert.deepEqual(g2.blocks, ["문화 점검"]);
  assert.match(g1.title, /세부평가내용❶ 1\. 지원제도 활용도/);
  assert.match(g1.context_prefix, /육아휴직 활용 등 일.가정 양립을 위한 다양한 노력과 성과/); // 두 줄 설명을 이음
  assert.equal(g1.meta.sd_marker_inferred, false);
  assert.equal(sd2.meta.sd_no, 2); // ◇ 표지 없이 나온 설명 → 앞 번호 + 1
  assert.equal(sd2.meta.sd_marker_inferred, true);
  assert.deepEqual(sd2.blocks, ["파이프 점검"]);
  assert.equal(aiG.meta.sd_desc, "한 줄 설명");
  assert.equal(aiIss.meta.issue_count, 1);
  // 인용 대조용 글이 있음
  assert.match(g1.search_text, /활용도 점검 하나/);
});

test("경영관리 체크리스트: 내부 검산 — 합성 자료는 기대값과 달라 건수 검산은 실패, 구조 검산은 통과", () => {
  const r = parseMgmtChecklist(SYNTH);
  const by = (part: string) => r.checks.find((c) => c.name.includes(part))!;
  assert.equal(by("자가진단 블록 수").ok, false);
  assert.equal(by("블록별 머리표 = 표 번호 수").ok, true);
  assert.equal(by("❶부터 연속").ok, true);
  assert.equal(by("지표 단위가 풀림").ok, true);
  assert.equal(by("조각 수").ok, true);
});

test("경영관리 체크리스트: 모르는 지표 이름·머리표 없음·번호 어긋남은 던짐", () => {
  assert.throws(() => parseMgmtChecklist([L("앞쪽")]), /머리표/);
  assert.throws(() => parseMgmtChecklist([head("□1 경영전략", "(9) 듣도보도못한지표(1점)", "팀", 0)]), /사전/);
  // 혁신가점 대분류인데 지표 1~11
  assert.throws(() => parseMgmtChecklist([head("혁신가점", "(2) 윤리경영(1.5점)", "팀", 0)]), /어긋/);
  // 점검표 없는 세부평가내용
  assert.throws(() => parseMgmtChecklist([head("□1 경영전략", "(1) 전략기획(2점)", "팀", 0), L("- ◇ 세부평가내용❶"), L("설명")]), /점검표가 없/);
});

const PARSED = "resources/knowledge/_parsed/plan-2607.chunks.json";

test("경영관리 체크리스트: 실제 관리계획 7월판 — 검산 전부 통과, 주요사업 키와 안 겹침, 두 번 돌려도 같음", { skip: !existsSync(PARSED) && "kordoc 산출물(plan-2607.chunks.json — git 밖)이 없음" }, () => {
  const items = toLineItems(loadKordocChunks(JSON.parse(readFileSync(PARSED, "utf8"))));
  const r = parseMgmtChecklist(items);
  const failed = r.checks.filter((c) => !c.ok);
  assert.deepEqual(failed, []);
  assert.equal(r.chunks.length, MGMT_CHECKLIST_EXPECTED.blocks + MGMT_CHECKLIST_EXPECTED.groups);

  const biz = parseBizChecklist(items);
  const bizKeys = new Set(biz.chunks.map((c) => c.chunk_key));
  assert.ok(r.chunks.every((c) => !bizKeys.has(c.chunk_key)));
  assert.equal(new Set(r.chunks.map((c) => c.chunk_key)).size, r.chunks.length);

  const again = parseMgmtChecklist(items);
  assert.deepEqual(again, r);
});
