// 글 모양 검사(lib/reports/text-shape.ts) 시험: 괄호 짝·쪼개진 문장·날짜만 있는 조각 불릿 — 각각 양성·음성 사례, 경고 등급은 참고.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Block } from "./blocks.ts";
import { hasUnbalancedBrackets, isDateOnly, splitSentenceAt, textShapeWarnings } from "./text-shape.ts";
import { warningLevel } from "./warning-levels.ts";

const blk = (kind: Block["kind"], x: Partial<Block> = {}): Block => ({ kind, label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...x });
const cell = (bullets: string[], head = "") => ({ head, tag: "", bullets, note: "" });

test("괄호 짝: 안 맞으면 걸리고, 맞거나 글머리 번호·연도 따옴표뿐이면 안 걸림", () => {
  assert.equal(hasUnbalancedBrackets("상담 접수(’26.6"), true);
  assert.equal(hasUnbalancedBrackets("【확인: ’26 실적"), true);
  assert.equal(hasUnbalancedBrackets("「AI 기본법 시행"), true);
  assert.equal(hasUnbalancedBrackets("상담 접수(’26.6)"), false);
  assert.equal(hasUnbalancedBrackets("【확인: ’26 실적】(「가」)[나]"), false);
  assert.equal(hasUnbalancedBrackets("1) 사업 개요"), false, "글머리 번호의 닫는 괄호");
  assert.equal(hasUnbalancedBrackets("’26.8 기준 31건"), false, "연도 따옴표는 세지 않음");
});

test("쪼개진 문장: 뒤 불릿이 여는 괄호·조사로 시작하면 걸리고, 새 문장이면 안 걸림", () => {
  assert.deepEqual(splitSentenceAt(["**AI 학습 가능 형식**", "(JSON･API)으로 개방"]), [1]);
  assert.deepEqual(splitSentenceAt(["데이터 개방", "으로 활용 확대"]), [1]);
  assert.deepEqual(splitSentenceAt(["데이터 개방", "를 통해 확대"]), [1]);
  assert.deepEqual(splitSentenceAt(["데이터 개방", "에너지 절감 추진"]), [], "조사처럼 보이는 글자로 시작하는 낱말");
  assert.deepEqual(splitSentenceAt(["대상 기관", "(주)한국 참여"]), [], "(주) 표기");
  assert.deepEqual(splitSentenceAt(["이 사업은 개방", "관계기관 협의"]), []);
  assert.deepEqual(splitSentenceAt(["(JSON)으로 개방"]), [], "첫 불릿은 앞이 없음");
});

test("조각 불릿: 날짜·기간만 있으면 걸리고, 문장 안의 시점이나 수치 불릿은 안 걸림", () => {
  for (const t of ["~8월", "하반기", "12월", "’26.6", "’26.6~", "**’26년 하반기**"]) assert.equal(isDateOnly(t), true, t);
  for (const t of ["12월 시범 운영", "50명", "1,200", "지표 개선", ""]) assert.equal(isDateOnly(t), false, t);
});

test("textShapeWarnings: 세 종류를 각각 한 줄로, 참고 등급, 인용·수치 표 값은 보지 않음", () => {
  const bad = [
    blk("bullets", { items: ["개방 형식", "(JSON･API)으로 개방", "~8월"] }),
    blk("chart", { series: [{ label: "상담 접수(’26.6", value: "40%" }] }),
  ];
  const w = textShapeWarnings(bad);
  assert.equal(w.length, 3);
  assert.match(w[0], /^글 모양: 괄호 짝이 안 맞는 글 1개 .*상담 접수\(’26\.6/);
  assert.match(w[1], /^글 모양: .*쪼개진 불릿 1곳/);
  assert.match(w[2], /^글 모양: 날짜·기간만 있는 조각 불릿 1개 .*~8월/);
  for (const x of w) assert.equal(warningLevel(x), "info");

  const ok = [
    blk("bullets", { items: ["개방 형식(JSON･API) 확대", "하반기 시범 운영"] }),
    blk("quotes", { cells: [cell(["“현장에서는 (일부 아쉽다”"])] }),
    blk("table", { items: ["구분", "’25"], cells: [cell(["12월"], "시점")] }),
  ];
  assert.deepEqual(textShapeWarnings(ok), []);
});
