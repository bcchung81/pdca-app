import "server-only";

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CliFailedError, type CliResult, CliUnavailableError } from "./cli-result.ts";
import type { CliOptions } from "./cli.ts";
import { fromStrict, toStrictSchema } from "./strict-schema.ts";

// 평가 전용(AI_PROVIDER=codex): 경평 초안을 Claude 대신 OpenAI 모델로 써서 품질을 견주려고 이 PC에 로그인된 Codex CLI(`codex exec`)를 부릅니다.
// runClaudeCli와 같은 계약(시스템·요청 글·스키마·모델·effort·제한 시간 → 구조화 답·사용량)이라 run.ts의 structuredCli만 갈라 탑니다(프롬프트·스키마·후처리는 같음).
// - 빈 임시 폴더에서 실행, 읽기 전용 샌드박스, 승인 요청 없음, 세션 저장 안 함(--ephemeral)
// - 사용자 설정(~/.codex/config.toml — MCP·훅·플러그인)과 실행 정책 규칙을 읽지 않고(--ignore-user-config·--ignore-rules), 훅·플러그인·셸·하위 에이전트·웹 검색·그림 도구를 끔
// - Codex가 덧붙이는 맥락(기술(skill) 목록·권한 안내·협업 모드·환경 정보)을 빼고, 시스템 글은 기본 지시를 갈음하는 model_instructions_file로 넣음
// - 답은 --output-schema(OpenAI 엄격 모드 — lib/ai/strict-schema.ts로 바꿔 보내고 되돌림)로만 받음
// - 자식 프로세스에는 비밀 키를 넘기지 않음(로그인은 CODEX_HOME의 auth.json — OPENAI_API_KEY 등은 안 넘김)

const ENV_KEYS = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "CODEX_HOME", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "https_proxy", "http_proxy", "no_proxy"];

/** 기본 모델·effort(평가 사용자 결정 2026-10-21 — gpt-6-sol·gpt-6-luna, 추론 medium). 기능별 구분 없이 한 값 */
export const CODEX_MODEL_DEFAULT = "gpt-6-sol";
export const CODEX_EFFORT_DEFAULT = "medium";
const CODEX_EFFORTS = ["low", "medium", "high", "xhigh", "max"];

/** 시스템 글 끝에 붙이는 전달 규칙(기능 지시가 아니라 Codex 실행 환경 안내 — Claude CLI는 --tools ""로 같은 상태라 붙이지 않음) */
export const CODEX_SYSTEM_TAIL = "\n\n---\n도구·셸·파일을 쓰지 말고, 위 지시와 사용자 요청만 읽고 정해진 JSON 스키마에 맞는 답 하나만 내십시오.";

/** 환경변수 → 모델·effort(CODEX_MODEL·CODEX_EFFORT, 비우거나 effort가 허용값이 아니면 기본값) */
export function codexSpec(env: Record<string, string | undefined> = process.env): { model: string; effort: string } {
  const effort = (env.CODEX_EFFORT ?? "").trim().toLowerCase();
  return { model: (env.CODEX_MODEL ?? "").trim() || CODEX_MODEL_DEFAULT, effort: CODEX_EFFORTS.includes(effort) ? effort : CODEX_EFFORT_DEFAULT };
}

/** `-c key=value`의 값(TOML 기본 문자열) — JSON 문자열 표기에서 TOML이 따로 막는 DEL만 더 이스케이프 */
const tomlString = (s: string) => JSON.stringify(s).replace(/\u007f/g, "\\u007F");

/** codex exec 인자(순수 — 시험용). 요청 글은 stdin(`-`)으로 */
export function codexArgs(o: { dir: string; model: string; effort: string; systemFile: string; schemaFile: string; lastFile: string }): string[] {
  const c = (kv: string) => ["-c", kv];
  return [
    "exec",
    "--ignore-user-config",
    "--ignore-rules",
    "--ephemeral",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "-C",
    o.dir,
    "-m",
    o.model,
    ...c(`model_reasoning_effort=${tomlString(o.effort)}`),
    ...c(`model_instructions_file=${tomlString(o.systemFile)}`),
    // 문맥은 모델 최대(87.2만, models_cache max_context_window)로 열고 자동 압축은 끔 — 앱처럼 입력을 자르거나 요약하지 않고, 넘치면 실패로 남김
    ...c("model_context_window=872000"),
    ...c("model_auto_compact_token_limit=100000000"),
    ...c('approval_policy="never"'),
    ...c('web_search="disabled"'),
    ...c("include_environment_context=false"),
    ...c("include_permissions_instructions=false"),
    ...c("include_apps_instructions=false"),
    ...c("include_collaboration_mode_instructions=false"),
    ...c("skills.include_instructions=false"),
    ...c("agents.enabled=false"),
    ...["hooks", "plugins", "apps", "multi_agent", "shell_tool", "unified_exec", "view_image", "image_generation", "browser_use", "computer_use", "goals"].flatMap((f) => ["--disable", f]),
    "--output-schema",
    o.schemaFile,
    "-o",
    o.lastFile,
    "--json",
    "--color",
    "never",
    "-",
  ];
}

/** codex exec --json 사건(JSONL) 중 이 앱이 읽는 칸 */
interface CodexEvent {
  type?: string;
  message?: string;
  error?: { message?: string };
  item?: { type?: string; text?: string };
  usage?: { input_tokens?: number; cached_input_tokens?: number; cache_write_input_tokens?: number; output_tokens?: number; reasoning_output_tokens?: number };
}

/**
 * JSONL 사건 + 마지막 답 글(-o 파일, 없으면 마지막 agent_message) → 구조화 답·사용량. 순수 함수(시험용).
 * 사용량은 API 경로와 같은 뜻으로: input = 캐시 밖 입력(OpenAI input_tokens는 캐시 읽기를 포함하므로 뺌), cacheRead = 캐시 읽기, output = 출력(추론 포함).
 * 답은 엄격 스키마(strictSchema)로 받은 것이라 원래 스키마(schema)의 선택 속성 null을 되돌림
 */
export function readCodexResult(jsonl: string, lastMessage: string | null, model: string, schema: object): CliResult {
  const events: CodexEvent[] = jsonl
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as CodexEvent];
      } catch {
        return [];
      }
    });
  const text = lastMessage?.trim() || [...events].reverse().find((e) => e.type === "item.completed" && e.item?.type === "agent_message")?.item?.text?.trim() || "";
  // 「error」 사건은 연결이 끊겨 다시 잇는 중에도 나옴 — 차례(turn)가 실패했거나 답이 없을 때만 실패로 봄
  const fail = events.find((e) => e.type === "turn.failed") ?? (text ? undefined : [...events].reverse().find((e) => e.type === "error"));
  if (fail) {
    const text = String(fail.error?.message ?? fail.message ?? "");
    if (/log ?in|authenticat|unauthori[sz]ed|credential|401/i.test(text)) throw new CliUnavailableError("이 PC의 Codex CLI가 로그인되어 있지 않습니다(codex login).");
    if (/usage limit|rate limit|limit reached|quota|429|overloaded/i.test(text)) throw new CliFailedError("AI 사용량 한도에 걸렸습니다. 잠시 뒤 다시 시도해 주세요.", text.slice(0, 500));
    throw new CliFailedError("AI가 답을 끝내지 못했습니다. 요청을 좁혀 다시 시도해 주세요.", text.slice(0, 500), `codex=${fail.type}`);
  }
  if (!text) throw new CliFailedError("AI가 답하지 않았습니다.", jsonl.slice(-500));
  let output: unknown;
  try {
    output = JSON.parse(text);
  } catch {
    throw new CliFailedError("AI 답의 형식을 읽지 못했습니다.", text.slice(0, 500));
  }
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0 };
  for (const e of events) {
    if (e.type !== "turn.completed" || !e.usage) continue;
    const cached = e.usage.cached_input_tokens ?? 0;
    usage.input += Math.max(0, (e.usage.input_tokens ?? 0) - cached);
    usage.cacheRead += cached;
    usage.cacheWrite += e.usage.cache_write_input_tokens ?? 0;
    usage.output += e.usage.output_tokens ?? 0;
  }
  return { output: fromStrict(output, schema), model: `codex/${model}`, usage, costUsd: null };
}

/** Codex CLI로 구조화 출력 한 번(평가 전용). opts.model·effort는 부르는 쪽이 codexSpec()으로 정함 */
export async function runCodexCli(opts: CliOptions): Promise<CliResult> {
  // 빈 임시 폴더에서 실행: 프로젝트 파일·AGENTS.md·설정이 끼지 않게
  const dir = await mkdtemp(join(tmpdir(), "pdca-codex-"));
  try {
    const systemFile = join(dir, "system.md");
    const schemaFile = join(dir, "schema.json");
    const lastFile = join(dir, "last.json");
    await writeFile(systemFile, `${opts.system}${CODEX_SYSTEM_TAIL}`, "utf8");
    await writeFile(schemaFile, JSON.stringify(toStrictSchema(opts.schema)), "utf8");
    const args = codexArgs({ dir, model: opts.model, effort: opts.effort, systemFile, schemaFile, lastFile });
    const env: Record<string, string> = {};
    for (const k of ENV_KEYS) if (process.env[k]) env[k] = process.env[k]!;
    const bin = process.env.CODEX_CLI_PATH || "codex";

    const run = await new Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }>((resolve, reject) => {
      // turbopackIgnore: 로컬 평가 전용 — 동적 경로 때문에 빌드가 프로젝트 전체를 서버 번들에 추적하지 않게
      const child = spawn(/*turbopackIgnore: true*/ bin, args, { cwd: dir, env: env as unknown as NodeJS.ProcessEnv, stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
      }, opts.timeoutMs);
      child.stdout.setEncoding("utf8").on("data", (s: string) => (stdout += s));
      child.stderr.setEncoding("utf8").on("data", (s: string) => (stderr += s.slice(0, 4_000)));
      child.on("error", (e: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        if (e.code === "ENOENT") reject(new CliUnavailableError("이 PC에 Codex CLI가 없습니다(평가 전용 AI_PROVIDER=codex)."));
        else reject(new CliFailedError("AI를 부르지 못했습니다.", e.message));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr, timedOut });
      });
      child.stdin.on("error", () => {}); // 프로세스가 먼저 끝나도 쓰기 오류로 죽지 않게
      child.stdin.end(opts.prompt, "utf8");
    });
    if (run.timedOut) throw new CliFailedError(`AI 응답이 늦어 멈췄습니다(${Math.round(opts.timeoutMs / 60_000)}분). 요청을 좁혀 다시 시도해 주세요.`);
    const last = await readFile(lastFile, "utf8").catch(() => null);
    if (!run.stdout.trim() && !last?.trim()) throw new CliFailedError("AI가 답하지 않았습니다.", run.stderr.slice(0, 500) || `exit ${run.code}`);
    return readCodexResult(run.stdout, last, opts.model, opts.schema);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
