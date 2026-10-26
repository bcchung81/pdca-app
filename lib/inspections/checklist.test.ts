import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { type ChecklistAnswer, type ChecklistRef, buildChecklist, checklistItems, checklistItemsBlock, circled, shortPoint } from "./checklist.ts";

const ROOT = resolve(import.meta.dirname, "../..");

const issues: ChecklistRef = {
  key: "k/issues",
  unitType: "checklist_group",
  meta: { kind: "issues", issue_numbers: [1, 2, 4] },
  text: "1. 지적 하나\n줄바꿈이 있는 문장\n\n2. 지적 둘\n\n4. 번호가 건너뛴 지적",
};
const sd1: ChecklistRef = {
  key: "k/sd1g2",
  unitType: "checklist_group",
  meta: { kind: "sd_group", sd_no: 1, group_label: "2. 비전과 핵심가치 설정의 적절성" },
  text: "점검사항 가\n\n점검사항 나 <태그> & \"따옴표\"",
};
const sd2: ChecklistRef = { key: "k/sd2g1", unitType: "checklist_group", meta: { kind: "sd_group", sd_no: 2, group_label: "1. 사업 구조" }, text: "점검사항 다" };

test("항목 뽑기: 지적은 「지적 N」(원문 번호), 착안사항은 「①-구분 번호」, 순서·id는 조각 순서대로 이어서 붙음", () => {
  const items = checklistItems([issues, { key: "x", unitType: "evaluator_comment", text: "무시" }, sd1, sd2]);
  assert.deepEqual(
    items.map((i) => [i.id, i.label, i.group, i.key]),
    [
      ["c1", "지적 1", "", "k/issues"],
      ["c2", "지적 2", "", "k/issues"],
      ["c3", "지적 4", "", "k/issues"],
      ["c4", "①-2", "비전과 핵심가치 설정의 적절성", "k/sd1g2"],
      ["c5", "①-2", "비전과 핵심가치 설정의 적절성", "k/sd1g2"],
      ["c6", "②-1", "사업 구조", "k/sd2g1"],
    ],
  );
  assert.equal(items[0].text, "지적 하나 줄바꿈이 있는 문장", "공백·줄바꿈 정리, 번호 머리는 뗌");
  assert.equal(items[2].label, "지적 4", "번호가 건너뛰어도 원문 번호를 그대로");
  assert.deepEqual(checklistItems([]), []);
  assert.equal(circled(1), "①");
  assert.equal(circled(10), "⑩");
  assert.equal(circled(21), "(21)");
});

test("요청 글 항목 목록: id·구분·구분 이름과 원문, 태그 기호는 이스케이프", () => {
  const block = checklistItemsBlock(checklistItems([issues, sd1]));
  assert.match(block, /^<item id="c1" label="지적 1">지적 하나 줄바꿈이 있는 문장<\/item>$/m);
  assert.match(block, /<item id="c4" label="①-2" group="비전과 핵심가치 설정의 적절성">점검사항 가<\/item>/);
  assert.match(block, /점검사항 나 &lt;태그&gt; &amp; &quot;따옴표&quot;/);
  assert.equal(checklistItemsBlock([]), "(제공된 체크리스트 항목 없음)");
});

test("답 → 점검표 블록: 소관 아닌 항목·빠진 항목은 나머지로 세고, 순서·구분은 코드가 정하며, 요지가 비면 원문을 줄여 씀", () => {
  const items = checklistItems([issues, sd1, sd2]);
  const answers: ChecklistAnswer[] = [
    { id: "c4", mine: true, point: "  요지   나  ", result: "아니오", task: "", note: "보완: '추진내용' 칸에 추가" },
    { id: "c1", mine: true, point: "", result: "예", task: "1-1", note: "카드 근거 한 줄" },
    { id: "c1", mine: true, point: "중복", result: "아니오", task: "", note: "" }, // 같은 id 둘째 답은 무시
    { id: "c2", mine: false, point: "x", result: "예", task: "", note: "" },
    { id: "c9", mine: true, point: "없는 항목", result: "예", task: "", note: "" }, // 모르는 id
    { id: "c3", mine: true, point: "p", result: "이상한 값" as never, task: "—", note: "" },
  ];
  const { block, missing } = buildChecklist(items, answers, "전략기획");
  assert.deepEqual(
    block.rows.map((r) => [r.label, r.point, r.result, r.task, r.note]),
    [
      ["지적 1", "지적 하나 줄바꿈이 있는 문장", "예", "1-1", "카드 근거 한 줄"],
      ["지적 4", "p", null, "—", ""],
      ["①-2", "요지 나", "아니오", "—", "보완: '추진내용' 칸에 추가"],
    ],
  );
  assert.equal(block.sub, "전략기획");
  assert.equal(missing, 2, "c5·c6은 답이 없음");
  assert.equal(block.others, 3, "총 6개 중 이 과제 3개 — 나머지 3개(소관 아님 1 + 빠짐 2)");
});

test("요지 줄이기: 90자 넘으면 …", () => {
  assert.equal(shortPoint("가".repeat(90)), "가".repeat(90));
  const long = shortPoint("가".repeat(200));
  assert.equal(long.length, 90);
  assert.ok(long.endsWith("…"));
});

// --- 실제 적재 산출물(원본이 이 컴퓨터에 있을 때만) ---
const REAL = join(ROOT, "resources/knowledge/_chunks/plan-2607.jsonl");

test("실제 체크리스트 조각: 14개 지표 모두 항목이 뽑히고 개수가 조각의 블록 수 합과 같으며 구분이 비지 않음", { skip: !existsSync(REAL) && "원본 산출물이 없음" }, () => {
  const chunks = readFileSync(REAL, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((c) => c.track === "경영관리" && c.unit_type === "checklist_group");
  for (let n = 1; n <= 14; n++) {
    const mine = chunks.filter((c) => c.business === `MG-${n}`).sort((a, b) => a.seq - b.seq);
    const items = checklistItems(mine.map((c) => ({ key: c.chunk_key, unitType: c.unit_type, text: c.text, meta: c.meta })));
    assert.equal(items.length, mine.reduce((s, c) => s + c.blocks.length, 0), `MG-${n} 항목 수`);
    assert.ok(items.length > 0 && items.every((i) => i.label && i.text), `MG-${n} 구분·글`);
    assert.ok(items.some((i) => i.label.startsWith("지적")), `MG-${n} 지적 항목`);
  }
});
