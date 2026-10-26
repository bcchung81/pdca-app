// 경평 초안 근거 겹침(lib/reports/ground.ts) 순수 로직 시험 — 4단계 검증 보강.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Block } from "./blocks.ts";
import { GROUND_WEAK, bigramSet, groundScores, groundedSentences, overlapScore, textSimilarity } from "./ground.ts";

const blk = (kind: Block["kind"], x: Partial<Block> = {}): Block => ({ kind, label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...x });

test("bigramSet: 낱말 안 글자 두 개 묶음, 한 글자 낱말은 뺌", () => {
  assert.deepEqual([...bigramSet("AI 판독")], ["ai", "판독"], "영숫자·한글 모두 낱말 안 두 글자씩 묶음(대소문자 무시)");
  assert.deepEqual([...bigramSet("안테나")], ["안테", "테나"], "세 글자 낱말은 겹쳐서 두 묶음");
  assert.deepEqual([...bigramSet("가")], [], "한 글자 낱말은 묶음 없음");
  assert.deepEqual([...bigramSet("")], []);
});

test("overlapScore: 대상 글자 두 개 묶음이 없으면(너무 짧음) null, 겹치는 만큼 0~1", () => {
  assert.equal(overlapScore("가", bigramSet("아무 글이나")), null);
  assert.equal(overlapScore("안테나 판독", bigramSet("안테나 판독 확대")), 1);
  assert.equal(overlapScore("화성 탐사선 발사", bigramSet("안테나 판독 확대")), 0);
});

test("groundedSentences: 블록 글 + 추진성과, 인용·말풍언(quotes·voices)과 막대 수치 줄(series)은 빼고 봄", () => {
  const spec = {
    blocks: [
      blk("bullets", { label: "추진배경", items: ["고소 작업 위험 해소"] }),
      blk("quotes", { cells: [{ head: "", tag: "", bullets: ["정부 관계자 발언"], note: "" }] }),
      blk("chart", { title: "실적 추이", series: [{ label: "’25년", value: "30,706건" }] }),
    ],
    results: ["검사 소요시간 1.5만 시간 절감"],
  };
  const out = groundedSentences(spec);
  assert.ok(out.includes("고소 작업 위험 해소"));
  assert.ok(out.includes("검사 소요시간 1.5만 시간 절감"));
  assert.ok(!out.includes("정부 관계자 발언"), "인용·말풍선 칸 글은 뺌(원문 대조를 따로 함)");
  assert.ok(!out.includes("’25년 30,706건"), "막대 수치 줄은 뺌");
  assert.ok(!out.includes("실적 추이"), "막대는 제목까지 뺌(이름)");
  assert.ok(!out.includes("추진배경"), "라벨은 이름이라 뺌(짧은 라벨이 약한 문장으로 잡히던 것)");
});

test("groundedSentences: 칸 머리·칩은 빼고 칸 글·결과 줄·전후 비교 칸은 봄, 8자 미만은 판단하지 않음", () => {
  const out = groundedSentences({
    blocks: [
      blk("steps", { cells: [{ head: "학습데이터 수집", tag: "Step 1", bullets: ["전국 이통사 안테나 사진 수집"], note: "’26.8 수집 완료" }] }),
      blk("compare", { rows: [{ key: "성과 산정", before: ["판독 시간만 건당 20분"], after: ["사후검증 포함 건당 25분"] }] }),
    ],
    results: ["짧은 글"],
  });
  assert.deepEqual(out, ["전국 이통사 안테나 사진 수집", "’26.8 수집 완료", "판독 시간만 건당 20분", "사후검증 포함 건당 25분"]);
});

test("groundScores: 근거 글과 겹치는 정도를 문장마다 셈, 짧아서 판단 못 하는 문장은 뺌", () => {
  const spec = { blocks: [blk("bullets", { items: ["안테나 판독 체계 고도화"] })], results: ["화성 탐사선 발사 성공"] };
  const scores = groundScores(spec, "안테나 판독 체계를 고도화해 검사 시간을 줄임");
  assert.equal(scores.length, 2);
  const byText = Object.fromEntries(scores.map((x) => [x.text, x.overlap]));
  assert.equal(byText["안테나 판독 체계 고도화"], 1, "근거 글에 그대로 있으면 1");
  assert.ok(byText["화성 탐사선 발사 성공"] < GROUND_WEAK, "근거와 무관한 문장은 기준(0.5) 아래");
});

test("textSimilarity: 대칭이고, 같은 글은 1, 무관한 글은 0에 가까움", () => {
  const a = "안테나 판독 체계 고도화로 검사 효율 향상";
  const b = "화성 탐사선 발사 성공";
  assert.equal(textSimilarity(a, a), 1);
  assert.equal(textSimilarity(a, b), textSimilarity(b, a), "대칭");
  assert.ok(textSimilarity(a, b) < 0.2, "무관한 글은 0 근처");
});
