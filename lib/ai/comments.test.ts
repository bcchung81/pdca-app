import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { editTargets } from "../cards/patch.ts";
import { type CommentInput, CommentResultSchema, commentOutline, commentPrompt, readCommentInput, verifyComments } from "./comments.ts";
import { commentPrompts } from "../prompts/sets.ts";
import { knowledgeBlock } from "./writer.ts";
import { NO_SEED_CARDS, seedCards } from "../testing/originals.ts";

// 코멘트 프롬프트(resources/prompts/card-comment)
const P = commentPrompts().prompts;
const COMMENT_ADAPTER = P.system.system;

const card = seedCards().find((c) => c.id === "주요사업1/1-가")!;

const comments: CommentInput[] = [
  { id: "c1", kind: "edit", path: "plan.lines.1", paths: ["plan.lines.1"], quote: "전국 대상 운영 확산", text: "확산 시기를 분명히" },
  { id: "c2", kind: "ask", path: "kpi.rows.0.target", paths: ["kpi.rows.0.target"], quote: "", text: "목표가 도전적인가요?" },
  { id: "c3", kind: "edit", path: null, paths: [], quote: "", text: "잠긴 칸 고치기" },
];

test("AI에 주는 카드: 편집 칸 전부를 문서 순서로, [줄]·[칸]·잠김 표시, 절 제목", { skip: NO_SEED_CARDS }, () => {
  const outline = commentOutline(card, editTargets(card, ["kpi"]));
  const lines = outline.split("\n");
  assert.equal(lines[0], "## 과제 기본정보");
  assert.ok(lines[1].startsWith("title [칸] | AI 기반 안테나"));
  assert.ok(outline.includes("## [Plan] 조치 및 개선방향"));
  assert.ok(outline.includes(`plan.lines.1 [줄] | ${card.plan.lines[1]}`));
  assert.ok(/kpi\.rows\.0\.target \[칸·잠김\] \| /.test(outline));
  assert.ok(outline.includes("## AX 연계과제 붙임 1"));
  assert.ok(outline.includes("axAttachments.0.purpose~.0 [줄] | "));
  const prompt = commentPrompt(P, card, editTargets(card), knowledgeBlock([]), { periodLabel: "2026년 9월", comments, keeps: [{ path: "plan.lines.0", quote: "AI 성과 산출기준 개선" }] });
  assert.ok(prompt.includes('<comment id="c1" kind="수정" at="plan.lines.1 ([Plan] 2번째 줄)">'));
  assert.ok(prompt.includes("고른 글: 「전국 대상 운영 확산」"));
  assert.ok(prompt.includes('<comment id="c3" kind="수정" at="카드 전체">'));
  assert.ok(prompt.includes("「유지할 부분」") && prompt.includes("- plan.lines.0 | 「AI 성과 산출기준 개선」"));
  assert.ok(prompt.includes("(제공된 근거 자료 없음)"));
  assert.doesNotMatch(prompt, /「첨부 자료」/, "카드 자료가 없으면 첨부 절도 없음");
  // 카드 전용 자료 전부(참고자료 1단계): 근거 자료 뒤에 file:N 봉투로 전체 글
  const withFiles = commentPrompt(P, card, editTargets(card), "", { periodLabel: "2026년 9월", comments, keeps: [], files: [{ name: "9월 결과보고.hwpx", text: `${"가".repeat(70_000)} 준공검사 3건` }] });
  assert.ok(withFiles.indexOf("「첨부 자료」 1건") > withFiles.indexOf("「근거 자료」"));
  assert.ok(withFiles.includes(`<source key="file:1" title="9월 결과보고.hwpx" kind="카드 전용 자료">\n${"가".repeat(70_000)} 준공검사 3건\n</source>`));
});

test("결과 검증: 없는·잠긴 경로와 칸의 넣기/지우기는 빼고, 질문은 답만, 답 없는 코멘트는 되묻기", { skip: NO_SEED_CARDS }, () => {
  const targets = editTargets(card, ["kpi"]);
  const result = CommentResultSchema.parse({
    results: [
      {
        comment_id: "c1",
        outcome: "edited",
        edits: [
          { path: "plan.lines.1", op: "replace", lines: ["→ 무선국검사관리시스템(RIMS) 안테나 AI 분석 기능 도입(’26년 下), ’26년 12월까지 전국 확산"] },
          { path: "plan.lines.1", op: "replace", lines: ["→ 무선국검사관리시스템(RIMS) 안테나 AI 분석 기능 도입(’26년 下), ’26년 12월까지 전국 확산"] },
          { path: "overview.cells.0", op: "insert_after", lines: ["x"] },
          { path: "plan.lines.99.x", op: "replace", lines: ["y"] },
          { path: "plan.lines.2", op: "replace", lines: [card.plan.lines[2]] },
          { path: "plan.lines.0", op: "delete", lines: ["무시"] },
        ],
        reply: "확산 시기를 적었습니다.",
      },
      { comment_id: "c2", outcome: "answered", edits: [{ path: "kpi.rows.0.target", op: "replace", lines: ["999"] }], reply: "전년 대비 높습니다." },
      { comment_id: "c3", outcome: "edited", edits: [{ path: "kpi.rows.0.target", op: "replace", lines: ["1"] }], reply: "목표를 고쳤습니다." },
    ],
  });
  const v = verifyComments(result, card, targets, [...comments, { id: "c4", kind: "edit", path: null, paths: [], quote: "", text: "x" }]);
  assert.equal(v[0].outcome, "edited");
  assert.deepEqual(
    v[0].edits.map((e) => [e.path, e.op, e.lines.length, e.label]),
    [
      ["plan.lines.1", "replace", 1, "[Plan] 2번째 줄"],
      ["plan.lines.0", "delete", 0, "[Plan] 1번째 줄"],
    ],
  );
  assert.equal(v[0].edits[0].before, card.plan.lines[1]);
  assert.equal(v[0].dropped, 3, "중복·칸 넣기·없는 경로(같은 글로 바꾸기는 셈하지 않음)");
  assert.deepEqual([v[1].outcome, v[1].edits.length, v[1].reply], ["answered", 0, "전년 대비 높습니다."]);
  assert.equal(v[2].outcome, "declined", "잠긴 칸만 고치려 하면 반영하지 않음");
  assert.ok(v[2].reply.includes("반영하지 않았습니다"));
  assert.equal(v[3].outcome, "declined");
});

test("요청 검사와 CLI용 스키마(draft-7)", () => {
  assert.equal(readCommentInput({ comments: [] }), "보낼 코멘트가 없습니다.");
  assert.equal(readCommentInput({ comments: [{ id: "a", kind: "ask", text: " " }] }), "질문 내용을 적어 주세요.");
  assert.equal(readCommentInput({ comments: [{ id: "a", kind: "delete", text: "x" }] }), "코멘트 형식이 맞지 않습니다.");
  const ok = readCommentInput({ comments: [{ id: "a", kind: "edit", path: "plan.lines.0", paths: ["plan.lines.0", 3], quote: "q".repeat(900), text: "t" }], keeps: [{ path: "do.lines.0", quote: "k" }, { bad: 1 }] });
  assert.ok(typeof ok === "object");
  if (typeof ok !== "object") return;
  assert.deepEqual(ok.comments[0].paths, ["plan.lines.0"]);
  assert.equal(ok.comments[0].quote.length, 400);
  assert.equal(ok.keeps.length, 1);
  const schema = z.toJSONSchema(CommentResultSchema, { target: "draft-7" }) as unknown as { properties: { results: { items: { required: string[] } } } };
  assert.deepEqual(schema.properties.results.items.required, ["comment_id", "outcome", "edits", "reply"]);
});

test("코멘트 적응문: 지침 지식파일 이름 ↔ 근거 자료 제목 짝", () => {
  assert.match(COMMENT_ADAPTER, /지침의 지식파일 이름과 「근거 자료」의 짝/);
});
