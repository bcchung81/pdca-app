// 공통 지식 선별 방식(실험, 기본 꺼짐) — 통째로 넣기 출력 바이트 불변 + 선별 묶음 규칙. 합성 조각만 씀(fixtures/bundle-synthetic.ts)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { assistPrompts, assistPromptsMg, chatPrompts, commentPromptsMg, reportDraftPrompts, reportDraftPromptsMg } from "../prompts/sets.ts";
import { type BundleChunk, type KnowledgeBundle, RULES_DIGEST_UNIT, buildBundle, bundleRefs, layerOf, listText, relevantRefs, sharedTexts } from "./bundle.ts";
import { chunkRole } from "./chunk-role.ts";
import { SYN_BIZ_CARD, SYN_BIZ_LINKED, SYN_CHUNKS, SYN_MG_CARD, SYN_MG_LINKED, SYN_PROMPTS } from "./fixtures/bundle-synthetic.ts";
import { type CardSelection, applySelection, digestCovers, rolesOf, selectPurposes } from "./select.ts";

const BASELINE = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures/bundle-baseline.json"), "utf8")) as Record<string, unknown>;
const cases = (chunks: BundleChunk[]): Record<string, KnowledgeBundle> => ({
  "biz-card": buildBundle(chunks, SYN_BIZ_CARD, SYN_BIZ_LINKED, "plan/task/1-1", "card"),
  "biz-report": buildBundle(chunks, SYN_BIZ_CARD, SYN_BIZ_LINKED, null, "report"),
  "mg-card": buildBundle(chunks, SYN_MG_CARD, SYN_MG_LINKED, null, "card"),
});
const outputs = (b: KnowledgeBundle) => JSON.parse(JSON.stringify({ sharedTexts: sharedTexts(SYN_PROMPTS, b), listText: listText(SYN_PROMPTS, b), bundleRefs: bundleRefs(b), relevantRefs: relevantRefs(b) }));

const digestChunk = (key: string, track: string, business: string | null, text: string): BundleChunk => ({ chunk_key: key, doc_id: "digest", seq: 0, unit_type: RULES_DIGEST_UNIT, track, business, title: key, text, context_prefix: null, meta: null });
const DIGESTS = [digestChunk("digest/biz", "주요사업", null, "규칙 문서 트랙 공통 [plan-2607/narr/I/1]"), digestChunk("digest/BZ-1", "주요사업", "BZ-1", "규칙 문서 BZ-1 [plan-2607/handbook26/BZ-1/k1]")];

test("바이트 불변: 선별 없는 묶음의 sharedTexts·listText·bundleRefs·relevantRefs가 선별 방식을 더하기 전 출력(fixtures/bundle-baseline.json)과 같음", () => {
  for (const [name, b] of Object.entries(cases(SYN_CHUNKS))) assert.deepEqual(outputs(b), BASELINE[name], name);
});

test("규칙 문서 조각(rules_digest)은 통째로 넣기 층에 안 들어감 — 적재돼 있어도 출력이 그대로", () => {
  for (const d of DIGESTS) {
    assert.equal(layerOf(d, "BZ-1"), null);
    assert.equal(layerOf(d, "BZ-1", "report"), null);
  }
  for (const [name, b] of Object.entries(cases([...SYN_CHUNKS, ...DIGESTS]))) assert.deepEqual(outputs(b), BASELINE[name], name);
});

test("selectPurposes: 쉼표 목록에서 card·report만, 비거나 모르는 값은 무시", () => {
  assert.deepEqual([...selectPurposes(undefined)], []);
  assert.deepEqual([...selectPurposes("")], []);
  assert.deepEqual([...selectPurposes("card")], ["card"]);
  assert.deepEqual([...selectPurposes(" Card , report ,writer,,")].sort(), ["card", "report"]);
  assert.deepEqual([...selectPurposes("on")], []);
});

const roles = rolesOf(SYN_CHUNKS);
const keysOf = (b: KnowledgeBundle) => b.layers.map((l) => [l.id, l.refs.map((r) => r.key)]);
const sel = (keys: string[], digest = { track: "규칙 문서 트랙 공통", unit: "규칙 문서 BZ-1" }): CardSelection => ({ keys, digest });

test("applySelection: 층에서 기준류·사례류가 빠지고 method·evidence·other는 원래 층에, 고른 키 순서 → 과제 연결 나머지 순으로 picked, 나머지 사례류는 unpicked", () => {
  const base = cases(SYN_CHUNKS)["biz-report"];
  const s = applySelection(base, sel(["rpt25-biz/BZ-1/b", "peer25-biz/b0-radio", "plan-2607/eval25/BZ-1/e1/p02", "plan-2607/handbook26/BZ-1/k1", "att3-2604/qa/BZ-2/1", "없는/키"]), roles);
  assert.deepEqual(keysOf(s), [["institution", ["up-m/1", "up-x/1"]], ["common", []], ["business", []]], "method(up-m)·other(up-x)만 남음");
  for (const r of s.layers.flatMap((l) => l.refs)) assert.ok(["method", "other", "evidence"].includes(chunkRole(SYN_CHUNKS.find((c) => c.chunk_key === r.key)!)));
  assert.deepEqual(
    s.select!.picked.map((r) => r.key),
    ["rpt25-biz/BZ-1/b", "peer25-biz/b0-radio", "plan-2607/eval25/BZ-1/e1/p02", "att3-2604/qa/BZ-1/1"],
    "기준류(편람)·범위 밖(다른 사업)·없는 키는 안 고름, 과제 연결(qa/BZ-1/1)은 고르지 않았어도 늘 넣음",
  );
  const unpicked = s.select!.unpicked.map((x) => x.key);
  const selectable = bundleRefs(base).filter((r) => ["critique", "survey", "prior", "case"].includes(roles.get(r.key)!)).map((r) => r.key);
  assert.deepEqual([...unpicked, ...s.select!.picked.map((r) => r.key)].sort(), selectable.sort(), "사례류는 picked·unpicked로 빠짐없이 갈림");
  assert.ok(unpicked.includes("plan-2607/eval25/BZ-1/e1/p01") && unpicked.includes("att3-2604/qa/bonus/1") && unpicked.includes("att3-2604/BZ-4/Q1"));
  assert.deepEqual(s.select!.unpicked.find((x) => x.key === "rpt25-biz/BZ-1/a"), { key: "rpt25-biz/BZ-1/a", title: "2025 보고서 1-1 가. 안테나 판독", unitType: "report_section" });
  assert.equal(s.select!.picked[0].text, "도서 지역 통신품질 측정 35곳", "고른 조각은 원문 그대로");
});

test("applySelection: 경영관리 핵심공통항목(evidence)은 ③에 그대로", () => {
  const s = applySelection(cases(SYN_CHUNKS)["mg-card"], sel([]), roles);
  assert.deepEqual(keysOf(s), [["institution", []], ["common", []], ["business", ["mg/core/MG-3"]]]);
  assert.deepEqual(s.select!.picked.map((r) => r.key), ["mg/eval/MG-3/1"], "과제 연결만");
});

test("applySelection: 목록표 키는 요청에 원문이 든 조각만, 인용·숫자 대조(bundleRefs·relevantRefs)는 선별 전 원문 전부", () => {
  const base = cases(SYN_CHUNKS)["biz-card"];
  const s = applySelection(base, sel(["rpt25-biz/BZ-1/b"]), roles);
  const inRequest = new Set([...s.layers.flatMap((l) => l.refs.map((r) => r.key)), ...s.select!.picked.map((r) => r.key)]);
  for (const k of [...s.list.relevant, ...s.list.peers, ...s.list.prior, ...s.list.similar]) assert.ok(inRequest.has(k), k);
  assert.deepEqual(s.list.prior, ["rpt25-biz/BZ-1/b"]);
  assert.deepEqual(s.list.peers, []);
  assert.deepEqual(s.list.relevant, ["att3-2604/qa/BZ-1/1", "plan-2607/eval25/BZ-1/e1/p02"]);
  assert.equal(s.list.taskRow?.key, "plan/task/1-1");
  assert.deepEqual(bundleRefs(s), bundleRefs(base), "인용 대조는 원문 전부 + 과제 목록 행");
  assert.deepEqual(relevantRefs(s), relevantRefs(base));
});

test("sharedTexts(선별): 세 덩이 — 앞 둘(규칙 문서 + 남은 원문)은 카드·고른 키가 달라도 같고, 셋째(고른 원문)만 카드별", () => {
  for (const p of [assistPrompts().prompts, chatPrompts().prompts, reportDraftPrompts().prompts]) {
    const a = applySelection(buildBundle(SYN_CHUNKS, SYN_BIZ_CARD, SYN_BIZ_LINKED, "plan/task/1-1", "card"), sel(["rpt25-biz/BZ-1/b"]), roles);
    const b = applySelection(buildBundle([...SYN_CHUNKS].reverse(), { ...SYN_BIZ_CARD, data: { title: "선박 탑승 예측", executionTask: "" } }, [], null, "card"), sel(["peer25-biz/bplus-ship", "att3-2604/qa/BZ-1/2"]), roles);
    const [ta, tb] = [sharedTexts(p, a), sharedTexts(p, b)];
    assert.equal(ta.length, 3, p.feature);
    assert.equal(ta[0], tb[0], `${p.feature} 덩이 1`);
    assert.equal(ta[1], tb[1], `${p.feature} 덩이 2`);
    assert.notEqual(ta[2], tb[2]);
    assert.match(ta[0], /「공통 규칙 문서 — 기관 공통」[^\n]*사실·숫자의 근거가 아닙니다[^\n]*\n규칙 문서 트랙 공통/);
    assert.match(ta[0], /「근거 자료 ① 기관 공통 — 원문 그대로」 1건/);
    assert.ok(!ta[0].includes("관리계획 서술 하나") && !ta[1].includes("편람 지표 정의와 배점"), "기준류 원문은 안 들어감");
    assert.match(ta[1], /^「공통 규칙 문서 — 주요사업1 [^」]+」[^\n]*\n규칙 문서 BZ-1$/, "③에 남은 원문이 없으면 규칙 문서만");
    assert.match(ta[2], /^「이 과제에 고른 원문」 3건[^\n]*\n<source key="rpt25-biz\/BZ-1\/b"/);
    assert.ok(ta[2].includes('<source key="att3-2604/qa/BZ-1/1"') && !ta[2].includes("plan-2607/eval25/BZ-1/e1/p01"));
  }
});

test("sharedTexts(선별): 고른 조각이 없고 규칙 문서·남은 원문도 없으면 빈 덩이는 뺌", () => {
  const s = applySelection(cases(SYN_CHUNKS)["mg-card"], { keys: [], digest: { track: "", unit: "" } }, roles);
  const t = sharedTexts(assistPromptsMg().prompts, { ...s, list: { ...s.list, relevant: [] }, select: { ...s.select!, picked: [] } });
  assert.equal(t.length, 1);
  assert.match(t[0], /^「근거 자료 ③ 경영관리 지표3 [^」]+ 지표 공통 — 원문 그대로」 1건/);
});

test("listText(선별): 목록 머리가 선별 방식 설명이고 끝에 고르지 않은 조각을 문서별 「key · 제목」으로, 「자료 확인 필요」 안내", () => {
  for (const p of [assistPrompts().prompts, reportDraftPrompts().prompts]) {
    const s = applySelection(cases(SYN_CHUNKS)["biz-card"], sel(["rpt25-biz/BZ-1/b"]), roles);
    const t = listText(p, s);
    assert.match(t, /^이 요청의 공통 지식은 선별 방식입니다/);
    assert.match(t, /관리계획 과제 목록의 이 과제 행:\n<source key="plan\/task\/1-1"/);
    assert.match(t, /「고르지 않은 조각」 10건 — [^\n]*「자료 확인 필요: <key>」/);
    assert.match(t, /\n- plan-2607\(3건\): plan-2607\/eval25\/BZ-1\/e1\/p01 · 제목 plan-2607\/eval25\/BZ-1\/e1\/p01 \| /);
    assert.match(t, /\n- rpt25-biz\(1건\): rpt25-biz\/BZ-1\/a · 2025 보고서 1-1 가\. 안테나 판독$/m);
  }
  const mg = applySelection(cases(SYN_CHUNKS)["mg-card"], sel([]), roles);
  for (const p of [commentPromptsMg().prompts, reportDraftPromptsMg().prompts]) {
    assert.match(listText(p, mg), /「고르지 않은 조각」 2건[^\n]*\n- att3-2604\(1건\): att3-2604\/qa\/bonus\/1 · [^\n]*\n- rpt25-mg-03\(1건\): rpt25-mg-03\/1 · /, "가점 실사(②)도 사례류");
    assert.equal(sharedTexts(p, mg).length, 3);
  }
});

test("digestCovers: 이 평가단위 층에 기준류가 있는데 그 자리 규칙 문서가 비면 false(반쪽 선별 안 함)", () => {
  assert.equal(digestCovers(SYN_CHUNKS, "BZ-1", "card", sel([])), true);
  assert.equal(digestCovers(SYN_CHUNKS, "BZ-1", "card", sel([], { track: "있음", unit: " " })), false, "③ 편람·Pool 자리가 빔");
  assert.equal(digestCovers(SYN_CHUNKS, "BZ-1", "card", sel([], { track: "", unit: "있음" })), false, "①② 서술·편람 자리가 빔");
  const noOwnRules = SYN_CHUNKS.filter((c) => !(c.business === "BZ-1" && chunkRole(c) === "rule"));
  assert.equal(digestCovers(noOwnRules, "BZ-1", "card", sel([], { track: "있음", unit: "" })), true, "③에 기준류가 없으면 평가단위 규칙 문서는 없어도 됨");
});
