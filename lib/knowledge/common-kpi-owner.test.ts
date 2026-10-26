import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSeedInput } from "../db/seed-files.ts";
import { HAS_SEED_CARDS } from "../testing/originals.ts";
import { commonKpiOwner } from "./common-kpi-owner.ts";

const c = (chunk_key: string, over: { text?: string; context_prefix?: string; meta?: Record<string, unknown> } = {}) => ({ chunk_key, text: "", context_prefix: null, meta: null, ...over });

test("키에 사업이 적힌 평가위원 의견은 그 사업, 총평(total)은 모르는 것으로", () => {
  assert.equal(commonKpiOwner(c("plan-2607/eval25/BZ-4/BZ-2/fit/p01")), "BZ-2");
  assert.equal(commonKpiOwner(c("plan-2607/eval25/BZ-4/BZ-3/chal/p02")), "BZ-3");
  assert.equal(commonKpiOwner(c("plan-2607/eval25/BZ-4/total/fit/p01")), null);
});

test("지적 행의 metric_tag와 실사 질의응답의 metric_2025로 사업을 판별", () => {
  const tag = (t: string) => commonKpiOwner(c("mid25-biz/BZ-4/01", { meta: { metric_tag: t } }));
  assert.deepEqual(["전파품질", "공공용", "인명안전", "전자파", "기금", "방송"].map(tag), ["BZ-1", "BZ-1", "BZ-2", "BZ-2", "BZ-3", "BZ-3"]);
  const m25 = (t: string) => commonKpiOwner(c("att3-2604/s1/Q01", { meta: { metric_2025: t } }));
  assert.equal(m25("전파품질 조기 안정화 기여도"), "BZ-1");
  assert.equal(m25("인명구조 및 재난경보 무선국 관리 강화 성과"), "BZ-2");
  assert.equal(m25("생활환경 전자파 안심 사회 구현 성과"), "BZ-2");
  assert.equal(m25("국내 방송콘텐츠 공동제작 및 투자 활성화"), "BZ-3");
  assert.equal(m25("ICT기금재정 효율화 성과"), "BZ-3", "띄어쓰기가 달라도 같은 지표");
});

test("metric_2025가 없는 분할 조각·요청 자료는 질문 머리 괄호의 지표명으로, 증빙 그림은 위치 글의 부모 질문으로", () => {
  assert.equal(commonKpiOwner(c("att3-2604/s1/Q02/part1", { text: "질문: (전파품질 조기 안정화 기여도) 이 지표는 이동통신사의 망 투자실적에 크게 의존하는…" })), "BZ-1");
  assert.equal(commonKpiOwner(c("att3-2604/s2/R06", { text: "요청: (ICT기금 재정 효율화 성과) 분담금 조성 현황" })), "BZ-3");
  assert.equal(commonKpiOwner(c("att3-2604/s1/Q/ev/11-1", { context_prefix: "2025 주요사업 실사 질문·요청 답변자료('26.4.2) · 증빙 11-1 · 질문 11: (ICT기금재정 효율화 성과) ICT기금 분담금 조성 정책목표" })), "BZ-3");
});

test("판별 못 하면 null(빼지 않음): 소속이 바뀐 지표·여러 사업에 걸친 글·편람·글 없음", () => {
  assert.equal(commonKpiOwner(c("att3-2604/s2/Q20", { text: "질문: (근로자 무사고 달성 노력) 무사고 달성 방법" })), null, "근로자 무사고 달성 노력은 주요사업2→1로 옮겨진 지표라 일부러 뺌");
  assert.equal(commonKpiOwner(c("att3-2604/s2/Q21", { text: "질문: (전파품질 및 ICT기금 지표) 비교" })), null, "두 사업 지표가 섞이면 모름");
  assert.equal(commonKpiOwner(c("plan-2607/handbook26/BZ-4/c1", { text: "공통지표 편람 설명" })), null);
  assert.equal(commonKpiOwner(c("up-1/g0001")), null);
});

test("적재 때 기록한 meta.related_business(지표 사전)가 1순위 — 이름이 다른 사업을 가리켜도 이 값을, BZ-1~3이 아닌 값은 건너뜀", () => {
  const withRb = (rb: unknown, over: { text?: string; meta?: Record<string, unknown> } = {}) => commonKpiOwner(c("att3-2604/s1/Q01", { text: "질문: (전파품질 조기 안정화 기여도) 설명", ...over, meta: { related_business: rb, ...over.meta } }));
  assert.equal(withRb("BZ-2"), "BZ-2", "사전 값이 이름 판별(BZ-1)보다 먼저");
  assert.equal(commonKpiOwner(c("mid25-biz/BZ-4/01", { meta: { related_business: "BZ-3", metric_tag: "전파품질" } })), "BZ-3");
  for (const bad of [null, undefined, "BZ-4", "BZ-9", 1]) assert.equal(withRb(bad), "BZ-1", `쓸 수 없는 값(${String(bad)})이면 이름 판별로`);
  assert.equal(commonKpiOwner(c("plan-2607/eval25/BZ-4/total/fit/p01", { meta: { related_business: null } })), null, "총평은 사업이 없음");
});

// readSeedInput은 카드 원본(seed/cards — git 밖)도 읽으므로, 없으면 공통 지식도 없는 것으로 봄
const seed = HAS_SEED_CARDS ? readSeedInput(resolve(import.meta.dirname, "../..")) : { knowledgeAvailable: false, chunks: undefined };
test("실제 적재 조각(이 컴퓨터에 있을 때): 사전 값(related_business)이 있는 공통지표 조각은 이름 판별(보조)과 같은 사업 — 사전과 이름 규칙이 어긋나지 않음", { skip: !seed.knowledgeAvailable && "공통 지식 적재 결과(resources/knowledge/_chunks)가 없음" }, () => {
  const all = (seed as unknown as { chunks: Array<{ chunk_key: string; business: string | null; text: string | null; context_prefix: string | null; meta: Record<string, unknown> | null }> }).chunks.filter((x) => x.business === "BZ-4" && typeof x.meta?.related_business === "string");
  assert.ok(all.length > 0);
  for (const x of all) assert.equal(commonKpiOwner({ ...x, meta: { ...x.meta, related_business: undefined } }), x.meta!.related_business, x.chunk_key);
});
