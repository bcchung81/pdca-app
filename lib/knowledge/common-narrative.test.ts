import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { MGMT_COMMON_NARRATIVE_KEYS, isMgmtCommonNarrative } from "./common-narrative.ts";

const REAL = join(resolve(import.meta.dirname, "../.."), "resources/knowledge/_chunks/plan-2607.jsonl");

test("경영관리 공통 서술: 키 목록에 중복이 없고, 주요사업 전용 서술은 안 들어 있음", () => {
  assert.equal(new Set(MGMT_COMMON_NARRATIVE_KEYS).size, MGMT_COMMON_NARRATIVE_KEYS.length);
  for (const k of ["I/2/s3", "I/ref4/s1", "I/ref6/s3", "II/1/s2", "II/ref2/s1", "II/ref2/s2"]) assert.equal(isMgmtCommonNarrative(`plan-2607/narr/${k}`), false, k);
  assert.equal(isMgmtCommonNarrative("plan-2607/narr/II/2/s2"), true);
});

test("실제 적재 산출물: 키가 모두 서술 조각이고, 경영관리·주요사업 서술 전체가 「공통(포함)」과 「주요사업 전용(제외)」으로 갈림", { skip: !existsSync(REAL) && "원본 산출물이 없음" }, () => {
  const narr = readFileSync(REAL, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((c) => c.unit_type === "plan_section");
  const keys = new Set(narr.map((c) => c.chunk_key as string));
  for (const k of MGMT_COMMON_NARRATIVE_KEYS) assert.ok(keys.has(k), `서술 조각이 아님: ${k}`);
  // 제외되는 주요사업 표시 조각은 제목이 주요사업 전용이거나(총평 <주요사업>·주요사업 지표 변화·계량지표 수정안·기관별 득점) 산업진흥1팀 총평 마지막 묶음(주요사업 팀장)
  const excluded = narr.filter((c) => c.track === "주요사업" && !isMgmtCommonNarrative(c.chunk_key));
  assert.deepEqual(
    excluded.map((c) => c.chunk_key.replace("plan-2607/narr/", "")).sort(),
    ["II/1/s2", "II/ref2/s1", "II/ref2/s2", "I/2/s3", "I/ref4/s1", "I/ref6/s3"].sort(),
  );
  for (const c of excluded.filter((x) => x.chunk_key !== "plan-2607/narr/I/ref6/s3")) assert.match(c.title, /주요사업/, c.chunk_key);
});
