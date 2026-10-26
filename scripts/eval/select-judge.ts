// 통째로 넣기(full) 대 선별(sel) 병행 비교 — 작성지원·질문 답 블라인드 쌍 심사(심사 AI를 부름: --dry가 아니면 Claude CLI 호출이 나감).
// 입력: <out>/ab/<arm>/<cards.uid>/<feature>.json (select-ab.ts 산출물). 두 방식 답이 다 있고 fellBack이 아니면 한 쌍.
// 실행: node --conditions=react-server --env-file=.env.local scripts/eval/select-judge.ts --out docs/analysis/eval/2026-10-26-select [--features writer,chat] [--concurrency 2] [--dry]
// 하는 일: 쌍마다 A/B 순서를 씨앗 고정으로 섞고(키 <out>/ab/judge/judge-key.json) → 묶음(카드 원장 글 + 두 답 + 두 답이 인용·언급한 조각 원문, 조각당 앞 3,000자) → Claude CLI 심사(검사 실패 시 한 번 재시도)
//  → <out>/ab/judge/<feature>/<uid>.json(이미 있으면 건너뜀 — 이어 하기), 요약 <out>/ab/judge/summary.json·summary.md.
//  결정론 지표(제안 수·인용 대조·언급 조각 수 등)는 AI 없이 같은 요약에 들어감. 운영 DB는 읽기만. Claude API는 안 부름(CLI 자식에 API 키를 넘기지 않음).
//  --dry: 쌍 목록과 묶음 크기만(CLI 안 부름, 결과 파일 안 씀 — 요약은 결정론 지표만 summary.json에 씀).
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { runClaudeCli } from "../../lib/ai/cli.ts";
import { runPool } from "../../lib/ai/pool.ts";
import { cardOutline } from "../../lib/ai/writer.ts";
import {
  ARMS, FEATURES, type AbRecord, type Arm, type ChatResult, type ChunkText, type Feature, type JudgeKey, type PairOutcome, type WriterResult,
  answerMarkdown, blindBreaks, buildPacket, chatMetrics, checkJudge, judgeJsonSchema, mentionedKeys, pairId, pairOrder, resolveJudge, summarize, summaryTable, writerMetrics,
} from "./select-judge-core.ts";

// Claude API는 쓰지 않음 — CLI로만
process.env.ANTHROPIC_API_KEY = "";
delete process.env.VERCEL;

const MODEL = "claude-opus-5-5"; // 경평 심사기(judge-run.ts)의 claude 심사자와 같은 모델·effort
const EFFORT = "high";
const TIMEOUT_MS = 20 * 60_000;

const argv = process.argv.slice(2);
const flag = (n: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const outArg = flag("--out");
if (!outArg) {
  console.error("usage: node --conditions=react-server --env-file=.env.local scripts/eval/select-judge.ts --out <dir> [--features writer,chat] [--concurrency 2] [--dry]");
  process.exit(1);
}
const features = (flag("--features") ?? FEATURES.join(",")).split(",").map((s) => s.trim()).filter(Boolean) as Feature[];
const badF = features.filter((f) => !FEATURES.includes(f));
if (badF.length) throw new Error(`모르는 기능: ${badF.join(", ")} (writer·chat)`);
const concurrency = Math.max(1, Number(flag("--concurrency") ?? 2) || 2);
const dry = argv.includes("--dry");

const out = resolve(outArg);
const abDir = join(out, "ab");
const judgeDir = join(abDir, "judge");
mkdirSync(judgeDir, { recursive: true });
const log = (s: string) => {
  const line = `${new Date().toISOString().slice(11, 19)} ${s}`;
  console.log(line);
  appendFileSync(join(judgeDir, "run.txt"), line + "\n");
};

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

// ───────────── 1) 쌍 찾기 ─────────────
const readAb = (arm: Arm, uid: string, f: Feature): AbRecord | null => {
  const p = join(abDir, arm, uid, `${f}.json`);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as AbRecord) : null;
};
const uids = [...new Set(ARMS.flatMap((a) => (existsSync(join(abDir, a)) ? readdirSync(join(abDir, a)) : [])))].sort();
interface Pair { feature: Feature; uid: string; full: AbRecord; sel: AbRecord }
const pairs: Pair[] = [];
for (const f of features) {
  for (const uid of uids) {
    const full = readAb("full", uid, f);
    const sel = readAb("sel", uid, f);
    if (!full || !sel) {
      if (full || sel) log(`건너뜀(한쪽만 있음): ${f}/${uid}`);
      continue;
    }
    if (full.fellBack || sel.fellBack) {
      log(`건너뜀(fellBack): ${f}/${uid}`);
      continue;
    }
    pairs.push({ feature: f, uid, full, sel });
  }
}

// ───────────── 2) 키 파일 ─────────────
const keyFile = join(judgeDir, "judge-key.json");
const key: JudgeKey = existsSync(keyFile) ? JSON.parse(readFileSync(keyFile, "utf8")) : {};
for (const p of pairs) key[pairId(p.feature, p.uid)] ??= pairOrder(p.feature, p.uid);
if (!dry) writeFileSync(keyFile, JSON.stringify(key, null, 1));

// ───────────── 3) 묶음 ─────────────
async function chunksOf(keys: string[]): Promise<ChunkText[]> {
  if (!keys.length) return [];
  const { data, error } = await db.from("knowledge_chunks").select("chunk_key, title, text").in("chunk_key", keys);
  if (error) throw new Error(`조각을 읽지 못함: ${error.message}`);
  return (data ?? []).map((c) => ({ key: c.chunk_key, title: c.title, text: String(c.text ?? "") })).sort((a, b) => a.key.localeCompare(b.key));
}
interface Task { pair: Pair; k: { A: Arm; B: Arm }; request: string; outFile: string; keys: string[] }
const tasks: Task[] = [];
const outcomes: PairOutcome[] = [];
for (const p of pairs) {
  const k = key[pairId(p.feature, p.uid)];
  const { data: card, error } = await db.from("cards").select("data").eq("uid", p.uid).single();
  if (error || !card) throw new Error(`카드를 읽지 못함 ${p.uid}: ${error?.message}`);
  const keyOf = (r: AbRecord) => mentionedKeys(p.feature, r.result);
  const existing = await chunksOf([...new Set([...keyOf(p.full), ...keyOf(p.sel)])]);
  const have = new Set(existing.map((c) => c.key));
  const md = (arm: Arm) => answerMarkdown(p.feature, (arm === "full" ? p.full : p.sel).result);
  const question = p.feature === "chat" ? String((p.full.result as ChatResult).question ?? "") : undefined;
  const request = buildPacket({ feature: p.feature, cardId: p.full.cardId, cardText: cardOutline(card.data), question, answerA: md(k.A), answerB: md(k.B), chunks: existing });
  const metricsOf = (r: AbRecord) => {
    const ks = keyOf(r).filter((x) => have.has(x));
    return p.feature === "writer" ? writerMetrics(r.result as WriterResult, ks) : chatMetrics(r.result as ChatResult, ks);
  };
  outcomes.push({ feature: p.feature, uid: p.uid, metrics: { full: metricsOf(p.full), sel: metricsOf(p.sel) }, blindBreak: ARMS.filter((a) => blindBreaks(md(a))) });
  tasks.push({ pair: p, k, request, outFile: join(judgeDir, p.feature, `${p.uid}.json`), keys: [...have] });
}

log(`쌍 ${pairs.length}건 (${features.join(",")}) · 모델 ${MODEL}/${EFFORT} · 동시 ${concurrency}`);
for (const t of tasks) log(`  ${existsSync(t.outFile) ? "[있음]" : "[할 일]"} ${t.pair.feature}/${t.pair.uid} (${t.pair.full.cardId}) · A=${t.k.A} · 묶음 ${t.request.length}자 · 조각 ${t.keys.length}건`);

// ───────────── 4) 심사 ─────────────
const rubric = readFileSync("scripts/eval/prompts/select-judge.md", "utf8");
const schema = judgeJsonSchema();
if (!dry) {
  async function runTask(t: Task): Promise<void> {
    const name = `${t.pair.feature}/${t.pair.uid}`;
    if (existsSync(t.outFile)) return log(`있음, 건너뜀 ${name}`);
    let last = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      const t0 = Date.now();
      try {
        const res = await runClaudeCli({ system: rubric, prompt: t.request, schema, model: MODEL, effort: EFFORT, timeoutMs: TIMEOUT_MS });
        const checked = checkJudge(res.output);
        if (checked.ok) {
          mkdirSync(join(judgeDir, t.pair.feature), { recursive: true });
          const meta = { model: res.model, usage: res.usage, costUsd: res.costUsd, ms: Date.now() - t0, attempt };
          // 키로 푼 방식 표시 + 원본 답(심사자가 본 것과 같은 글)
          writeFileSync(t.outFile, JSON.stringify({ feature: t.pair.feature, uid: t.pair.uid, cardId: t.pair.full.cardId, key: t.k, resolved: resolveJudge(checked.value, t.k), judge: checked.value, answers: { full: t.pair.full.result, sel: t.pair.sel.result }, _meta: meta }, null, 1));
          return log(`완료 ${name} (${Math.round((Date.now() - t0) / 1000)}초, 시도 ${attempt})`);
        }
        last = `답 검사 실패: ${checked.errors.join(" / ")}`;
      } catch (e) {
        last = e instanceof Error ? e.message : String(e);
      }
      log(`실패 ${name} (시도 ${attempt}): ${last.slice(0, 300)}`);
    }
    log(`오류 기록 ${name}: 두 번 다 실패 — 다음으로`);
  }
  await runPool(tasks, concurrency, (t) => runTask(t));
}

// ───────────── 5) 요약 ─────────────
for (const [i, t] of tasks.entries()) {
  if (existsSync(t.outFile)) outcomes[i].resolved = (JSON.parse(readFileSync(t.outFile, "utf8")) as { resolved: PairOutcome["resolved"] }).resolved;
}
const summary = summarize(outcomes);
writeFileSync(join(judgeDir, "summary.json"), JSON.stringify({ createdAt: new Date().toISOString(), model: `${MODEL}/${EFFORT}`, dry, features, summary, pairs: outcomes }, null, 1));
const table = summaryTable(summary);
if (!dry) writeFileSync(join(judgeDir, "summary.md"), table);
console.log(`\n${table}`);
log(dry ? "--dry: 심사 AI는 부르지 않음" : "끝");
