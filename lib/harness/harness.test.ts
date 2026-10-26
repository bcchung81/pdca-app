// report-harness 고정 사본이 원본 그대로인지, 규칙을 읽을 수 있는지 확인합니다.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { HARNESS_DIR, HARNESS_FILES, HARNESS_SOURCES } from "./files.ts";
import { parseRules, selectRules } from "./rules.ts";
import { NO_PDCA_GUIDES } from "../testing/originals.ts";

const DIR = join(resolve(import.meta.dirname, "../.."), HARNESS_DIR);
const source = JSON.parse(readFileSync(join(DIR, "SOURCE.json"), "utf8")) as {
  commit: string;
  files: Array<{ dest: string; src: string; sha256: string }>;
};

test("사본은 SOURCE.json에 적힌 원본과 바이트가 같다(손으로 고치지 않기)", () => {
  assert.match(source.commit, /^[0-9a-f]{40}$/);
  assert.deepEqual(
    source.files.map((f) => f.dest),
    HARNESS_FILES.map((f) => f.dest),
    "목록이 바뀌었으면 pnpm harness:sync",
  );
  for (const f of source.files) {
    const sha = createHash("sha256").update(readFileSync(join(DIR, f.dest))).digest("hex");
    assert.equal(sha, f.sha256, `${f.dest}가 원본과 다릅니다. report-harness에서 고치고 pnpm harness:sync`);
  }
});

test("모든 고정 사본(pdca 운영 지침 포함)이 SOURCE.json 해시와 같다", { skip: NO_PDCA_GUIDES }, () => {
  const root = resolve(import.meta.dirname, "../..");
  for (const src of HARNESS_SOURCES) {
    const info = JSON.parse(readFileSync(join(root, src.dir, "SOURCE.json"), "utf8")) as { files: Array<{ dest: string; sha256: string }> };
    assert.deepEqual(info.files.map((f) => f.dest), src.files.map((f) => f.dest), `${src.id}: 목록이 바뀌었으면 pnpm harness:sync ${src.id}`);
    for (const f of info.files) {
      const sha = createHash("sha256").update(readFileSync(join(root, src.dir, f.dest))).digest("hex");
      assert.equal(sha, f.sha256, `${src.id}/${f.dest}가 원본과 다릅니다`);
    }
  }
});

test("규칙: 번호 중복 없음, 모든 규칙에 단계 태그", () => {
  const rules = parseRules(readFileSync(join(DIR, "rules.md"), "utf8"));
  assert.ok(rules.length >= 80, `규칙 수 ${rules.length}`);
  assert.equal(new Set(rules.map((r) => r.id)).size, rules.length);
  assert.ok(rules.every((r) => r.tags.length > 0));
  // 이 앱이 기대는 최신 규칙(도식 표·배색·쉬운 말·인용)
  for (const id of ["R089", "R090", "R091", "R092"]) assert.ok(rules.some((r) => r.id === id), `${id} 없음`);
  // 대체 표기를 읽어 따를 규칙으로 돌림
  const r036 = rules.find((r) => r.id === "R036")!;
  assert.ok(r036.superseded && r036.redirects.includes("R042"));
  const draft = selectRules(rules, ["draft"]);
  assert.ok(draft.every((r) => r.tags.includes("draft") && !r.superseded));
  assert.ok(draft.some((r) => r.id === "R091"));
});

test("규칙 읽기: 형식", () => {
  const md = "# t\n- R001 [draft][export] 기호를 남기지 않는다\n- R036 [export] **[상한값 정정 → R042 · 메커니즘은 본 규칙 유효]** 표 폭\n본문 아님";
  const rules = parseRules(md);
  assert.deepEqual(rules.map((r) => [r.id, r.tags, r.superseded, r.redirects]), [
    ["R001", ["draft", "export"], false, []],
    ["R036", ["export"], true, ["R042"]],
  ]);
});
