import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type AiFeature,
  FEATURE_EFFORT,
  FEATURE_MAX_TOKENS,
  FEATURE_TIER,
  HEAVY_CLI_MODEL_DEFAULT,
  HEAVY_EFFORT_DEFAULT,
  HEAVY_MODEL_DEFAULT,
  LIGHT_CLI_MODEL_DEFAULT,
  LIGHT_EFFORT_DEFAULT,
  LIGHT_MODEL_DEFAULT,
  lightCliModel,
  lightModel,
  specForFeature,
  tierOf,
  tierSpec,
} from "./models.ts";

test("기본값(사용자 결정 2026-09-30): 두 등급 모두 Sonnet 5.5, light는 effort low·heavy는 xhigh, CLI 별칭은 sonnet", () => {
  assert.deepEqual(tierSpec("light", "api", {}), { model: "claude-sonnet-5-5", cliModel: "sonnet", effort: "low" });
  assert.deepEqual(tierSpec("heavy", "api", {}), { model: "claude-sonnet-5-5", cliModel: "sonnet", effort: "xhigh" });
  assert.equal(LIGHT_MODEL_DEFAULT, HEAVY_MODEL_DEFAULT);
  assert.equal(LIGHT_CLI_MODEL_DEFAULT, HEAVY_CLI_MODEL_DEFAULT);
  assert.equal(LIGHT_EFFORT_DEFAULT, "low");
  assert.equal(HEAVY_EFFORT_DEFAULT, "xhigh");
});

test("기능 → 등급 표: 과제 매칭·첨부 그림 설명만 light, 나머지 기능은 모두 heavy(동작을 바꾸지 않음), 모르는 기능은 heavy", () => {
  assert.equal(FEATURE_TIER.prep_match, "light");
  assert.equal(FEATURE_TIER.material_describe, "light");
  assert.equal(tierOf("material_describe"), "light");
  for (const f of ["card_assist", "card_chat", "card_comment", "inspection", "report_outline", "report_section", "report_block"] as const) assert.equal(FEATURE_TIER[f], "heavy", f);
  assert.equal(tierOf("prep_match"), "light");
  assert.equal(tierOf("card_chat"), "heavy");
  assert.equal(tierOf("옛 기능 이름"), "heavy");
  assert.deepEqual(specForFeature("prep_match", "api", {}), tierSpec("light", "api", {}));
  assert.deepEqual(specForFeature("report_section", "api", {}), { ...tierSpec("heavy", "api", {}), effort: "high" }, "모델·CLI 별칭은 heavy 그대로, effort만 기능별 표(B4)");
});

test("heavy 환경변수: CLAUDE_MODEL_HEAVY가 옛 이름 CLAUDE_MODEL_WRITER보다 앞, 둘 다 비면 기본값", () => {
  assert.equal(tierSpec("heavy", "api", { CLAUDE_MODEL_WRITER: "claude-opus-5-5" }).model, "claude-opus-5-5", "옛 이름도 읽음(호환)");
  assert.equal(tierSpec("heavy", "api", { CLAUDE_MODEL_WRITER: "claude-opus-5-5", CLAUDE_MODEL_HEAVY: "claude-fable-5-1" }).model, "claude-fable-5-1");
  assert.equal(tierSpec("heavy", "api", { CLAUDE_MODEL_HEAVY: "", CLAUDE_MODEL_WRITER: "" }).model, HEAVY_MODEL_DEFAULT);
  assert.equal(tierSpec("heavy", "api", { CLAUDE_MODEL_LIGHT: "claude-haiku-4-5-20251001" }).model, HEAVY_MODEL_DEFAULT, "light 설정이 heavy에 섞이지 않음");
});

test("CLI 별칭: heavy는 CLAUDE_CLI_MODEL_HEAVY(옛 이름 CLAUDE_CLI_MODEL), light는 CLAUDE_CLI_MODEL_LIGHT — 서로 섞이지 않음", () => {
  assert.equal(tierSpec("heavy", "cli", { CLAUDE_CLI_MODEL: "opus" }).cliModel, "opus");
  assert.equal(tierSpec("heavy", "cli", { CLAUDE_CLI_MODEL: "opus", CLAUDE_CLI_MODEL_HEAVY: "fable" }).cliModel, "fable");
  assert.equal(tierSpec("light", "cli", { CLAUDE_CLI_MODEL: "opus" }).cliModel, LIGHT_CLI_MODEL_DEFAULT, "옛 CLAUDE_CLI_MODEL은 heavy 전용");
  assert.equal(tierSpec("light", "cli", { CLAUDE_CLI_MODEL_LIGHT: "haiku" }).cliModel, "haiku");
});

test("effort: 등급별 환경변수, 허용값(low·medium·high·xhigh·max)이 아니면 기본값, 옛 CLAUDE_CLI_EFFORT는 heavy·CLI 경로에서만", () => {
  assert.equal(tierSpec("heavy", "api", { CLAUDE_EFFORT_HEAVY: "high" }).effort, "high");
  assert.equal(tierSpec("heavy", "api", { CLAUDE_EFFORT_HEAVY: "max" }).effort, "max");
  assert.equal(tierSpec("light", "api", { CLAUDE_EFFORT_LIGHT: "medium" }).effort, "medium");
  assert.equal(tierSpec("heavy", "api", { CLAUDE_EFFORT_HEAVY: "xhihg" }).effort, "xhigh", "오타면 기본값");
  assert.equal(tierSpec("light", "api", { CLAUDE_EFFORT_LIGHT: "" }).effort, "low");
  assert.equal(tierSpec("heavy", "cli", { CLAUDE_CLI_EFFORT: "medium" }).effort, "medium", "옛 CLI 변수는 CLI 경로 heavy에 적용");
  assert.equal(tierSpec("heavy", "api", { CLAUDE_CLI_EFFORT: "medium" }).effort, "xhigh", "API 경로에는 적용 안 됨");
  assert.equal(tierSpec("light", "cli", { CLAUDE_CLI_EFFORT: "medium" }).effort, "low", "light에는 적용 안 됨");
  assert.equal(tierSpec("heavy", "cli", { CLAUDE_EFFORT_HEAVY: "high", CLAUDE_CLI_EFFORT: "medium" }).effort, "high", "새 변수가 옛 변수보다 앞");
});

test("기능별 effort(2026-10-07, 경평 2026-10-10 B4): 작성지원·질문·코멘트·블록 고치기·경평 구성안·집필·고치기는 high, 월간 점검은 xhigh 유지, light는 low — 모델은 등급 그대로", () => {
  const eff = (f: string, path: "api" | "cli" = "api", env: Record<string, string | undefined> = {}) => specForFeature(f, path, env).effort;
  for (const f of ["card_assist", "card_chat", "card_comment", "report_block", "report_outline", "report_section", "report_fix"]) assert.equal(eff(f), "high", f);
  assert.equal(eff("inspection"), "xhigh", "월간 점검은 공식 판정이라 유지(B4: 판정 98/100 일치, ★핵심 1건 차이)");
  for (const f of ["prep_match", "material_describe"]) assert.equal(eff(f), "low", f);
  assert.equal(eff("옛 기능 이름"), "xhigh", "표에 없는 기능은 등급 기본값(heavy)");
  assert.deepEqual(specForFeature("card_chat", "api", {}), { ...tierSpec("heavy", "api", {}), effort: "high" }, "effort만 갈리고 모델·CLI 별칭은 등급 그대로");
  for (const f of Object.keys(FEATURE_EFFORT)) assert.ok(f in FEATURE_TIER, `${f}는 등급 표에 있는 기능`);
});

test("기능별 effort 우선순위: 환경변수로 명시한 등급 effort > 기능별 표 > 등급 기본값, 잘못된 값은 표로", () => {
  assert.equal(specForFeature("card_chat", "api", { CLAUDE_EFFORT_HEAVY: "xhigh" }).effort, "xhigh", "운영자가 xhigh를 명시하면 표(high)보다 앞 — 한 줄로 전체 복구");
  assert.equal(specForFeature("inspection", "api", { CLAUDE_EFFORT_HEAVY: "medium" }).effort, "medium", "xhigh 유지 기능도 명시값을 따름");
  assert.equal(specForFeature("card_assist", "api", { CLAUDE_EFFORT_HEAVY: "xhihg" }).effort, "high", "오타는 명시로 안 치고 표를 따름");
  assert.equal(specForFeature("card_chat", "api", { CLAUDE_EFFORT_HEAVY: "" }).effort, "high");
  assert.equal(specForFeature("card_chat", "cli", { CLAUDE_CLI_EFFORT: "medium" }).effort, "medium", "옛 CLI 변수도 CLI 경로에서는 명시값");
  assert.equal(specForFeature("card_chat", "api", { CLAUDE_CLI_EFFORT: "medium" }).effort, "high", "API 경로에는 옛 CLI 변수가 안 닿음");
  assert.equal(specForFeature("prep_match", "api", { CLAUDE_EFFORT_LIGHT: "medium" }).effort, "medium");
  assert.equal(specForFeature("card_chat", "api", { CLAUDE_EFFORT_LIGHT: "max" }).effort, "high", "light 설정이 heavy 기능에 섞이지 않음");
});

test("light 접근자(3-3에서 만든 이름)는 그대로 동작", () => {
  assert.equal(lightModel({}), LIGHT_MODEL_DEFAULT);
  assert.equal(lightModel({ CLAUDE_MODEL_LIGHT: "" }), LIGHT_MODEL_DEFAULT);
  assert.equal(lightModel({ CLAUDE_MODEL_LIGHT: "claude-haiku-4-5-20251001" }), "claude-haiku-4-5-20251001");
  assert.equal(lightCliModel({}), LIGHT_CLI_MODEL_DEFAULT);
  assert.equal(lightCliModel({ CLAUDE_CLI_MODEL_LIGHT: "haiku" }), "haiku");
});

test("FEATURE_MAX_TOKENS(API 출력 상한 — 생각 토큰 포함): effort를 올린 뒤 실측 출력(2026-10-09 로컬 CLI — 작성지원 2.1~2.4만·집필 4.0만·점검 5.7~5.9만·구성안 7.0만)보다 넉넉하고 모델 한도 12.8만 이하", () => {
  const observed: Partial<Record<AiFeature, number>> = { card_assist: 23556, inspection: 59077, report_outline: 70074, report_section: 39974, report_block: 2053, prep_match: 2707 };
  for (const [f, n] of Object.entries(observed)) {
    const cap = FEATURE_MAX_TOKENS[f as AiFeature];
    assert.ok(cap >= n * 1.5, `${f}: 상한 ${cap} < 실측 ${n}의 1.5배`);
    assert.ok(cap <= 128_000, f);
  }
  // heavy 기능은 스트리밍 기본(약 6.4만) 이상
  for (const f of ["card_assist", "card_chat", "card_comment", "inspection", "report_outline", "report_section", "report_block"] as AiFeature[]) assert.ok(FEATURE_MAX_TOKENS[f] >= 64_000, f);
});

test("report_fix(2026-10-10 개선 계획): 경평 집필 자동 고치기 호출은 키만 따로 — 등급·effort·출력 상한은 집필과 같음(B2c effort high는 라운드 V에서 문장 품질이 떨어져 미채택)", () => {
  assert.equal(FEATURE_TIER.report_fix, "heavy", "한 작업에는 한 모델(집필과 같은 등급)");
  for (const path of ["api", "cli"] as const) assert.deepEqual(specForFeature("report_fix", path, {}), specForFeature("report_section", path, {}), path);
  assert.equal(specForFeature("report_section", "api", {}).effort, "high", "집필 본 호출과 같은 effort(B4)");
  assert.equal(FEATURE_MAX_TOKENS.report_fix, FEATURE_MAX_TOKENS.report_section);
});

test("report_unit_mg(2026-10-16 R5c — 경영관리 지표 단위 부분 문장 채우기): heavy·effort high·출력 상한 6.4만(설계 §3.7 — 경평 기능과 같이)", () => {
  assert.equal(FEATURE_TIER.report_unit_mg, "heavy");
  for (const path of ["api", "cli"] as const) assert.deepEqual(specForFeature("report_unit_mg", path, {}), { ...tierSpec("heavy", path, {}), effort: "high" }, path);
  assert.equal(FEATURE_MAX_TOKENS.report_unit_mg, 64_000);
  assert.equal(specForFeature("report_unit_mg", "api", { CLAUDE_EFFORT_HEAVY: "xhigh" }).effort, "xhigh", "환경변수 한 줄로 되돌림");
});
