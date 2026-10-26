// 관리계획 7월판 경영관리 부분(붙임1 평가위원 의견·붙임2 편람) 읽기 도구 시험.
// 합성 자료로 경계·단위 풀이·지적 번호 규칙을 확인하고, 실제 kordoc 산출물이 있으면 검산 통과·주요사업 쪽과 키가 겹치지 않음·재실행 동일을 확인한다.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { SourceBlock } from "../source.ts";
import { loadKordocChunks, toLineItems } from "../source.ts";
import { parseBizEvaluatorComments, parseBizHandbook } from "./plan.ts";
import { MGMT_EVAL_EXPECTED, MGMT_HANDBOOK_EXPECTED, parseMgmtEvaluatorComments, parseMgmtHandbook, pickQuasiGovPoints } from "./plan-mg-eval.ts";

const block = (text: string, page = 1, id = "c"): SourceBlock => ({ id, type: "text", text, page, breadcrumb: [] });

const EVAL_SAMPLE = [
  block("| 붙임1 |  | ’25년도 경영실적 평가보고서 지적사항 |\n| --- | --- | --- |", 101),
  block(
    [
      "1 경영관리",
      "## 경영전략",
      "(1) 전략기획",
      "- - 세부평가내용 ①과 관련하여 기관은 계획을 세웠다. 다만, ①기관은 ① 공공성, ② 효율성을 보았으나 ②기준이 모호하다.",
      "- - 이상의 결과를 종합하여 볼 때, 전략기획 지표에 대한 기관의 노력과 성과를 “D+”로 평가한다.",
      "(2) 안전",
      "및 재난관리",
      "㉮ 산업재해로부터 안전한 근로·생활환경 유지",
      "- - 기관은 점검을 했다. ①한계가 있다.",
      "- ②응급훈련은 대상 확대가 필요하다.",
      "- - 이상의 결과를 종합하여 볼 때, 산업재해 지표에 대한 기관의 노력과 성과를 “C”로 평가한다.",
      "㉯ 재난으로부터 안전한 근로·생활환경 유지",
      "- - 기관은 훈련을 했다. 다만, ① 훈련 평가가 없다.",
      "- - 이상의 결과를 종합하여 볼 때, 재난 지표에 대한 기관의 노력과 성과를 “C”로 평가한다.",
      "## 재무성과관리",
      "(1) 재무예산관리",
      "㉯ 중장기재무관리계획",
      "- - 제출 대상 기관이 아니므로 결측 처리하였다.",
      "2 주요사업",
      "(4) 전파이용 기회 확대 사업 성과관리의 적정성",
      "- - 주요사업 문단은 읽지 않는다.",
      "3 공공기관 혁신 노력과 성과 가점",
    ].join("\n"),
    102,
  ),
  block(
    ["## 안전한 일터 조성을 위한 노력과 성과", "- - 협력업체 합동점검을 했다. 다만, ① 만족도 조사가 없다.", "- - 이상의 결과를 종합하여 볼 때, 안전한 일터 조성을 위한 노력과 성과 지표에 대한 기관의 노력과 성과를 “D+”로 평가한다."].join("\n"),
    103,
  ),
  block("| 붙임2 |  | ’26년도 경영평가편람(’26.1.29 기준) |\n| --- | --- | --- |", 104),
];

test("붙임1: 경영관리 문단 — 소지표별 번호, 편람 번호 인용·문장 속 열거 제외, 줄 이음, 등급, 주요사업 범위는 읽지 않음", () => {
  const r = parseMgmtEvaluatorComments(toLineItems(EVAL_SAMPLE));
  assert.deepEqual(
    r.chunks.map((c) => c.chunk_key),
    [
      "plan-2607/eval25/MG-1/main/p01",
      "plan-2607/eval25/MG-4/a/p01",
      "plan-2607/eval25/MG-4/a/p02",
      "plan-2607/eval25/MG-4/b/p01",
      "plan-2607/eval25/MG-8/b/p01",
      "plan-2607/eval25/MG-12/main/p01",
    ],
  );
  const [s1, a, a2, b, fin, bonus] = r.chunks;
  assert.deepEqual(s1.meta.finding_nos, [1, 2]); // 「세부평가내용 ①과」·「① 공공성, ② 효율성」은 지적이 아님
  assert.equal(s1.meta.criterion_no, 1);
  assert.equal(s1.meta.grade_2025, "D+");
  assert.equal(s1.business, "MG-1");
  assert.equal(s1.track, "경영관리");
  assert.equal(s1.unit_type, "evaluator_comment");
  // 「(2) 안전」+「및 재난관리」 이음. 단일 「- 」줄은 앞 문단이 「했다.」로 끝났으므로 새 문단
  assert.equal(a.business, "MG-4");
  assert.equal(a.meta.sub_mark, "㉮");
  assert.deepEqual(a.meta.finding_nos, [1]);
  assert.deepEqual(a2.meta.finding_nos, [2]);
  // 소지표(㉯)는 번호를 ①부터 다시 센다
  assert.deepEqual(b.meta.finding_nos, [1]);
  assert.equal(b.meta.grade_2025, "C");
  // 결측 처리 문단: 등급 없음
  assert.equal(fin.business, "MG-8");
  assert.equal(fin.meta.grade_2025, null);
  // 혁신가점은 경영관리 트랙·MG-12
  assert.equal(bonus.business, "MG-12");
  assert.equal(bonus.track, "경영관리");
  assert.equal(bonus.measure, "가점");
  assert.deepEqual(bonus.meta.finding_nos, [1]);
});

test("붙임1: 앞 문단이 문장 끝이 아니면 단일 「- 」줄은 앞 문단에 이어 붙고, 아니면 새 문단", () => {
  const items = toLineItems([
    block("| 붙임1 |  | x |\n| --- | --- | --- |", 1),
    block(["1 경영관리", "## 경영전략", "(1) 전략기획", "- - 훈련 평가가 필요하다. 또한", "- ①대상 확대가 필요하다.", "- ②다만, 별도 검토가 필요하다.", "2 주요사업", "3 공공기관 혁신", "| 붙임2 |  | y |"].join("\n"), 2),
  ]);
  const r = parseMgmtEvaluatorComments(items);
  assert.equal(r.chunks.length, 2); // 첫 둘은 한 문단, 「필요하다.」 뒤 「- ②」는 새 문단
  assert.deepEqual(r.chunks[0].meta.finding_nos, [1]);
  assert.deepEqual(r.chunks[1].meta.finding_nos, [2]);
});

test("붙임1: 모르는 지표 이름은 추측하지 않고 던진다", () => {
  const items = toLineItems([
    block("| 붙임1 |  | x |\n| --- | --- | --- |", 1),
    block(["1 경영관리", "## 경영전략", "(1) 가상의새지표", "- - 문단.", "2 주요사업", "3 공공기관 혁신", "| 붙임2 |  | y |"].join("\n"), 2),
  ]);
  assert.throws(() => parseMgmtEvaluatorComments(items), /가상의새지표/);
});

const HB_TABLE = (rows: string) => `<table>\n<tr><th>평가지표</th><th colspan="2">세부평가내용</th></tr>\n${rows}\n</table>`;
const HB_ROWS = (name: string, measure: string, target: string) =>
  `<tr><td rowspan="3">${name}</td><td>지표정의</td><td>• ${name} 정의</td></tr>\n<tr><td>적용대상(배점)</td><td>• ${target}</td></tr>\n<tr><td>세부평가<br>내용</td><td>① ${measure} 평가내용</td></tr>`;

test("붙임2: 구성요소별 조각, 카드 없는 항목은 business null, 준정부기관 배점 선택, 가점 ①②③ 분리", () => {
  const items = toLineItems([
    block("| 붙임2 |  | ’26년도 경영평가편람 |\n| --- | --- | --- |", 1),
    block(
      [
        "1. 경영관리 범주",
        "## 경영전략",
        "### (1) 전략기획",
        HB_TABLE(HB_ROWS("전략기획", "비계량", "공기업 및 준정부기관 : 비계량 2점")),
        "### (3) 국민소통",
        HB_TABLE(HB_ROWS("국민소통", "계량", "공기업 및 준정부기관 : 계량 0.5점")),
        "## 재무성과관리",
        "### (1) 재무예산관리",
        HB_TABLE(HB_ROWS("재무예산관리", "비계량", "공기업 : 비계량 4점, 위탁집행형 준정부기관 : 비계량 3점, 기금관리형 준정부기관 : 비계량 4점")),
        "### (4) 창업",
        "### 및 경제활성화",
        HB_TABLE(HB_ROWS("창업 및 경제활성화", "비계량", "공기업 및 준정부기관 : 비계량 1.5점")),
        "2. 주요사업 범주",
        "## 주요사업 계량지표 구성의 적합성",
        "3. 공공기관 혁신 노력과 성과 가점",
      ].join("\n"),
      2,
    ),
    block(
      HB_TABLE(
        "<tr><td>공공기관 혁신가점</td><td>지표정의</td><td>• 혁신 정의</td></tr>\n<tr><td>적용대상(배점)</td><td>• 준정부기관 : 5점</td></tr>\n<tr><td>세부평가<br>내용</td><td>① 안전한 일터 조성을 위한 노력과 성과(1.5점)<br>- 협력업체<br>② AI 활용을 통한 혁신<br>등을 위한 노력과 성과(1.5점)<br>③ 국정과제 등 핵심정책 이행을 위한 노력과 성과(2점)</td></tr>",
      ),
      3,
    ),
    block("| 붙임3 |  | x |\n| --- | --- | --- |", 4),
  ]);
  const r = parseMgmtHandbook(items);
  assert.deepEqual(
    r.chunks.map((c) => [c.chunk_key, c.business, c.measure, c.meta.weight_quasi_gov]),
    [
      ["plan-2607/handbook26/MG-1/k1", "MG-1", "비계량", 2],
      ["plan-2607/handbook26/MG/1-3/k1", null, "계량", 0.5],
      ["plan-2607/handbook26/MG-8/k1", "MG-8", "비계량", 3], // 위탁집행형 준정부기관 값(공기업 4점·기금관리형 4점이 아님)
      ["plan-2607/handbook26/MG-6/k1", "MG-6", "비계량", 1.5], // 「(4) 창업」+「### 및 경제활성화」 이음
      ["plan-2607/handbook26/MG-12/k1", "MG-12", "가점", 1.5],
      ["plan-2607/handbook26/MG-13/k1", "MG-13", "가점", 1.5],
      ["plan-2607/handbook26/MG-14/k1", "MG-14", "가점", 2],
    ],
  );
  assert.ok(r.chunks.every((c) => c.track === "경영관리" && c.unit_type === "handbook_indicator" && c.doc_id === "plan-2607"));
  const bonusCheck = r.checks.find((c) => c.name.includes("가점"))!;
  assert.equal(bonusCheck.ok, true); // 1.5 + 1.5 + 2 = 5
});

test("붙임2: 모르는 지표 이름은 던진다", () => {
  const items = toLineItems([
    block("| 붙임2 |  | x |\n| --- | --- | --- |", 1),
    block(["1. 경영관리 범주", "## 경영전략", "### (1) 가상의새지표", HB_TABLE(HB_ROWS("가상", "비계량", "공기업 및 준정부기관 : 비계량 1점")), "2. 주요사업 범주", "3. 공공기관 혁신", HB_TABLE(HB_ROWS("가점", "가점", "x")), "| 붙임3 |  | y |"].join("\n"), 2),
  ]);
  assert.throws(() => parseMgmtHandbook(items), /가상의새지표/);
});

test("준정부기관 배점 고르기", () => {
  assert.deepEqual(pickQuasiGovPoints("• 공기업 및 준정부기관 : 비계량 2점"), { measure: "비계량", points: 2, by: "준정부기관" });
  assert.equal(pickQuasiGovPoints("• 공기업 : 비계량 3점, 준정부기관 비계량 1점 * 공기업은 총 배점 중 1점을, 준정부기관은 총 배점 중 0.3점을 ➂항으로 평가")?.points, 1);
  assert.equal(pickQuasiGovPoints("• 공기업 : 비계량 4점, 위탁집행형 준정부기관 : 비계량 3점, 기금관리형 준정부기관 : 비계량 4점")?.points, 3);
  assert.equal(pickQuasiGovPoints("• 공기업(SOC, 산업진흥·서비스) 및 준정부기관 : 비계량 2점 공기업(상장, 에너지) : 비계량 2.5점")?.points, 2);
  assert.equal(pickQuasiGovPoints("• 공기업 : 계량 5점"), null);
});

const PARSED = path.resolve(import.meta.dirname, "../../../resources/knowledge/_parsed/plan-2607.chunks.json");
const hasReal = existsSync(PARSED);

test("실제 plan-2607: 검산 통과(요약표 대조 경고 제외) · 기대 수 · 주요사업 쪽과 키 겹침 없음 · 재실행 동일", { skip: !hasReal && "plan-2607.chunks.json 없음" }, () => {
  const items = toLineItems(loadKordocChunks(JSON.parse(readFileSync(PARSED, "utf8"))));
  const ev = parseMgmtEvaluatorComments(items);
  const hb = parseMgmtHandbook(items);
  for (const c of [...ev.checks, ...hb.checks]) {
    // 요약표 대조는 원문 자체가 본문과 달라(조직 및 인적자원관리 +1, 보수 및 복리후생 ㉮ 문단 없음) 경고로만 둔다
    if (c.level === "error") assert.ok(c.ok, `${c.name}: ${JSON.stringify({ expected: c.expected, actual: c.actual })}`);
  }
  assert.equal(ev.chunks.length, MGMT_EVAL_EXPECTED.paragraphs);
  assert.equal(hb.chunks.length, MGMT_HANDBOOK_EXPECTED.components + MGMT_HANDBOOK_EXPECTED.bonusComponents);
  // 모든 조각: 문서·트랙·단위 꼬리표, 카드 없는 편람 항목만 business null
  for (const c of ev.chunks) assert.ok(c.track === "경영관리" && /^MG-\d+$/.test(c.business ?? ""));
  assert.equal(hb.chunks.filter((c) => c.business === null).length, MGMT_HANDBOOK_EXPECTED.noUnit);

  const biz = [...parseBizEvaluatorComments(items).chunks, ...parseBizHandbook(items).chunks];
  const keys = new Set(biz.map((c) => c.chunk_key));
  const all = [...ev.chunks, ...hb.chunks];
  assert.equal(new Set(all.map((c) => c.chunk_key)).size, all.length, "경영관리 쪽 키 중복");
  assert.deepEqual(all.filter((c) => keys.has(c.chunk_key)).map((c) => c.chunk_key), [], "주요사업 쪽과 키가 겹침");

  const again = [...parseMgmtEvaluatorComments(items).chunks, ...parseMgmtHandbook(items).chunks];
  assert.deepEqual(again, all);
});
