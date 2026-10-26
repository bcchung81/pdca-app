import assert from "node:assert/strict";
import { test } from "node:test";
import { applyText, getAt, insertLineAfter } from "./edit.ts";
import { canonicalJson } from "./fixed.ts";
import { type CommentBatch, type EditTarget, type TaggedEdit, applyEdits, containerOf, editTargets, mergeEdits, toggleComment, valueAt } from "./patch.ts";
import { pathLabel, sectionTitle } from "./path-label.ts";
import { renderCard } from "./render.ts";
import { NO_SEED_CARDS, seedCards } from "../testing/originals.ts";

const cards = seedCards();
const card = cards.find((c) => c.id === "주요사업1/1-가")!;
const targets = card ? editTargets(card) : new Map<string, EditTarget>();

test("편집 칸 목록: 모든 카드에서 data-p와 같고, 글줄·칸·잠김을 가림", { skip: NO_SEED_CARDS }, () => {
  for (const c of cards) {
    const html = renderCard(c, { editable: true });
    const paths = [...html.matchAll(/ data-p="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual([...editTargets(c).keys()], paths, c.id);
  }
  assert.equal(targets.get("plan.lines.0")?.line, true);
  assert.equal(targets.get("overview.cells.0")?.line, false);
  assert.equal(targets.get("kpi.headers.name")?.line, false);
  assert.equal(targets.get("axAttachments.0.purpose~.0")?.line, true);
  const locked = editTargets(card, ["plan", "kpi"]);
  assert.equal(locked.get("plan.lines.0")?.locked, true);
  assert.equal(locked.get("kpi.rows.0.nameRaw")?.locked, true);
  assert.equal(locked.get("do.lines.0")?.locked, false);
});

test("묶음: 글줄은 가장 바깥 줄 목록, 표 안 줄도 바깥 목록, 칸은 그 칸", { skip: NO_SEED_CARDS }, () => {
  assert.equal(containerOf(card, "plan.lines.2", targets.get("plan.lines.2")), "plan.lines");
  assert.equal(containerOf(card, "do.monthly.0.items.1", targets.get("do.monthly.0.items.1")), "do.monthly.0.items");
  assert.equal(containerOf(card, "axAttachments.0.purpose~.0", targets.get("axAttachments.0.purpose~.0")), "axAttachments.0.purpose");
  assert.equal(containerOf(card, "overview.cells.4", targets.get("overview.cells.4")), "overview.cells.4");
  const withTable = cards.find((x) => x.id === "주요사업1/1-라")!;
  const t2 = editTargets(withTable);
  const inner = [...t2.keys()].find((p) => p.startsWith("do.lines.") && p.includes(".table."));
  assert.ok(inner, "표 안 글줄이 있음");
  assert.equal(containerOf(withTable, inner!, t2.get(inner!)), "do.lines");
  const grid = cards.find((x) => x.plan.grid)!;
  const tg = editTargets(grid);
  const gp = [...tg.keys()].find((p) => p.startsWith("plan.grid."))!;
  assert.match(containerOf(grid, gp, tg.get(gp)), /^plan\.grid\.rows\.\d+\.\d+\.lines$/);
});

test("한꺼번에 적용: 경로는 적용 전 기준 — 앞 줄 넣기·지우기가 뒤 줄 번호를 밀지 않음", { skip: NO_SEED_CARDS }, () => {
  const edits = [
    { path: "plan.lines.0", op: "insert_after" as const, lines: ["∙ 새 둘째 줄"] },
    { path: "plan.lines.1", op: "delete" as const, lines: [] },
    { path: "plan.lines.2", op: "replace" as const, lines: ["★ (지속가능 여부) 고친 줄", "→ 이어 넣은 줄"] },
  ];
  const after = applyEdits(card, edits, targets);
  assert.deepEqual(after.plan.lines, [card.plan.lines[0], "∙ 새 둘째 줄", "★ (지속가능 여부) 고친 줄", "→ 이어 넣은 줄"]);
  assert.deepEqual(card.plan.lines.length, 3, "원본은 그대로");
  // 칸: 여러 줄은 한 칸 글로, 계량지표 칸은 줄바꿈 유지, 넣기·지우기는 무시
  const cells = applyEdits(
    card,
    [
      { path: "overview.cells.5", op: "replace", lines: ["과제 투입인력 : 3명(본사),", "150명(지방본부)"] },
      { path: "kpi.rows.0.formula", op: "replace", lines: ["첫 줄", "둘째 줄"] },
      { path: "overview.cells.0", op: "delete", lines: [] },
      { path: "@person", op: "replace", lines: ["홍길동 팀장 / 김철수 차장"] },
    ],
    targets,
  );
  assert.equal(cells.overview.cells[5], "과제 투입인력 : 3명(본사), 150명(지방본부)");
  assert.equal(cells.kpi.rows[0].formula, "첫 줄\n둘째 줄");
  assert.equal(cells.overview.cells[0], card.overview.cells[0]);
  assert.deepEqual([cells.manager, cells.writer], ["홍길동 팀장", "김철수 차장"]);
  // 여러 줄 글(AX 과제 목적)의 줄 조작
  const ax = applyEdits(card, [{ path: "axAttachments.0.purpose~.0", op: "insert_after", lines: ["- 덧붙인 목적"] }], targets);
  assert.equal(String(ax.axAttachments[0].purpose).split("\n")[1], "- 덧붙인 목적");
  // 잠긴 칸·없는 경로는 건드리지 않음
  const lockedT = editTargets(card, ["plan"]);
  assert.equal(canonicalJson(applyEdits(card, [{ path: "plan.lines.0", op: "replace", lines: ["x"] }, { path: "nope.0", op: "replace", lines: ["y"] }], lockedT)), canonicalJson(card));
});

const tag = (commentId: string, e: { path: string; op: "replace" | "insert_after" | "delete"; lines: string[] }): TaggedEdit => ({ commentId, ...e });

test("합치기: 기다리는 동안 사용자가 고친 묶음은 두고 충돌로, 나머지는 반영", { skip: NO_SEED_CARDS }, () => {
  const snapshot = card;
  // 보낸 뒤 사용자가 Plan 첫 줄을 고침
  const current = applyText(card, "plan.lines.0", "∙ 사용자가 고친 계획");
  const edits = [tag("a", { path: "plan.lines.1", op: "replace", lines: ["→ AI가 고친 줄"] }), tag("b", { path: "check.items.0", op: "replace", lines: ["∙ (장애 또는 리스크 요인) AI가 고친 리스크"] })];
  const r = mergeEdits(current, snapshot, edits, targets);
  assert.deepEqual(r.conflicts, { a: ["plan.lines"] });
  assert.deepEqual(r.applied, { b: ["check.items"] });
  assert.equal(r.card.plan.lines[0], "∙ 사용자가 고친 계획", "사용자 글 유지");
  assert.equal(r.card.plan.lines[1], card.plan.lines[1], "충돌 묶음은 그대로");
  assert.equal(r.card.check.items[0], "∙ (장애 또는 리스크 요인) AI가 고친 리스크");
  // 다른 묶음을 고쳤으면 그대로 합쳐짐(사용자가 Do에 줄을 넣어도 Plan 반영)
  const cur2 = insertLineAfter(card, "do.lines.0", "∙ 사용자 줄").card;
  const r2 = mergeEdits(cur2, snapshot, [edits[0]], targets);
  assert.deepEqual(r2.applied, { a: ["plan.lines"] });
  assert.equal(r2.card.do.lines[1], "∙ 사용자 줄");
  assert.equal(r2.card.plan.lines[1], "→ AI가 고친 줄");
});

test("코멘트별 되돌리기·다시 반영: 같은 묶음을 함께 고친 코멘트도 제 몫만, 그 뒤 고친 곳은 막음", { skip: NO_SEED_CARDS }, () => {
  const edits = [
    tag("a", { path: "plan.lines.0", op: "replace", lines: ["∙ A가 고친 첫 줄"] }),
    tag("b", { path: "plan.lines.2", op: "insert_after", lines: ["→ B가 넣은 줄"] }),
    tag("c", { path: "outcome.quantitative.0", op: "replace", lines: ["∙ C가 고친 성과"] }),
  ];
  const m = mergeEdits(card, card, edits, targets);
  const batch: CommentBatch = { snapshot: card, edits, targets, state: Object.fromEntries(Object.entries(m.applied).map(([id, containers]) => [id, { containers, applied: true }])) };
  assert.deepEqual(m.card.plan.lines, ["∙ A가 고친 첫 줄", card.plan.lines[1], card.plan.lines[2], "→ B가 넣은 줄"]);
  // A만 되돌리면 B의 줄은 남음
  const undoA = toggleComment(m.card, batch, "a", false);
  assert.ok(undoA.ok);
  if (!undoA.ok) return;
  assert.deepEqual(undoA.card.plan.lines, [...card.plan.lines, "→ B가 넣은 줄"]);
  batch.state.a.applied = false;
  // 다시 반영
  const redoA = toggleComment(undoA.card, batch, "a", true);
  assert.ok(redoA.ok && redoA.card.plan.lines[0] === "∙ A가 고친 첫 줄");
  batch.state.a.applied = true;
  // 그 뒤 사용자가 Plan을 또 고치면 A·B 되돌리기는 막히고, C(다른 묶음)는 됨
  const edited = applyText(m.card, "plan.lines.1", "→ 사용자 수정");
  const blocked = toggleComment(edited, batch, "b", false);
  assert.deepEqual(blocked, { ok: false, blocked: ["plan.lines"] });
  const undoC = toggleComment(edited, batch, "c", false);
  assert.ok(undoC.ok && undoC.card.outcome.quantitative[0] === card.outcome.quantitative[0]);
});

test("자리 이름: 경로를 사람이 읽는 말로", { skip: NO_SEED_CARDS }, () => {
  assert.equal(pathLabel("plan.lines.2"), "[Plan] 3번째 줄");
  assert.equal(pathLabel("do.monthly.0.items.1", card), "[Do] 월별 실적(1월~8월) · 2번째 줄");
  assert.equal(pathLabel("kpi.rows.0.target"), "계량 성과지표 · 1행 ’26년 목표");
  assert.equal(pathLabel("do.lines.3.table.rows.0.1.lines.2"), "[Do] 표 1행 2칸 · 3번째 줄");
  assert.equal(pathLabel("axAttachments.0.purpose~.1"), "AX 붙임 1 · 과제 목적 · 2번째 줄");
  assert.equal(pathLabel("@person"), "관리자/작성자");
  assert.equal(pathLabel(null), "카드 전체");
  assert.equal(sectionTitle("do.monthly.0.items.0", card), "[Do] 월별 실적 — 1월~8월");
  // 모든 카드의 모든 편집 칸이 경로 그대로 남지 않고 이름을 가짐
  for (const c of cards) for (const p of editTargets(c).keys()) assert.notEqual(pathLabel(p, c), p, `${c.id} ${p}`);
  assert.equal(valueAt(card, "@person"), `${card.manager}${card.writer ? ` / ${card.writer}` : ""}`);
  assert.equal(getAt(card, "plan.lines.0"), valueAt(card, "plan.lines.0"));
});
