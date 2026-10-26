import assert from "node:assert/strict";
import { test } from "node:test";
import { NO_PDCA_GUIDES, pdcaGuide } from "../testing/originals.ts";
import {
  CASE_FOOTNOTE,
  CHECKLIST_HEADERS,
  CHECKLIST_TITLE,
  CONSULT_TITLE,
  FORM_ID,
  INTERNAL_TAG,
  MGMT_CASE_FOOTNOTE,
  MGMT_FORM_ID,
  MGMT_FORM_TABLES,
  caseFootnote,
  checklistCounts,
  checklistIntro,
  formTablesOf,
  linkText,
  rowLabel,
  FORM_COL_WIDTHS,
  FORM_TABLES,
  consultDateLine,
  formRows,
  overviewLines,
  OVERVIEW_ROWS,
  TABLE_KEYS,
  applyPreMonth,
  CASE_NO_SOURCE,
  cleanResult,
  emptyResult,
  emptyRow,
  finalInspection,
  finalInspectionView,
  inspectionSummary,
  isVerdict,
  newResult,
  isPreMonth,
  judgeStatus,
  needsCount,
  problems,
  readResult,
  readyToSend,
  remedyText,
  tally,
  unverifiedCount,
} from "./model.ts";

const guide = pdcaGuide("14-inspection-guide-biz.md");
const outForm = guide.slice(guide.indexOf("<출력구조 단위="), guide.indexOf("[미흡 시 보완방안 칸 작성법]"));

test("양식 고정: 세 표의 구분·항목·정의와 머리·총평 칸이 지침 <출력구조> 문구와 글자까지 같음", { skip: NO_PDCA_GUIDES }, () => {
  const lines = outForm.split("\n");
  for (const k of TABLE_KEYS) {
    const t = FORM_TABLES[k];
    assert.ok(outForm.includes(`□ ${t.title}`), `제목 ${t.title}`);
    assert.ok(outForm.includes(`| 구분 | ${t.itemHeader} | 정의 | 판단 | 미흡 시 보완방안 |`), `머리 ${t.itemHeader}`);
    for (const r of t.rows) assert.ok(lines.some((l) => l.startsWith(`| ${r.no} | ${r.name} | ${r.definition} |`)), `${t.short} ${r.no} ${r.name}`);
  }
  // 지침 표의 행 수와 양식 행 수가 같음(지침이 바뀌어 행이 늘면 여기서 걸림)
  const tableRows = lines.filter((l) => /^\| \d \|/.test(l)).length;
  assert.equal(tableRows, TABLE_KEYS.reduce((n, k) => n + FORM_TABLES[k].rows.length, 0));
  for (const o of OVERVIEW_ROWS) assert.ok(lines.some((l) => l.startsWith(`| ${o.label} |`)), o.label);
  assert.ok(outForm.includes(CASE_FOOTNOTE));
});

function filled() {
  const r = emptyResult();
  for (const k of TABLE_KEYS) r[k] = r[k].map(() => ({ judgment: "충족" as const, question: "", fix: "", evidence: [], card: "", note: "" }));
  r.overview.status = "과정 실적 단계";
  return r;
}
const weak = (question = "") => ({
  judgment: "미흡" as const,
  question,
  fix: "'추진성과' 칸에 체감 변화 수치 추가",
  evidence: [{ source: "관리계획 '26 자가진단", quote: "결과(outcome) 중심", key: "k1", verified: true }],
  card: "'추진성과 — 정량' — 건수만",
  note: "",
});

test("읽기·정리: 다른 양식은 빈 점검표, 판단에 따라 칸 정리(충족은 메모만, 미흡은 보완 재료, 질의패턴만 예상 질의)", () => {
  assert.deepEqual(readResult({ summary: "옛 양식", items: [{ key: "a", verdict: "보완" }] }), emptyResult());
  const r = cleanResult({
    overview: { status: " 추진 ", direction: "★a\n★b", case: "" },
    axes: [{ judgment: "충족", fix: "지울 글", note: " 메모 " }, { judgment: "미흡", question: "질문?", fix: "보완", evidence: [{ source: "s", quote: "「원문」" }], card: "카드", note: "지울 사유" }],
    patterns: [{ judgment: "미흡", question: "질문?", fix: "f", evidence: [], card: "c" }],
    coherence: [{ judgment: "해당 없음", fix: "x", note: "계량지표 없음" }, { judgment: "이상한 값" }],
    extra: "버림",
  });
  assert.equal(r.form, "biz14");
  assert.equal(r.overview.status, "추진");
  assert.equal(r.axes.length, 7);
  assert.equal(r.patterns.length, 8);
  assert.equal(r.coherence.length, 5);
  assert.deepEqual(r.axes[0], { judgment: "충족", question: "", fix: "", evidence: [], card: "", note: "메모" });
  assert.equal(r.axes[1].question, "", "7대축에는 예상 질의 없음");
  assert.equal(r.axes[1].note, "");
  assert.equal(r.axes[1].evidence[0].quote, "원문", "「」는 벗김");
  assert.equal(r.patterns[0].question, "질문?");
  assert.deepEqual(r.coherence[0], { judgment: "해당 없음", question: "", fix: "", evidence: [], card: "", note: "계량지표 없음" });
  assert.equal(r.coherence[1].judgment, null);
  assert.equal("extra" in r, false);
});

test("집계: 충족 수·미흡 항목·보완 건수, 기준 미확인·해당 없음은 어디에도 안 셈", () => {
  const r = filled();
  r.axes[0] = weak();
  r.axes[5] = { ...r.axes[5], judgment: "기준 미확인", note: "관리계획 Ⅱ" };
  r.patterns[6] = { ...r.patterns[6], judgment: "해당 없음", note: "계량지표 없음" };
  const t = tally(r);
  assert.equal(t.tables.axes.met, 5);
  assert.deepEqual(t.tables.axes.weak, ["국민 출발점"]);
  assert.equal(t.tables.axes.unknown, 1);
  assert.equal(t.tables.patterns.met, 7);
  assert.equal(t.tables.patterns.na, 1);
  assert.equal(t.tables.coherence.met, 5);
  assert.equal(t.needs, 1);
  assert.equal(needsCount(r), 1);
  assert.equal(t.focus, false);
});

test("★집중보완: 판정 가능한 ★ 중 2개 이상 미흡이면 집중보완, 판정 가능한 ★가 1개 이하면 아님 + 사유", () => {
  const r = filled();
  r.axes[3] = weak(); // 7대축 4 OutCome 연결
  r.patterns[4] = weak("착시 아닌가?"); // 질의패턴 5 계량 수치의 함정
  let t = tally(r);
  assert.equal(t.focus, true);
  assert.deepEqual(t.stars.weak, ["7대축 4 OutCome 연결", "질의패턴 5 계량 수치의 함정"]);
  assert.equal(t.focusNote, null);
  assert.equal(tally(emptyResult()).focusNote, null, "★를 아직 판단하지 않았으면(작성 중) 알림 없음");

  const pre = applyPreMonth(filled()); // 사전점검: 7대축 4·질의패턴 5가 해당 없음
  pre.patterns[2] = weak("확산 계획은?");
  t = tally(pre);
  assert.equal(t.stars.judged, 1);
  assert.equal(t.focus, false);
  assert.match(t.focusNote ?? "", /판정 가능한 ★가 1개라 집중보완 아님 — 7대축 4 OutCome 연결\(해당 없음\), 질의패턴 5 계량 수치의 함정\(해당 없음\)/);
});

test("사전점검: 점검월이 뒤면 7대축 2·4, 질의패턴 5만 해당 없음", () => {
  assert.equal(isPreMonth("2026-10", "2026-09"), true);
  assert.equal(isPreMonth("2026-09", "2026-09"), false);
  const r = applyPreMonth(filled());
  assert.deepEqual(
    TABLE_KEYS.flatMap((k) => r[k].map((x, i) => (x.judgment === "해당 없음" ? `${k}${i + 1}:${x.note}` : null)).filter(Boolean)),
    ["axes2:점검월 미도래(사전점검)", "axes4:점검월 미도래(사전점검)", "patterns5:점검월 미도래(사전점검)"],
  );
});

test("보내기 전 확인과 판정 상태: 미판단·미흡 3요소(질의패턴은 예상 질의)·사유·총평", () => {
  const r = emptyResult();
  assert.match(readyToSend(r)!, /판단하지 않은 항목이 20개/);
  const f = filled();
  assert.equal(readyToSend(f), null);
  assert.equal(judgeStatus(f), "점검완료");
  f.patterns[0] = { ...weak(), question: "" };
  assert.match(readyToSend(f)!, /질의패턴 1 사전 설계·체계성: 미흡이면 예상 질의/);
  f.patterns[0].question = "환경분석은 어디 있나?";
  f.axes[2] = { ...weak(), evidence: [] };
  assert.match(readyToSend(f)!, /근거 원문/);
  f.axes[2] = weak();
  f.coherence[4] = { judgment: "기준 미확인", question: "", fix: "", evidence: [], card: "", note: "" };
  assert.match(readyToSend(f)!, /기준 미확인 사유/);
  f.coherence[4].note = "대상사업 실행과제 목록";
  assert.match(readyToSend(f)!, /개선방향/, "미흡이 있으면 개선방향 필요");
  f.overview.direction = "★전년 지적 1:1 개선: …";
  assert.equal(readyToSend(f), null);
  assert.equal(judgeStatus(f), "보완요청");
  f.axes[2].evidence[0].verified = false;
  assert.equal(unverifiedCount(f), 1);
  assert.equal(judgeStatus(f), "재점검필요", "원문과 다른 인용이 있으면 다시 봄");
  assert.deepEqual(problems(emptyResult()).slice(-1), ["총평 추진현황을 적어 주세요."]);
});

test("보완방안 칸 글: 지침 형식(▸ 예상 질의·보완·근거·카드 / — / 기준 미확인 — / 해당 없음 —)", () => {
  assert.equal(
    remedyText("patterns", weak("왜 바꿨나?")),
    "▸ 예상 질의: 왜 바꿨나?\n▸ 보완: '추진성과' 칸에 체감 변화 수치 추가\n▸ 근거: 관리계획 '26 자가진단 「결과(outcome) 중심」\n▸ 카드: '추진성과 — 정량' — 건수만",
  );
  assert.equal(remedyText("axes", { ...weak(), judgment: "충족" }), "—");
  assert.equal(remedyText("coherence", { ...weak(), judgment: "충족", note: "실행과제 매칭: 기준 미확인" }), "— (실행과제 매칭: 기준 미확인)");
  assert.equal(remedyText("axes", { ...weak(), judgment: "기준 미확인", note: "관리계획 Ⅱ 착안사항(Do)" }), "기준 미확인 — 지식파일에 판정 기준 없음(필요 자료: 관리계획 Ⅱ 착안사항(Do))");
  assert.equal(remedyText("axes", { ...weak(), judgment: "해당 없음", note: "점검월 미도래(사전점검)" }), "해당 없음 — 점검월 미도래(사전점검)");
  assert.equal(remedyText("axes", { ...weak(), judgment: null }), "");
});

test("새 점검표: 붙임2가 없으면 사례제안을 미리 「기준 미확인 — 붙임2 미확보」, 있으면 비움", () => {
  assert.equal(newResult(false).overview.case, CASE_NO_SOURCE);
  assert.equal(newResult(true).overview.case, "");
});

test("점검 결과 보기 양식(AI 컨설팅 결과 노션 예시 = 지침 <출력구조>): 제목·날짜 줄·총평 줄·표 행이 결과와 맞게", () => {
  assert.equal(CONSULT_TITLE, "과제관리카드 AI 컨설팅 결과");
  assert.deepEqual([...FORM_COL_WIDTHS], [40, 140, 220, 70, 430]);
  assert.equal(consultDateLine("2026-09-16T03:00:00Z"), "< ’26. 9. 16.(수), 경영기획본부 성과관리팀 >");
  assert.equal(consultDateLine(null), null);
  const r = emptyResult();
  r.overview.status = "과정 실적 단계";
  r.overview.direction = "★OutCome 연결: 체감 변화 → 수치\n★성과확산: 전국 확대";
  r.overview.case = "가나공사 — 사업(B0): 잘한 점\n▸ 인사이트: 시사점";
  assert.deepEqual(overviewLines(r), [
    { mark: "○", label: "추진현황", lines: ["과정 실적 단계"] },
    { mark: "○", label: "개선방향", lines: ["★OutCome 연결: 체감 변화 → 수치", "★성과확산: 전국 확대"] },
    { mark: "★", label: "사례제안", lines: ["가나공사 — 사업(B0): 잘한 점", "▸ 인사이트: 시사점"] },
  ]);
  r.axes[3] = { ...r.axes[3], judgment: "미흡", fix: "추진성과에 체감 수치", evidence: [{ source: "관리계획", quote: "결과 중심", key: "k", verified: true }], card: "'추진성과' — 건수만" };
  r.axes[0] = { ...r.axes[0], judgment: "충족" };
  r.patterns[4] = { ...r.patterns[4], judgment: "미흡", question: "분모 착시 아닌가?", fix: "분모 기준 명시" };
  r.coherence[1] = { ...r.coherence[1], judgment: "해당 없음", note: "사유" };
  const axes = formRows(r, "axes");
  assert.equal(axes.length, 7);
  assert.deepEqual(axes[0], { no: 1, name: "국민 출발점", definition: FORM_TABLES.axes.rows[0].definition, judgment: "충족", remedy: "—" });
  assert.equal(axes[3].remedy, "▸ 보완: 추진성과에 체감 수치\n▸ 근거: 관리계획 「결과 중심」\n▸ 카드: '추진성과' — 건수만");
  assert.equal(axes[1].judgment, "");
  assert.match(formRows(r, "patterns")[4].remedy, /^▸ 예상 질의: 분모 착시 아닌가\?\n▸ 보완: 분모 기준 명시/);
  assert.equal(formRows(r, "coherence")[1].remedy, "해당 없음 — 사유");
  assert.equal(formRows(r, "coherence").length, 5);
});

test("최종 점검현황: 보낸·확인한 것 중 점검월이 가장 늦은 1건, 그보다 늦은 초안만 따로(같은 달·지난달 초안은 아님)", () => {
  const rows = [
    { id: 1, period: "2026-07", status: "acknowledged" },
    { id: 2, period: "2026-08", status: "sent" },
    { id: 3, period: "2026-06", status: "draft" },
    { id: 4, period: "2026-09", status: "draft" },
  ];
  const f = finalInspection(rows);
  assert.equal(f.final?.id, 2, "확인 여부가 아니라 점검월이 가장 늦은 보낸 점검");
  assert.equal(f.draft?.id, 4, "최종보다 늦은 초안");
  assert.equal(finalInspection(rows.slice(0, 3)).draft, null, "최종보다 이른 초안(지난달 다시 쓰는 중)은 알리지 않음");
  assert.deepEqual(finalInspection([rows[3]]), { final: null, draft: rows[3] }, "초안만 있으면 최종 없음");
  assert.deepEqual(finalInspection([]), { final: null, draft: null });
});

test("AI 컨설팅 칸: 점검월 · 판정 · 보냄/확인, 사전점검 표시, 새 초안 표시, 초안만이면 흐린 「초안」", () => {
  const v = finalInspectionView({ period: "2026-09", status: "acknowledged", verdict: "보완요청" }, null, "2026-09")!;
  assert.equal(v.text, "9월 보완요청 · 확인");
  assert.equal(v.title, "최종 점검: 2026년 9월 · 보완요청 · 부서 확인함");
  const pre = finalInspectionView({ period: "2026-10", status: "sent", verdict: "점검완료" }, { period: "2026-11" }, "2026-09")!;
  assert.equal(pre.text, "10월 사전 점검완료 · 보냄");
  assert.equal(pre.pre, true);
  assert.equal(pre.draftPeriod, "2026-11");
  assert.match(pre.title, /\(사전점검\).*부서에 보냄\(확인 전\) \/ 2026년 11월 점검 초안 작성 중/);
  const draftOnly = finalInspectionView(null, { period: "2026-09" }, "2026-09")!;
  assert.deepEqual([draftOnly.status, draftOnly.text, draftOnly.verdict], ["draft", "9월 초안", null]);
  assert.equal(finalInspectionView(null, null, "2026-09"), null);
  assert.equal(finalInspectionView({ period: "2026-08", status: "sent" }, null, "2026-09")!.text, "8월 · 보냄", "판정 요약이 없으면 판정 없이");
});

test("판정 요약(result.summary): 저장 때 두는 판정·보완 건수가 judgeStatus·needsCount와 같음", () => {
  const f = filled();
  assert.deepEqual(inspectionSummary(f), { verdict: "점검완료", needs: 0 });
  f.axes[3] = weak();
  f.overview.direction = "★OutCome 연결: …";
  assert.deepEqual(inspectionSummary(f), { verdict: "보완요청", needs: 1 });
  assert.ok(isVerdict("보완요청") && !isVerdict("보완") && !isVerdict(null));
  // 요약은 파생 값 — 점검표를 다시 읽으면 빠지고 저장할 때마다 다시 셈
  assert.equal("summary" in readResult({ ...f, summary: inspectionSummary(f) }), false);
});

// ---------------------------------------------------------------------------
// 경영관리 양식(mgmt13, 지침 13)

const guideMg = pdcaGuide("13-inspection-guide-mg.md");
const outFormMg = guideMg.slice(guideMg.indexOf('<출력구조 단위="과제 1개당'), guideMg.indexOf("[미흡 시 보완방안 칸 작성법]"));

test("경영관리 양식 고정: 세 표·체크리스트 머리·총평 주석이 지침 13 <출력구조> 문구와 글자까지 같고 주요사업 양식은 그대로", { skip: NO_PDCA_GUIDES }, () => {
  const lines = outFormMg.split("\n");
  for (const k of TABLE_KEYS) {
    const t = MGMT_FORM_TABLES[k];
    assert.ok(outFormMg.includes(`□ ${t.title}`), `제목 ${t.title}`);
    assert.ok(outFormMg.includes(`| 구분 | ${t.itemHeader} | 정의 | 판단 | 미흡 시 보완방안 |`), `머리 ${t.itemHeader}`);
    for (const r of t.rows) assert.ok(lines.some((l) => l.startsWith(`| ${r.no} | ${r.name} | ${r.definition} |`)), `${t.short} ${r.no} ${r.name}`);
  }
  assert.equal(lines.filter((l) => /^\| \d \|/.test(l)).length, TABLE_KEYS.reduce((n, k) => n + MGMT_FORM_TABLES[k].rows.length, 0));
  for (const o of OVERVIEW_ROWS) assert.ok(lines.some((l) => l.startsWith(`| ${o.label} |`)), o.label);
  assert.ok(outFormMg.includes(MGMT_CASE_FOOTNOTE));
  assert.ok(outFormMg.includes(`□ ${CHECKLIST_TITLE}`));
  assert.ok(outFormMg.includes(`| ${CHECKLIST_HEADERS.join(" | ")} |`));
  // 7대축·질의패턴은 주요사업과 같은 표, 정합성은 1·2·3 항목 이름과 다섯 행의 정의가 다름(4·5 항목 이름은 같음)
  assert.deepEqual(MGMT_FORM_TABLES.axes, FORM_TABLES.axes);
  assert.deepEqual(MGMT_FORM_TABLES.patterns, FORM_TABLES.patterns);
  const same = (key: "name" | "definition") => MGMT_FORM_TABLES.coherence.rows.map((r) => r[key] === FORM_TABLES.coherence.rows[r.no - 1][key]);
  assert.deepEqual(same("name"), [false, false, false, true, true], "항목 이름은 1·2·3만 다름");
  assert.deepEqual(same("definition"), [false, false, false, false, false], "정의는 다섯 행 모두 경영관리 카드 양식에 맞게 다름");
  assert.equal(formTablesOf(MGMT_FORM_ID), MGMT_FORM_TABLES);
  assert.equal(formTablesOf(FORM_ID), FORM_TABLES);
  assert.equal(formTablesOf("옛양식"), FORM_TABLES);
  assert.equal(caseFootnote(MGMT_FORM_ID), MGMT_CASE_FOOTNOTE);
  assert.equal(caseFootnote(FORM_ID), CASE_FOOTNOTE);
});

test("경영관리 점검표 읽기·정리: 양식은 호출한 쪽이 정하고, 체크리스트는 경영관리에만 있으며 주요사업 점검표 모양은 안 바뀜", () => {
  const biz = emptyResult();
  assert.equal(biz.form, "biz14");
  assert.equal("checklist" in biz, false, "주요사업 점검표에는 체크리스트 블록이 없음");
  const mg = emptyResult(MGMT_FORM_ID);
  assert.deepEqual([mg.form, mg.coherence.length, mg.checklist], ["mgmt13", 5, { sub: "", rows: [], others: 0 }]);
  assert.deepEqual(readResult(mg), mg, "경영관리 점검표는 읽어도 같음");
  assert.equal(readResult(mg).form, "mgmt13");
  assert.deepEqual(readResult({ ...biz, checklist: { rows: [{ label: "x" }] } }), biz, "주요사업 점검표에 끼어든 체크리스트는 버림");
  // 보낸 form 값은 믿지 않고 호출한 쪽이 정함
  assert.equal(cleanResult({ form: "biz14" }, MGMT_FORM_ID).form, "mgmt13");
  assert.equal(cleanResult({ form: "mgmt13" }).form, "biz14");
  const r = cleanResult(
    {
      checklist: {
        sub: " 전략기획 ",
        others: 3.9,
        rows: [
          { label: "지적 1", point: " 점검사항\n요지 ", result: "예", task: "1-1", note: "카드 근거" },
          { label: "①-2", point: "다른 점검사항", result: "이상한 값", task: "", note: "" },
          { label: "", point: "", result: "예" },
        ],
      },
    },
    MGMT_FORM_ID,
  );
  assert.deepEqual(r.checklist, {
    sub: "전략기획",
    others: 3,
    rows: [
      { label: "지적 1", point: "점검사항 요지", result: "예", task: "1-1", note: "카드 근거" },
      { label: "①-2", point: "다른 점검사항", result: null, task: "", note: "" },
    ],
  });
});

test("경영관리 집계: 정합성 항목 이름은 경영관리 양식으로, 체크리스트 대조는 충족 수·미흡·보완 건수·집중보완 어디에도 안 들어감", () => {
  const f = emptyResult(MGMT_FORM_ID);
  for (const k of TABLE_KEYS) f[k] = f[k].map(() => ({ judgment: "충족" as const, question: "", fix: "", evidence: [], card: "", note: "" }));
  f.overview.status = "과정 실적 단계";
  f.coherence[1] = weak();
  f.axes[3] = weak();
  f.patterns[4] = weak("질문?");
  f.checklist = { sub: "전략기획", others: 0, rows: [{ label: "지적 1", point: "a", result: "아니오", task: "—", note: "보완: x" }, { label: "지적 2", point: "b", result: null, task: "", note: "" }] };
  const t = tally(f);
  assert.deepEqual(t.tables.coherence.weak, ["지적↔개선방안 대응"], "주요사업 양식의 「전략 연계성」이 아니라 경영관리 양식 이름");
  assert.equal(t.needs, 3, "미흡 행 수 — 체크리스트 아니오는 안 셈");
  assert.deepEqual(t.stars.weak, ["7대축 4 OutCome 연결", "질의패턴 5 계량 수치의 함정"]);
  assert.equal(t.focus, true);
  assert.equal(rowLabel("coherence", 2, MGMT_FORM_ID), "정합성 2 지적↔개선방안 대응");
  assert.equal(rowLabel("coherence", 2), "정합성 2 전략 연계성");
  assert.equal(needsCount(f), 3);
  assert.equal(formRows(f, "coherence")[1].name, "지적↔개선방안 대응");
  assert.equal(formRows(f, "coherence")[1].judgment, "미흡");
  // 체크리스트에 결과 없는 행이 있으면 보내기만 막고 판정 상태에는 안 섞임
  const ok = emptyResult(MGMT_FORM_ID);
  for (const k of TABLE_KEYS) ok[k] = ok[k].map(() => ({ judgment: "충족" as const, question: "", fix: "", evidence: [], card: "", note: "" }));
  ok.overview.status = "과정 실적 단계";
  ok.checklist = f.checklist;
  assert.equal(judgeStatus(ok), "점검완료");
  assert.match(readyToSend(ok) ?? "", /자가진단 체크리스트 대조에서 결과를 정하지 않은 항목이 1개/);
  ok.checklist = { ...f.checklist!, rows: [f.checklist!.rows[0]] };
  assert.equal(readyToSend(ok), null);
});

test("체크리스트 표 위 한 줄: 위치 · 담당 범위 · 항목 수와 결과 건수 · 계획 포함 기준 · 나머지 항목 안내(지침 <출력구조>)", () => {
  const block = {
    sub: "전략기획",
    others: 2,
    rows: [
      { label: "지적 1", point: "a", result: "예" as const, task: "1-1", note: "" },
      { label: "지적 1", point: "b", result: "부분" as const, task: "1-1", note: "" },
      { label: "①-4", point: "c", result: "아니오" as const, task: "—", note: "" },
    ],
  };
  assert.deepEqual(checklistCounts(block), { total: 3, yes: 1, partial: 1, no: 1, na: 0, blank: 0 });
  assert.equal(checklistIntro(block), "붙임1 '26 자가진단 체크리스트 (전략기획) 중 지적 1 · ①-4 — 3개 항목: 예 1 · 부분 1 · 아니오 1 (카드에 계획이 있으면 실적이 없어도 '예'로 판단 / 나머지 2개 항목은 같은 지표의 다른 과제 점검표 참조)");
  const na = { ...block, others: 0, rows: [...block.rows, { label: "②-1", point: "d", result: "해당 없음" as const, task: "—", note: "붙임1 61쪽" }] };
  assert.match(checklistIntro(na), /예 1 · 부분 1 · 아니오 1 · 해당 없음 1 \(카드에 계획이 있으면 실적이 없어도 '예'로 판단\)$/);
  assert.match(checklistIntro(null), /0개 항목: 예 0 · 부분 0 · 아니오 0/);
});

test("내부관리형 보정(절대원칙 9): 충족·미흡 행에만 붙고 보완방안 칸 맨 앞에 「[내부관리형 보정]」", () => {
  const r = cleanResult({ axes: [{ judgment: "충족", internal: true }, { judgment: "해당 없음", internal: true, note: "사유" }, { judgment: "미흡", internal: true, fix: "f", card: "c", evidence: [{ source: "s", quote: "q" }] }], patterns: [{ judgment: "충족", internal: false }] }, MGMT_FORM_ID);
  assert.equal(r.axes[0].internal, true);
  assert.equal("internal" in r.axes[1], false, "해당 없음에는 안 붙음");
  assert.equal(r.axes[2].internal, true);
  assert.equal("internal" in r.patterns[0], false);
  assert.equal(remedyText("axes", r.axes[0]), `— ${INTERNAL_TAG}`);
  assert.equal(remedyText("axes", { ...r.axes[0], note: "메모" }), `— (메모) ${INTERNAL_TAG}`);
  assert.equal(remedyText("axes", r.axes[2]).split("\n")[0], INTERNAL_TAG);
  assert.match(remedyText("axes", r.axes[2]), /\n▸ 보완: f\n▸ 근거: s 「q」\n▸ 카드: c$/);
  // 보정이 없는 행은 예전 글 그대로
  assert.equal(remedyText("axes", { ...emptyRow(), judgment: "충족" }), "—");
});

test("inspectionWriteBlock(2026-10-10 개선 계획 P1-2): 초안은 저장·보내기, 보낸 점검표는 보내기 취소만, 확인한 점검표는 아무것도 — 예전에는 보낸 점검표를 저장하면 조용히 초안으로 돌아갔음", async () => {
  const { inspectionWriteBlock } = await import("./model.ts");
  for (const intent of ["save", "send", "unsend"] as const) assert.equal(inspectionWriteBlock(null, intent), null, `새 점검표 ${intent}`);
  assert.equal(inspectionWriteBlock("draft", "save"), null);
  assert.equal(inspectionWriteBlock("draft", "send"), null);
  assert.match(inspectionWriteBlock("sent", "save") ?? "", /보내기를 취소한 뒤/);
  assert.match(inspectionWriteBlock("sent", "send") ?? "", /보내기를 취소한 뒤/);
  assert.equal(inspectionWriteBlock("sent", "unsend"), null);
  for (const intent of ["save", "send", "unsend"] as const) assert.match(inspectionWriteBlock("acknowledged", intent) ?? "", /확인한 점검표/);
});

test("주요사업 연계 후보(경영관리 미흡 행 — 2026-10-12 붙임4 대체): 저장·읽기에서 미흡 행에만·번호 형식만·행당 2건, 옛 점검표(links 없음)는 그대로 읽힘, 보완방안 칸 끝에 「▸ 연계 후보」", () => {
  const old = emptyResult(MGMT_FORM_ID);
  old.axes[3] = { judgment: "미흡", question: "", fix: "f", evidence: [{ source: "s", quote: "q", key: null, verified: null }], card: "c", note: "" };
  const back = readResult(JSON.parse(JSON.stringify(old)));
  assert.deepEqual(back, old, "links가 없는 옛 점검표는 바뀌지 않음");
  assert.equal("links" in back.axes[3], false);
  const l = (id: string, gist = "요지") => ({ id, title: "과제명", gist, asOf: "’26.9.16. 판(그 뒤 원장 수정 없음)" });
  const raw = { ...old, axes: old.axes.map((r, i) => (i === 3 ? { ...r, links: [l("주요사업2 3-라", "요지\n둘째 줄"), l("주요사업2 3-라"), l("잘못된 번호"), l("주요사업1 1-가"), l("주요사업3 6-나")] } : i === 0 ? { ...emptyRow(), judgment: "충족", links: [l("주요사업1 1-가")] } : r)) };
  const r = cleanResult(raw, MGMT_FORM_ID);
  assert.deepEqual(
    r.axes[3].links?.map((x) => [x.id, x.gist]),
    [
      ["주요사업2 3-라", "요지 둘째 줄"],
      ["주요사업1 1-가", "요지"],
    ],
  );
  assert.equal("links" in r.axes[0], false, "충족 행에는 연계 후보가 없음");
  const remedy = remedyText("axes", r.axes[3]).split("\n");
  assert.equal(remedy.at(-1), "▸ 연계 후보: 주요사업1 1-가 「과제명」 — 요지 [원장 ’26.9.16. 판(그 뒤 원장 수정 없음)], 담당부서 협의 후 경영관리 관점으로 재서술 검토");
  assert.equal(remedy.at(-2), linkText(r.axes[3].links![0]));
  assert.equal(remedy[remedy.length - 3], "▸ 카드: c", "연계 후보는 ▸ 카드 뒤(지침: 맨 끝)");
  assert.equal(tally(r).needs, 1);
  assert.equal(judgeStatus(r), judgeStatus(cleanResult(old, MGMT_FORM_ID)), "연계 후보는 판정 상태에 영향 없음");
});
