import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSeedInput } from "../db/seed-files.ts";
import { HAS_SEED_CARDS } from "../testing/originals.ts";
import { NEW_METRICS_2026 } from "./dictionaries.ts";
import { HANDBOOK_REVISIONS_2607, METHOD_NOTE, SOURCE_ERRATA, revisionNote, whereWithNote } from "./revision-note.ts";

test("편람(최초) 조각 중 7월판 개선(안)으로 바뀐 것에 개선(안) 모습을 알림", () => {
  const n = (key: string) => revisionNote({ chunk_key: key, unit_type: "handbook_indicator" });
  assert.match(n("plan-2607/handbook26/BZ-1")!, /^※ 7월판 개선\(안\) 기준: 배점 23점/);
  assert.match(n("plan-2607/handbook26/BZ-2")!, /배점 15점.*주요사업1로 이동/);
  assert.match(n("plan-2607/handbook26/BZ-2/m1")!, /3점:5점/);
  assert.match(n("plan-2607/handbook26/BZ-2/m2")!, /주요사업1로 이동·재배치/);
  assert.match(n("plan-2607/handbook26/BZ-3/m1")!, /지표 신설\(기금 운용평가 결과 1점\).*1점:3점:1점/);
  assert.equal(n("plan-2607/handbook26/BZ-1/m1"), null, "바뀌지 않은 지표는 표지 없음");
});

test("'25 자료의 지표가 '26 편람에서 명칭 변경·교체·폐지면 알림, 유지·정보 없음·편람 조각은 표지 없음", () => {
  const n = (meta: Record<string, unknown> | null, unit_type = "qa_pair", chunk_key = "att3-2604/s2/Q11") => revisionNote({ chunk_key, unit_type, meta });
  assert.equal(n({ metric_relation: "명칭 변경", metric_2026: "기금 재정 효율화 성과" }), "※ '25 지표 — '26 편람에서 「기금 재정 효율화 성과」로 명칭 변경");
  assert.equal(n({ metric_relation: "교체", metric_2026: "국내 방송콘텐츠 OTT 방영 성과" }), "※ '25 지표 — '26 편람에서 「국내 방송콘텐츠 OTT 방영 성과」로 교체");
  assert.equal(n({ metric_relation: "폐지", metric_2026: null }), "※ '25 지표 — '26 편람에서 폐지");
  assert.equal(n({ metric_relation: "유지", metric_2026: "전파품질 조기 안정화 기여도" }), null);
  assert.equal(n({ metric_relation: "명칭 변경", metric_2026: null }), null, "바뀐 이름을 모르면 표지 없음");
  assert.equal(n(null), null);
  assert.equal(n({ metric_relation: "명칭 변경", metric_2026: "기금 재정 효율화 성과" }, "handbook_indicator", "plan-2607/handbook26/BZ-3/m9"), null, "편람 조각은 이미 '26 이름");
});

test("위치 글 = 조각 머리말 + 판 표지, 둘 다 없으면 없음", () => {
  assert.equal(whereWithNote({ chunk_key: "k", context_prefix: "문서 · 위치", meta: { metric_relation: "폐지" }, unit_type: "qa_pair" }), "문서 · 위치 · ※ '25 지표 — '26 편람에서 폐지");
  assert.equal(whereWithNote({ chunk_key: "k", context_prefix: "문서 · 위치" }), "문서 · 위치");
  assert.equal(whereWithNote({ chunk_key: "plan-2607/handbook26/BZ-1", context_prefix: "편람 · 주요사업1", unit_type: "handbook_indicator" })?.startsWith("편람 · 주요사업1 · ※ 7월판 개선(안) 기준"), true);
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

test("지표 사전: 근로자 무사고 달성 노력은 편람(최초)에서 주요사업2, 최종본(7월판 개선(안))에서 주요사업1", () => {
  const m = NEW_METRICS_2026.find((x) => x.name === "근로자 무사고 달성 노력")!;
  assert.deepEqual([m.business, m.business2026], ["BZ-2", "BZ-1"]);
});

// readSeedInput은 카드 원본(seed/cards — git 밖)도 읽으므로, 없으면 공통 지식도 없는 것으로 봄
const seed = HAS_SEED_CARDS ? readSeedInput(resolve(import.meta.dirname, "../..")) : { knowledgeAvailable: false, chunks: undefined };
test("실제 적재 조각(이 컴퓨터에 있을 때): 판·원문 표지를 붙이는 조각 키가 모두 실제로 있음", { skip: !seed.knowledgeAvailable && "공통 지식 적재 결과(resources/knowledge/_chunks)가 없음" }, () => {
  const keys = new Set((seed as unknown as { chunks: Array<{ chunk_key: string }> }).chunks.map((x) => x.chunk_key));
  for (const k of [...Object.keys(HANDBOOK_REVISIONS_2607), ...Object.keys(SOURCE_ERRATA)]) assert.ok(keys.has(k), `${k} 조각이 없음 — 키가 바뀌었으면 표지 표를 고칠 것`);
});
