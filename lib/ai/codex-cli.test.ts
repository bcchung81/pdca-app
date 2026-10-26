// 평가 전용 Codex CLI 경로(lib/ai/codex-cli.ts)의 순수 부분: 인자(사용자 설정·도구 끔·읽기 전용 샌드박스·모델·effort·스키마 파일), 모델·effort 환경변수, JSONL 결과 읽기. 실제 codex는 부르지 않습니다.
// codex-cli.ts는 import "server-only"라 run.test.ts처럼 "server-only"만 빈 모듈로 돌려 주고 불러옵니다.
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type Resolve = (specifier: string, context: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as { registerHooks: (hooks: { resolve: (specifier: string, context: unknown, next: Resolve) => unknown }) => void };
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { codexArgs, codexSpec, readCodexResult, CODEX_MODEL_DEFAULT, CODEX_EFFORT_DEFAULT } = await import("./codex-cli.ts");
const { CliFailedError, CliUnavailableError } = await import("./cli-result.ts");

const args = codexArgs({ dir: "/tmp/pdca-codex-x", model: "gpt-6-luna", effort: "medium", systemFile: "/tmp/pdca-codex-x/system.md", schemaFile: "/tmp/pdca-codex-x/schema.json", lastFile: "/tmp/pdca-codex-x/last.json" });
const valueOf = (flag: string) => args[args.indexOf(flag) + 1];
const configs = args.flatMap((a, i) => (args[i - 1] === "-c" ? [a] : []));
const disabled = args.flatMap((a, i) => (args[i - 1] === "--disable" ? [a] : []));

test("codexArgs: 사용자 설정·실행 정책 규칙을 읽지 않고, 세션을 남기지 않고, 빈 임시 폴더에서 읽기 전용 샌드박스로", () => {
  assert.equal(args[0], "exec");
  for (const f of ["--ignore-user-config", "--ignore-rules", "--ephemeral", "--skip-git-repo-check", "--json"]) assert.ok(args.includes(f), f);
  assert.equal(valueOf("--sandbox"), "read-only");
  assert.equal(valueOf("-C"), "/tmp/pdca-codex-x");
  assert.ok(configs.includes('approval_policy="never"'));
  assert.ok(configs.includes('web_search="disabled"'));
  // 요청 글은 stdin(맨 끝 「-」)
  assert.equal(args.at(-1), "-");
});

test("codexArgs: 훅·플러그인·셸·하위 에이전트·그림 도구를 끄고, Codex가 덧붙이는 맥락(기술 목록·권한·협업 모드·환경)을 뺌", () => {
  for (const f of ["hooks", "plugins", "apps", "multi_agent", "shell_tool", "unified_exec", "view_image", "image_generation", "browser_use", "computer_use"]) assert.ok(disabled.includes(f), f);
  for (const c of ["include_environment_context=false", "include_permissions_instructions=false", "include_apps_instructions=false", "include_collaboration_mode_instructions=false", "skills.include_instructions=false", "agents.enabled=false"]) assert.ok(configs.includes(c), c);
});

test("codexArgs: 모델·effort·시스템 글 파일·엄격 스키마 파일·마지막 답 파일", () => {
  assert.equal(valueOf("-m"), "gpt-6-luna");
  assert.ok(configs.includes('model_reasoning_effort="medium"'));
  assert.ok(configs.includes('model_instructions_file="/tmp/pdca-codex-x/system.md"'));
  assert.equal(valueOf("--output-schema"), "/tmp/pdca-codex-x/schema.json");
  assert.equal(valueOf("-o"), "/tmp/pdca-codex-x/last.json");
});

test("codexArgs: 문맥은 모델 최대로 열고 자동 압축은 끔(입력을 몰래 요약하지 않게)", () => {
  assert.ok(configs.includes("model_context_window=872000"));
  assert.ok(configs.includes("model_auto_compact_token_limit=100000000"));
});

test("codexArgs: 경로의 따옴표·역빗금은 TOML 문자열로 이스케이프", () => {
  const a = codexArgs({ dir: "/d", model: "m", effort: "low", systemFile: '/a "b"\\c.md', schemaFile: "/s", lastFile: "/l" });
  assert.ok(a.includes('model_instructions_file="/a \\"b\\"\\\\c.md"'));
});

test("codexSpec: CODEX_MODEL·CODEX_EFFORT(비우거나 틀린 effort면 기본값 gpt-6-sol·medium)", () => {
  assert.deepEqual(codexSpec({}), { model: CODEX_MODEL_DEFAULT, effort: CODEX_EFFORT_DEFAULT });
  assert.deepEqual(codexSpec({}), { model: "gpt-6-sol", effort: "medium" });
  assert.deepEqual(codexSpec({ CODEX_MODEL: "gpt-6-luna", CODEX_EFFORT: "HIGH" }), { model: "gpt-6-luna", effort: "high" });
  assert.deepEqual(codexSpec({ CODEX_MODEL: " ", CODEX_EFFORT: "ultra" }), { model: "gpt-6-sol", effort: "medium" });
});

const schema = { type: "object", properties: { a: { type: "string" }, b: { type: "string" } }, required: ["a"], additionalProperties: false };
const ok = [
  '{"type":"thread.started","thread_id":"t"}',
  '{"type":"turn.started"}',
  '{"type":"error","message":"Reconnecting... 1/5"}',
  '{"type":"item.completed","item":{"id":"i","type":"agent_message","text":"{\\"a\\":\\"가\\",\\"b\\":null}"}}',
  '{"type":"turn.completed","usage":{"input_tokens":1200,"cached_input_tokens":200,"output_tokens":340,"reasoning_output_tokens":300}}',
].join("\n");

test("readCodexResult: 답(엄격 스키마 null 되돌림)·모델 이름 codex/…·사용량(입력은 캐시 읽기를 뺀 값) — 중간 재연결 error 사건은 실패가 아님", () => {
  const r = readCodexResult(ok, null, "gpt-6-luna", schema);
  assert.deepEqual(r.output, { a: "가" });
  assert.equal(r.model, "codex/gpt-6-luna");
  assert.deepEqual(r.usage, { input: 1000, output: 340, cacheRead: 200, cacheWrite: 0, cacheWrite1h: 0 });
  assert.equal(r.costUsd, null);
});

test("readCodexResult: -o 파일(마지막 답)이 있으면 그것을 씀", () => {
  assert.deepEqual(readCodexResult(ok, '{"a":"나","b":"다"}', "m", schema).output, { a: "나", b: "다" });
});

test("readCodexResult: 실패 — 차례 실패·로그인·한도·빈 답·JSON 아님", () => {
  const failed = (msg: string) => `{"type":"turn.started"}\n{"type":"turn.failed","error":{"message":"${msg}"}}`;
  assert.throws(() => readCodexResult(failed("stream error: context_length_exceeded"), null, "m", schema), (e) => e instanceof CliFailedError && /끝내지 못했습니다/.test(e.message));
  assert.throws(() => readCodexResult(failed("401 Unauthorized"), null, "m", schema), (e) => e instanceof CliUnavailableError);
  assert.throws(() => readCodexResult(failed("You've hit your usage limit"), null, "m", schema), (e) => e instanceof CliFailedError && /한도/.test(e.message));
  assert.throws(() => readCodexResult('{"type":"turn.completed","usage":{}}', null, "m", schema), (e) => e instanceof CliFailedError && /답하지 않았습니다/.test(e.message));
  assert.throws(() => readCodexResult("", "답은 이렇습니다", "m", schema), (e) => e instanceof CliFailedError && /형식/.test(e.message));
});
