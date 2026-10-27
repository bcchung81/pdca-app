// AI 작성지원 결과 단건 채점(심사 AI를 부름: --dry가 아니면 Claude CLI 호출이 나감).
// 입력: <out>/writer/<label>/<cards.uid>/<mode>.json (writer-run.ts 산출물). AI를 부른 기록만 심사(건너뜀·코드 결과는 뺌 — 요약에 이유 표시).
// 실행: node --conditions=react-server --env-file=.env.local scripts/eval/writer-judge.ts --out <폴더> [--labels base] [--concurrency 2] [--dry]
// 하는 일: 기록마다 묶음(카드 원장 글 + 요청 + 카드 전용 자료 원문 + 보완 점검이면 미흡 행 + 답 + 답이 인용·언급한 조각 원문 앞 3,000자)을 만들어
//  루브릭(scripts/eval/prompts/writer-judge.md)으로 Claude CLI(opus·high)가 한 건씩 채점(검사 실패 시 한 번 재시도)
//  → <out>/writer/judge/<label>/<uid>/<mode>.json(이미 있으면 건너뜀 — 이어 하기), 요약 <out>/writer/judge/summary.md·summary.json.
//  운영 DB는 읽기만. Claude API는 안 부름(CLI 자식에 API 키를 넘기지 않음).
//  --dry: 심사 대상 목록과 묶음 크기만(CLI 안 부름, 결과·요약 파일 안 씀)
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { runClaudeCli } from "../../lib/ai/cli.ts";
import { MATERIAL_COLS, type MaterialRow, materialState } from "../../lib/ai/material-text.ts";
import { runPool } from "../../lib/ai/pool.ts";
import { WRITER_MODES, cardOutline } from "../../lib/ai/writer.ts";
import {
  type ChunkText, type Excluded, type MaterialText, type Outcome, type RunRecord, MODE_NAMES,
  buildPacket, checkJudge, judgeJsonSchema, judgeable, mentionedKeys, summarize, summaryMarkdown, writerAnswerMarkdown, writerMetrics,
} from "./writer-judge-core.ts";

// Claude API는 쓰지 않음 — CLI로만
process.env.ANTHROPIC_API_KEY = "";
delete process.env.VERCEL;

const MODEL = "claude-opus-5-5"; // 경평 심사기(judge-run.ts)·select-judge.ts와 같은 모델·effort
const EFFORT = "high";
const TIMEOUT_MS = 20 * 60_000;

const argv = process.argv.slice(2);
const flag = (n: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const outArg = flag("--out");
if (!outArg) {
  console.error("usage: node --conditions=react-server --env-file=.env.local scripts/eval/writer-judge.ts --out <폴더> [--labels base] [--concurrency 2] [--dry]");
  process.exit(1);
}
const concurrency = Math.max(1, Number(flag("--concurrency") ?? 2) || 2);
const dry = argv.includes("--dry");
const out = resolve(outArg);
const runDir = join(out, "writer");
const judgeDir = join(runDir, "judge");
const labels = flag("--labels")?.split(",").map((s) => s.trim()).filter(Boolean) ?? readdirSync(runDir).filter((n) => n !== "judge" && existsSync(join(runDir, n)) && !n.endsWith(".txt")).sort();
mkdirSync(judgeDir, { recursive: true });
const log = (s: string) => {
  const line = `${new Date().toISOString().slice(11, 19)} ${s}`;
  console.log(line);
  appendFileSync(join(judgeDir, "run.txt"), line + "\n");
};

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

// ───────────── 1) 기록 모으기 ─────────────
interface Item { label: string; mode: (typeof MODE_NAMES)[number]; uid: string; rec: RunRecord }
const items: Item[] = [];
const excluded: Excluded[] = [];
for (const label of labels) {
  const dir = join(runDir, label);
  if (!existsSync(dir)) {
    log(`라벨 폴더 없음: ${label}`);
    continue;
  }
  for (const uid of readdirSync(dir).sort()) {
    for (const mode of MODE_NAMES) {
      const f = join(dir, uid, `${mode}.json`);
      if (!existsSync(f)) continue;
      const rec = JSON.parse(readFileSync(f, "utf8")) as RunRecord;
      const j = judgeable(rec);
      if (j.ok) items.push({ label, mode, uid, rec });
      else excluded.push({ label, mode, uid, cardId: rec.cardId, reason: j.reason });
    }
  }
}

// ───────────── 2) 묶음 ─────────────
async function chunksOf(keys: string[]): Promise<ChunkText[]> {
  if (!keys.length) return [];
  const { data, error } = await db.from("knowledge_chunks").select("chunk_key, title, text").in("chunk_key", keys);
  if (error) throw new Error(`조각을 읽지 못함: ${error.message}`);
  return (data ?? []).map((c) => ({ key: c.chunk_key, title: c.title, text: String(c.text ?? "") })).sort((a, b) => a.key.localeCompare(b.key));
}

/** 서버와 같은 순서·판정의 카드 전용 자료(ready만, file:N 번호 같음) */
async function materialsOf(cardId: string): Promise<MaterialText[]> {
  const { data, error } = await db.from("card_materials").select(MATERIAL_COLS).eq("card_id", cardId).order("created_at");
  if (error) throw new Error(`카드 전용 자료를 읽지 못함: ${error.message}`);
  return ((data ?? []) as MaterialRow[]).filter((r) => materialState(r) === "ready").map((r, i) => ({ key: `file:${i + 1}`, name: r.file_name, text: r.parsed_text ?? "" }));
}

interface Task { item: Item; request: string; outFile: string; keys: string[]; metrics: Outcome["metrics"]; hasSuggestions: boolean }
const tasks: Task[] = [];
for (const item of items) {
  const { rec } = item;
  const { data: card, error } = await db.from("cards").select("id, data").eq("uid", item.uid).single();
  if (error || !card) throw new Error(`카드를 읽지 못함 ${item.uid}: ${error?.message}`);
  const result = rec.result!;
  const found = await chunksOf(mentionedKeys("writer", result));
  const keys = found.map((c) => c.key);
  const request = buildPacket({
    cardId: rec.cardId,
    mode: item.mode,
    modeLabel: WRITER_MODES[item.mode].label,
    modeHint: WRITER_MODES[item.mode].hint,
    periodLabel: rec.periodLabel,
    cardText: cardOutline(card.data),
    materials: await materialsOf(card.id),
    followupBasis: rec.followupBasis,
    answer: writerAnswerMarkdown(result),
    chunks: found,
  });
  tasks.push({ item, request, outFile: join(judgeDir, item.label, item.uid, `${item.mode}.json`), keys, metrics: writerMetrics(result as never, keys), hasSuggestions: (result.suggestions ?? []).length > 0 });
}

log(`심사 대상 ${tasks.length}건(뺀 것 ${excluded.length}건) · 라벨 ${labels.join(",")} · 모델 ${MODEL}/${EFFORT} · 동시 ${concurrency}`);
for (const t of tasks) log(`  ${existsSync(t.outFile) ? "[있음]" : "[할 일]"} ${t.item.label}/${t.item.rec.cardId}/${t.item.mode} · 묶음 ${t.request.length}자 · 조각 ${t.keys.length}건`);
for (const e of excluded) log(`  [뺌] ${e.label}/${e.cardId}/${e.mode} — ${e.reason}`);

// ───────────── 3) 심사 ─────────────
const rubric = readFileSync("scripts/eval/prompts/writer-judge.md", "utf8");
const schema = judgeJsonSchema();
if (!dry) {
  async function runTask(t: Task): Promise<void> {
    const name = `${t.item.label}/${t.item.rec.cardId}/${t.item.mode}`;
    if (existsSync(t.outFile)) return log(`있음, 건너뜀 ${name}`);
    let last = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      const t0 = Date.now();
      try {
        const res = await runClaudeCli({ system: rubric, prompt: t.request, schema, model: MODEL, effort: EFFORT, timeoutMs: TIMEOUT_MS });
        const checked = checkJudge(res.output, { hasSuggestions: t.hasSuggestions });
        if (checked.ok) {
          mkdirSync(join(judgeDir, t.item.label, t.item.uid), { recursive: true });
          const meta = { model: res.model, usage: res.usage, costUsd: res.costUsd, ms: Date.now() - t0, attempt };
          writeFileSync(t.outFile, JSON.stringify({ label: t.item.label, mode: t.item.mode, uid: t.item.uid, cardId: t.item.rec.cardId, metrics: t.metrics, judge: checked.value, _meta: meta }, null, 1));
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

// ───────────── 4) 요약 ─────────────
const outcomes: Outcome[] = tasks.map((t) => {
  const o: Outcome = { label: t.item.label, mode: t.item.mode, uid: t.item.uid, cardId: t.item.rec.cardId, metrics: t.metrics };
  if (existsSync(t.outFile)) o.judge = (JSON.parse(readFileSync(t.outFile, "utf8")) as { judge: Outcome["judge"] }).judge;
  else if (!dry) excluded.push({ label: o.label, mode: o.mode, uid: o.uid, cardId: o.cardId, reason: "심사 실패(두 번 다)" });
  return o;
});
const summary = summarize(outcomes);
const md = summaryMarkdown(summary, excluded);
if (!dry) {
  writeFileSync(join(judgeDir, "summary.json"), JSON.stringify({ createdAt: new Date().toISOString(), model: `${MODEL}/${EFFORT}`, labels, summary, excluded, outcomes }, null, 1));
  writeFileSync(join(judgeDir, "summary.md"), md);
}
console.log(`\n${md}`);
log(dry ? "--dry: 심사 AI는 부르지 않음" : "끝");
