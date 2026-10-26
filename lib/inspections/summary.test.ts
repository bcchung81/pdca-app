import assert from "node:assert/strict";
import { test } from "node:test";
import { CASE_NO_SOURCE, type InspectionResult, MGMT_FORM_ID, TABLE_KEYS, emptyResult } from "./model.ts";
import { MGMT_LINK_NOTE, type SummaryInput, bizLinkLine, caseKey, focusDirection, summarize, summaryMarkdown } from "./summary.ts";

function result(weak: Array<[keyof Pick<InspectionResult, "axes" | "patterns" | "coherence">, number]>, extra: Partial<InspectionResult> = {}): InspectionResult {
  const r = emptyResult();
  for (const k of TABLE_KEYS) r[k] = r[k].map(() => ({ judgment: "충족" as const, question: "", fix: "", evidence: [], card: "", note: "" }));
  for (const [k, no] of weak) r[k][no - 1] = { judgment: "미흡", question: "q?", fix: "f", evidence: [{ source: "s", quote: "원문 구절", key: null, verified: null }], card: "c", note: "" };
  r.overview = { status: "현황", direction: "★OutCome 연결·계량 수치의 함정: 체감 지표 → 성과 입증\n★전년 지적 1:1 개선: …", case: CASE_NO_SOURCE };
  return { ...r, ...extra };
}
const card = (taskNo: string, business: string, department: string, team: string | null = null) => ({ taskNo, title: `과제 ${taskNo}`, business, department, team });

test("취합: 총괄·평균·집중보완·상태·사업별·부서별(점검표 판정만 집계)", () => {
  const list: SummaryInput[] = [
    { card: card("1-가", "전파이용 기회 확대", "전파기반본부", "검사기획팀"), status: "sent", result: result([["axes", 4], ["patterns", 5]]) },
    { card: card("1-나", "전파이용 기회 확대", "전파기반본부"), status: "draft", result: result([["patterns", 3]]) },
    { card: card("2-가", "국민안전 편익서비스 강화", "방송미디어본부"), status: "acknowledged", result: result([]) },
  ];
  const s = summarize(list);
  assert.equal(s.count, 3);
  assert.deepEqual(s.avg, { axes: 6.7, patterns: 7.3, coherence: 5 });
  assert.equal(s.focus, 1);
  assert.equal(s.needs, 3);
  assert.deepEqual(s.judge, { 점검완료: 1, 보완요청: 2, 재점검필요: 0 });
  assert.deepEqual(s.sent, { draft: 1, sent: 1, acknowledged: 1 });
  assert.deepEqual(
    s.byBusiness.map((b) => [b.name, b.count, b.focus]),
    [
      ["전파이용 기회 확대", 2, 1],
      ["국민안전 편익서비스 강화", 1, 0],
    ],
  );
  assert.deepEqual(
    s.byDept.map((b) => [b.name, b.count]),
    [
      ["전파기반본부", 2],
      ["방송미디어본부", 1],
    ],
  );
  assert.equal(s.focusList.length, 1);
  assert.deepEqual(s.focusList[0].stars, ["7대축 4 OutCome 연결", "질의패턴 5 계량 수치의 함정"]);
  assert.equal(s.focusList[0].dept, "전파기반본부(검사기획팀)");
  assert.deepEqual(s.focusList[0].direction, ["★OutCome 연결·계량 수치의 함정: 체감 지표 → 성과 입증"]);
  // 공통 미흡: 건수 같으면 ★ 먼저
  assert.deepEqual(
    s.weakTop.map((w) => [w.label, w.count, w.star]),
    [
      ["7대축 4 OutCome 연결", 1, true],
      ["질의패턴 3 성과확산·지속성", 1, true],
      ["질의패턴 5 계량 수치의 함정", 1, true],
    ],
  );
  assert.equal(s.cases.length, 0, "붙임2 미확보 사례제안은 빈도에서 뺌");
  assert.match(s.headline, /주요사업 3개 과제 점검 결과 평균 7대축 6.7\/7 · 질의패턴 7.3\/8 · 정합성 5\/5, 보완 3건 · 집중보완 1건/);
  assert.equal(s.top3.length, 3);
  const md = summaryMarkdown("2026-09", s);
  assert.match(md, /^# \[2026-09월\] KCA 경영평가 월간 점검 취합 결과보고서 — 주요사업/);
  assert.match(md, /◆ 총괄 현황 : 점검 3건 \/ 평균 7대축 6\.7\/7/);
  assert.match(md, /\| 전파이용 기회 확대 \| 2건 \| 6\.5\/7 \| 7\/8 \| 5\/5 \| 1건 \|/);
  assert.match(md, /▸ 7대축 'OutCome 연결' 미흡 1건 \(★핵심\)/);
  assert.match(md, /## ○ 기관장 보고 1면\n\n주요사업 3개 과제/);
});

test("취합: 기준 미확인·해당 없음 종합과 사례제안 키", () => {
  const r = result([]);
  r.coherence[4] = { judgment: "기준 미확인", question: "", fix: "", evidence: [], card: "", note: "대상사업 실행과제 목록" };
  r.patterns[6] = { judgment: "해당 없음", question: "", fix: "", evidence: [], card: "", note: "계량지표 없음" };
  const s = summarize([
    { card: card("1-가", "a", "d"), status: "sent", result: r },
    { card: card("1-나", "a", "d"), status: "sent", result: { ...r, overview: { ...r.overview, case: "한국관광공사 — 관광서비스 기반강화(B0): 잘한 점\n▸ 인사이트: …" } } },
  ]);
  assert.deepEqual(s.unknowns, [{ label: "정합성 5 과제 성격·식별정보 정합성", count: 2, notes: ["대상사업 실행과제 목록"] }]);
  assert.deepEqual(s.nas, [{ label: "질의패턴 7 실적 100% 포화", count: 2, notes: ["계량지표 없음"] }]);
  assert.deepEqual(s.cases, [{ key: "한국관광공사 — 관광서비스 기반강화(B0)", count: 1 }]);
  assert.equal(caseKey("해당 없음 — 붙임2에 유사 유형 사례 없음"), null);
  assert.equal(caseKey(CASE_NO_SOURCE), null);
  assert.deepEqual(focusDirection("★전년 지적: a\n★사전 설계: b"), ["★전년 지적: a"], "★핵심 줄이 없으면 첫 줄");
  assert.equal(summarize([]).headline, "");
  assert.equal(summarize([], "mgmt13").form, "mgmt13", "점검표가 없으면 화면이 고른 트랙 양식");
  assert.match(summaryMarkdown("2026-10", summarize([], "mgmt13")).split("\n")[0], /— 경영관리$/);
});

test("경영관리 취합: 경영관리 양식 이름으로 집계하고, 보고서는 부서별 집계만(대상사업별 없음) + 주요사업 연계 후보 종합 자리(연계 후보가 없으면 안내)", () => {
  const mg = (weak: Array<["axes" | "patterns" | "coherence", number]>) => {
    const r = result(weak);
    const e = emptyResult(MGMT_FORM_ID);
    return { ...e, axes: r.axes, patterns: r.patterns, coherence: r.coherence, overview: r.overview };
  };
  const list: SummaryInput[] = [
    { card: card("1-1", "전략기획", "경영기획본부", "경영기획팀"), status: "sent", result: mg([["coherence", 2], ["axes", 4], ["patterns", 5]]) },
    { card: card("2-1", "윤리경영", "감사실"), status: "draft", result: mg([["coherence", 1]]) },
  ];
  const s = summarize(list);
  assert.equal(s.form, "mgmt13");
  assert.equal(s.focus, 1);
  assert.equal(s.needs, 4);
  assert.deepEqual(s.weakTop.filter((w) => w.table === "coherence").map((w) => [w.name, w.count]), [["계량지표 3요소", 1], ["지적↔개선방안 대응", 1]], "정합성 항목 이름은 경영관리 양식");
  assert.match(s.headline, /^경영관리 2개 과제 점검 결과/);
  const md = summaryMarkdown("2026-09", s);
  assert.match(md, /^# \[2026-09월\] KCA 경영평가 월간 점검 취합 결과보고서 — 경영관리/);
  assert.doesNotMatch(md, /대상사업별 집계/);
  assert.match(md, /## □ 부서별 집계/);
  assert.match(md, /▸ 정합성 '지적↔개선방안 대응' 미흡 1건/);
  assert.ok(md.includes(`## □ 주요사업 연계 후보 종합 (부서 간 협의 안건)\n\n${MGMT_LINK_NOTE}`));
  assert.ok(md.indexOf("사례제안 종합") < md.indexOf("주요사업 연계 후보 종합") && md.indexOf("주요사업 연계 후보 종합") < md.indexOf("기준 미확인·해당 없음"), "지침 13 순서");
  // 주요사업 취합은 그대로
  const biz = summarize([{ card: card("1-가", "전파이용 기회 확대", "전파기반본부"), status: "sent", result: result([]) }]);
  assert.equal(biz.form, "biz14");
  assert.match(summaryMarkdown("2026-09", biz), /대상사업별 집계/);
  assert.doesNotMatch(summaryMarkdown("2026-09", biz), /주요사업 연계 후보 종합/);
  assert.equal(summarize([]).form, "biz14");
  assert.deepEqual(biz.bizLinks, []);
});

test("경영관리 취합: 주요사업 연계 후보 종합 — 그 달 점검표 미흡 행의 연계 후보를 주요사업 과제별로 모아 경영관리 과제번호(같은 과제는 한 번)", () => {
  const link = (id: string, title: string) => ({ id, title, gist: "요지", asOf: "’26.9.16. 판(그 뒤 원장 수정 없음)" });
  const mg = (links: Array<[number, ReturnType<typeof link>[]]>) => {
    const r = emptyResult(MGMT_FORM_ID);
    for (const k of TABLE_KEYS) r[k] = r[k].map(() => ({ judgment: "충족" as const, question: "", fix: "", evidence: [], card: "", note: "" }));
    for (const [no, ls] of links) r.axes[no - 1] = { judgment: "미흡", question: "", fix: "f", evidence: [{ source: "s", quote: "원문 구절", key: null, verified: null }], card: "c", note: "", links: ls };
    return r;
  };
  const s = summarize([
    { card: card("12-1", "안전한 일터 조성", "안전경영실"), status: "sent", result: mg([[4, [link("주요사업2 3-라", "무선국 검사 전주기 안전관리체계")]], [7, [link("주요사업2 3-라", "무선국 검사 전주기 안전관리체계"), link("주요사업1 1-가", "안테나 자동판독")]]]) },
    { card: card("4-2", "안전 및 재난관리", "안전경영실"), status: "draft", result: mg([[4, [link("주요사업2 3-라", "무선국 검사 전주기 안전관리체계")]]]) },
    { card: card("4-1", "안전 및 재난관리", "안전경영실"), status: "draft", result: mg([]) },
  ]);
  assert.deepEqual(s.bizLinks, [
    { id: "주요사업2 3-라", title: "무선국 검사 전주기 안전관리체계", tasks: ["12-1", "4-2"] },
    { id: "주요사업1 1-가", title: "안테나 자동판독", tasks: ["12-1"] },
  ]);
  assert.equal(bizLinkLine(s.bizLinks[0]), "▸ 주요사업2 3-라 「무선국 검사 전주기 안전관리체계」 → 경영관리 과제 2건(12-1, 4-2)");
  const md = summaryMarkdown("2026-09", s);
  assert.ok(md.includes("## □ 주요사업 연계 후보 종합 (부서 간 협의 안건)\n\n▸ 주요사업2 3-라 「무선국 검사 전주기 안전관리체계」 → 경영관리 과제 2건(12-1, 4-2)\n▸ 주요사업1 1-가 「안테나 자동판독」 → 경영관리 과제 1건(12-1)\n"));
  assert.ok(!md.includes(MGMT_LINK_NOTE));
  assert.equal(s.needs, 3, "연계 후보는 보완 건수에 영향 없음");
});
