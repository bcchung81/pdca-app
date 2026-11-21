import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { KnowledgeRef } from "../ai/writer.ts";
import { WRITER_MODES, type WriterMode } from "../ai/writer.ts";
import { type KnowledgeBundle, bundleRefs, listText, sharedTexts } from "./bundle.ts";
import { RAW_INDICATOR_RULES, REFLECT_SCOPE, SOURCE_GROUPS, SOURCE_GROUP_IDS, type SourceGroup, groupOf, inScope, keepIndicatorRule, scopeBundle, writerBundleOpts, writerScope } from "./mode-profile.ts";
import { chunkRole } from "./chunk-role.ts";
import { BIZ_TRACK, MGMT_TRACK, TRACK_SPECS } from "../tracks/index.ts";
import { applySelection, rolesOf } from "./select.ts";
import { assistPromptsMg } from "../prompts/sets.ts";

const MODES = Object.keys(WRITER_MODES) as WriterMode[];

/** chunk-role.ts의 ROLE_OF_UNIT 키(내보내지 않는 표라 원문에서 읽음) — 새 조각 종류가 생기면 갈래 표에도 넣으라는 경보 */
function roleUnits(): string[] {
  const src = readFileSync(join(import.meta.dirname, "chunk-role.ts"), "utf8");
  const body = /const ROLE_OF_UNIT: Record<string, ChunkRole> = \{([\s\S]*?)\n\};/.exec(src)?.[1] ?? "";
  return [...body.matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]);
}

test("갈래 표: chunk-role.ts의 조각 종류가 모두 한 갈래에 들고(그 밖 아님), 한 종류가 두 갈래에 들지 않음", () => {
  const units = roleUnits();
  assert.ok(units.length >= 20, `ROLE_OF_UNIT 키를 읽지 못함(${units.length})`);
  for (const u of units) assert.notEqual(groupOf(u), "other", u);
  const all = SOURCE_GROUP_IDS.flatMap((g) => SOURCE_GROUPS[g].units);
  assert.equal(new Set(all).size, all.length, "같은 종류가 두 갈래에");
  assert.deepEqual(SOURCE_GROUPS.other.units, []);
  assert.equal(groupOf("generic_section"), "other", "일반 문서는 그 밖(늘 넣음)");
  assert.equal(groupOf("모르는_종류"), "other");
  // 지침의 「사용하지 않는 자료」 = 점검표가 대신하는 자료
  assert.deepEqual([...SOURCE_GROUPS.replaced.units].sort(), ["checklist_group", "evaluator_comment", "finding_row", "handbook_indicator", "peer_case", "plan_section"]);
  assert.equal(groupOf("consult_comment"), "consult");
  assert.equal(groupOf("task_list_row"), "strategy");
});

test("요청 종류 × 점검표 유무 → 넣는 갈래·뺀 종류·선별·점검표 요약(주요사업)", () => {
  const ALL = SOURCE_GROUP_IDS;
  const NO_REPLACED = ALL.filter((g) => g !== "replaced");
  const want: Record<WriterMode, Record<"없음" | "있음", { groups: readonly SourceGroup[]; drop: string[]; select: boolean; inspection: boolean }>> = {
    improve: { 없음: { groups: ALL, drop: ["peer_case"], select: true, inspection: false }, 있음: { groups: NO_REPLACED, drop: ["peer_case"], select: true, inspection: true } },
    discover: { 없음: { groups: ALL, drop: [], select: true, inspection: false }, 있음: { groups: NO_REPLACED, drop: [], select: true, inspection: true } },
    reflect: { 없음: { groups: ["strategy", "other"], drop: [], select: false, inspection: false }, 있음: { groups: ["strategy", "other"], drop: [], select: false, inspection: true } },
    followup: { 없음: { groups: NO_REPLACED, drop: [], select: true, inspection: false }, 있음: { groups: NO_REPLACED, drop: [], select: true, inspection: false } },
  };
  for (const mode of MODES)
    for (const has of [false, true]) {
      const s = writerScope(mode, has, BIZ_TRACK);
      const w = want[mode][has ? "있음" : "없음"];
      const at = `${mode} 점검표 ${has ? "있음" : "없음"}`;
      assert.deepEqual([...s.groups], [...w.groups], at);
      assert.deepEqual([...s.dropUnits], w.drop, at);
      assert.deepEqual([...s.extraUnits], mode === "reflect" && !has ? ["checklist_group"] : [], `${at} — 갈래 밖 추가 종류`);
      assert.equal(s.select, w.select, at);
      assert.equal(s.inspection, w.inspection, at);
      assert.equal(writerBundleOpts(s).select, w.select, `${at} — loadCardBundle opts.select`);
    }
});

test("실적 반영은 트랙 표(REFLECT_SCOPE): 주요사업 지표·전략 + 그 밖·선별 안 씀(지침 09), 경영관리 + 실사·전년 보고서·선별 따름(지침 08 §7 4·5, §8 1) — 다른 요청 종류는 두 트랙 같음", () => {
  assert.deepEqual(Object.keys(REFLECT_SCOPE).sort(), Object.keys(TRACK_SPECS).sort(), "모든 트랙에 자리");
  for (const has of [false, true]) {
    const biz = writerScope("reflect", has, BIZ_TRACK);
    assert.deepEqual([...biz.groups], ["strategy", "other"]);
    assert.equal(biz.select, false);
    const mg = writerScope("reflect", has, MGMT_TRACK);
    assert.deepEqual([...mg.groups], ["survey", "strategy", "prior", "other"]);
    assert.equal(mg.select, true);
    assert.equal(mg.inspection, has);
    assert.deepEqual([...mg.dropUnits], []);
    assert.deepEqual([...biz.extraUnits], has ? [] : ["checklist_group"], "실적 반영: 점검표가 없을 때만 자가진단 체크리스트(주요사업)");
    assert.deepEqual([...mg.extraUnits], has ? [] : ["checklist_group"], "실적 반영: 점검표가 없을 때만 자가진단 체크리스트(경영관리)");
    for (const mode of MODES.filter((m) => m !== "reflect")) assert.deepEqual(writerScope(mode, has, MGMT_TRACK), writerScope(mode, has, BIZ_TRACK), mode);
  }
  const units = unitsOf(scopeBundle(sample(), writerScope("reflect", false, MGMT_TRACK)));
  for (const u of ["qa_pair", "qa_part", "request_evidence", "evidence_image", "report_section", "report_chapter", "pool_indicator", "generic_section"]) assert.ok(units.has(u), `경영관리 실적 반영: ${u} 남김`);
  for (const u of ["evaluator_comment", "finding_row", "corrective_action", "core_item", "peer_case"]) assert.ok(!units.has(u), `경영관리 실적 반영: ${u} 뺌`);
  assert.ok(units.has("checklist_group"), "경영관리 실적 반영(점검표 없음): 자가진단 체크리스트는 남김");
  for (const track of [BIZ_TRACK, MGMT_TRACK]) {
    const withIns = unitsOf(scopeBundle(sample(), writerScope("reflect", true, track)));
    const without = unitsOf(scopeBundle(sample(), writerScope("reflect", false, track)));
    assert.ok(!withIns.has("checklist_group") && without.has("checklist_group"), `${track.id}: 체크리스트는 점검표가 없을 때만`);
    for (const u of ["plan_section", "handbook_indicator", "peer_case", "evaluator_comment", "finding_row"]) assert.ok(!without.has(u), `${track.id}: 다른 점검표 대신 자료(${u})는 계속 뺌`);
  }
  assert.equal(scopeBundle(sample(), writerScope("reflect", false, MGMT_TRACK)).consult, undefined, "컨설팅 의견은 안 넣음");
});

// 종류마다 조각 하나씩 — 층은 실제 모양처럼 나눔(①: 기관 공통 기준·사례·지표, ②: 가점 실사, ③: 이 사업 나머지)
const ref = (key: string, unitType: string): KnowledgeRef => ({ key, title: `제목 ${key}`, unitType, text: `본문 ${key} — 「원문 구절 ${key}」`, where: "" });
const LAYER_UNITS = {
  institution: ["plan_section", "checklist_group", "handbook_indicator", "goal_indicator", "ceo_indicator", "ax_task", "peer_case", "generic_section"],
  common: ["qa_pair", "qa_part", "request_evidence", "evidence_image"],
  business: ["handbook_indicator", "pool_indicator", "evaluator_comment", "finding_row", "corrective_action", "qa_pair", "report_section", "report_chapter", "core_item"],
} as const;
function sample(): KnowledgeBundle {
  const layers = (Object.keys(LAYER_UNITS) as Array<keyof typeof LAYER_UNITS>).map((id) => ({ id, refs: LAYER_UNITS[id].map((u, i) => ref(`${id}/${u}/${i}`, u)) }));
  const keys = layers.flatMap((l) => l.refs.map((r) => r.key));
  return {
    unit: "BZ-1",
    layers,
    list: { relevant: keys.filter((_, i) => i % 3 === 0), taskRow: ref("plan-2607/task/1-가", "task_list_row"), peers: keys.filter((k) => k.includes("peer_case")), prior: keys.filter((k) => k.includes("report_section")), similar: [...keys].reverse() },
    consult: [ref("consult26-mg/r1/1-1", "consult_comment")],
  };
}
const unitsOf = (b: KnowledgeBundle) => new Set(b.layers.flatMap((l) => l.refs.map((r) => r.unitType)));

test("묶음 줄이기: 요청 종류마다 남는 갈래, 목록 키는 층에 남은 조각만, 과제 목록 행·컨설팅 의견도 범위대로", () => {
  for (const mode of MODES)
    for (const has of [false, true]) {
      const scope = writerScope(mode, has, BIZ_TRACK);
      const b = scopeBundle(sample(), scope);
      const at = `${mode} 점검표 ${has ? "있음" : "없음"}`;
      for (const u of unitsOf(b)) assert.ok(inScope(scope, u), `${at}: ${u}가 남음`);
      for (const u of unitsOf(sample())) if (inScope(scope, u)) assert.ok(unitsOf(b).has(u), `${at}: ${u}가 빠짐`);
      const inLayers = new Set(b.layers.flatMap((l) => l.refs.map((r) => r.key)));
      for (const k of [...b.list.relevant, ...b.list.peers, ...b.list.prior, ...b.list.similar]) assert.ok(inLayers.has(k), `${at}: 목록 키 ${k}가 층에 없음`);
      assert.equal(b.list.taskRow?.key, "plan-2607/task/1-가", `${at}: 과제 목록 행은 지표·전략 — 모든 요청 종류에 남음`);
      assert.equal(b.consult?.length ?? 0, scope.groups.includes("consult") ? 1 : 0, at);
      // 인용 대조 근거(bundleRefs) = 요청에 든 원문만
      assert.deepEqual(new Set(bundleRefs(b).map((r) => r.key)), new Set([...inLayers, "plan-2607/task/1-가"]), at);
    }
  // 대표 경우를 글자로
  const improve = unitsOf(scopeBundle(sample(), writerScope("improve", false, BIZ_TRACK)));
  assert.ok(!improve.has("peer_case") && improve.has("evaluator_comment") && improve.has("plan_section"), "개선 제안(점검표 없음): 붙임2만 뺌");
  const improveIns = unitsOf(scopeBundle(sample(), writerScope("improve", true, BIZ_TRACK)));
  for (const u of ["checklist_group", "evaluator_comment", "handbook_indicator", "plan_section", "peer_case", "finding_row"]) assert.ok(!improveIns.has(u), `개선 제안(점검표 있음): ${u} 뺌`);
  for (const u of ["qa_pair", "pool_indicator", "report_section", "corrective_action", "core_item", "generic_section"]) assert.ok(improveIns.has(u), `개선 제안(점검표 있음): ${u} 남김`);
  assert.deepEqual([...unitsOf(scopeBundle(sample(), writerScope("reflect", true, BIZ_TRACK)))].sort(), ["ax_task", "ceo_indicator", "generic_section", "goal_indicator", "pool_indicator"], "실적 반영: 지표·전략 + 그 밖");
  assert.deepEqual([...unitsOf(scopeBundle(sample(), writerScope("reflect", false, BIZ_TRACK)))].sort(), ["ax_task", "ceo_indicator", "checklist_group", "generic_section", "goal_indicator", "pool_indicator"], "실적 반영(점검표 없음): + 자가진단 체크리스트");
  assert.deepEqual(scopeBundle(sample(), writerScope("reflect", false, BIZ_TRACK)).layers.find((l) => l.id === "common")?.refs, [], "실적 반영: 가점 실사 층은 비움");
});

test("묶음 줄이기: 다 범위 안이면(실적 발굴·점검표 없음) 입력과 같은 묶음이고 요청 앞 공유 덩이·목록 글이 바이트까지 같음", () => {
  const p = assistPromptsMg().prompts; // 컨설팅 의견 절(kb.consult)은 경영관리 프롬프트에만
  const before = sample();
  const after = scopeBundle(sample(), writerScope("discover", false, BIZ_TRACK));
  assert.deepEqual(after, before);
  assert.deepEqual(sharedTexts(p, after), sharedTexts(p, before));
  assert.equal(listText(p, after), listText(p, before));
  const noConsult = { ...sample(), consult: undefined };
  delete noConsult.consult;
  assert.ok(!("consult" in scopeBundle(noConsult, writerScope("discover", false, BIZ_TRACK))), "컨설팅 의견이 없으면 칸도 없음(예전 모양)");
});

test("선별 방식과 함께: 줄인 묶음에서 고르므로 범위 밖 조각은 고른 원문·인용 대조(select.all)에 없음 — 선별 결과 키에 있어도", () => {
  const b = scopeBundle(sample(), writerScope("improve", true, BIZ_TRACK));
  const all = sample().layers.flatMap((l) => l.refs);
  const roles = rolesOf(all.map((r) => ({ chunk_key: r.key, doc_id: r.key.split("/")[0], seq: 0, unit_type: r.unitType, track: "주요사업", business: null, title: r.title, text: r.text, context_prefix: null, meta: null })));
  const sel = applySelection(b, { keys: all.map((r) => r.key), digest: { track: "규칙 요약", unit: "규칙 요약" } }, roles);
  const removed = new Set(all.filter((r) => groupOf(r.unitType) === "replaced").map((r) => r.key));
  assert.ok(sel.select!.picked.length > 0);
  for (const r of [...sel.select!.picked, ...sel.select!.all, ...bundleRefs(sel)]) assert.ok(!removed.has(r.key), r.key);
  assert.ok(!sel.select!.unpicked.some((u) => removed.has(u.key)), "제목 목록에도 범위 밖 조각은 없음");
  assert.equal(sel.select!.digest.track, "규칙 요약", "공통 규칙 문서는 갈래로 나눌 수 없어 그대로(한계)");
});

test("지표 기준류(RAW_INDICATOR_RULES): 갈래 표에 있는 기준류(rule)만 — Pool·중장기·기관장은 층 상관없이, 편람은 ③ 이 사업 층만 원문으로", () => {
  for (const u of Object.keys(RAW_INDICATOR_RULES)) {
    assert.notEqual(groupOf(u), "other", `${u}가 갈래 표에 없음`);
    assert.equal(chunkRole({ doc_id: "x", unit_type: u }), "rule", `${u}는 기준류가 아님 — 원래 원문이라 술어가 필요 없음`);
  }
  for (const u of ["pool_indicator", "goal_indicator", "ceo_indicator"]) for (const l of ["institution", "common", "business"] as const) assert.equal(keepIndicatorRule({ unitType: u }, l), true, `${u} ${l}`);
  assert.equal(keepIndicatorRule({ unitType: "handbook_indicator" }, "business"), true);
  for (const l of ["institution", "common"] as const) assert.equal(keepIndicatorRule({ unitType: "handbook_indicator" }, l), false, `편람 ${l}`);
  for (const u of ["plan_section", "checklist_group", "task_list_row", "evaluator_comment", "모르는_종류"]) assert.equal(keepIndicatorRule({ unitType: u }, "business"), false, u);
  for (const mode of MODES) for (const has of [false, true]) assert.equal(writerBundleOpts(writerScope(mode, has, BIZ_TRACK)).keepRules, keepIndicatorRule, `${mode} ${has}`);
});
