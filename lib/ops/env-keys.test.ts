// 환경변수 목록 정합(2026-10-10 개선 계획 P2-3): 앱(lib·app·proxy·instrumentation)이 읽는 키는 모두 .env.example에 있거나 아래 「적지 않는 키」여야 함.
// 예전에는 운영 문서가 옛 이름(CLAUDE_MODEL_WRITER·CLAUDE_INSPECT_EFFORT)을 적고 있었고, 코드가 읽는 키와 문서 목록이 어긋나도 알 길이 없었음.

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "../..");
/** 적지 않는 키: 플랫폼이 넣는 값·옛 이름 대체(새 이름이 .env.example에 있음)·로컬 CLI 내부 */
const UNLISTED = new Set(["NODE_ENV", "VERCEL", "VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL", "NEXT_RUNTIME", "CLAUDE_MODEL_WRITER", "CLAUDE_CLI_MODEL", "CLAUDE_CLI_EFFORT", "SUPABASE_SERVICE_ROLE_KEY", "CLAUDE_CONFIG_DIR"]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "node_modules" ? [] : files(p);
    return /\.(ts|tsx)$/.test(f) && !/\.test\.ts$/.test(f) ? [p] : [];
  });
}

test("앱이 읽는 환경변수는 모두 .env.example에 있음(옛 이름 대체·플랫폼 값 제외)", () => {
  const src = [...files(join(ROOT, "lib")), ...files(join(ROOT, "app")), join(ROOT, "proxy.ts"), join(ROOT, "instrumentation.ts")].map((p) => readFileSync(p, "utf8")).join("\n");
  const used = new Set([...src.matchAll(/(?:process\.env|\benv)\.([A-Z][A-Z0-9_]{2,})/g)].map((m) => m[1]));
  const listed = new Set([...readFileSync(join(ROOT, ".env.example"), "utf8").matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]));
  const missing = [...used].filter((k) => !listed.has(k) && !UNLISTED.has(k)).sort();
  assert.deepEqual(missing, [], `.env.example에 없는 키: ${missing.join(", ")}`);
  assert.ok(used.has("SUPABASE_SECRET_KEY") && used.has("ANTHROPIC_API_KEY"), "검사가 실제로 키를 찾음");
});

test("운영 문서는 옛 AI 변수 이름(CLAUDE_MODEL_WRITER·CLAUDE_INSPECT_EFFORT)을 운영 변수로 적지 않음", () => {
  const doc = readFileSync(join(ROOT, "docs/ops/운영-전환.md"), "utf8");
  const line = doc.split("\n").find((l) => l.includes("운영에 넣을 환경 변수")) ?? "";
  assert.ok(line, "운영 변수 줄");
  assert.ok(!/CLAUDE_MODEL_WRITER|CLAUDE_INSPECT_EFFORT/.test(line), line);
  assert.match(line, /CLAUDE_MODEL_HEAVY/);
});
