// pickRules·pickSections(규칙 정리 ④, 2026-09-27) 시험: 경평 초안이 report-harness 사본에서 관련 절·규칙만 순서대로 골라 쓰는 두 함수.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { REPORT_HARNESS } from "../reports/section.ts";
import { HARNESS_DIR } from "./files.ts";
import { OUTLINE_SKELETON, parseRules, pickHeadings, pickRules, pickSections } from "./rules.ts";

const DIR = join(resolve(import.meta.dirname, "../.."), HARNESS_DIR);

const RULES_MD = ["# t", "- R001 [draft] 규칙 하나", "- R002 [draft] 규칙 둘", "- R003 [export] **[대체됨 → R002]** 옛 규칙"].join("\n");

test("pickRules: 준 순서대로 돌려줌", () => {
  const rules = parseRules(RULES_MD);
  assert.deepEqual(
    pickRules(rules, ["R002", "R001"]).map((r) => r.id),
    ["R002", "R001"],
  );
});

test("pickRules: 없는 번호는 오류", () => {
  const rules = parseRules(RULES_MD);
  assert.throws(() => pickRules(rules, ["R999"]), /report-harness 규칙 R999이 사본에 없습니다/);
});

test("pickRules: 대체된 규칙은 오류(갈 곳을 알려줌)", () => {
  const rules = parseRules(RULES_MD);
  assert.throws(() => pickRules(rules, ["R003"]), /report-harness 규칙 R003은 대체됐습니다\(→ R002\)/);
});

const SECTIONS_MD = ["# 제목", "머리말(어느 절에도 안 들어감)", "", "## 1. 첫째", "첫째 내용 1줄", "첫째 내용 2줄", "", "## 2. 둘째", "둘째 내용", "", "## 10. 열째", "열째 내용"].join("\n");

test("pickSections: 준 순서대로, 절 머리 포함, 다음 「## N.」 앞에서 끊음", () => {
  const picked = pickSections(SECTIONS_MD, [2]);
  assert.equal(picked, "## 2. 둘째\n둘째 내용");
  const two = pickSections(SECTIONS_MD, [2, 1]);
  assert.equal(two, "## 2. 둘째\n둘째 내용\n\n## 1. 첫째\n첫째 내용 1줄\n첫째 내용 2줄");
  assert.doesNotMatch(pickSections(SECTIONS_MD, [1]), /## 2\. 둘째/, "다음 절 내용은 안 들어감");
});

test("pickSections: 「## 1.」이 「## 10.」과 헷갈리지 않음, 없는 번호는 오류", () => {
  const ten = pickSections(SECTIONS_MD, [10]);
  assert.equal(ten, "## 10. 열째\n열째 내용");
  assert.throws(() => pickSections(SECTIONS_MD, [99]), /절 ## 99\.이 없습니다/);
});

test("REPORT_HARNESS.rules 7건은 실제 rules.md 사본에 모두 있고 대체되지 않았으며 [draft] 태그가 있음", () => {
  const rules = parseRules(readFileSync(join(DIR, "rules.md"), "utf8"));
  const picked = pickRules(rules, REPORT_HARNESS.rules);
  assert.equal(picked.length, REPORT_HARNESS.rules.length);
  for (const r of picked) {
    assert.ok(r.tags.includes("draft"), `${r.id}에 draft 태그 없음`);
    assert.ok(!r.superseded, `${r.id}은 대체됨`);
  }
});

test("REPORT_HARNESS.style(§4·§11)을 실제 style-guide.md 사본에서 고르면 §4로 시작하고 §11을 담되 §3·§6은 없음", () => {
  const picked = pickSections(readFileSync(join(DIR, "style-guide.md"), "utf8"), REPORT_HARNESS.style);
  assert.match(picked, /^## 4\. /);
  assert.match(picked, /## 11\. /);
  assert.doesNotMatch(picked, /## 3\. /);
  assert.doesNotMatch(picked, /## 6\. /);
});

const HEADINGS_MD = ["# 도식", "머리", "", "## 선택 절차 (LLM 판정)", "1. 판정", "", "## 판정표", "| 패턴 | 구조 |", "| 3단-1 | 도입 → 전개 → 마무리 |", "", "## 작성 규칙", "- 규칙"].join("\n");

test("pickHeadings: 제목 글로 「## 제목」 절을 골라 준 순서대로(괄호 꼬리 허용), 없는 제목이면 오류", () => {
  assert.equal(pickHeadings(HEADINGS_MD, ["판정표"]), "## 판정표\n| 패턴 | 구조 |\n| 3단-1 | 도입 → 전개 → 마무리 |");
  assert.match(pickHeadings(HEADINGS_MD, ["선택 절차"]), /^## 선택 절차 \(LLM 판정\)\n1\. 판정$/);
  assert.doesNotMatch(pickHeadings(HEADINGS_MD, ["판정표"]), /작성 규칙/, "다음 절은 안 들어감");
  assert.throws(() => pickHeadings(HEADINGS_MD, ["없는 절"]), /절 ## 없는 절이 없습니다/);
  assert.throws(() => pickHeadings(HEADINGS_MD, ["판정"]), /없습니다/, "제목 앞부분만 같은 것은 아님");
});

test("OUTLINE_SKELETON: 구성안 골격 판정에 쓰는 도식 Pool 사본의 절이 실제 사본에 있고 2단~5단 패턴을 담음", () => {
  const md = readFileSync(join(DIR, OUTLINE_SKELETON.file), "utf8");
  const picked = pickHeadings(md, OUTLINE_SKELETON.headings);
  for (const p of ["2단", "3단-1", "3단-7", "4단-1", "5단-1"]) assert.ok(picked.includes(p), p);
  assert.doesNotMatch(picked, /게이트/, "하네스 작업 절차(게이트)는 안 들어감");
});
