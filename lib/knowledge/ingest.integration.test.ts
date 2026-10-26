// 실제 원본(resources/knowledge/_parsed)이 있을 때만 도는 통합 테스트. 원본은 git에 없으므로 없으면 건너뜁니다.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { KNOWLEDGE_DOCUMENTS } from "./documents.ts";
import { runIngest } from "./pipeline.ts";
import { pickPrior, toPriorSection } from "../reports/prior.ts";
import { NO_SEED_CARDS } from "../testing/originals.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const PARSED = join(ROOT, "resources/knowledge/_parsed");
const specs = KNOWLEDGE_DOCUMENTS.filter((d) => d.status === "ingest");
const available = specs.every((s) => existsSync(join(PARSED, `${s.parsed_name}.chunks.json`)));

test("공통 지식 적재: 검산 전부 통과, 결과는 매번 같음", { skip: NO_SEED_CARDS || (available ? false : "resources/knowledge/_parsed 없음") }, () => {
  const inputs = specs.map((spec) => ({ spec, sha256: null, kordoc: JSON.parse(readFileSync(join(PARSED, `${spec.parsed_name}.chunks.json`), "utf8")) }));
  const cards = (JSON.parse(readFileSync(join(ROOT, "seed/cards/260916/biz-260916.json"), "utf8")) as { cards: unknown[] }).cards;

  const a = runIngest(inputs, cards);
  const failed = a.checks.filter((c) => c.level === "error" && !c.ok);
  assert.deepEqual(failed, [], "error 검산 실패");

  const all = Object.values(a.chunks).flat();
  assert.equal(all.filter((c) => c.unit_type === "finding_row" && c.doc_id === "mid25-biz").length, 48);
  assert.equal(all.filter((c) => c.unit_type === "finding_row" && c.doc_id === "mid25-mg").length, 70, "경영관리 중간보고서 지적(경영관리 59 + 가점 11)");
  // 카드 작성 안내 붙임(지표·AX): Pool 71 · 중장기 전략과제 12 · 기관장 성과목표 4 · AX 24
  const count = (u: string) => all.filter((c) => c.unit_type === u).length;
  assert.deepEqual([count("pool_indicator"), count("goal_indicator"), count("ceo_indicator"), count("ax_task")], [71, 12, 4, 24]);
  // 2025 경영실적보고서 평가내용2 소항목 62(주요사업 19·21·22) — 경평 초안의 과거 실적 근거
  const rpt = all.filter((c) => c.unit_type === "report_section" && c.doc_id === "rpt25-biz");
  // 2025 경영실적보고서(경영관리) 지표별 14개: 절 167 + 장 단위 160 (주요사업 보고서 소항목과 섞이지 않음)
  const rptMg = all.filter((c) => c.doc_id.startsWith("rpt25-mg-"));
  assert.deepEqual([rptMg.filter((c) => c.unit_type === "report_section").length, rptMg.filter((c) => c.unit_type === "report_chapter").length], [167, 160]);
  assert.deepEqual(["BZ-1", "BZ-2", "BZ-3"].map((b) => rpt.filter((c) => c.business === b).length), [19, 21, 22]);
  assert.ok(rpt.every((c) => c.report_page_2025 && (c.meta as { task_title?: string }).task_title), "소항목마다 인쇄 쪽·실행과제 제목");
  // 카드 ↔ 전년 절 짝(눈으로 확인한 표본): 같은 일을 한 과제는 그 절이 첫째
  const secs = rpt.map((c) => toPriorSection({ ...c, meta: c.meta }));
  const cardOf = (id: string) => (cards as Array<Record<string, unknown>>).find((c) => c.id === id)!;
  for (const [id, key] of [
    ["주요사업1/1-가", "rpt25-biz/BZ-1/1-1/가"],
    ["주요사업1/2-가", "rpt25-biz/BZ-1/1-2/나"],
    ["주요사업1/7-나", "rpt25-biz/BZ-1/2-3/나"],
    ["주요사업2/1-라", "rpt25-biz/BZ-2/1-1/다"],
    ["주요사업3/4-나", "rpt25-biz/BZ-3/1-4/나"],
  ]) {
    const c = cardOf(id);
    const picks = pickPrior(c, secs.filter((s) => s.business === `BZ-${String(c.group).replace("주요사업", "")}`));
    assert.equal(picks[0]?.section.key, key, `${id} → ${picks[0]?.section.key}`);
  }
  assert.equal(new Set(all.map((c) => c.chunk_key)).size, all.length, "chunk_key 중복");
  for (const c of all) {
    assert.ok(c.blocks.length > 0 && c.blocks.every((b) => b.trim()), `${c.chunk_key}: 빈 블록`);
    assert.ok(c.search_text.length > 0, `${c.chunk_key}: search_text 없음`);
    assert.ok(!/[･‧․ㆍ]/.test(c.search_text), `${c.chunk_key}: 가운뎃점 변종 남음`);
  }

  // 같은 입력이면 같은 결과(재현성)
  const b = runIngest(
    specs.map((spec) => ({ spec, sha256: null, kordoc: JSON.parse(readFileSync(join(PARSED, `${spec.parsed_name}.chunks.json`), "utf8")) })),
    cards,
  );
  assert.equal(JSON.stringify(b.chunks), JSON.stringify(a.chunks));
});
