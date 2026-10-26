import "server-only";

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CliFailedError, type CliResult, CliUnavailableError, readCliResult } from "./cli-result.ts";

// Claude API 키를 받기 전 임시 연결: 이 서버에 로그인된 Claude Code CLI를 헤드리스(-p)로 부릅니다.
// - 도구 없음(--tools ""), 사용자 설정·CLAUDE.md·MCP·훅 끔(--safe-mode, --strict-mcp-config), 세션 저장 안 함
// - 답은 --json-schema 구조화 출력(structured_output)으로만 받음
// - 자식 프로세스에는 비밀 키가 든 환경변수를 넘기지 않음(로그인·경로에 필요한 것만)
// API 키가 생기면 AI_PROVIDER=api(또는 ANTHROPIC_API_KEY만 넣음)로 바꾸면 되고, 이 파일은 그대로 둬도 됩니다.

const ENV_KEYS = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "XDG_CONFIG_HOME", "CLAUDE_CONFIG_DIR", "NODE_EXTRA_CA_CERTS", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "https_proxy", "http_proxy", "no_proxy"];

export { CliFailedError, type CliResult, CliUnavailableError };

export interface CliOptions {
  system: string;
  prompt: string;
  schema: object;
  model: string;
  effort: string;
  timeoutMs: number;
}

export async function runClaudeCli(opts: CliOptions): Promise<CliResult> {
  // 빈 임시 폴더에서 실행: 프로젝트 파일·설정이 끼지 않게
  const dir = await mkdtemp(join(tmpdir(), "pdca-ai-"));
  try {
    const systemFile = join(dir, "system.md");
    await writeFile(systemFile, opts.system, "utf8");
    const args = [
      "-p",
      "--output-format",
      "json",
      "--json-schema",
      JSON.stringify(opts.schema),
      "--system-prompt-file",
      systemFile,
      "--tools",
      "",
      "--strict-mcp-config",
      "--no-session-persistence",
      "--safe-mode",
      "--model",
      opts.model,
      "--effort",
      opts.effort,
    ];
    const env: Record<string, string> = {};
    for (const k of ENV_KEYS) if (process.env[k]) env[k] = process.env[k]!;
    const bin = process.env.CLAUDE_CLI_PATH || "claude";

    const run = await new Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }>((resolve, reject) => {
      // turbopackIgnore: 로컬 임시 연결 전용 — 동적 경로 때문에 빌드가 프로젝트 전체를 서버 번들에 추적하지 않게
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
        if (e.code === "ENOENT") reject(new CliUnavailableError("AI가 아직 연결되지 않았습니다(Claude API 키도, 이 서버의 Claude Code CLI도 없음). 관리자에게 알려 주세요."));
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
    if (!run.stdout.trim()) throw new CliFailedError("AI가 답하지 않았습니다.", run.stderr.slice(0, 500) || `exit ${run.code}`);
    return readCliResult(run.stdout, opts.model);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
