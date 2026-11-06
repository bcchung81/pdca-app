// 과제별 초안 「AI 초안」 대화(lib/reports/draft-thread.ts): 저장된 값으로 만든 차례 순서·답 글, 할 일 묶음, 판면 한 마디, 머리 상태
import assert from "node:assert/strict";
import { test } from "node:test";
import { THREAD_EDIT_MAX, type ThreadDraftIn, type ThreadEditIn, type ThreadOutlineIn, draftThread, draftTodo, fitWord, threadStatus } from "./draft-thread.ts";
import { LINE_MM } from "./fit.ts";

const outline = (o: Partial<ThreadOutlineIn> = {}): ThreadOutlineIn => ({
  at: "2026-11-01T01:00:00Z",
  approved: false,
  approvedAt: null,
  story: "AX 전환형",
  blocks: 6,
  parts: [],
  fit: { total: 252, budget: 255 },
  module: 1,
  message: "핵심 메시지",
  points: [{ tag: "편람", text: "논점" }],
  needs: ["9월 실적 결과보고"],
  frame: "",
  memo: "",
  ...o,
});
const draft = (o: Partial<ThreadDraftIn> = {}): ThreadDraftIn => ({ updatedAt: "2026-11-02T01:00:00Z", plan: true, fit: { total: 127, budget: 127 }, module: 0.5, stale: false, ...o });
const edit = (id: number, at: string, o: Partial<ThreadEditIn> = {}): ThreadEditIn => ({ id, blockIndex: 2, kind: "edit", request: "더 짧게", at, refId: null, ...o });
const kinds = (ts: ReturnType<typeof draftThread>) => ts.map((t) => (t.kind === "edit" ? `edit:${t.key}` : t.kind));

test("fitWord: 판정은 fitVerdict(95~102% 맞음) 그대로, mm 대신 한 마디 — 빈 곳은 줄 수", () => {
  assert.equal(fitWord({ total: 252, budget: 255 }, 1)?.text, "1쪽에 맞음");
  assert.equal(fitWord({ total: 127, budget: 127 }, 0.5)?.text, "0.5쪽에 맞음");
  const gap = 255 - 200;
  assert.equal(fitWord({ total: 200, budget: 255 }, 1)?.text, `${Math.round(gap / LINE_MM)}줄쯤 빔`);
  assert.equal(fitWord({ total: 262, budget: 255 }, 1)?.text, "조금 넘침");
  assert.equal(fitWord({ total: 280, budget: 255 }, 1)?.text, "넘침");
  assert.equal(fitWord({ total: 280, budget: 255 }, 1)?.tone, "alert");
  assert.match(fitWord({ total: 252, budget: 255 }, 1)!.title, /판면 어림 99%/);
  assert.equal(fitWord(null, 1), null, "예산이 없으면(경영관리) 한 마디 없음");
  assert.equal(fitWord({ total: 0, budget: 0 }, 1), null);
});

test("draftThread: 아무것도 없으면 빈 대화 · 구성안만 있으면 구성안 한 차례(요약 한 줄)", () => {
  assert.deepEqual(draftThread({ outline: null, draft: null, edits: [] }), []);
  const ts = draftThread({ outline: outline({ frame: "이야기 틀 AX 전환형", memo: "지적 해소를 앞에" }), draft: null, edits: [] });
  assert.equal(ts.length, 1);
  const t = ts[0];
  assert.equal(t.kind, "outline");
  if (t.kind !== "outline") return;
  assert.equal(t.headline, "구성안을 만들었어요");
  assert.equal(t.summary, "AX 전환형 · 블록 6 · 1쪽에 맞음");
  assert.deepEqual(t.askLines, ["짜임: 이야기 틀 AX 전환형", "지적 해소를 앞에"]);
  assert.equal(t.at, "2026-11-01T01:00:00Z");
});

test("draftThread: 경영관리 구성안은 절 수로 요약하고 판면 한 마디 없음", () => {
  const ts = draftThread({ outline: outline({ story: "", fit: null, parts: [{ name: "평가내용 1 · 대주제 1 · 가. 제목", story: "문제·해결형" }, { name: "평가내용 1 · 대주제 2", story: "기존·개선형" }] }), draft: null, edits: [] });
  const t = ts[0];
  assert.ok(t.kind === "outline" && t.summary === "절 2 · 블록 6" && t.fit === null && t.parts.length === 2);
});

test("draftThread: 승인된 구성안 → 구성안대로 쓴 초안 → 그 뒤 블록 고치기(직접 고침·그 되돌리기는 뺌)", () => {
  const ts = draftThread({
    outline: outline({ approved: true, approvedAt: "2026-11-02T00:30:00Z" }),
    draft: draft(),
    edits: [
      edit(1, "2026-11-01T05:00:00Z"), // 초안 쓰기 전 — 뺌
      edit(2, "2026-11-02T00:40:00Z"),
      edit(3, "2026-11-02T00:41:00Z", { request: "직접 고침" }),
      edit(4, "2026-11-02T00:42:00Z", { kind: "undo", request: "", refId: 3 }),
      edit(5, "2026-11-02T00:43:00Z", { kind: "undo", request: "", refId: 2 }),
      edit(6, "2026-11-02T00:44:00Z", { blockIndex: -1, request: "모양 바꾸기 — 「목록」 → 「표」 · 더 크게" }),
    ],
  });
  assert.deepEqual(kinds(ts), ["outline", "draft", "edit:e2", "edit:e5", "edit:e6"]);
  const d = ts[1];
  assert.ok(d.kind === "draft" && d.ask === "구성안대로 집필" && d.headline === "초안을 썼어요(왼쪽 종이)" && d.at === "2026-11-02T00:30:00Z" && d.fit?.text === "0.5쪽에 맞음");
  const [e2, e5, e6] = ts.slice(2);
  assert.ok(e2.kind === "edit" && e2.ask === "3번 블록 고치기" && e2.headline === "3번 블록을 고쳤어요" && e2.askLines[0] === "더 짧게");
  assert.ok(e5.kind === "edit" && e5.edit === "undo" && e5.headline === "3번 블록을 되돌렸어요" && e5.askLines.length === 0);
  assert.ok(e6.kind === "edit" && e6.edit === "shape" && e6.ask === "추진성과 모양 바꾸기" && e6.headline === "추진성과 모양을 바꿨어요" && e6.askLines[0] === "「목록」 → 「표」 · 더 크게");
});

test("draftThread: 블록 고치기는 최근 THREAD_EDIT_MAX개만, 앞선 수는 초안 차례에", () => {
  const edits = Array.from({ length: THREAD_EDIT_MAX + 3 }, (_, i) => edit(i + 1, `2026-11-02T02:${String(i).padStart(2, "0")}:00Z`));
  const ts = draftThread({ outline: null, draft: draft({ plan: false }), edits });
  assert.equal(ts.filter((t) => t.kind === "edit").length, THREAD_EDIT_MAX);
  const d = ts[0];
  assert.ok(d.kind === "draft" && d.olderEdits === 3 && d.ask === "바로 만들기" && d.headline.startsWith("구성안 없이"));
  assert.equal(ts.at(-1)?.key, `e${THREAD_EDIT_MAX + 3}`, "가장 최근 고치기가 마지막");
});

test("draftThread: 초안 뒤 다시 만든 구성안(승인 전)은 마지막 차례 — 그 사이 고치기는 시각대로 앞뒤", () => {
  const ts = draftThread({
    outline: outline({ at: "2026-11-03T00:00:00Z" }),
    draft: draft({ updatedAt: "2026-11-02T05:00:00Z" }),
    edits: [edit(1, "2026-11-02T04:00:00Z"), edit(2, "2026-11-03T01:00:00Z")],
  });
  assert.deepEqual(kinds(ts), ["draft", "edit:e1", "outline", "edit:e2"]);
  const o = ts[2];
  assert.ok(o.kind === "outline" && o.headline === "구성안을 만들었어요" && o.at === "2026-11-03T00:00:00Z");
});

test("draftThread: 구성안대로 쓴 뒤 고쳐 저장한 구성안(승인 풀림·만든 때는 초안보다 앞)은 「고쳤어요」·시각 없이 마지막", () => {
  const ts = draftThread({ outline: outline({ at: "2026-11-01T01:00:00Z" }), draft: draft({ updatedAt: "2026-11-02T05:00:00Z" }), edits: [edit(1, "2026-11-02T04:00:00Z")] });
  assert.deepEqual(kinds(ts), ["draft", "edit:e1", "outline"]);
  const o = ts.at(-1)!;
  assert.ok(o.kind === "outline" && o.headline === "구성안을 고쳤어요(아직 승인 전)" && o.at === null);
});

test("draftThread: 구성안 뒤 바로 만들기 초안은 구성안 → 초안(구성안 시각 뒤 고치기만)", () => {
  const ts = draftThread({ outline: outline({ at: "2026-11-01T01:00:00Z" }), draft: draft({ plan: false, updatedAt: "2026-11-02T05:00:00Z" }), edits: [edit(1, "2026-10-30T00:00:00Z"), edit(2, "2026-11-02T04:00:00Z")] });
  assert.deepEqual(kinds(ts), ["outline", "draft", "edit:e2"]);
});

test("draftTodo: 행동별 묶음 — 코멘트 · 카드에 실적 넣기 · 자료 올리기 · 문장 고치기(막힘 먼저), 빈 묶음 뺌", () => {
  const r = draftTodo({
    year: 2026,
    kpi: [{ name: "측정 구간", unit: "km", target: "1,200", prev: "1,000" }],
    needs: ["’26 측정 구간"],
    figures: [{ label: "사진", desc: "현장 점검", nth: 0 }],
    warnings: ["문장: 너무 김", "카드·근거 자료에 없는 숫자 1개", "첨부: AI가 읽지 못해 빼고 썼습니다 — a.pdf", "올해 실적: 추진성과에 올해 값이 없음", "판면: 어림 140mm로 0.5쪽(127mm)보다 13mm 넘칩니다 — 칸 글·블록을 줄여 주세요."],
    weak: ["**근거** 약한 문장"],
    outlineNeeds: ["9월 결과보고"],
    comments: [
      { body: "숫자 확인", meta: "확인 요청 · 담당 · 11.2 10:00", blockIndex: 1, open: true },
      { body: "좋음", meta: "칭찬 · 담당 · 11.2 10:01", blockIndex: null, open: false },
    ],
  });
  assert.deepEqual(
    r.groups.map((g) => g.key),
    ["comment", "card", "upload", "text"],
  );
  const by = Object.fromEntries(r.groups.map((g) => [g.key, g]));
  assert.equal(by.card.title, "카드에 실적 넣기");
  assert.deepEqual(
    by.card.items.map((x) => x.text),
    ["측정 구간(km) 2026년 실적이 원장에 없음", "’26 측정 구간", "올해 실적: 추진성과에 올해 값이 없음"],
  );
  assert.ok(by.card.items[0].card && by.card.items[1].jump?.kind === "need");
  assert.deepEqual(
    by.upload.items.map((x) => x.text),
    ["9월 결과보고", "사진 — 현장 점검", "첨부: AI가 읽지 못해 빼고 썼습니다 — a.pdf"],
  );
  assert.equal(by.upload.items[1].jump?.kind, "fig");
  // 문장 고치기: 막힘 경고(없는 숫자·판면 넘침) → 근거 약한 문장 → 참고 경고, 판면은 mm 대신 뜻(원문은 title)
  assert.deepEqual(
    by.text.items.map((x) => x.text),
    ["카드·근거 자료에 없는 숫자 1개", "판면: 배정 쪽을 넘침 — 칸 글·블록을 줄여 주세요", "근거 약한 문장", "문장: 너무 김"],
  );
  assert.match(by.text.items[1].title ?? "", /140mm/);
  assert.equal(by.text.items[2].jump?.text, "**근거** 약한 문장", "찾기는 원문 그대로");
  assert.ok(by.comment.items[0].jump?.kind === "comment" && by.comment.items[0].jump.block === 1 && !by.comment.items[1].jump);
  assert.equal(r.count, 3 + 3 + 4 + 1, "코멘트는 미해결만 셈");
  assert.deepEqual(draftTodo({ year: 2026, kpi: [], needs: [], figures: [], warnings: [], weak: [], outlineNeeds: [], comments: [] }), { groups: [], count: 0 });
});

test("threadStatus: 머리 한 줄", () => {
  const base = { hasOutline: false, approved: false, hasDraft: false, stale: false, todo: 0, locked: false };
  assert.equal(threadStatus(base), "구성안부터");
  assert.equal(threadStatus({ ...base, hasOutline: true }), "구성안 확인 전");
  assert.equal(threadStatus({ ...base, hasOutline: true, approved: true }), "구성안 승인 · 집필 전");
  assert.equal(threadStatus({ ...base, hasOutline: true, approved: true, hasDraft: true, todo: 4 }), "초안 있음 · 채울 자료 4");
  assert.equal(threadStatus({ ...base, hasOutline: true, hasDraft: true }), "초안 있음 · 새 구성안 확인 전");
  assert.equal(threadStatus({ ...base, hasDraft: true, stale: true }), "원장이 바뀜 · 다시 쓰기 권장");
  assert.equal(threadStatus({ ...base, hasDraft: true, locked: true }), "확정한 보고서 · 읽기만");
});

test("draftThread: 자료 반영 고치기로 쓴 초안은 저장된 revise로 이름이 바뀜", () => {
  const find = (d: ThreadDraftIn) => draftThread({ outline: null, draft: d, edits: [] }).find((t) => t.kind === "draft");
  const a = find(draft({ plan: true, revise: true }));
  assert.equal(a?.ask, "자료 반영 고치기");
  assert.equal(a?.headline, "자료를 반영해 다시 썼어요(왼쪽 종이)");
  assert.equal(find(draft({ plan: true }))?.ask, "구성안대로 집필");
});
