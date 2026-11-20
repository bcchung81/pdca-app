import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSeedInput } from "../db/seed-files.ts";
import { HAS_SEED_CARDS } from "../testing/originals.ts";
import { NEW_METRICS_2026 } from "./dictionaries.ts";
import { CHECKLIST_REVISIONS, HANDBOOK_REVISIONS, METHOD_NOTE, PLAN_REVISION_NOTES, SOURCE_ERRATA, revisionNote, whereWithNote } from "./revision-note.ts";

test("편람(최초) 조각 중 11.13 수정본으로 바뀐 것에 수정본 모습을 알림 — 7월판 개선(안) 값은 유효한 값으로 남지 않음", () => {
  const n = (key: string) => revisionNote({ chunk_key: key, unit_type: "handbook_indicator" });
  assert.equal(n("plan-2607/handbook26/BZ-1"), null, "주요사업1은 수정본이 바꾸지 않음 — 7월판 23점 표지를 지움");
  assert.match(n("plan-2607/handbook26/BZ-2")!, /^※ 11\.13 수정본 기준: 배점 18점 그대로.*검사 성과 4점.*사전 처리 노력 2점.*현장 개선 노력 2점.*주요사업2 그대로.*hb26r-2611\/handbook26\/BZ-2 조각\)$/);
  assert.match(n("plan-2607/handbook26/BZ-2/m1")!, /개별지표 3개/);
  assert.match(n("plan-2607/handbook26/BZ-2/m2")!, /주요사업2 그대로.*7월판 개선\(안\)의 주요사업1 이동은 수정본에서 다르게 확정됨/);
  assert.match(n("plan-2607/handbook26/BZ-3")!, /배점 16점 그대로.*기금 분담금 재원 조성 성과 3점.*기금운용평가 결과 2점\(신설\)/);
  assert.match(n("plan-2607/handbook26/BZ-3/m1")!, /차입금리 대비 기금 운용수익 성과는 없어짐/);
  for (const k of ["MG-3/k1", "MG-3/k2", "MG-4/k1", "MG-4/k2", "MG-4/k3", "MG-6/k1", "MG-7/k2", "MG-14/k1"]) {
    assert.match(n(`plan-2607/handbook26/${k}`)!, new RegExp(`^※ 11\\.13 수정본 기준: .*hb26r-2611/handbook26/${k} 조각\\)$`), k);
  }
  assert.equal(n("plan-2607/handbook26/BZ-1/m1"), null, "바뀌지 않은 지표는 표지 없음");
  assert.equal(n("plan-2607/handbook26/MG-4/k4"), null, "바뀌지 않은 구성요소(개인정보·사이버)는 표지 없음");
  assert.equal(n("plan-2607/handbook26/MG-7/k1"), null);
  // 요청 때 붙는 표지 어디에도 7월판 개선(안) 값이 「기준」으로 남지 않음 — 7월판을 말하면 「수정본에서 다르게 확정됨」과 함께
  const all = [...Object.values(HANDBOOK_REVISIONS), ...Object.values(PLAN_REVISION_NOTES)];
  assert.ok(all.every((v) => !/7월판 개선\(안\) 기준|배점 23점|배점 15점|3점:5점|1점:3점:1점/.test(v)), "7월판 값이 유효한 값으로 남음");
  assert.ok(all.filter((v) => /7월판/.test(v)).every((v) => /수정본에서 다르게 확정됨/.test(v)));
});

test("7월판 개선(안)·편람 최초 구성을 적은 관리계획 서술 조각에 「수정본에서 다르게 확정됨」 표지", () => {
  for (const k of ["plan-2607/narr/II/ref2/s1", "plan-2607/narr/II/ref2/s2", "plan-2607/narr/II/2/s1"]) {
    assert.match(revisionNote({ chunk_key: k, unit_type: "plan_section" })!, /7월판 개선\(안\) — 11\.13 수정본에서 다르게 확정됨.*hb26r-2611\/handbook26\/BZ-2·BZ-3 조각 참고/, k);
  }
  assert.match(revisionNote({ chunk_key: "plan-2607/narr/II/ref2/s2", unit_type: "plan_section" })!, /주요사업1 20점 그대로·주요사업2 18점·근로자 무사고 달성 노력은 주요사업2 그대로/);
  assert.match(revisionNote({ chunk_key: "plan-2607/narr/II/ref1/s1", unit_type: "plan_section" })!, /^※ 편람 최초\('26\.1\) 총괄표 — 주요사업2·3 계량지표 구성은 11\.13 수정본에서 바뀜/);
  assert.equal(revisionNote({ chunk_key: "plan-2607/narr/II/1/s2", unit_type: "plan_section" }), null);
});

test("편람 수정본 조각(meta.revision)은 이 판이 유효하고 나머지는 대신하는 옛 조각 그대로라고 알림, 신설 지표는 신설이라고", () => {
  const meta = { revision: "2026.11.13", supersedes: ["plan-2607/handbook26/MG-3/k2"], elided: true };
  assert.equal(
    revisionNote({ chunk_key: "hb26r-2611/handbook26/MG-3/k2", unit_type: "handbook_indicator", meta }),
    "※ '26 편람 11.13 수정본(신구대비표 「수정」 쪽) — 이 판이 유효. 바뀐 칸만 옮겨 「⋮」로 줄인 항목과 여기 없는 항목은 plan-2607/handbook26/MG-3/k2 조각('26 편람 최초) 그대로",
  );
  assert.match(revisionNote({ chunk_key: "hb26r-2611/handbook26/BZ-2/m2", unit_type: "handbook_indicator", meta: { revision: "2026.11.13", supersedes: ["plan-2607/handbook26/BZ-2/m1"], new_metric: true } })!, /^※ 수정본에서 새로 생긴 지표 · '26 편람 11\.13 수정본/);
  assert.equal(revisionNote({ chunk_key: "x/handbook26/BZ-2/m9", unit_type: "handbook_indicator", meta: { supersedes: ["a"] } }), null, "판 표지(revision) 없으면 수정본 조각 아님");
});

test("'25 자료의 지표가 '26 편람에서 명칭 변경·교체·폐지면 알림, 유지·정보 없음·편람 조각은 표지 없음", () => {
  const n = (meta: Record<string, unknown> | null, unit_type = "qa_pair", chunk_key = "att3-2604/s2/Q11") => revisionNote({ chunk_key, unit_type, meta });
  assert.equal(n({ metric_relation: "명칭 변경", metric_2026: "기금 재정 효율화 성과" }), "※ '25 지표 — '26 편람에서 「기금 재정 효율화 성과」로 명칭 변경");
  // 수정본에서 나뉜 지표: '25 이름(meta.metric_2025)으로 사전을 찾아 나뉜 사실을 덧붙임
  assert.equal(
    n({ metric_relation: "명칭 변경", metric_2025: "ICT기금 재정 효율화 성과", metric_2026: "기금 재정 효율화 성과" }),
    "※ '25 지표 — '26 편람에서 「기금 재정 효율화 성과」로 명칭 변경 — 11.13 수정본에서 기금 분담금 재원 조성 성과·기금운용평가 결과 2개 지표로 나뉨(차입금리 대비 운용수익은 없어짐)",
  );
  assert.match(n({ metric_relation: "명칭 변경", metric_2025: "인명구조 및 재난경보 무선국 관리 강화 성과", metric_2026: "인명구조 및 재난 관리 강화 성과" })!, /명칭 변경 — 11\.13 수정본에서 인명안전 무선국 검사 성과·사전 처리 노력·현장 개선 노력 3개 지표로 나뉨$/);
  assert.equal(n({ metric_relation: "교체", metric_2025: "국내 방송콘텐츠 공동제작 및 투자 활성화", metric_2026: "국내 방송콘텐츠 OTT 방영 성과" }), "※ '25 지표 — '26 편람에서 「국내 방송콘텐츠 OTT 방영 성과」로 교체", "나뉘지 않은 지표는 덧붙임 없음");
  assert.equal(n({ metric_relation: "교체", metric_2026: "국내 방송콘텐츠 OTT 방영 성과" }), "※ '25 지표 — '26 편람에서 「국내 방송콘텐츠 OTT 방영 성과」로 교체");
  assert.equal(n({ metric_relation: "폐지", metric_2026: null }), "※ '25 지표 — '26 편람에서 폐지");
  assert.equal(n({ metric_relation: "유지", metric_2026: "전파품질 조기 안정화 기여도" }), null);
  assert.equal(n({ metric_relation: "명칭 변경", metric_2026: null }), null, "바뀐 이름을 모르면 표지 없음");
  assert.equal(n(null), null);
  assert.equal(n({ metric_relation: "명칭 변경", metric_2026: "기금 재정 효율화 성과" }, "handbook_indicator", "plan-2607/handbook26/BZ-3/m9"), null, "편람 조각은 이미 '26 이름");
});

test("경영관리 자가진단 체크리스트 조각: 수정본과 번호·문구가 다른 항목에만 「11.13 수정본 기준」 표지, 주요사업 체크리스트는 표지 없음", () => {
  const n = (key: string) => revisionNote({ chunk_key: `plan-2607/checklist/${key}`, unit_type: "checklist_group" });
  const want: Array<[string, RegExp]> = [
    ["MG-3/s1/sd1/g1", /^※ 11\.13 수정본 기준: .*최초 번호·문구.*①이 「청년 등의 신규채용을 포함한 일자리 창출」.*유관기업·대학 협력.*hb26r-2611\/handbook26\/MG-3\/k2 조각\)$/],
    ["MG-3/s1/sd1/g2", /⑥ 공정채용\(신설\)/],
    ["MG-3/s1/sd1/g3", /⑥ 공정채용\(신설\)/],
    ["MG-4/s2/sd2/g2", /안전법령 위반.*포괄적 관리 책임.*MG-4\/k3 조각\)$/],
    ["MG-7/s5/sd2/g1", /세부평가내용 ③.*최초 편람 ②.*수정본 ②는 신설.*MG-7\/k2 조각\)$/],
    ["MG-7/s5/sd2/g2", /세부평가내용 ③/],
    ["MG-7/s5/sd2/g3", /수정본 ③.*지역생산품 우선 구매.*수정본 ② /],
    ["MG-7/s5/sd3/g1", /④ 「시설·장비 개방」\(최초 편람 ③\).*번호만 바뀜/],
    ["MG-7/s5/sd3/g2", /④ 「시설·장비 개방」/],
    ["MG-14/s3/sd3/g1", /청년인턴.*유관기업·대학 협력.*MG-14\/k1 조각\)$/],
  ];
  for (const [k, re] of want) assert.match(n(k)!, re, k);
  // 안 바뀐 MG 체크리스트·같은 지표의 다른 묶음·issues는 표지 없음
  for (const k of ["MG-7/s5/sd1/g1", "MG-7/s5/sd1/g3", "MG-7/s5/issues", "MG-3/s1/sd2/g1", "MG-3/s1/sd3/g1", "MG-3/s1/issues", "MG-4/s2/sd2/g1", "MG-4/s2/sd2/g3", "MG-4/s2/sd1/g1", "MG-6/s4/sd1/g1", "MG-6/s4/sd5/g1", "MG-14/s3/sd3/g2", "MG-14/s3/sd3/g3", "MG-14/s3/sd4/g1", "MG-1/s1/sd1/g1"]) assert.equal(n(k), null, k);
  // 주요사업 체크리스트는 표지 없음(표지는 규칙 문서 해시에 들어가므로 한 글자도 바뀌면 안 됨)
  for (const k of ["BZ-1/s1/sd1/g1", "BZ-2/s2/sd2/g2", "BZ/s1/sd1/g1"]) assert.equal(n(k), null, k);
  assert.ok(Object.keys(CHECKLIST_REVISIONS).every((k) => k.startsWith("plan-2607/checklist/MG-")));
});

test("위치 글 = 조각 머리말 + 판 표지, 둘 다 없으면 없음", () => {
  assert.equal(whereWithNote({ chunk_key: "k", context_prefix: "문서 · 위치", meta: { metric_relation: "폐지" }, unit_type: "qa_pair" }), "문서 · 위치 · ※ '25 지표 — '26 편람에서 폐지");
  assert.equal(whereWithNote({ chunk_key: "k", context_prefix: "문서 · 위치" }), "문서 · 위치");
  assert.equal(whereWithNote({ chunk_key: "plan-2607/handbook26/BZ-2", context_prefix: "편람 · 주요사업2", unit_type: "handbook_indicator" })?.startsWith("편람 · 주요사업2 · ※ 11.13 수정본 기준"), true);
  assert.equal(whereWithNote({ chunk_key: "plan-2607/handbook26/BZ-1", context_prefix: "편람 · 주요사업1", unit_type: "handbook_indicator" }), "편람 · 주요사업1");
  assert.equal(whereWithNote({ chunk_key: "k", context_prefix: "" }), undefined);
});

test("원문 오기·표기 차이 표지: 조각 글은 안 고치고 위치 꼬리표로 알림, 같은 글을 두 번 적은 조각(duplicate_of)은 한 건으로 보라고 알림, 판 표지와 함께 이어 붙음", () => {
  assert.match(revisionNote({ chunk_key: "att3-2604/s4/R01", unit_type: "request_evidence" })!, /^※ 원문 오기: 본문의 「2025년 주요사업2에 관련된 예산요구서」.*주요사업1 절/);
  assert.match(revisionNote({ chunk_key: "plan-2607/narr/I/3/s2" })!, /85\.376으로 적음.*85\.37로 적은 표기 차이/);
  for (const k of ["plan-2607/eval25/BZ-2/e4/p02", "mid25-biz/BZ-2/13"]) assert.match(revisionNote({ chunk_key: k })!, /관리계획 서술 Ⅰ-3은 85\.37로 적음.*85\.376으로 적은 표기 차이/, k);
  assert.match(revisionNote({ chunk_key: "att3-2604/s6/Q14" })!, /수식 기호가 글로 옮겨지지 않아.*짐작해 적지 말 것/);
  assert.equal(revisionNote({ chunk_key: "mid25-biz/BZ-3/05", meta: { duplicate_of: "mid25-biz/BZ-3/04" } }), "※ 원문이 같은 글을 mid25-biz/BZ-3/04 조각에도 적음 — 한 건으로 볼 것");
  assert.equal(revisionNote({ chunk_key: "k", meta: { duplicate_of: null } }), null, "duplicate_of가 비면 표지 없음");
  assert.equal(
    revisionNote({ chunk_key: "att3-2604/s4/R01", unit_type: "request_evidence", meta: { metric_relation: "폐지" } }),
    `※ ${SOURCE_ERRATA["att3-2604/s4/R01"]} · ※ '25 지표 — '26 편람에서 폐지`,
    "원문 표지와 판 표지는 함께",
  );
});

test("경평 초안 작성 방법론 자료(meta.usage = report_method)는 사실·숫자 근거가 아니라고 조각마다 알리고, 다른 표지와 이어 붙음", () => {
  assert.equal(revisionNote({ chunk_key: "up-45de74c5/g0000", unit_type: "generic_section", meta: { generic: true, usage: "report_method" } }), `※ ${METHOD_NOTE}`);
  assert.equal(revisionNote({ chunk_key: "up-1/g0", unit_type: "generic_section", meta: { generic: true } }), null, "방법론이 아니면 표지 없음");
  assert.equal(revisionNote({ chunk_key: "up-1/g0", unit_type: "generic_section", meta: { usage: "other" } }), null, "모르는 용도는 표지 없음");
  assert.equal(
    whereWithNote({ chunk_key: "up-1/g0", context_prefix: "특강 › 1장", unit_type: "generic_section", meta: { usage: "report_method", duplicate_of: "up-1/g9" } }),
    `특강 › 1장 · ※ ${METHOD_NOTE} · ※ 원문이 같은 글을 up-1/g9 조각에도 적음 — 한 건으로 볼 것`,
  );
});

test("지표 사전: 근로자 무사고 달성 노력은 편람(최초)·11.13 수정본 모두 주요사업2(7월판 개선(안)의 주요사업1 이동은 수정본에서 다르게 확정됨)", () => {
  const m = NEW_METRICS_2026.find((x) => x.name === "근로자 무사고 달성 노력")!;
  assert.equal(m.business, "BZ-2");
  assert.match(m.note, /11\.13 수정본에서도 주요사업2 그대로/);
});

// readSeedInput은 카드 원본(seed/cards — git 밖)도 읽으므로, 없으면 공통 지식도 없는 것으로 봄
const seed = HAS_SEED_CARDS ? readSeedInput(resolve(import.meta.dirname, "../..")) : { knowledgeAvailable: false, chunks: undefined };
test("실제 적재 조각(이 컴퓨터에 있을 때): 판·원문 표지를 붙이는 조각 키가 모두 실제로 있음", { skip: !seed.knowledgeAvailable && "공통 지식 적재 결과(resources/knowledge/_chunks)가 없음" }, () => {
  const keys = new Set((seed as unknown as { chunks: Array<{ chunk_key: string }> }).chunks.map((x) => x.chunk_key));
  for (const k of [...Object.keys(HANDBOOK_REVISIONS), ...Object.keys(PLAN_REVISION_NOTES), ...Object.keys(SOURCE_ERRATA)]) assert.ok(keys.has(k), `${k} 조각이 없음 — 키가 바뀌었으면 표지 표를 고칠 것`);
  // 수정본 조각마다 「바뀐 부분은 <새 조각 key>」로 가리킨 key가 실제로 있고, 수정본 조각이 대신하는 옛 조각에는 표지가 있음
  for (const v of Object.values(HANDBOOK_REVISIONS)) {
    const m = /\(바뀐 부분은 (hb26r-2611\/handbook26\/[^ ]+) 조각\)$/.exec(v)!;
    const [head, ...tails] = m[1].split("·");
    for (const k of [head, ...tails.map((t) => head.replace(/[^/]+$/, t))]) assert.ok(keys.has(k), `${k} 수정본 조각이 없음`);
  }
  const revised = (seed as unknown as { chunks: Array<{ chunk_key: string; meta: Record<string, unknown> }> }).chunks.filter((c) => c.chunk_key.startsWith("hb26r-2611/"));
  for (const c of revised) for (const k of c.meta.supersedes as string[]) assert.ok(keys.has(k) && Object.hasOwn(HANDBOOK_REVISIONS, k), `${c.chunk_key}가 대신하는 ${k}에 표지가 없음`);
});

const planFile = resolve(import.meta.dirname, "../../resources/knowledge/_chunks/plan-2607.jsonl");
test("실제 적재 조각(이 컴퓨터에 있을 때): 체크리스트 표 key가 실제 조각에 걸리고, 주요사업 조각(checklist/BZ 포함)에는 체크리스트 표지가 하나도 걸리지 않음", { skip: !existsSync(planFile) && "resources/knowledge/_chunks/plan-2607.jsonl이 없음" }, () => {
  const rows = readFileSync(planFile, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { chunk_key: string; unit_type: string; meta: Record<string, unknown> | null });
  const keys = rows.map((r) => r.chunk_key);
  for (const k of Object.keys(CHECKLIST_REVISIONS)) assert.ok(keys.some((x) => x === k || (k.endsWith("/") && x.startsWith(k))), `${k}에 걸리는 조각이 없음`);
  const hit = rows.filter((r) => revisionNote(r)?.includes("이 자가진단 항목"));
  assert.ok(hit.length >= 8);
  assert.ok(hit.every((r) => r.chunk_key.startsWith("plan-2607/checklist/MG-")), "MG 체크리스트가 아닌 조각에 체크리스트 표지가 걸림");
});
