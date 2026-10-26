// 경평 초안 모델 비교 일괄 실행기(평가 전용·수동 실행, 2026-10-21): 팔(claude·sol·luna) × 카드 × 회차마다 ai-report-smoke.ts --app을 자식 프로세스로 돌려
// 앱에서 사용자가 한 흐름과 같게 「구성안 다시 만들기」(짜임 지정·요청 메모 없음, 근거는 앱 기본 — 카드 + 카드 전용 자료 저장본 + 전년 절 + 평가 근거 + 공통 지식)
// → 그 구성안 그대로 승인 → 구성안대로 집필(판면 맞추기·자동 고치기 포함)을 하고, 초안 HTML·spec·경고를 <evalDir>/drafts에, 묶음 기록을 <evalDir>/manifest.json에 씀.
// DB는 읽기만 함(smoke가 저장하지 않음). Claude API는 부르지 않음 — claude 팔은 AI_PROVIDER=cli, 나머지는 AI_PROVIDER=codex이고 자식에는 ANTHROPIC_API_KEY를 빈 값으로 넘김.
// 실행: node --env-file-if-exists=.env.local scripts/eval/model-compare-run.ts --out <evalDir> --cards <id,id,…> [--arms claude,sol,luna] [--runs 2] [--concurrency 2] [--dry]
//  --dry: 할 일 목록(순서·이미 있는 초안)만 찍고 아무것도 부르지 않음.
//  이어 하기: <이름>.html·.html.json이 이미 있으면 건너뜀(기록은 manifest의 앞 항목 또는 .html.meta.json에서 다시 채움). 실패한 건은 한 번 더 돌리고, 그래도 실패하면 ok:false로 남기고 다음으로.
//  진행 줄은 <evalDir>/run.txt, 자식 출력은 <evalDir>/logs/<이름>.log.
import { spawn } from "node:child_process";
import { appendFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { runPool } from "../../lib/ai/pool.ts";
import { HEAVY_CLI_MODEL_DEFAULT, HEAVY_MODEL_DEFAULT, specForFeature } from "../../lib/ai/models.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const SMOKE = join(ROOT, "scripts/smoke/ai-report-smoke.ts");
/** 한 건(구성안 + 집필 + 고치기) 제한 — smoke 안의 호출마다 제한(구성안·집필 10분)이 따로 있고, 이것은 자식이 멈췄을 때의 안전판 */
const CHILD_TIMEOUT_MS = 60 * 60_000;
/** Codex 팔의 추론 수준(사용자 결정 2026-10-21 — lib/ai/codex-cli.ts 기본값과 같음, 자식에 CODEX_EFFORT로 명시) */
const CODEX_EFFORT = "medium";
/** 실패한 건을 다시 돌리는 횟수 */
const MAX_RETRIES = 1;

const argv = process.argv.slice(2);
const flag = (name: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
// 절대 경로로(자식은 저장소 맨 위에서 돌므로 상대 경로가 어긋나지 않게)
const outArg = flag("--out");
const cards = (flag("--cards") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (!outArg || !cards.length) {
  console.error("usage: node --env-file-if-exists=.env.local scripts/eval/model-compare-run.ts --out <evalDir> --cards <id,id,…> [--arms claude,sol,luna] [--runs 2] [--concurrency 2] [--dry]");
  process.exit(1);
}
const outDir = resolve(outArg);
const runs = Math.max(1, Number(flag("--runs") ?? 1) || 1);
const concurrency = Math.max(1, Number(flag("--concurrency") ?? 2) || 2);
const dry = argv.includes("--dry");

interface Arm {
  id: string;
  label: string;
  provider: "cli" | "codex";
  model: string;
  effort: string;
  env: Record<string, string>;
}

// claude 팔은 앱 설정(경평 구성안·집필·고치기 — 세 기능이 같은 등급·effort) 그대로
const claudeSpec = specForFeature("report_section", "cli");
const claudeName = claudeSpec.cliModel === HEAVY_CLI_MODEL_DEFAULT ? HEAVY_MODEL_DEFAULT.replace(/^claude-/, "") : claudeSpec.cliModel;
const codexArm = (id: string, model: string): Arm => ({
  id,
  label: `OpenAI ${model} (Codex CLI, reasoning ${CODEX_EFFORT})`,
  provider: "codex",
  model,
  effort: CODEX_EFFORT,
  env: { AI_PROVIDER: "codex", CODEX_MODEL: model, CODEX_EFFORT: CODEX_EFFORT },
});
const ARMS: Record<string, Arm> = {
  claude: { id: "claude", label: `Claude ${claudeName} (Claude Code CLI, effort ${claudeSpec.effort})`, provider: "cli", model: claudeSpec.cliModel, effort: claudeSpec.effort, env: { AI_PROVIDER: "cli" } },
  sol: codexArm("sol", "gpt-6-sol"),
  luna: codexArm("luna", "gpt-6-luna"),
};
const armIds = (flag("--arms") ?? "claude,sol,luna").split(",").map((s) => s.trim()).filter(Boolean);
const unknownArm = armIds.find((a) => !ARMS[a]);
if (unknownArm) {
  console.error(`모르는 팔: ${unknownArm} (claude·sol·luna)`);
  process.exit(1);
}
const arms = armIds.map((a) => ARMS[a]);

/** 카드·회차마다 팔 순서를 섞음(시간대 편향 줄이기) — 같은 카드·회차면 같은 순서(다시 돌려도 계획이 같게) */
function shuffled<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619) >>> 0;
  const rand = () => {
    h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    return h / 2 ** 32;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

interface Task {
  name: string;
  arm: Arm;
  card: string;
  run: number;
}
const tasks: Task[] = [];
for (let run = 1; run <= runs; run++) for (const card of cards) for (const arm of shuffled(arms, `${card}#${run}`)) tasks.push({ name: `${arm.id}__${card.replaceAll("/", "_")}__${run}`, arm, card, run });

const draftsDir = join(outDir, "drafts");
const logsDir = join(outDir, "logs");
const htmlOf = (t: Task) => join(draftsDir, `${t.name}.html`);
const done = (t: Task) => existsSync(htmlOf(t)) && existsSync(`${htmlOf(t)}.json`);

interface Usage3 {
  input: number;
  output: number;
  cached: number;
}
interface DraftEntry {
  name: string;
  arm: string;
  card: string;
  run: number;
  ok: boolean;
  error: string | null;
  durationMs: number;
  outlineMs: number;
  draftMs: number;
  usage: Usage3;
  retries: number;
  /** 앱이 저장할 초안 경고(card_report_drafts.warnings)·없는 숫자(unknown_numbers)·구성안 경고(outline_warnings) — smoke의 .html.meta.json */
  warnings: string[];
  unknownNumbers: string[];
  outlineWarnings: string[];
  model: string | null;
}

/** smoke 사용량(Usage) → 기록 셋: input = 캐시 밖 입력(캐시 쓰기 포함), cached = 캐시 읽기 */
const usage3 = (u: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number } | null | undefined): Usage3 => ({ input: (u?.input ?? 0) + (u?.cacheWrite ?? 0), output: u?.output ?? 0, cached: u?.cacheRead ?? 0 });
const addUsage = (a: Usage3, b: Usage3): Usage3 => ({ input: a.input + b.input, output: a.output + b.output, cached: a.cached + b.cached });

/** .html.meta.json → 기록 칸(없으면 null) */
function readMeta(t: Task): Pick<DraftEntry, "outlineMs" | "draftMs" | "usage" | "warnings" | "unknownNumbers" | "outlineWarnings" | "model"> | null {
  const f = `${htmlOf(t)}.meta.json`;
  if (!existsSync(f)) return null;
  const m = JSON.parse(readFileSync(f, "utf8"));
  return {
    outlineMs: m.timings?.outlineMs ?? 0,
    draftMs: m.timings?.draftMs ?? 0,
    usage: addUsage(usage3(m.usage?.outline), usage3(m.usage?.draft)),
    warnings: m.warnings ?? [],
    unknownNumbers: m.unknownNumbers ?? [],
    outlineWarnings: m.outlineWarnings ?? [],
    model: m.model ?? null,
  };
}

const manifestFile = join(outDir, "manifest.json");
const prev: DraftEntry[] = existsSync(manifestFile) ? (JSON.parse(readFileSync(manifestFile, "utf8")).drafts ?? []) : [];
const entries = new Map<string, DraftEntry>(prev.map((d) => [d.name, d]));
const empty = (t: Task): DraftEntry => ({ name: t.name, arm: t.arm.id, card: t.card, run: t.run, ok: false, error: null, durationMs: 0, outlineMs: 0, draftMs: 0, usage: { input: 0, output: 0, cached: 0 }, retries: 0, warnings: [], unknownNumbers: [], outlineWarnings: [], model: null });

if (dry) {
  console.log(`round ${basename(resolve(outDir))} · 팔 ${arms.length} · 카드 ${cards.length} · 회차 ${runs} · 동시 ${concurrency} · 할 일 ${tasks.length}건(이미 있음 ${tasks.filter(done).length})`);
  for (const a of arms) console.log(`  팔 ${a.id}: ${a.label} · env ${Object.entries(a.env).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  for (const [i, t] of tasks.entries()) console.log(`  ${String(i + 1).padStart(3)}. ${t.name}${done(t) ? " (있음 — 건너뜀)" : ""}`);
  console.log(`자식: node --conditions=react-server --env-file=.env.local scripts/smoke/ai-report-smoke.ts <카드> ${join(draftsDir, "<이름>.html")} --app`);
  process.exit(0);
}

mkdirSync(draftsDir, { recursive: true });
mkdirSync(logsDir, { recursive: true });
const progress = (line: string) => {
  const l = `${new Date().toISOString()} ${line}`;
  console.log(l);
  appendFileSync(join(outDir, "run.txt"), `${l}\n`);
};
const saveManifest = () => {
  const drafts = tasks.flatMap((t) => (entries.has(t.name) ? [entries.get(t.name)!] : []));
  writeFileSync(manifestFile, JSON.stringify({ round: basename(resolve(outDir)), createdAt: new Date().toISOString(), arms: arms.map((a) => ({ id: a.id, label: a.label, provider: a.provider, model: a.model, effort: a.effort })), drafts }, null, 1));
};

/** smoke 한 번(자식 프로세스) — 성공이면 null, 실패면 오류 글(자식 stderr 끝) */
function runChild(t: Task): Promise<string | null> {
  return new Promise((res) => {
    const log = createWriteStream(join(logsDir, `${t.name}.log`), { flags: "a" });
    log.write(`\n=== ${new Date().toISOString()} ${t.arm.label} · ${t.card} · ${t.run}회\n`);
    const env: Record<string, string | undefined> = { ...process.env, ...t.arm.env, ANTHROPIC_API_KEY: "" };
    delete env.VERCEL;
    const child = spawn(process.execPath, ["--conditions=react-server", "--env-file=.env.local", SMOKE, t.card, htmlOf(t), "--app"], { cwd: ROOT, env: env as NodeJS.ProcessEnv, stdio: ["ignore", "pipe", "pipe"] });
    let tail = "";
    const keep = (s: Buffer) => {
      log.write(s);
      tail = (tail + s.toString("utf8")).slice(-1_500);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    const timer = setTimeout(() => child.kill("SIGTERM"), CHILD_TIMEOUT_MS);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      log.end();
      if (code === 0 && done(t)) return res(null);
      const last = tail.trim().split("\n").filter((l) => l.trim()).slice(-4).join(" ⏎ ");
      res(`exit ${code ?? signal}${last ? ` — ${last.slice(-600)}` : ""}`);
    });
  });
}

saveManifest();
progress(`시작 · 할 일 ${tasks.length}건(이미 있음 ${tasks.filter(done).length}) · 동시 ${concurrency}`);
await runPool(tasks, concurrency, async (t, i) => {
  if (done(t)) {
    const meta = readMeta(t);
    // 앞 기록이 없으면 .html.meta.json에서(걸린 시간은 구성안 + 집필 시간으로 어림)
    if (!entries.get(t.name)?.ok) entries.set(t.name, { ...empty(t), ...(entries.get(t.name) ?? {}), ...(meta ?? {}), durationMs: meta ? meta.outlineMs + meta.draftMs : 0, ok: true, error: null });
    progress(`${i + 1}/${tasks.length} 건너뜀(있음) ${t.name}`);
    saveManifest();
    return;
  }
  const t0 = Date.now();
  let error: string | null = null;
  let retries = 0;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    progress(`${i + 1}/${tasks.length} 시작 ${t.name}${attempt ? ` (다시 ${attempt})` : ""}`);
    error = await runChild(t);
    if (!error) break;
    progress(`${i + 1}/${tasks.length} 실패 ${t.name}: ${error.slice(0, 300)}`);
    if (attempt < MAX_RETRIES) retries++;
  }
  const meta = error ? null : readMeta(t);
  entries.set(t.name, { ...empty(t), ...(meta ?? {}), ok: !error, error, durationMs: Date.now() - t0, retries });
  const e = entries.get(t.name)!;
  progress(`${i + 1}/${tasks.length} ${e.ok ? "끝" : "실패로 남김"} ${t.name} · ${Math.round(e.durationMs / 1000)}초${e.ok ? ` · 경고 ${e.warnings.length} · 없는 숫자 ${e.unknownNumbers.length} · 토큰 입력 ${e.usage.input}+캐시 ${e.usage.cached}/출력 ${e.usage.output}` : ""}`);
  saveManifest();
});
progress(`끝 · 성공 ${[...entries.values()].filter((d) => d.ok).length}/${tasks.length}`);
