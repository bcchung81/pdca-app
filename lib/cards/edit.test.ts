import assert from "node:assert/strict";
import { test } from "node:test";
import { addMonthly, applyText, checkEditable, deleteLine, deletePairRow, getAt, insertLineAfter, insertPairRow, pairRowOf, recomputeDerived, toggleBox } from "./edit.ts";
import { renderMgmtCard } from "./render-mgmt.ts";
import { renderCard } from "./render.ts";
import { NO_SEED_CARDS, seedCards } from "../testing/originals.ts";

const cards = seedCards();
const card = cards.find((c) => c.id === "주요사업1/1-가")!;

test("글 고치기: 제목·관리자/작성자·글줄·중첩 표 글줄", { skip: NO_SEED_CARDS }, () => {
  let c = applyText(card, "title", "  새 과제명\n");
  assert.equal(c.title, "새 과제명");
  assert.equal(card.title, "AI 기반 안테나 자동판독 전국 확산을 통한 무선국 검사 안전·효율 혁신", "원본은 그대로");
  c = applyText(c, "@person", "홍길동 팀장 / 김철수 차장");
  assert.deepEqual([c.manager, c.writer], ["홍길동 팀장", "김철수 차장"]);
  c = applyText(c, "plan.lines.0", "∙ 고친 계획");
  assert.equal(c.plan.lines[0], "∙ 고친 계획");
  const withTable = cards.find((x) => x.do.lines?.some((l: unknown) => typeof l === "object"));
  const ti = withTable.do.lines.findIndex((l: unknown) => typeof l === "object");
  const p = `do.lines.${ti}.table.rows.0.0.lines.0`;
  if (typeof getAt(withTable, p) === "string") {
    const t = applyText(withTable, p, "표 안 글");
    assert.equal(getAt(t, p), "표 안 글");
  }
});

test("계량지표 이름(단위)·월별 기간 다시 나누기", { skip: NO_SEED_CARDS }, () => {
  let c = applyText(card, "kpi.rows.0.nameRaw", "AI 대체 건수(건)");
  assert.deepEqual([c.kpi.rows[0].name, c.kpi.rows[0].unit], ["AI 대체 건수", "건"]);
  c = applyText(c, "do.monthly.0.period", "7월~9월");
  assert.deepEqual(c.do.monthly[0].periodTokens, ["7월", "~", "9월"]);
});

test("줄 추가·삭제와 초점 경로", { skip: NO_SEED_CARDS }, () => {
  const ins = insertLineAfter(card, "plan.lines.0", "∙ 새 줄");
  assert.equal(ins.path, "plan.lines.1");
  assert.equal(ins.card.plan.lines[1], "∙ 새 줄");
  const del = deleteLine(ins.card, "plan.lines.1");
  assert.equal(del.focus, "plan.lines.0");
  assert.deepEqual(del.card.plan.lines, card.plan.lines);
  const empty = insertLineAfter({ ...card, act: { ...card.act, selfAssessment: [] } }, "act.selfAssessment.0", "∙ 첫 줄");
  assert.equal(empty.card.act.selfAssessment[0], "∙ 첫 줄");
  assert.equal(empty.path, "act.selfAssessment.0", "빈 목록이면 첫 줄로 초점");
});

test("체크 상자 토글과 파생값", { skip: NO_SEED_CARDS }, () => {
  const i = card.overview.cells.findIndex((t: string) => t.includes("신규과제"));
  let c = toggleBox(card, `overview.cells.${i}#0`);
  assert.ok(c.overview.cells[i].startsWith("☑"));
  c = recomputeDerived(c);
  assert.equal(c.overview.checks.new, true);
  c = toggleBox(c, "strategy.ai.checked");
  assert.equal(c.strategy.ai.checked, !card.strategy.ai.checked);
});

test("월별 실적 추가 후에도 원본 양식으로 그려짐", { skip: NO_SEED_CARDS }, () => {
  const { card: c, path } = addMonthly(card, "9월");
  assert.equal(path, `do.monthly.${card.do.monthly.length}.items.0`);
  const html = renderCard(c);
  assert.ok(html.includes('aria-label="9월 추진 실적"'));
});

test("저장 전 확인", { skip: NO_SEED_CARDS }, () => {
  assert.equal(checkEditable(card, applyText(card, "title", "x")), null);
  assert.match(checkEditable(card, { ...card, taskNo: "9-가" })!, /taskNo/);
  assert.match(checkEditable(card, { ...card, title: " " })!, /과제명/);
});

test("AI 제안 반영: 줄 바꾸기+이어 넣기, 뒤에 넣기, 월별 상자, 단일 칸", { skip: NO_SEED_CARDS }, async () => {
  const { applySuggestion } = await import("./edit.ts");
  let r = applySuggestion(card, { kind: "replace", targetPath: "plan.lines.0", period: null, proposed: ["∙ 가", "- 나"] });
  assert.deepEqual(r.card.plan.lines.slice(0, 2), ["∙ 가", "- 나"]);
  assert.equal(r.card.plan.lines.length, card.plan.lines.length + 1);
  assert.equal(r.focus, "plan.lines.1");
  r = applySuggestion(card, { kind: "insert_after", targetPath: "check.items.0", period: null, proposed: ["∙ 새 점검"] });
  assert.equal(r.card.check.items[1], "∙ 새 점검");
  r = applySuggestion(card, { kind: "monthly", targetPath: null, period: "9월", proposed: ["∙ 9월 실적", "- 세부"] });
  const m = r.card.do.monthly.at(-1);
  assert.deepEqual([m.period, m.items], ["9월", ["∙ 9월 실적", "- 세부"]]);
  r = applySuggestion(card, { kind: "replace", targetPath: "title", period: null, proposed: ["새 제목"] });
  assert.equal(r.card.title, "새 제목");
});

test("머리행·과제 구분·계량 구분·ESG·국정과제 배지·AX 항목 제목도 편집 경로가 있고, 고치면 원본 양식에 그대로 나옴", { skip: NO_SEED_CARDS }, () => {
  const c = cards.find((x) => x.id === "주요사업1/1-가")!;
  const html = renderCard(c, { editable: true });
  for (const p of ["kpi.headers.name", "kpi.headers.target", "strategy.headers.national", "strategy.headers.ai", "act.headers.findings", "outcome.headers.qualitative", "overview.cells.0", "kpi.categoriesText", "strategy.esgText", "strategy.nationalAgenda.0.badges.0", "axAttachments.0.sections.0.heading"])
    assert.ok(html.includes(`data-p="${p}" contenteditable`), p);
  // 과제번호·양식 라벨은 잠김 + 까닭
  assert.ok(/class="kc-tno" data-fixed="1" title="과제번호는/.test(html));
  assert.ok(/class="kc-k" rowspan="2" data-fixed="1"/.test(html));
  let d = applyText(c, "strategy.headers.national", "국정과제 연계성(정부정책)");
  d = applyText(d, "kpi.headers.target", "’26년 목표치");
  d = applyText(d, "act.headers.findings", "중간보고서 지적사항");
  d = applyText(d, "strategy.nationalAgenda.0.badges.0", "#22");
  d = applyText(d, "overview.cells.0", "☑ 고도화과제(기존 과제 확대)");
  const view = renderCard(d);
  for (const t of ["국정과제 연계성(정부정책)", "’26년 목표치", "중간보고서 지적사항", "#22", "고도화과제</b>(기존 과제 확대)"]) assert.ok(view.includes(t), t);
  // 머리 글자를 적지 않은 카드는 보기 출력이 원본과 같음(바이트 일치 테스트가 59장 모두 지킴)
  assert.ok(renderCard(c).includes("국정과제(정부정책) 연계성"));
});

test("경영관리 짝 칸 표(지적 및 개선방안·전년도 환류) 행 추가·삭제: 빈 행은 두 칸 빈 목록, 편집 칸 글 = JSON, 마지막 행은 지우지 않고 비움", () => {
  const mg = {
    id: "경영관리1/1-1",
    group: "경영관리1",
    taskNo: "1-1",
    title: "시험 과제",
    feedback: { rows: [{ self: ["∙ 자체평가"], plan: ["∙ 개선"] }], headers: { self: "’25년 자체평가", plan: "’26년 개선방안" } },
    findings: { rows: [{ finding: ["∙ 지적 가"], plan: ["∙ 개선 가"] }, { finding: ["∙ 지적 나"], plan: ["∙ 개선 나"] }], headers: { finding: "’25년 지적사항", plan: "’26년 개선방안" } },
    overview: { cells: [] },
    do: { lines: [], monthly: [] },
    kpi: { rows: [] },
    outcome: { quantitative: [], qualitative: [] },
  };
  assert.deepEqual(pairRowOf("findings.rows.1.plan.0"), { key: "findings", row: 1 });
  assert.deepEqual(pairRowOf("feedback.rows.0.self.2"), { key: "feedback", row: 0 });
  assert.equal(pairRowOf("findings.headers.plan"), null);
  assert.equal(pairRowOf("do.lines.0"), null);

  // 1행 아래에 추가 → 새 2행(가운데), 원본은 그대로
  const add = insertPairRow(mg, "findings", 0);
  assert.equal(add.path, "findings.rows.1.finding.0");
  assert.deepEqual(add.card.findings.rows.map((r: { finding: string[] }) => r.finding), [["∙ 지적 가"], [], ["∙ 지적 나"]]);
  assert.deepEqual(add.card.findings.rows[1], { finding: [], plan: [] });
  assert.equal(mg.findings.rows.length, 2, "원본 카드는 그대로");
  assert.equal(insertPairRow(mg, "findings", -1).card.findings.rows[0].finding.length, 0, "-1이면 맨 앞");
  assert.equal(insertPairRow(mg, "feedback", 0).path, "feedback.rows.1.self.0");
  // 편집 칸 규칙: 빈 행의 칸은 빈 첫 줄(data-empty) 하나, 글을 치면 그 줄이 생김
  const html = renderMgmtCard(add.card, { editable: true });
  assert.match(html, /<p class="kc-ln kc-plain" data-empty="1" data-p="findings\.rows\.1\.finding\.0"[^>]*><\/p>/);
  assert.match(html, /data-p="findings\.rows\.1\.plan\.0"/);
  const typed = applyText(add.card, "findings.rows.1.finding.0", "∙ 새 지적");
  assert.deepEqual(typed.findings.rows[1], { finding: ["∙ 새 지적"], plan: [] });
  assert.equal(checkEditable(mg, typed), null, "구역 구조 유지");

  // 삭제: 그 행만 빠지고 초점은 앞 행
  const del = deletePairRow(typed, "findings", 1);
  assert.deepEqual(del.card.findings.rows.map((r: { finding: string[] }) => r.finding), [["∙ 지적 가"], ["∙ 지적 나"]]);
  assert.equal(del.focus, "findings.rows.0.finding.0");
  assert.equal(deletePairRow(mg, "findings", 0).focus, "findings.rows.0.finding.0", "첫 행이면 새 첫 행");
  assert.equal(deletePairRow(mg, "findings", 5).focus, null, "없는 행");
  // 마지막 한 행: 지우지 않고 두 칸을 비움(0행이 되지 않음)
  const one = deletePairRow(mg, "feedback", 0).card;
  assert.deepEqual(one.feedback.rows, [{ self: [], plan: [] }]);
  assert.deepEqual(one.feedback.headers, mg.feedback.headers, "머리 그대로");
});
