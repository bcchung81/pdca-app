// 경평 초안 모델 비교 라운드 — 블라인드 교차 심사 실행기(심사 AI를 부름: --dry·--packets-only가 아니면 CLI 호출이 나감).
// 실행: node --conditions=react-server --env-file-if-exists=.env.local scripts/eval/judge-run.ts --round <dir>
//   [--judges claude,gpt] [--cards 주요사업3/7-나,…] [--concurrency 2] [--dry] [--packets-only] [--allow-leak 낱말,…] [--rubric 파일]
// 하는 일(순서):
//  1) 카드별 블라인드 묶음 — judge-packets.ts(DB 읽기만)를 카드마다 부름: <round>/judge/<카드 태그>/_sources.md·Dnn.md,
//     라운드 루트 judge-key.json(D01~ 전역 고유 → 초안 이름, 이미 있으면 그대로 씀). 이미 만든 카드 묶음은 다시 만들지 않음.
//     Dnn.md에 모델 정체 낱말이 있으면 멈춤(초안 본문에 원래 있는 낱말은 --allow-leak).
//  2) 심사: 카드 × 심사자 한 번씩. 시스템 글 = 루브릭 전문 + 심사자·카드, 요청 글 = _sources.md + 그 카드 초안 전부(심사자마다 다른 순서).
//     claude = Claude Code CLI, gpt = Codex CLI. 검사에 실패하면 한 번 다시, 그래도 실패면 오류를 run.txt에 적고 다음으로.
//  3) 원본 답 <round>/judge/<심사자>/<카드 태그>.json(있으면 건너뜀 — 이어 하기) → 다 모이면 루트에 judge-<심사자>.json(compare-report.ts 입력).
// Claude API는 부르지 않음: runClaudeCli·runCodexCli는 CLI만 부르고 자식 환경에 API 키를 넘기지 않음.
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { runClaudeCli } from "../../lib/ai/cli.ts";
import { runCodexCli } from "../../lib/ai/codex-cli.ts";
import { assignBlindKeys, cardTag, checkAnswer, judgeJsonSchema, judgeOrder, leakHits, mergeJudge, type JudgeAnswer } from "./judge-run-core.ts";

const TIMEOUT_MS = 20 * 60_000;
const RUNNERS = {
  claude: { run: runClaudeCli, model: "claude-opus-5-5", effort: "high" },
  gpt: { run: runCodexCli, model: "gpt-6.1-sol", effort: "high" },
} as const;
type JudgeName = keyof typeof RUNNERS;

const argv = process.argv.slice(2);
const opt = (n: string): string | undefined => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const has = (n: string) => argv.includes(n);
const list = (n: string): string[] | undefined => opt(n)?.split(",").map((s) => s.trim()).filter(Boolean);

const round = opt("--round");
if (!round) throw new Error("사용법: judge-run.ts --round <dir> [--judges claude,gpt] [--cards …] [--concurrency 2] [--dry] [--packets-only] [--allow-leak 낱말,…]");
const judges = (list("--judges") ?? ["claude", "gpt"]).map((j) => {
  if (!(j in RUNNERS)) throw new Error(`알 수 없는 심사자: ${j} (claude|gpt)`);
  return j as JudgeName;
});
const concurrency = Math.max(1, Number(opt("--concurrency") ?? 2) || 2);
const allowLeak = list("--allow-leak") ?? [];
const dry = has("--dry");
const packetsOnly = has("--packets-only");

const judgeDir = `${round}/judge`;
mkdirSync(judgeDir, { recursive: true });
const log = (s: string) => {
  const line = `${new Date().toISOString().slice(11, 19)} ${s}`;
  console.log(line);
  appendFileSync(`${judgeDir}/run.txt`, line + "\n");
};

// ───────────── 1) 초안 목록·전역 키 ─────────────
interface ManifestDraft { name: string; card: string; ok?: boolean }
const manifest = JSON.parse(readFileSync(`${round}/manifest.json`, "utf8")) as { drafts: ManifestDraft[] };
const eligible = manifest.drafts.filter((d) => {
  const have = existsSync(`${round}/drafts/${d.name}.html`) && existsSync(`${round}/drafts/${d.name}.html.json`);
  if (!have || d.ok === false) log(`건너뜀(초안 없음·실패): ${d.name}`);
  return have && d.ok !== false;
});
const allCards = [...new Set(eligible.map((d) => d.card))];
const cards = list("--cards") ?? allCards;
for (const c of cards) if (!allCards.includes(c)) throw new Error(`manifest에 심사할 초안이 없는 카드: ${c}`);

const keyFile = `${round}/judge-key.json`;
let key: Record<string, string>;
if (existsSync(keyFile)) {
  key = JSON.parse(readFileSync(keyFile, "utf8"));
  const known = new Set(Object.values(key));
  const missing = eligible.filter((d) => !known.has(d.name)).map((d) => d.name);
  if (missing.length) throw new Error(`judge-key.json에 없는 초안 ${missing.length}건(${missing.slice(0, 3).join(", ")}…) — 초안이 늘었으면 judge-key.json과 judge/를 지우고 다시 하세요`);
} else {
  key = assignBlindKeys(allCards.map((card) => ({ card, names: eligible.filter((d) => d.card === card).map((d) => d.name) })));
  writeFileSync(keyFile, JSON.stringify(key, null, 1));
  log(`judge-key.json 씀 (${Object.keys(key).length}건)`);
}
const namesOf = (card: string) => eligible.filter((d) => d.card === card).map((d) => d.name);
const idsOf = (card: string) => Object.keys(key).filter((id) => namesOf(card).includes(key[id])).sort();

// ───────────── 2) 카드별 묶음 ─────────────
for (const card of cards) {
  const tag = cardTag(card);
  const dir = `${judgeDir}/${tag}`;
  const ids = idsOf(card);
  if (existsSync(`${dir}/_sources.md`) && ids.every((id) => existsSync(`${dir}/${id}.md`))) log(`묶음 있음: ${card}`);
  else {
    mkdirSync(`${round}/judge-keys`, { recursive: true });
    const cardKey = `${round}/judge-keys/${tag}.json`;
    writeFileSync(cardKey, JSON.stringify(Object.fromEntries(ids.map((id) => [id, key[id]])), null, 1));
    const r = spawnSync(process.execPath, [...process.execArgv, "scripts/eval/judge-packets.ts", round, card, "--key", cardKey, "--out", dir], { encoding: "utf8", env: process.env, maxBuffer: 64 << 20 });
    if (r.status !== 0) throw new Error(`묶음 만들기 실패(${card}): ${(r.stderr || r.stdout).slice(-600)}`);
    log(`묶음 만듦: ${card} — ${r.stdout.trim().split("\n").pop()}`);
  }
  const leaks = ids.flatMap((id) => leakHits(readFileSync(`${dir}/${id}.md`, "utf8"), allowLeak).map((w) => `${id}: ${w}`));
  if (leaks.length) throw new Error(`정체 누출 의심(${card}): ${leaks.join(", ")} — 초안 본문에 원래 있는 낱말이면 --allow-leak`);
}
log(`묶음 검사 통과 — 카드 ${cards.length}장, 초안 ${cards.reduce((n, c) => n + idsOf(c).length, 0)}건, 누출 없음`);

// ───────────── 3) 심사 계획 ─────────────
// 루브릭: --rubric > <round>/judge-rubric.md > 모델 비교 라운드(2026-10-21-gpt)의 것
const rubricPath = opt("--rubric") ?? (existsSync(`${round}/judge-rubric.md`) ? `${round}/judge-rubric.md` : "docs/analysis/eval/2026-10-21-gpt/judge-rubric.md");
const rubric = readFileSync(rubricPath, "utf8");
interface Task { judge: JudgeName; card: string; order: string[]; request: string; out: string }
const tasks: Task[] = [];
for (const card of cards) {
  const tag = cardTag(card);
  const sources = readFileSync(`${judgeDir}/${tag}/_sources.md`, "utf8");
  for (const judge of judges) {
    const order = judgeOrder(idsOf(card), judge, card);
    const body = order.map((id) => readFileSync(`${judgeDir}/${tag}/${id}.md`, "utf8")).join("\n\n---\n\n");
    const request = `${sources}\n\n=====\n\n# 심사할 초안 ${order.length}건 (제시 순서: ${order.join(", ")})\n\n${body}\n\n=====\n\n위 근거 묶음과 대조해 초안 ${order.join(", ")} 전부를 루브릭 답 형식의 JSON 하나로 심사하세요.`;
    tasks.push({ judge, card, order, request, out: `${judgeDir}/${judge}/${tag}.json` });
  }
}
// 심사자가 번갈아 돌게 카드 순서로 끼워 정렬
tasks.sort((a, b) => cards.indexOf(a.card) - cards.indexOf(b.card) || judges.indexOf(a.judge) - judges.indexOf(b.judge));
const todo = tasks.filter((t) => !existsSync(t.out));
log(`심사 계획: 전체 ${tasks.length}건, 남은 ${todo.length}건, 동시 ${concurrency}, 모델 ${judges.map((j) => `${j}=${RUNNERS[j].model}/${RUNNERS[j].effort}`).join(" ")}`);
for (const t of tasks) log(`  ${existsSync(t.out) ? "[있음]" : "[할 일]"} ${t.judge} · ${t.card} · 순서 ${t.order.join(" ")} · 요청 ${t.request.length}자 · 시스템 ${rubric.length + 60}자`);
if (dry || packetsOnly) {
  log(dry ? "--dry: 심사 AI는 부르지 않음" : "--packets-only: 묶음까지만");
  process.exit(0);
}

// ───────────── 4) 심사 호출 ─────────────
const schema = judgeJsonSchema();
async function runTask(t: Task): Promise<void> {
  const r = RUNNERS[t.judge];
  const system = `${rubric}\n\n심사자 이름: ${t.judge}, 카드: ${t.card}`;
  let last = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const t0 = Date.now();
    try {
      const res = await r.run({ system, prompt: t.request, schema, model: r.model, effort: r.effort, timeoutMs: TIMEOUT_MS });
      const checked = checkAnswer(res.output, t.order);
      if (checked.ok) {
        mkdirSync(`${judgeDir}/${t.judge}`, { recursive: true });
        const meta = { model: res.model, usage: res.usage, costUsd: res.costUsd, ms: Date.now() - t0, attempt };
        writeFileSync(t.out, JSON.stringify({ ...checked.value, judge: t.judge, card: t.card, _meta: meta }, null, 1));
        log(`완료 ${t.judge} · ${t.card} (${Math.round((Date.now() - t0) / 1000)}초, 시도 ${attempt})`);
        return;
      }
      last = `답 검사 실패: ${checked.errors.join(" / ")}`;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    log(`실패 ${t.judge} · ${t.card} (시도 ${attempt}): ${last.slice(0, 300)}`);
  }
  log(`오류 기록 ${t.judge} · ${t.card}: 두 번 다 실패 — 다음으로`);
}
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(concurrency, todo.length) }, async () => {
    while (next < todo.length) await runTask(todo[next++]);
  }),
);

// ───────────── 5) 합치기 ─────────────
for (const judge of judges) {
  const got: { card: string; answer: JudgeAnswer }[] = [];
  const missing: string[] = [];
  for (const card of cards) {
    const f = `${judgeDir}/${judge}/${cardTag(card)}.json`;
    if (existsSync(f)) got.push({ card, answer: JSON.parse(readFileSync(f, "utf8")) });
    else missing.push(card);
  }
  if (missing.length) log(`합치기 보류 ${judge}: 답 없는 카드 ${missing.join(", ")} — 다시 실행하면 이어서 함`);
  else {
    writeFileSync(`${round}/judge-${judge}.json`, JSON.stringify(mergeJudge(judge, got), null, 1));
    log(`합침: judge-${judge}.json (카드 ${got.length}장)`);
  }
}
