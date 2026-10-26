import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { checklistItems } from "../inspections/checklist.ts";
import { CASE_NO_SOURCE, INTERNAL_TAG, MGMT_FORM_ID, TABLE_KEYS, remedyText, tally } from "../inspections/model.ts";
import { inspectPromptsMg } from "../prompts/sets.ts";
import {
  InspectMgOutputSchema,
  type InspectMgOutput,
  MGMT_NOTICE_INTERNAL,
  MGMT_NOTICE_NO_REF,
  type MgSiblingRow,
  type MgmtInspectContext,
  inspectMgOutputSchema,
  inspectMgPrompt,
  inspectMgSystemText,
  mgSiblingsOf,
  verifyInspectionMg,
} from "./inspect-mg.ts";
import type { BizLinkPack } from "../inspections/biz-links.ts";
import type { KnowledgeRef } from "./writer.ts";
import { NO_PDCA_GUIDES, pdcaGuide } from "../testing/originals.ts";

const P = inspectPromptsMg().prompts;
const guide13 = pdcaGuide("13-inspection-guide-mg.md");

const refs: KnowledgeRef[] = [
  {
    key: "plan-2607/checklist/MG-1/s1/issues",
    title: "관리계획 '26 자가진단 · 경영관리 전략기획 · '25 경영평가단 지적사항 조치계획",
    unitType: "checklist_group",
    text: "1. 기관은 핵심가치 진단 시 다양한 기준을 적용하고 있으나 세부 평가 요소를 명확하게 제시하려는 노력이 필요\n\n2. 하위 평가 항목에 대한 재검토 및 개선 노력이 필요",
    where: "관리계획 7월판 Ⅲ-2",
    meta: { kind: "issues", issue_numbers: [1, 2] },
  },
  {
    key: "plan-2607/checklist/MG-1/s1/sd1/g1",
    title: "관리계획 '26 자가진단 · 경영관리 전략기획 · 세부평가내용❶ 1. 환경변화 분석",
    unitType: "checklist_group",
    text: "경영환경 변화를 체계적으로 분석하고 있다.\n\n대응과제를 객관적으로 제시하였다.",
    where: "관리계획 7월판 Ⅲ-2",
    meta: { kind: "sd_group", sd_no: 1, group_label: "1. 환경변화 분석" },
  },
  { key: "plan-2607/eval25/MG-1/main/p02", title: "관리계획 '25 평가보고서 · 전략기획 ①", unitType: "evaluator_comment", text: "핵심가치 진단 기준의 개념이 구체적이지 않아 평가자의 주관성이 개입될 여지가 있다.", where: "'25 평가보고서" },
  { key: "core25-mg/1-1", title: "핵심공통항목 '25 · 1-(1) 전략기획", unitType: "core_item", text: "전략기획 | O / 4", where: "핵심공통항목" },
];
const items = checklistItems(refs);

const ctx: MgmtInspectContext = {
  period: "2026-09",
  today: "2026-09-26",
  preMonth: false,
  business: null,
  subBusinesses: [],
  hasPeerCases: false,
  form: MGMT_FORM_ID,
  unit: { id: "MG-1", no: 1, name: "전략기획", bonus: false },
  siblings: ["1-1 핵심가치 진단", "1-2 사업포트폴리오 분석"],
  siblingFindings: [],
  items,
  biz: { task: "1-1", cards: [], more: [], indexed: true, unknownCited: [] },
};
const card = { taskNo: "1-1", title: "핵심가치 진단", group: "경영관리1", indicatorNo: 1, indicatorName: "전략기획", deptText: "경영기획본부(경영기획팀)", findings: { rows: [{ finding: ["지적 하나"], plan: ["개선 하나"] }] } };

const row = (no: number, judgment: "충족" | "미흡" | "기준 미확인" | "해당 없음" = "충족", extra: Record<string, unknown> = {}) => ({ no, judgment, question: "", fix: "", evidence: [], card: "", note: "", links: [], ...extra });
function output(over: Partial<InspectMgOutput> = {}): InspectMgOutput {
  return {
    coherence: [1, 2, 3, 4, 5].map((n) => row(n)),
    axes: [1, 2, 3, 4, 5, 6, 7].map((n) => row(n)),
    patterns: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => row(n)),
    status: "과정 실적 단계",
    direction: "★환류: 방향 → 기대",
    internal: false,
    checklist: items.map((i) => ({ id: i.id, mine: true, point: "", result: "예" as const, task: "1-1", note: "카드 근거" })),
    notices: [],
    ...over,
  };
}
const META = { model: "m", at: "2026-09-26T00:00:00Z" };

test("시스템 프롬프트: 경영관리 적응문 + 지침 13 사본, 자리표시가 남지 않고 경영관리 용어를 씀", { skip: NO_PDCA_GUIDES }, () => {
  const sys = inspectMgSystemText(P, guide13);
  assert.doesNotMatch(sys, /\{\{\w+\}\}/);
  assert.match(sys, /경영관리 월간 점검표 초안/);
  assert.ok(sys.includes("「운영 지침」\n당신은 한국방송통신전파진흥원(KCA) 성과관리팀의 「경영관리 과제 월간 점검관」입니다."));
  assert.match(sys, /기준 미확인 — 붙임2 미확보/);
  assert.match(sys, /사전점검/);
  assert.doesNotMatch(inspectMgSystemText(P, ""), /주요사업 월간 점검|대상사업 실행과제 목록|세부 대상사업/, "주요사업 적응문이 섞이지 않음");
});

test("요청 글: 지표·같은 지표 과제·체크리스트 항목·지식 조각이 들어가고 자리표시가 남지 않음, 과제가 하나뿐이면 그 안내", () => {
  const text = inspectMgPrompt(P, card, refs, ctx);
  assert.doesNotMatch(text, /\{\{\w+\}\}/);
  for (const phrase of ["점검월: 2026-09 · 점검일자: 2026-09-26 · 사전점검 아님", "과제: 1-1 핵심가치 진단", "경영관리 지표(과제번호 앞부분): 전략기획(지표 1, MG-1)", "같은 지표의 과제: 1-1 핵심가치 진단 · 1-2 사업포트폴리오 분석", "붙임1(관리계획 7월판 경영관리 발췌) 조각 3개 · 붙임3(핵심공통항목) 조각 1개", "체크리스트 항목 4개", "「체크리스트 항목」 — 5블록", '<item id="c1" label="지적 1">', '<item id="c3" label="①-1" group="환경변화 분석">', "「지식 조각」", "## 지적 및 개선방안"])
    assert.ok(text.includes(phrase), phrase);
  const at = (head: string) => text.indexOf(`\n${head}`);
  assert.ok(at("「카드」 — 확정 원장") > 0 && at("「카드」 — 확정 원장") < at("「지식 조각」\n") && at("「지식 조각」\n") < at("「체크리스트 항목」 — 5블록"), "카드 → 지식 조각 → 체크리스트 항목 순서");
  const bonus = inspectMgPrompt(P, card, refs, { ...ctx, unit: { ...ctx.unit, no: 12, id: "MG-12", name: "안전한 일터 조성", bonus: true }, siblings: ["12-1 안전"] });
  assert.match(bonus, /\(지표 12, MG-12\) · 혁신가점 영역/);
  assert.match(bonus, /같은 지표의 다른 과제: 없음/);
  assert.equal(inspectMgPrompt(P, card, refs, ctx), inspectMgPrompt(P, card, refs, ctx), "같은 입력이면 같은 글");
});

test("답 스키마: 주요사업 답에서 사례제안이 빠지고 내부관리형·체크리스트가 더해지며, schema.md 설명이 모두 붙음", () => {
  const json = z.toJSONSchema(InspectMgOutputSchema) as { properties: Record<string, unknown>; required: string[] };
  assert.deepEqual(Object.keys(json.properties), ["coherence", "axes", "patterns", "status", "direction", "internal", "checklist", "notices"]);
  assert.ok(!("case" in json.properties));
  const withDesc = JSON.stringify(z.toJSONSchema(inspectMgOutputSchema(P.schema)));
  for (const v of Object.values(P.schema)) assert.ok(withDesc.includes(JSON.stringify(v).slice(1, -1)), `설명이 스키마에 없음: ${v.slice(0, 20)}`);
  assert.ok(InspectMgOutputSchema.safeParse(output()).success);
  assert.ok(!InspectMgOutputSchema.safeParse({ ...output(), checklist: [{ id: "c1", mine: true, point: "", result: "맞음", task: "", note: "" }] }).success, "체크리스트 결과는 예·부분·아니오·해당 없음만");
});

test("결과 검증: 경영관리 양식 점검표 — 정합성 이름·체크리스트 블록·붙임2 미확보 알림, 사례제안은 붙임2 미확보", () => {
  const v = verifyInspectionMg(
    output({
      coherence: [row(1), row(2, "미흡", { fix: "'지적 및 개선방안' 표에 지적 2 행 추가", evidence: [{ key: "plan-2607/checklist/MG-1/s1/issues", quote: "하위 평가 항목에 대한 재검토 및 개선 노력이 필요" }], card: "'지적 및 개선방안' — 지적 1 행만 있음" }), row(3), row(4), row(5)],
      checklist: [
        { id: "c1", mine: true, point: " 핵심가치 진단 기준 구체화 ", result: "부분", task: "1-1", note: "보완: '추진내용' 칸에 세부 평가 요소 추가" },
        { id: "c2", mine: false, point: "x", result: "예", task: "—", note: "" },
        { id: "c3", mine: true, point: "", result: "예", task: "1-1", note: "추진내용 1월 환경분석" },
      ],
    }),
    refs,
    ctx,
    META,
  );
  const r = v.result;
  assert.equal(r.form, MGMT_FORM_ID);
  assert.equal(r.coherence.length, 5);
  assert.equal(tally(r).tables.coherence.weak[0], "지적↔개선방안 대응");
  assert.equal(r.coherence[1].evidence[0].verified, true, "근거 인용은 원문과 대조됨");
  assert.equal(r.overview.case, CASE_NO_SOURCE);
  assert.deepEqual(
    r.checklist!.rows.map((x) => [x.label, x.result, x.point]),
    [["지적 1", "부분", "핵심가치 진단 기준 구체화"], ["①-1", "예", "경영환경 변화를 체계적으로 분석하고 있다."]],
  );
  assert.equal(r.checklist!.sub, "전략기획");
  assert.equal(r.checklist!.others, 2, "소관 아님 1 + 답 없음 1(c4)");
  assert.equal(v.checklistMissing, 1);
  assert.equal(r.notices[0], MGMT_NOTICE_NO_REF, "지식파일 미확보 알림이 첫 줄");
  assert.equal(r.notices.filter((n) => n.startsWith("지식파일 미확보")).length, 1, "주요사업 검증의 붙임2 알림과 겹치지 않음");
  assert.equal(MGMT_NOTICE_NO_REF, "지식파일 미확보: 붙임2", "붙임4는 원장 주요사업 카드로 대체(2026-10-12)");
  assert.ok(r.notices.some((n) => /답하지 않은 체크리스트 항목 1개/.test(n)));
  assert.ok(!r.notices.includes(MGMT_NOTICE_INTERNAL));
  assert.equal(v.unverified, 0);
  assert.equal(v.missing, 0);
  assert.equal(tally(r).needs, 1, "체크리스트 부분·아니오는 보완 건수에 안 들어감");
  assert.ok(TABLE_KEYS.every((k) => r[k].every((x) => !("internal" in x))));
});

test("내부관리형 보정: internal이면 판정한 7대축 1·4·질의패턴 2에 표지, 사전점검으로 해당 없음이 된 행과 판정 안 한 행에는 안 붙음", () => {
  const v = verifyInspectionMg(output({ internal: true, axes: [1, 2, 3, 4, 5, 6, 7].map((n) => (n === 1 ? row(n, "미흡", { fix: "f", card: "c", evidence: [{ key: "plan-2607/eval25/MG-1/main/p02", quote: "평가자의 주관성이 개입될 여지가 있다" }] }) : row(n))) }), refs, ctx, META);
  assert.equal(v.result.axes[0].internal, true);
  assert.equal(v.result.axes[3].internal, true);
  assert.equal(v.result.patterns[1].internal, true);
  assert.equal("internal" in v.result.axes[1], false);
  assert.equal(remedyText("axes", v.result.axes[0]).split("\n")[0], INTERNAL_TAG);
  assert.ok(v.result.notices.includes(MGMT_NOTICE_INTERNAL));
  const pre = verifyInspectionMg(output({ internal: true }), refs, { ...ctx, preMonth: true }, META);
  assert.equal("internal" in pre.result.axes[3], false, "사전점검이면 7대축 4는 해당 없음이라 보정 안 함");
  assert.equal(pre.result.axes[3].judgment, "해당 없음");
  assert.equal(pre.result.axes[0].internal, true);
  assert.match(pre.result.overview.status, /^사전점검\(점검월 미도래\)/);
  const off = verifyInspectionMg(output({ internal: false }), refs, ctx, META);
  assert.ok(off.result.notices.every((n) => n !== MGMT_NOTICE_INTERNAL));
});

test("주요사업 검증은 그대로: form을 안 주면 biz14 표·체크리스트 없음", async () => {
  const { verifyInspection } = await import("./inspect.ts");
  const v = verifyInspection({ ...output(), case: { key: "", summary: "", insight: "" } }, refs, { period: "2026-09", today: "2026-09-26", preMonth: false, business: null, subBusinesses: [], hasPeerCases: false }, META);
  assert.equal(v.result.form, "biz14");
  assert.equal("checklist" in v.result, false);
  assert.equal(tally(v.result).tables.coherence.total, 5);
});

const bizPack: BizLinkPack = {
  task: "1-1",
  cards: [
    { id: "주요사업1 1-라", title: "규제 혁신 과제", dept: "전파정책본부(제도팀)", asOf: "’26.9.16. 판(그 뒤 원장 수정 없음)", reasons: ["b"], text: "## 과제 기본정보\ntitle | 규제 혁신 과제 <원장>" },
    { id: "주요사업2 6-나", title: "국민 소통 혁신", dept: "ICT자격본부(자격기획팀)", asOf: "’26.9.16. 판(그 뒤 원장 수정 2회 — 마지막 ’26.9.29.)", reasons: ["b", "c"], text: "## 과제 기본정보\ntitle | 국민 소통 혁신" },
    { id: "주요사업3 1-나", title: "셋째 과제", dept: "", asOf: "’26.9.16. 판(그 뒤 원장 수정 없음)", reasons: ["c"], text: "x" },
  ],
  more: [{ id: "주요사업1 9-나", title: "신산업 규제 재설계", reasons: ["b"] }],
  indexed: true,
  unknownCited: ["주요사업2 9-가"],
};

test("요청 글: 「주요사업 원장 발췌」(붙임4 자리)가 지식 조각 뒤·체크리스트 앞에 들어가고, 머리에 번호·과제명·부서·원장 시점, 상한 밖은 목록만", () => {
  const text = inspectMgPrompt(P, card, refs, { ...ctx, biz: bizPack });
  assert.doesNotMatch(text, /\{\{\w+\}\}/);
  assert.match(text, /붙임4 자리 = 원장 주요사업 카드 발췌 3장/);
  assert.match(text, /「주요사업 원장 발췌」 — 붙임4 자리\(이 앱 원장의 주요사업 카드 3장/);
  assert.ok(text.includes('<biz id="주요사업1 1-라" title="규제 혁신 과제" dept="전파정책본부(제도팀)" asof="’26.9.16. 판(그 뒤 원장 수정 없음)" why="지침 연계 색인">\n주요사업1 1-라 「규제 혁신 과제」 · 전파정책본부(제도팀) · 원장 ’26.9.16. 판(그 뒤 원장 수정 없음)\n'));
  assert.ok(text.includes('why="지침 연계 색인 · 글자 겹침"'));
  assert.ok(text.includes("title | 규제 혁신 과제 &lt;원장&gt;"), "발췌 글은 꺾쇠를 이스케이프");
  assert.match(text, /상한 밖 색인 과제\(본문 없음 — 연계 후보로 쓰지 않음\): 주요사업1 9-나 · 신산업 규제 재설계/);
  assert.match(text, /원장에 없는 주요사업 과제번호: 주요사업2 9-가/);
  assert.doesNotMatch(text, /연계 색인에 「먼저 볼 주요사업 과제」 행이 없습니다/);
  const at = (head: string) => text.indexOf(head);
  assert.ok(at("「지식 조각」\n") < at("「주요사업 원장 발췌」") && at("「주요사업 원장 발췌」") < at("「체크리스트 항목」 — 5블록"));
  const none = inspectMgPrompt(P, card, refs, { ...ctx, biz: { task: "10-1", cards: [], more: [], indexed: false, unknownCited: [] } });
  assert.match(none, /줄 주요사업 카드가 없습니다/);
  assert.match(none, /억지로 연결하지 않습니다/, "색인 행이 없는 지표 — 지침 「억지로 연결하지 않는다」");
});

test("프롬프트: 「붙임4 미확보」·연계 후보 생략 문구가 남지 않고, 붙임4 자리·원장 시점·읽기 전용 참고를 알림", () => {
  const sys = inspectMgSystemText(P, "");
  const req = inspectMgPrompt(P, card, refs, ctx);
  for (const t of [sys, req]) {
    assert.doesNotMatch(t, /붙임2·붙임4 미확보|붙임4\(주요사업 과제관리카드\)는 이 앱에 아직 없|연계 후보·인용 대조는 하지 않|붙임4가 없으므로/);
  }
  assert.match(sys, /붙임4\(주요사업 과제관리카드 파일\) 대신 앱 원장의 주요사업 카드 발췌/);
  assert.match(sys, /읽기 전용 참고로만 쓰고 주요사업 과제를 점검·판정하지 않는/);
  assert.match(sys, /'26\.9\.21 기준」 자리에는 발췌 머리의 원장 시점/);
  assert.match(sys, /주요사업 인용 불일치: 경영관리 \(이 과제번호\) ↔ 주요사업N N-가/);
  assert.match(sys, /기준 미확인 — 붙임2 미확보/, "사례제안은 그대로 붙임2 미확보");
});

test("연계 후보 정리: 미흡 행에만·받은 발췌의 번호만·행당 2건, 과제명·원장 시점은 원장에서, 버린 번호와 원장에 없는 인용은 운영 알림", () => {
  const weak = (no: number, links: Array<{ id: string; gist: string }>) => row(no, "미흡", { fix: "f", card: "c", evidence: [{ key: "plan-2607/eval25/MG-1/main/p02", quote: "평가자의 주관성이 개입될 여지가 있다" }], links });
  const v = verifyInspectionMg(
    output({
      axes: [1, 2, 3, 4, 5, 6, 7].map((n) =>
        n === 4
          ? weak(4, [
              { id: "주요사업1 1-라", gist: "규제개선 실적 — 전사 체계로 재서술" },
              { id: "주요사업1  1-라", gist: "같은 번호 다시" },
              { id: "주요사업9 9-가", gist: "없는 과제" },
              { id: "주요사업1 9-나", gist: "상한 밖 목록 과제" },
              { id: "주요사업2 6-나", gist: "소통 혁신\n두 줄" },
              { id: "주요사업3 1-나", gist: "셋째" },
            ])
          : n === 6
            ? row(6, "충족", { links: [{ id: "주요사업1 1-라", gist: "충족 행" }] })
            : row(n),
      ),
    }),
    refs,
    { ...ctx, biz: bizPack },
    META,
  );
  const r = v.result;
  assert.deepEqual(r.axes[3].links, [
    { id: "주요사업1 1-라", title: "규제 혁신 과제", gist: "규제개선 실적 — 전사 체계로 재서술", asOf: "’26.9.16. 판(그 뒤 원장 수정 없음)" },
    { id: "주요사업2 6-나", title: "국민 소통 혁신", gist: "소통 혁신 · 두 줄", asOf: "’26.9.16. 판(그 뒤 원장 수정 2회 — 마지막 ’26.9.29.)" },
  ]);
  assert.equal("links" in r.axes[5], false, "미흡이 아닌 행의 연계 후보는 버림");
  assert.equal("links" in r.axes[0], false);
  assert.ok(r.notices.includes("연계 후보 버림: 주요사업9 9-가 — 받은 원장 발췌에 없음"));
  assert.ok(r.notices.includes("연계 후보 버림: 주요사업1 9-나 — 받은 원장 발췌에 없음"), "상한 밖 목록(본문 없음)도 버림");
  assert.ok(r.notices.includes("주요사업 인용 불일치: 경영관리 1-1 ↔ 주요사업2 9-가 — 원장에 없는 과제번호"));
  assert.equal(r.notices[0], MGMT_NOTICE_NO_REF);
  const remedy = remedyText("axes", r.axes[3]).split("\n");
  assert.equal(remedy.at(-2), "▸ 연계 후보: 주요사업1 1-라 「규제 혁신 과제」 — 규제개선 실적 — 전사 체계로 재서술 [원장 ’26.9.16. 판(그 뒤 원장 수정 없음)], 담당부서 협의 후 경영관리 관점으로 재서술 검토");
  assert.equal(tally(r).needs, 1, "연계 후보는 판정·집계에 영향 없음");
  // 사전점검으로 해당 없음이 된 행(7대축 4)의 연계 후보도 버림
  const pre = verifyInspectionMg(output({ axes: [1, 2, 3, 4, 5, 6, 7].map((n) => (n === 4 ? weak(4, [{ id: "주요사업1 1-라", gist: "g" }]) : row(n))) }), refs, { ...ctx, preMonth: true, biz: bizPack }, META);
  assert.equal("links" in pre.result.axes[3], false);
});

// ── '25 지적의 소관: 매핑표 대신 같은 지표 카드들의 「지적 및 개선방안」 행(2026-10-12 사용자 결정) ──

const sibRows: MgSiblingRow[] = [
  { id: "경영관리13/13-4", status: "active", no: "13-4", title: "넷째 과제", findings: { rows: [{ finding: ["∙ 자기 지적"], plan: ["∙ 자기 개선"] }] } },
  { id: "경영관리13/13-2", status: "active", no: "13-2", title: "둘째 과제", findings: { rows: [{ finding: ["∙ AX 이행 로드맵 구체성 취약", 3, "  "], plan: ["∙ 로드맵 재수립"] }, { finding: [], plan: [] }] } },
  { id: "경영관리13/13-9", status: "retired", no: "13-9", title: "보관 과제", findings: { rows: [{ finding: ["∙ 보관 카드 지적"], plan: ["∙ x"] }] } },
  { id: "경영관리13/13-10", status: "active", no: "13-10", title: "열째 과제", findings: null },
  { id: "경영관리13/13-1", status: "active", no: "13-1", title: "첫째 과제", findings: { rows: [{ finding: ["∙ 설계 단계 혁신성 제한적", "∙ 둘째 줄"], plan: [] }] } },
];

test("같은 지표 다른 과제의 지적 행: 원장 findings 글줄만 — 이 과제·보관 카드는 빼고, 과제번호 숫자 순, 글머리·빈 줄·글 아닌 값은 버림", () => {
  const { siblings, findings } = mgSiblingsOf(sibRows, "경영관리13/13-4");
  assert.deepEqual(siblings, ["13-1 첫째 과제", "13-2 둘째 과제", "13-4 넷째 과제", "13-10 열째 과제"], "과제 목록은 이 과제 포함·보관 제외");
  assert.deepEqual(findings, [
    { taskNo: "13-1", title: "첫째 과제", rows: [{ finding: ["설계 단계 혁신성 제한적", "둘째 줄"], plan: [] }] },
    { taskNo: "13-2", title: "둘째 과제", rows: [{ finding: ["AX 이행 로드맵 구체성 취약"], plan: ["로드맵 재수립"] }] },
    { taskNo: "13-10", title: "열째 과제", rows: [] },
  ]);
  assert.ok(!JSON.stringify(findings).includes("자기 지적"), "이 과제 자신의 행은 「카드」 글에 이미 있으므로 넣지 않음");
  assert.ok(!JSON.stringify(findings).includes("보관"), "보관 카드는 넣지 않음");
});

test("요청 글: 같은 지표 다른 과제의 「지적 및 개선방안」 행이 과제 목록 바로 뒤(부서 줄 앞)에 들어가고, 다른 과제가 없으면 블록도 없음", () => {
  const { siblings, findings } = mgSiblingsOf(sibRows, "경영관리13/13-4");
  const text = inspectMgPrompt(P, card, refs, { ...ctx, siblings, siblingFindings: findings });
  assert.doesNotMatch(text, /\{\{\w+\}\}/);
  const block = [
    "같은 지표의 과제: 13-1 첫째 과제 · 13-2 둘째 과제 · 13-4 넷째 과제 · 13-10 열째 과제 — 체크리스트 항목 중 이 과제가 맡을 범위를 나눌 때 씁니다.",
    "같은 지표 다른 과제 3개의 「지적 및 개선방안」 행(원장, 행마다 '25년 지적사항 → '26년 개선방안) — '25 지적의 소관을 정하는 기준입니다(지침의 '25 지적 → '26 과제 매핑표 대신). 여기 있는 지적은 그 과제 소관이고, 이 과제의 행은 「카드」에 있습니다.",
    "- 13-1 「첫째 과제」",
    "  · 1행 지적: 설계 단계 혁신성 제한적 / 둘째 줄 → 개선방안: —",
    "- 13-2 「둘째 과제」",
    "  · 1행 지적: AX 이행 로드맵 구체성 취약 → 개선방안: 로드맵 재수립",
    "- 13-10 「열째 과제」",
    "  · 지적 행 없음",
    "부서(팀): 경영기획본부(경영기획팀)",
  ].join("\n");
  assert.ok(text.includes(block), "과제 목록 → 다른 과제 지적 행 → 부서 순서");
  assert.equal(inspectMgPrompt(P, card, refs, { ...ctx, siblings, siblingFindings: findings }), text, "같은 입력이면 같은 글");
  const solo = inspectMgPrompt(P, card, refs, { ...ctx, siblings: ["14-2 단독 과제"], siblingFindings: [] });
  assert.match(solo, /같은 지표의 다른 과제: 없음 — 체크리스트 항목과 이 지표의 '25 지적은 모두 이 과제의 것입니다\./);
  assert.doesNotMatch(solo, /「지적 및 개선방안」 행\(원장/);
});

test("프롬프트: 매핑표 대신 카드 지적 행 기준 — 「매핑 추가 제안」·「지적 소관 과제 확인 필요」를 쓰라는 지시가 없고, 어느 카드에도 없는 지적은 「미반영 지적」 알림", () => {
  const sys = inspectMgSystemText(P, "");
  const schema = Object.values(P.schema).join("\n");
  const req = inspectMgPrompt(P, card, refs, ctx);
  for (const t of [sys, schema, req]) {
    // 두 이름은 「쓰지 않음」 문장 안에서만 나옴
    for (const line of t.split("\n").filter((l) => /매핑 추가 제안|지적 소관 과제 확인 필요/.test(l))) assert.match(line, /쓰지 않/, line);
  }
  assert.doesNotMatch(req, /매핑 추가 제안|지적 소관 과제 확인 필요/);
  assert.match(sys, /'25 지적 → '26 과제 매핑」\(체크리스트 '반영과제' 칸·지침의 매핑 목록 — 지적사항–과제 연결표\)을 쓰지 않습니다/);
  assert.match(sys, /각 카드의 「지적 및 개선방안」 행이 기준/);
  assert.match(sys, /과제가 여럿이면 소관을 정하지 않고 Act누락으로 미흡 판정하지 않으며, notices에 「미반영 지적: \(소분류\) 지적 N — 지표 안 어느 카드의 「지적 및 개선방안」에도 없음」/);
  assert.match(sys, /과제가 이 카드뿐이면 이 과제 소관입니다\(<Act누락 일관기준> 그대로/);
  assert.match(sys, /note 맨 앞에 '미반영 지적 — 소관 미정'/);
  assert.match(sys, /주요사업 인용 불일치: 경영관리 \(이 과제번호\)/, "다른 판정 규칙은 그대로");
});

test("운영 알림: AI가 낸 「매핑 추가 제안」·「지적 소관 과제 확인 필요」는 버리고(글머리가 붙어도) 「미반영 지적」 등은 그대로", () => {
  const v = verifyInspectionMg(
    output({
      notices: [
        "매핑 추가 제안: AI 활용 혁신 지적 1·2 → 13-1",
        "지적 소관 과제 확인 필요: (AI 활용 혁신) 지적 6·7 — 13-1·13-4 중 소관 확인",
        "- 매핑 추가 제안: 지적 3 → 13-2",
        "미반영 지적: (AI 활용 혁신) 지적 5 — 지표 안 어느 카드의 「지적 및 개선방안」에도 없음",
        "팀명 미기재",
        "카드의 매핑 추가 제안 문구 확인",
      ],
    }),
    refs,
    ctx,
    META,
  );
  assert.ok(v.result.notices.every((n) => !/^(?:- )?(?:매핑 추가 제안|지적 소관 과제 확인 필요)/.test(n)), v.result.notices.join(" / "));
  assert.ok(v.result.notices.includes("미반영 지적: (AI 활용 혁신) 지적 5 — 지표 안 어느 카드의 「지적 및 개선방안」에도 없음"));
  assert.ok(v.result.notices.includes("팀명 미기재"));
  assert.ok(v.result.notices.includes("카드의 매핑 추가 제안 문구 확인"), "줄 머리가 아닌 곳의 낱말은 버리지 않음");
  assert.equal(v.result.notices[0], MGMT_NOTICE_NO_REF);
});

test("운영 알림: 매핑 알림은 알림 수(20줄)를 자르기 전에 버려 다른 알림이 밀려 잘리지 않음", () => {
  const mapping = Array.from({ length: 6 }, (_, i) => ` 매핑 추가 제안: 지적 ${i + 1} → 13-1`);
  const others = Array.from({ length: 15 }, (_, i) => `알림 ${i + 1}`);
  const v = verifyInspectionMg(output({ notices: [...mapping, ...others] }), refs, ctx, META);
  for (const n of others) assert.ok(v.result.notices.includes(n), n);
});
