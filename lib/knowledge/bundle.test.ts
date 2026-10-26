import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSeedInput } from "../db/seed-files.ts";
import { HAS_SEED_CARDS } from "../testing/originals.ts";
import { assistPrompts, reportDraftPrompts } from "../prompts/sets.ts";
import { SCOPE_UNIT_TYPES } from "../prep/scope.ts";
import { type BundleChunk, SIMILAR_MAX, buildBundle, bundleRefs, layerOf, listText, relevantRefs, sharedTexts } from "./bundle.ts";

const c = (over: Partial<BundleChunk> & { chunk_key: string }): BundleChunk => ({
  doc_id: "plan-2607",
  seq: 0,
  unit_type: "plan_section",
  track: "주요사업",
  business: null,
  title: over.chunk_key,
  text: `글 ${over.chunk_key}`,
  context_prefix: null,
  meta: null,
  ...over,
});

const chunks: BundleChunk[] = [
  c({ chunk_key: "rpt/BZ-1/b", doc_id: "rpt25-biz", seq: 2, unit_type: "report_section", business: "BZ-1", title: "2025 보고서 1-2 나. 도서 통신품질", text: "도서 지역 통신품질 측정" }),
  c({ chunk_key: "rpt/BZ-1/a", doc_id: "rpt25-biz", seq: 1, unit_type: "report_section", business: "BZ-1", title: "2025 보고서 1-1 가. 안테나 판독", text: "AI 안테나 자동판독 전국 확산" }),
  c({ chunk_key: "plan/sec2", seq: 2 }),
  c({ chunk_key: "plan/sec1", seq: 1, text: "가".repeat(9_000) }),
  c({ chunk_key: "plan/mg", seq: 3, track: "경영관리" }),
  c({ chunk_key: "plan/task/1-1", unit_type: "task_list_row", business: "BZ-1", seq: 9 }),
  c({ chunk_key: "att3/qa/BZ-1/1", doc_id: "att3-2604", unit_type: "qa_pair", business: "BZ-1", seq: 5 }),
  c({ chunk_key: "att3/qa/BZ-2/1", doc_id: "att3-2604", unit_type: "qa_pair", business: "BZ-2", seq: 6 }),
  c({ chunk_key: "att3/qa/BZ-4/1", doc_id: "att3-2604", unit_type: "qa_pair", business: "BZ-4", seq: 7 }),
  c({ chunk_key: "att3/qa/bonus/1", doc_id: "att3-2604", unit_type: "qa_pair", business: null, track: "가점", seq: 8 }),
  c({ chunk_key: "peer/b0-radio", doc_id: "peer25-biz", unit_type: "peer_case", seq: 1, title: "붙임2 · 기관A — 전파 안테나 판독(B0)", text: "안테나 판독 자동화", meta: { grade: "B0" } }),
  c({ chunk_key: "peer/bplus-ship", doc_id: "peer25-biz", unit_type: "peer_case", seq: 0, title: "붙임2 · 기관B — 선박 안전(B+)", text: "선박 탑승 예측", meta: { grade: "B+" } }),
  c({ chunk_key: "peer/c", doc_id: "peer25-biz", unit_type: "peer_case", seq: 2, meta: { grade: "C" } }),
  c({ chunk_key: "peer/kca", doc_id: "peer25-biz", unit_type: "peer_case", seq: 3, meta: { grade: "B+", kca: true } }),
  c({ chunk_key: "goal/1", doc_id: "goal30-2605", unit_type: "goal_indicator" }),
];
const card = (title: string) => ({ evalUnitId: "BZ-1", data: { title, executionTask: "" } });

test("층 규칙: 기관 공통(사업 없음)·공통지표/가점·이 사업만, 경영관리 트랙·다른 사업·B+/B0 밖 사례·KCA는 범위 밖, 과제 목록 행은 층에 안 넣음", () => {
  const at = (k: string) => layerOf(chunks.find((x) => x.chunk_key === k)!, "BZ-1");
  assert.equal(at("plan/sec1"), "institution");
  assert.equal(at("goal/1"), "institution");
  assert.equal(at("peer/b0-radio"), "institution");
  assert.equal(at("att3/qa/BZ-4/1"), "common");
  assert.equal(at("att3/qa/bonus/1"), "common", "사업 미지정 실사(가점)도 모든 과제에");
  assert.equal(at("att3/qa/BZ-1/1"), "business");
  assert.equal(at("att3/qa/BZ-2/1"), null);
  assert.equal(at("plan/mg"), null);
  assert.equal(at("peer/c"), null);
  assert.equal(at("peer/kca"), null);
  assert.equal(at("plan/task/1-1"), null);
});

test("묶음: 규칙 범위를 거르지 않고 전부·자르지 않고, 층 안은 문서 순서 → 적재 순서(카드와 무관)", () => {
  const b = buildBundle(chunks, card("안테나 판독"), ["att3/qa/BZ-1/1", "att3/qa/BZ-2/1"], "plan/task/1-1");
  assert.deepEqual(
    b.layers.map((l) => [l.id, l.refs.map((r) => r.key)]),
    [
      ["institution", ["plan/sec1", "plan/sec2", "goal/1", "peer/bplus-ship", "peer/b0-radio"]],
      ["common", ["att3/qa/BZ-4/1", "att3/qa/bonus/1"]],
      ["business", ["att3/qa/BZ-1/1", "rpt/BZ-1/a", "rpt/BZ-1/b"]],
    ],
  );
  assert.equal(b.layers[0].refs[0].text.length, 9_000, "조각 글을 자르지 않음(예전 2,500자)");
  assert.deepEqual(b.list.relevant, ["att3/qa/BZ-1/1"], "연결 중 범위 밖(다른 사업)은 목록에 안 넣음");
  assert.equal(b.list.taskRow?.key, "plan/task/1-1");
  assert.deepEqual(bundleRefs(b).length, 11);
});

test("대응표가 비었거나 처리기가 안 돌았어도(연결 없음) 규칙 범위 조각은 하나도 빠지지 않고, 「이 과제 해당」 표시만 없다", () => {
  const withScope = buildBundle(chunks, card("안테나 판독"), ["att3/qa/BZ-1/1", "rpt/BZ-1/a"], "plan/task/1-1");
  const without = buildBundle(chunks, card("안테나 판독"), [], "plan/task/1-1");
  const keys = (b: typeof withScope) => b.layers.map((l) => [l.id, l.refs.map((r) => r.key)]);
  assert.deepEqual(keys(without), keys(withScope));
  assert.deepEqual(without.list.relevant, []);
  assert.deepEqual(withScope.list.relevant.sort(), ["att3/qa/BZ-1/1", "rpt/BZ-1/a"]);
  assert.deepEqual(relevantRefs(withScope).map((r) => r.key).sort(), ["att3/qa/BZ-1/1", "rpt/BZ-1/a"], "relevantRefs: 연결된 조각의 글(경평 초안 숫자 근거)");
  assert.deepEqual(relevantRefs(without), []);
  assert.equal(sharedTexts(assistPrompts().prompts, without).join("\n\n"), sharedTexts(assistPrompts().prompts, withScope).join("\n\n"), "공유 층 글도 같음(표시는 목록표에만)");
});

test("검색 전용 표지(meta.search_only): 어느 층에도 안 들어가 AI 근거·닮은 순·매칭 후보에서 빠지고, 표지가 없으면 층 규칙 그대로", () => {
  const only = c({ chunk_key: "gen/only", doc_id: "up-x", unit_type: "generic_section", meta: { search_only: true } });
  const plain = c({ chunk_key: "gen/plain", doc_id: "up-x", unit_type: "generic_section", meta: { generic: true } });
  assert.equal(layerOf(only, "BZ-1"), null);
  assert.equal(layerOf({ ...only, business: "BZ-1" }, "BZ-1"), null, "사업 공통으로 올려도 검색 전용이면 빠짐");
  assert.equal(layerOf(plain, "BZ-1"), "institution");
  const b = buildBundle([...chunks, only, plain], card("안테나 판독"));
  const keys = new Set(bundleRefs(b).map((r) => r.key));
  assert.ok(!keys.has("gen/only") && keys.has("gen/plain"));
  assert.ok(!b.list.similar.includes("gen/only"), "닮은 순에도 안 들어감");
});

test("경평 초안 작성 방법론(meta.usage = report_method): 과제원장 요청에는 어느 층에도 안 들어가고 경평 초안 요청에만 ① 기관 공통으로(사업과 상관없이 모든 과제에 같은 글), 검색 전용이 우선", () => {
  const method = c({ chunk_key: "gen/method", doc_id: "up-m", unit_type: "generic_section", meta: { generic: true, usage: "report_method" } });
  for (const unit of ["BZ-1", "BZ-2", "BZ-3"]) {
    assert.equal(layerOf(method, unit), null, "기본(과제원장 AI·매칭·크기)은 범위 밖");
    assert.equal(layerOf(method, unit, "card"), null);
    assert.equal(layerOf(method, unit, "report"), "institution", `${unit} 경평 초안은 ①`);
  }
  assert.equal(layerOf({ ...method, meta: { usage: "report_method", search_only: true } }, "BZ-1", "report"), null, "검색 전용이면 경평 초안에서도 빠짐");
  assert.equal(layerOf({ ...method, meta: { usage: "다른 용도" } }, "BZ-1", "report"), "institution", "모르는 용도는 층 규칙 그대로(사업 미지정 → ①)");
  const forCard = buildBundle([...chunks, method], card("안테나 판독"));
  const forReport = buildBundle([...chunks, method], card("안테나 판독"), [], null, "report");
  assert.ok(!bundleRefs(forCard).some((r) => r.key === "gen/method"), "카드 쪽 묶음에 없음");
  assert.ok(!forCard.list.similar.includes("gen/method"), "닮은 순에도 없음");
  const ref = forReport.layers.find((l) => l.id === "institution")!.refs.find((r) => r.key === "gen/method");
  assert.ok(ref, "경평 초안 묶음 ①에 있음");
  assert.match(ref!.where ?? "", /^※ 작성 방법론 자료 — .*사실·숫자·사례의 근거가 아님$/, "조각마다 방법론 표지");
  // 카드 쪽 묶음은 방법론 때문에 달라지지 않음 — 방법론이 없는 묶음과 똑같음
  assert.deepEqual(forCard.layers.map((l) => l.refs.map((r) => r.key)), buildBundle(chunks, card("안테나 판독")).layers.map((l) => l.refs.map((r) => r.key)));
  // 경평 초안 쪽은 방법론만 더 있고 나머지 층·글은 같음
  const keysOf = (b: typeof forReport) => b.layers.flatMap((l) => l.refs.map((r) => r.key));
  assert.deepEqual(keysOf(forReport).filter((k) => k !== "gen/method"), keysOf(forCard));
});

test("트랙 분리: 경영관리 요청 묶음에는 주요사업 조각이(공통지표·사업 조각·보고서 절·방법론 포함) 하나도 안 섞이고, 주요사업 묶음에는 경영관리 조각이 안 섞임 — 가점은 두 트랙 공통", () => {
  const mgChunks: BundleChunk[] = [
    c({ chunk_key: "mg/inst", doc_id: "mg-doc", track: "경영관리", seq: 1 }),
    c({ chunk_key: "mg/i3", doc_id: "mg-doc", track: "경영관리", business: "MG-3", seq: 2 }),
    c({ chunk_key: "mg/i4", doc_id: "mg-doc", track: "경영관리", business: "MG-4", seq: 3 }),
    c({ chunk_key: "mg/task", doc_id: "mg-doc", track: "경영관리", business: "MG-3", unit_type: "task_list_row", seq: 4 }),
  ];
  const method = c({ chunk_key: "gen/method", doc_id: "up-m", unit_type: "generic_section", meta: { usage: "report_method" } });
  const all = [...chunks, ...mgChunks, method];
  const mgCard = { evalUnitId: "MG-G1", knowledgeUnit: "MG-3", data: { title: "경영관리 과제", executionTask: "" } };
  for (const purpose of ["card", "report"] as const) {
    const keys = bundleRefs(buildBundle(all, mgCard, [], null, purpose)).map((r) => r.key);
    assert.deepEqual(
      keys.filter((k) => !k.startsWith("mg/") && k !== "plan/mg" && k !== "att3/qa/bonus/1").sort(), // plan/mg = 기본 조각 목록의 경영관리 트랙 조각
      purpose === "report" ? ["gen/method"] : [],
      `${purpose}: 경영관리 요청에 주요사업 조각이 없음(방법론은 경평 초안 쪽 ①에만)`,
    );
    assert.ok(keys.includes("att3/qa/bonus/1"), "가점은 경영관리 요청에도 들어감");
  }
  const mg = buildBundle(all, mgCard);
  assert.deepEqual(mg.layers.map((l) => [l.id, l.refs.map((r) => r.key)]), [["institution", ["plan/mg", "mg/inst"]], ["common", ["att3/qa/bonus/1"]], ["business", ["mg/i3"]]], "③은 카드가 속한 지표(knowledgeUnit)의 조각만, 과제 목록 행은 층에 안 넣음");
  assert.equal(mg.unit, "MG-3");
  // knowledgeUnit을 안 주면 카드의 평가단위(MG-G1)로 읽어 지표 조각은 ③에 안 들어감(① ②만)
  assert.deepEqual(buildBundle(all, { ...mgCard, knowledgeUnit: undefined }).layers.find((l) => l.id === "business")!.refs, []);
  // 주요사업 카드: 경영관리 조각이 없고, 예전과 똑같은 묶음
  const bizKeys = bundleRefs(buildBundle(all, card("안테나 판독"))).map((r) => r.key);
  assert.ok(!bizKeys.some((k) => k.startsWith("mg/")));
  assert.deepEqual(bizKeys, bundleRefs(buildBundle(chunks, card("안테나 판독"))).map((r) => r.key), "경영관리·방법론 조각이 있어도 주요사업 카드 쪽 묶음은 그대로");
});

test("닮은 순: 붙임2 사례·전년 절을 카드와 닮은 순으로(거르지 않음)", () => {
  const radio = buildBundle(chunks, card("AI 안테나 자동판독 전국 확산"));
  assert.deepEqual(radio.list.peers, ["peer/b0-radio", "peer/bplus-ship"]);
  assert.deepEqual(radio.list.prior, ["rpt/BZ-1/a", "rpt/BZ-1/b"]);
  const ship = buildBundle(chunks, card("선박 탑승 예측"));
  assert.deepEqual(ship.list.peers, ["peer/bplus-ship", "peer/b0-radio"]);
});

test("닮은 순 전체 목록: 대응표 대상 종류(실사·평가 의견·지적·전년 절·Pool·AX)만 카드와 닮은 순으로 상한까지, 근거 묶음은 그대로 전부(거르지 않음)", () => {
  const many = [
    ...chunks,
    ...Array.from({ length: 40 }, (_, i) => c({ chunk_key: `att3/qa/BZ-1/x${i}`, doc_id: "att3-2604", unit_type: "qa_pair", business: "BZ-1", seq: 100 + i, title: `질의 ${i}`, text: i === 17 ? "AI 안테나 자동판독 확산 질의" : `기타 질의 ${i}` })),
  ];
  const b = buildBundle(many, card("AI 안테나 자동판독 전국 확산"));
  const inLayers = new Set(bundleRefs(b).map((r) => r.key));
  assert.equal(b.list.similar.length, SIMILAR_MAX, "상한까지만");
  assert.equal(new Set(b.list.similar).size, b.list.similar.length, "중복 없음");
  const type = new Map(bundleRefs(b).map((r) => [r.key, r.unitType]));
  assert.ok(b.list.similar.every((k) => SCOPE_UNIT_TYPES.includes(type.get(k) ?? "")), "관리계획 서술·지표·붙임2 사례는 이 목록에 안 넣음");
  assert.ok(b.list.similar.slice(0, 3).includes("att3/qa/BZ-1/x17") && b.list.similar.slice(0, 3).includes("rpt/BZ-1/a"), "글이 겹치는 조각이 앞");
  assert.ok(many.filter((x) => layerOf(x, "BZ-1")).every((x) => inLayers.has(x.chunk_key)), "닮은 순에서 빠진 조각도 근거 묶음에는 전부 있음");
  // 요청 글의 목록표에 실림
  assert.match(listText(assistPrompts().prompts, b), new RegExp(`앞 ${SIMILAR_MAX}건: .*att3/qa/BZ-1/x17`));
  // 카드 글이 비어도(닮음 없음) 오류 없이 같은 상한 안에서 결정된 순서
  const blank = buildBundle(many, card(""));
  assert.ok(blank.list.similar.length <= SIMILAR_MAX);
});

test("공유 층 글은 같은 사업이면 카드가 달라도 바이트까지 같음(캐시를 나눠 씀), 목록표만 카드별", () => {
  const p = assistPrompts().prompts;
  const a = buildBundle(chunks, card("AI 안테나 자동판독"), ["att3/qa/BZ-1/1"], "plan/task/1-1");
  const b = buildBundle([...chunks].reverse(), card("선박 탑승 예측"), [], null);
  assert.deepEqual(sharedTexts(p, a), sharedTexts(p, b));
  assert.equal(sharedTexts(p, a).length, 2, "①②(모든 과제)와 ③(이 사업) 두 덩이");
  assert.match(sharedTexts(p, a)[0], /「근거 자료 ① 기관 공통」 5건/);
  assert.match(sharedTexts(p, a)[0], /「근거 자료 ② 공통지표·사업 미지정」 2건/);
  assert.match(sharedTexts(p, a)[1], /「근거 자료 ③ 주요사업1 전파이용 기회 확대 사업 공통」 3건/);
  assert.match(sharedTexts(p, a)[1], /<source key="att3\/qa\/BZ-1\/1"/);
  assert.notEqual(listText(p, a), listText(p, b));
  assert.match(listText(p, a), /이 과제 해당\(과제 연결\): att3\/qa\/BZ-1\/1/);
  assert.match(listText(p, a), /관리계획 과제 목록의 이 과제 행:\n<source key="plan\/task\/1-1"/);
  assert.match(listText(p, b), /이 과제 해당\(과제 연결\): 없음/);
  // 경평 초안 프롬프트도 같은 절을 가짐
  assert.deepEqual(sharedTexts(reportDraftPrompts().prompts, a), sharedTexts(p, a));
});

// readSeedInput은 카드 원본(seed/cards — git 밖)도 읽으므로, 없으면 공통 지식도 없는 것으로 봄
const seed = HAS_SEED_CARDS ? readSeedInput(resolve(import.meta.dirname, "../..")) : { knowledgeAvailable: false, chunks: undefined };
test("실제 적재 조각(이 컴퓨터에 있을 때): 사업마다 규칙 범위가 모두 들어감 — 사업 미지정 실사·관리계획 서술 포함, 경영관리 트랙 없음", { skip: !seed.knowledgeAvailable && "공통 지식 적재 결과(resources/knowledge/_chunks)가 없음" }, () => {
  const all = (seed as unknown as { chunks: BundleChunk[] }).chunks;
  for (const unit of ["BZ-1", "BZ-2", "BZ-3"]) {
    const b = buildBundle(all, { evalUnitId: unit, data: { title: "" } });
    const keys = new Set(bundleRefs(b).map((r) => r.key));
    const expected = all.filter((x) => layerOf(x, unit));
    assert.equal(keys.size, expected.length, unit);
    const bonus = all.filter((x) => x.doc_id === "att3-2604" && x.business == null);
    assert.ok(bonus.length > 0 && bonus.every((x) => keys.has(x.chunk_key)), `${unit} 사업 미지정 실사`);
    const narrative = all.filter((x) => x.unit_type === "plan_section" && x.track === "주요사업");
    assert.ok(narrative.length > 0 && narrative.every((x) => keys.has(x.chunk_key)), `${unit} 관리계획 서술`);
    assert.ok(![...keys].some((k) => all.find((x) => x.chunk_key === k)?.track === "경영관리"));
    for (const t of ["evaluator_comment", "qa_pair", "report_section", "pool_indicator"]) assert.ok(b.layers[2].refs.some((r) => r.unitType === t), `${unit} 사업 공통 ${t}`);
  }
});

test("공통지표(BZ-4) 조각은 지표가 속한 사업의 ③에만, 다른 사업 지표는 뺌, 모르면(총평·편람) ② — 덩이 1은 사업이 달라도 같음", () => {
  const kpi = (key: string, indicator: string, unit_type = "qa_pair") => c({ chunk_key: key, doc_id: "att3-2604", unit_type, business: "BZ-4", seq: 10, meta: { metric_2025: indicator } });
  const all = [
    ...chunks,
    kpi("att3/BZ-4/Q1", "전파품질 조기 안정화 기여도"),
    kpi("att3/BZ-4/Q5", "인명구조 및 재난경보 무선국 관리 강화 성과"),
    c({ chunk_key: "plan/eval25/BZ-4/total/fit/p01", unit_type: "evaluator_comment", business: "BZ-4", seq: 11 }),
    c({ chunk_key: "plan/handbook26/BZ-4", unit_type: "handbook_indicator", business: "BZ-4", seq: 12 }),
  ];
  const at = (key: string, unit: string) => layerOf(all.find((x) => x.chunk_key === key)!, unit);
  assert.deepEqual(["att3/BZ-4/Q1", "att3/BZ-4/Q5", "plan/eval25/BZ-4/total/fit/p01", "plan/handbook26/BZ-4"].map((k) => at(k, "BZ-1")), ["business", null, "common", "common"]);
  assert.deepEqual(["att3/BZ-4/Q1", "att3/BZ-4/Q5"].map((k) => at(k, "BZ-2")), [null, "business"]);
  const p = assistPrompts().prompts;
  const t1 = sharedTexts(p, buildBundle(all, { evalUnitId: "BZ-1", data: { title: "", executionTask: "" } }));
  const t2 = sharedTexts(p, buildBundle(all, { evalUnitId: "BZ-2", data: { title: "", executionTask: "" } }));
  assert.equal(t1[0], t2[0], "①②는 사업이 달라도 바이트까지 같음(캐시 공유)");
  assert.match(t1[1], /<source key="att3\/BZ-4\/Q1"/);
  assert.ok(!t1.join("\n").includes("att3/BZ-4/Q5"), "다른 사업 지표 조각은 요청에 없음");
  assert.match(t2[1], /<source key="att3\/BZ-4\/Q5"/);
  assert.match(t1[0], /plan\/eval25\/BZ-4\/total\/fit\/p01/);
});

test("근거 조각의 위치(where)에 판 표지가 붙음: '25 지표가 '26 편람에서 폐지·명칭 변경·교체면 알리고, 편람(최초) 조각은 개선(안) 모습을 알림", () => {
  const all = [
    c({ chunk_key: "att3/qa/BZ-2/old", doc_id: "att3-2604", unit_type: "qa_pair", business: "BZ-2", context_prefix: "2025 실사 · 질문", meta: { metric_relation: "폐지", metric_2026: null } }),
    c({ chunk_key: "plan-2607/handbook26/BZ-2", unit_type: "handbook_indicator", business: "BZ-2", context_prefix: "'26 편람 · 주요사업2" }),
    c({ chunk_key: "att3/qa/BZ-2/same", doc_id: "att3-2604", unit_type: "qa_pair", business: "BZ-2", context_prefix: "2025 실사 · 유지 지표", meta: { metric_relation: "유지" } }),
  ];
  const where = (key: string) => bundleRefs(buildBundle(all, { evalUnitId: "BZ-2", data: { title: "", executionTask: "" } })).find((r) => r.key === key)?.where;
  assert.equal(where("att3/qa/BZ-2/old"), "2025 실사 · 질문 · ※ '25 지표 — '26 편람에서 폐지");
  assert.match(where("plan-2607/handbook26/BZ-2")!, /^'26 편람 · 주요사업2 · ※ 7월판 개선\(안\) 기준: 배점 15점/);
  assert.equal(where("att3/qa/BZ-2/same"), "2025 실사 · 유지 지표", "유지 지표는 표지 없음");
});
