import assert from "node:assert/strict";
import { test } from "node:test";
import { foldSections, inlineText, parseInline, parseMarkdown } from "./markdown.ts";

test("줄 안 강조: 굵게·기울임·코드, 곱셈 별표는 그대로", () => {
  assert.deepEqual(parseInline("**핵심** 과 `code` 와 *기울임*"), [
    { kind: "bold", text: "핵심" },
    { kind: "text", text: " 과 " },
    { kind: "code", text: "code" },
    { kind: "text", text: " 와 " },
    { kind: "italic", text: "기울임" },
  ]);
  assert.equal(inlineText(parseInline("45,000건*20분")), "45,000건*20분");
});

test("블록: 제목·지침 기호·목록(들여쓰기)·표(구분 줄 있음/없음)·인용·구분선·코드, HTML 태그는 글자로", () => {
  const md = [
    "## 개선안",
    "◆ 핵심: 성과 수치 보강",
    "▸ 세부 1",
    "- 가",
    "  - 가-1",
    "1. 하나",
    "2. 둘",
    "",
    "| 칸 | 보완 |",
    "|---|---|",
    "| [Do] | 달성률 추가 |",
    "",
    "| 월 | 추진실적 |",
    "| 9월 | 준공 3건 |",
    "> 인용",
    "---",
    "```",
    "raw",
    "```",
    "<script>alert(1)</script> 문단",
  ].join("\n");
  const b = parseMarkdown(md);
  assert.deepEqual(
    b.map((x) => x.kind),
    ["heading", "symbol", "symbol", "list", "list", "table", "table", "quote", "rule", "code", "paragraph"],
  );
  const list = b[3];
  assert.ok(list.kind === "list" && list.items.length === 2 && list.items[1].depth === 1);
  const t1 = b[5];
  assert.ok(t1.kind === "table" && inlineText(t1.head[1]) === "보완" && t1.rows.length === 1);
  const t2 = b[6];
  assert.ok(t2.kind === "table" && inlineText(t2.head[0]) === "월" && t2.rows.length === 1, "구분 줄 없는 표는 첫 줄이 머리");
  const p = b[10];
  assert.ok(p.kind === "paragraph" && inlineText(p.inline).startsWith("<script>"), "HTML은 글자로 남음(그릴 때 React가 이스케이프)");
});

test("절 접기: ◆ 절이 둘 이상일 때만 나누고, 머리 앞 글·맺음 글(끝 문단·※)은 늘 보이게 뗌", () => {
  const texts = (bs: ReturnType<typeof parseMarkdown>) => bs.map((b) => ("inline" in b ? inlineText(b.inline) : b.kind));
  assert.equal(foldSections(parseMarkdown("◆ 하나\n▸ 가")), null, "절이 하나면 나누지 않음");
  const f = foldSections(parseMarkdown("머리 글\n◆ 지적 환류\n▸ 가\n## 전략연계\n▸ 나\n▸ 다\n이 초안이 원본자료 수치와 일치하는지 확인 후 카드에 반영하십시오"))!;
  assert.deepEqual(texts(f.intro), ["머리 글"]);
  assert.deepEqual(f.sections.map((s) => texts([s.head])[0]), ["지적 환류", "전략연계"]);
  assert.deepEqual(texts(f.sections[1].body), ["나", "다"]);
  assert.deepEqual(texts(f.outro), ["이 초안이 원본자료 수치와 일치하는지 확인 후 카드에 반영하십시오"], "모드 A 확인 요청은 접힌 절에 숨지 않음");
  const note = foldSections(parseMarkdown("◆ 가\n▸ 1\n◆ 나\n▸ 2\n※ 수치는 원본과 확인"))!;
  assert.deepEqual(texts(note.outro), ["수치는 원본과 확인"]);
  const lone = foldSections(parseMarkdown("◆ 가\n▸ 1\n◆ 나\n마지막 절의 유일한 문단"))!;
  assert.deepEqual(lone.outro, [], "마지막 절에 그 줄뿐이면 떼지 않음(빈 절을 만들지 않음)");
  assert.equal(lone.sections[1].body.length, 1);
  const bullet = foldSections(parseMarkdown("◆ 가\n▸ 1\n◆ 나\n▸ 2\n▸ 3"))!;
  assert.deepEqual(bullet.outro, [], "끝이 ▸ 줄이면 맺음 글 아님");
});

