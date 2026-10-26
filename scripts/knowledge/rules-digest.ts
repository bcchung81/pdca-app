// 공통 규칙 문서 생성(지식공급 하이브리드 선별 계획 5단계 — docs/plan/지식공급-하이브리드선별-계획.md). 운영 DB는 읽기만 하고 결과는 로컬 파일에만 씁니다.
// 범위마다 기준류 조각(lib/knowledge/rules-digest.ts digestChunks)을 로컬 Claude Code CLI(opus·high, 구조화 출력)로 요약 → 검산 → 실패면 문제를 붙여 한 번 다시 → 저장.
// Claude API는 부르지 않음: runClaudeCli는 CLI만 부르고 자식 환경에 API 키를 넘기지 않음(lib/ai/cli.ts ENV_KEYS).
// 산출: <out>/rules/<id>.md(요청에 붙는 글) + <out>/rules/<id>.json(답·검산·입력 조각 해시·모델·프롬프트 판·시각·글자 수). 기관 자료 요약이라 git 밖(docs/analysis/eval/)에만 둡니다.
// 실행: node --conditions=react-server --env-file=.env.local scripts/knowledge/rules-digest.ts --out <폴더> [--units track-biz,track-mg,BZ-1,…] [--dry]
//   --dry: 범위별 입력 조각 수·글자만(모델 안 부름)
// 고쳐 만들기: ... --out <폴더> --units … --repair <rules-check 폴더> — 교차 검증 지적을 반영한 판을 같은 스키마로 만들고 검산(앞 판은 rules/_prev에 보관, 검산 실패면 앞 판 유지)
// 올리기: ... --out <폴더> [--units …] (--dry-run | --write --yes) — 교차 검증(scripts/eval/rules-check.ts)을 통과한 단위만, 기본은 드라이런
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { runClaudeCli } from "../../lib/ai/cli.ts";
import { loadBundleChunks } from "../../lib/ai/context.ts";
import { runPool } from "../../lib/ai/pool.ts";
import type { BundleChunk } from "../../lib/knowledge/bundle.ts";
import { type DigestAnswer, type DigestCheck, RulesDigestSchema, checkDigest, checkProblems, digestChunks, digestInputs, digestMarkdown, digestPrompt, digestTarget, repairPrompt, sourceChars } from "../../lib/knowledge/rules-digest.ts";
import { rulesDigestPrompts } from "../../lib/prompts/sets.ts";
import { fillFrom } from "../../lib/prompts/template.ts";
import { findingsOf, type UnitResult } from "../eval/rules-check-core.ts";

const MODEL = "opus";
const EFFORT = "high";
/** 한 번 부르는 데 기다리는 시간(입력 5만 자·출력 1만 자 안팎 — high effort) */
const TIMEOUT_MS = 40 * 60_000;
/** 동시에 부르는 범위 수 */
const CONCURRENCY = 3;
const DEFAULT_UNITS = ["track-biz", "track-mg", "BZ-1", "BZ-2", "BZ-3", "MG-1", "MG-3", "MG-4"];

const args = process.argv.slice(2);
// --write·--dry-run: 만든 규칙 문서를 운영 knowledge_chunks에 올리는 모드(모델 안 부름) — scripts/knowledge/rules-digest-store.ts
if (args.includes("--write") || args.includes("--dry-run")) {
  await import("./rules-digest-store.ts");
  process.exit(process.exitCode ?? 0);
}
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const out = value("--out");
if (!out) throw new Error("--out <폴더>가 필요합니다.");
const dry = args.includes("--dry");
// --repair <rules-check 폴더>: 앞 판(rules/<id>.json) + 그 단위의 교차 검증 지적을 붙여 같은 스키마로 고친 판을 만듦. 앞 판은 rules/_prev/<id>.<시각>.json으로 보관
const repairDir = value("--repair");
const targets = (value("--units")?.split(",").filter(Boolean) ?? DEFAULT_UNITS).map(digestTarget);

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const chunksByTrack = new Map<string, BundleChunk[]>();
for (const t of targets) if (!chunksByTrack.has(t.track.id)) chunksByTrack.set(t.track.id, await loadBundleChunks(db, t.track));
const inputOf = (t: (typeof targets)[number]) => digestChunks(chunksByTrack.get(t.track.id)!, t);

const man = (n: number) => `${(n / 10_000).toFixed(2)}만`;
console.log(`범위 ${targets.length}개${dry ? " — 드라이런(모델 안 부름)" : ` — CLI ${MODEL}·${EFFORT}, 동시 ${CONCURRENCY}`}`);
for (const t of targets) {
  const input = inputOf(t);
  const types = new Map<string, number>();
  for (const c of input) types.set(`${c.doc_id}:${c.unit_type}`, (types.get(`${c.doc_id}:${c.unit_type}`) ?? 0) + 1);
  console.log(`  ${t.id.padEnd(10)} ${String(input.length).padStart(4)}조각 ${man(sourceChars(input)).padStart(8)}자  ${[...types].map(([k, n]) => `${k} ${n}`).join(" · ")}`);
}
if (dry) process.exit(0);

const { prompts, schema } = rulesDigestPrompts();
const system = fillFrom(prompts, "system", "system");
// CLI의 스키마 검사기는 2020-12 메타 스키마를 몰라서 draft-7로 내고 $schema는 뺌(lib/ai/run.ts cliSchema와 같음)
const cliSchema = (() => {
  const s = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  delete s.$schema;
  return s;
})();
const dir = join(out, "rules");
await mkdir(dir, { recursive: true });

interface Attempt {
  ok: boolean;
  check: DigestCheck | null;
  error?: string;
  usage?: unknown;
  model?: string;
  durationMs: number;
}

async function call(prompt: string): Promise<{ answer: DigestAnswer; model: string; usage: unknown }> {
  const run = await runClaudeCli({ system, prompt, schema: cliSchema, model: MODEL, effort: EFFORT, timeoutMs: TIMEOUT_MS });
  const parsed = RulesDigestSchema.safeParse(run.output);
  if (!parsed.success) throw new Error(`답 형식이 맞지 않음: ${parsed.error.message.slice(0, 500)}`);
  return { answer: parsed.data, model: run.model, usage: run.usage };
}

/** 고쳐 만들기 모드의 앞 판 답·지적(단위마다) */
const repairOf = (id: string) => {
  const prev = JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8")) as { answer: DigestAnswer | null };
  const checkFile = join(repairDir!, `${id}.json`);
  if (!prev.answer) throw new Error(`${id}: 앞 판 답이 없습니다`);
  if (!existsSync(checkFile)) throw new Error(`${id}: 교차 검증 결과가 없습니다(${checkFile})`);
  return { previous: prev.answer, findings: findingsOf(JSON.parse(readFileSync(checkFile, "utf8")) as UnitResult) };
};
const repairs = new Map(repairDir ? targets.map((t) => [t.id, repairOf(t.id)] as const) : []);
const promptFor = (t: (typeof targets)[number], input: BundleChunk[], retry?: Parameters<typeof digestPrompt>[3]) => {
  const rep = repairs.get(t.id);
  if (!rep) return digestPrompt(prompts, t, input, retry);
  const base = repairPrompt(prompts, t, input, rep.previous, rep.findings);
  return retry ? `${base}\n\n${fillFrom(prompts, "request", "retry", { problems: retry.problems.map((x) => `- ${x}`).join("\n"), previous: JSON.stringify(retry.previous) })}` : base;
};

const summary: Array<{ id: string; ok: boolean; attempts: number; sourceChars: number; digestChars: number; ms: number; note: string }> = [];

await runPool(targets, CONCURRENCY, async (t) => {
  const input = inputOf(t);
  const started = Date.now();
  const attempts: Attempt[] = [];
  let best: { answer: DigestAnswer; check: DigestCheck; model: string } | null = null;
  let retry: Parameters<typeof digestPrompt>[3];
  for (let n = 0; n < 2; n++) {
    const t0 = Date.now();
    try {
      const r = await call(promptFor(t, input, retry));
      const check = checkDigest(r.answer, input);
      attempts.push({ ok: check.ok, check, usage: r.usage, model: r.model, durationMs: Date.now() - t0 });
      best = { answer: r.answer, check, model: r.model };
      console.log(`  ${t.id}: ${n ? "다시 만듦" : "첫 답"} — 검산 ${check.ok ? "통과" : `실패 ${checkProblems(check, r.answer).length}건`} (${Math.round((Date.now() - t0) / 1000)}초)`);
      if (check.ok) break;
      retry = { problems: checkProblems(check, r.answer), previous: r.answer };
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}${(e as { detail?: string }).detail ? ` — ${(e as { detail?: string }).detail}` : ""}` : String(e);
      attempts.push({ ok: false, check: null, error: msg, durationMs: Date.now() - t0 });
      console.log(`  ${t.id}: 호출 실패 — ${msg.slice(0, 300)}`);
      // 첫 호출이 실패하면 같은 요청으로 한 번 더, 다시 만들기가 실패하면 앞 답(검산 실패)을 저장
    }
  }
  const ms = Date.now() - started;
  const json = {
    id: t.id,
    title: t.title,
    track: t.track.id,
    units: t.units,
    layers: t.layers,
    model: best?.model ?? null,
    cliModel: MODEL,
    effort: EFFORT,
    promptVersion: prompts.version,
    generatedAt: new Date().toISOString(),
    durationMs: ms,
    inputs: digestInputs(input),
    sourceChars: sourceChars(input),
    digestChars: 0,
    ruleChars: best ? best.answer.rules.reduce((a, r) => a + r.text.length, 0) : 0,
    check: best ? best.check : { ok: false, error: "답 없음" },
    attempts,
    answer: best?.answer ?? null,
  };
  if (repairs.has(t.id) && !best?.check.ok) {
    // 고쳐 만들기가 검산을 못 넘으면 앞 판을 덮지 않음
    console.log(`  ${t.id}: 고친 판이 검산을 통과하지 못해 앞 판을 그대로 둡니다`);
    summary.push({ id: t.id, ok: false, attempts: attempts.length, sourceChars: json.sourceChars, digestChars: 0, ms, note: "고쳐 만들기 실패(앞 판 유지)" });
    return;
  }
  if (repairs.has(t.id)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await mkdir(join(dir, "_prev"), { recursive: true });
    await copyFile(join(dir, `${t.id}.json`), join(dir, "_prev", `${t.id}.${stamp}.json`));
    await copyFile(join(dir, `${t.id}.md`), join(dir, "_prev", `${t.id}.${stamp}.md`));
  }
  if (best) {
    const md = digestMarkdown(prompts, t, best.answer);
    json.digestChars = md.length;
    await writeFile(join(dir, `${t.id}.md`), md, "utf8");
  }
  await writeFile(join(dir, `${t.id}.json`), `${JSON.stringify(json, null, 2)}\n`, "utf8");
  summary.push({ id: t.id, ok: !!best?.check.ok, attempts: attempts.length, sourceChars: json.sourceChars, digestChars: json.digestChars, ms, note: best ? checkProblems(best.check, best.answer).slice(0, 3).join(" / ") : (attempts.at(-1)?.error ?? "") });
}, { onError: (e, i) => console.log(`  ${targets[i].id}: 저장 실패 — ${e instanceof Error ? e.message : String(e)}`) });

console.log("\n범위       검산  시도  원문자   요약자   비율   걸린 시간");
for (const s of summary.sort((a, b) => targets.findIndex((t) => t.id === a.id) - targets.findIndex((t) => t.id === b.id)))
  console.log(`${s.id.padEnd(10)} ${s.ok ? "통과" : "실패"}  ${s.attempts}    ${String(s.sourceChars).padStart(6)}  ${String(s.digestChars).padStart(6)}  ${s.sourceChars ? `${Math.round((s.digestChars / s.sourceChars) * 100)}%`.padStart(4) : "   -"}  ${Math.round(s.ms / 1000)}초${s.note ? `  — ${s.note}` : ""}`);
