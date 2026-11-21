// 공통 지식 맥락 줄이기(2026-11-21) 검증 — base·new 답 블라인드 쌍 심사(심사 AI를 부름: --dry가 아니면 Claude CLI 호출이 나감).
// 입력: <out>/<arm>/<cards.uid>/<기능>.json(writer-ab.ts 산출물). 같은 카드·같은 기능의 두 갈래 답이 다 있고 건너뜀·코드 결과가 아니면 한 쌍.
// 실행(저장소 폴더에서): node --conditions=react-server --env-file=.env.local scripts/eval/writer-ab-judge.ts --out <폴더> [--features …] [--concurrency 2] [--dry]
// 하는 일: 쌍마다 A/B 순서를 씨앗 고정으로 섞고(키 <out>/judge/judge-key.json) → 묶음(요청 종류의 할 일 + 카드 원장 글 + 두 답 + 두 답이 인용·언급한 조각 원문(조각당 앞 3,000자)
//  + 카드 전용 자료(자료당 앞 9,000자 — --attach로 더한 파일은 기록의 경로를 같은 읽기로 다시 읽음) + 이 카드의 외부 컨설팅 의견(근거 아님 — 점검 관점, 있을 때만)
//  + 최근 점검표 요약(어느 한쪽이 받았으면)) → Claude CLI 심사(opus·high, 루브릭 prompts/writer-ab-judge.md — select-judge.md의 4축 + 지침 준수,
//  검사 실패 시 한 번 재시도) → <out>/judge/<기능>/<uid>.json(이미 있으면 건너뜀 — 이어 하기), 요약 <out>/judge/summary.json·summary.md(통과 기준 4개·결정론 표·쌍 심사 표).
//  요청 종류의 할 일은 지금 작업 트리의 프롬프트 절(task.<요청 종류>)을 씀 — 두 갈래 같은 글(2026-11-21 확인). 운영 DB는 읽기만. Claude API는 안 부름(CLI 자식에 API 키를 넘기지 않음).
//  --cli-logs <파일,…>: CLI 감싸기 로그(claude-wrap.sh — 실행 때 CLAUDE_CLI_PATH로 꽂음)를 읽어 호출마다 첫 API 호출 입력 토큰·API 호출 수를 붙임(기록 usage와 맞춤).
//    두 갈래 모두 있으면 통과 기준 (4)를 그 값으로 봄(CLI가 구조화 출력을 고치느라 다시 부르면 전체 입력이 두 배 가까이 되므로)
//  조각마다 앱 요청 글과 같은 위치 표기(chunkRef의 where — context_prefix + 개정 표지, 쪽수 등)를 「위치: …」로 실음(2026-11-21 W2 지적 — 맞는 쪽수를 지어냄으로 세던 결함).
//  --judge-dir <이름>: 판정을 <out>/<이름>에 씀(기본 judge — 옛 판정을 덮지 않고 따로 낼 때), --cards <카드 id,…>: 그 카드의 쌍만
//  --dry: 쌍 목록과 묶음 크기만(CLI 안 부름, 판정 파일 안 씀 — 요약은 결정론 지표만 씀)
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { readAttachment } from "../../lib/ai/attachments.ts";
import { inspectionBrief } from "../../lib/ai/chat.ts";
import { loadCardConsult } from "../../lib/ai/context.ts";
import { BUNDLE_COLS, type BundleChunk, chunkRef } from "../../lib/knowledge/bundle.ts";
import { runClaudeCli } from "../../lib/ai/cli.ts";
import { MATERIAL_COLS, type MaterialRow, materialState } from "../../lib/ai/material-text.ts";
import { runPool } from "../../lib/ai/pool.ts";
import { cardOutline } from "../../lib/ai/writer.ts";
import { latestInspection } from "../../lib/ai/writer-knowledge.ts";
import { assistInspectionBrief } from "../../lib/ai/writer-inspection.ts";
import { isMgmtCard } from "../../lib/cards/mgmt-card.ts";
import { assistPrompts, assistPromptsMg } from "../../lib/prompts/sets.ts";
import { fillFrom } from "../../lib/prompts/template.ts";
import {
  AB_ARMS, type AbArm, type AbChunkText, type AbFeature, type AbPairOutcome, type AbRecord, type CliCallInfo, type PairRow, cliLogIndex, usageKey,
  abAnswerMarkdown, abBlindBreak, abJudgeJsonSchema, abMentionedKeys, abPairId, abPairOrder, abSummaryTable, buildAbPacket, checkAbJudge, dutyText, failFile,
  isWriterFeature, pairProblem, pairTable, parseFeatures, recordFile, recordMetrics, resolveAb, summarizeAb, verdictTable,
} from "./writer-ab-core.ts";

// Claude API는 쓰지 않음 — CLI로만
process.env.ANTHROPIC_API_KEY = "";
delete process.env.VERCEL;

const MODEL = "claude-opus-5-5"; // select-judge.ts·judge-run.ts의 claude 심사자와 같은 모델·effort
const EFFORT = "high";
const TIMEOUT_MS = 20 * 60_000;

const argv = process.argv.slice(2);
const flag = (n: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const outArg = flag("--out");
if (!outArg) {
  console.error("usage: node --conditions=react-server --env-file=.env.local scripts/eval/writer-ab-judge.ts --out <폴더> [--features …] [--concurrency 2] [--dry]");
  process.exit(1);
}
const features = parseFeatures(flag("--features"));
const concurrency = Math.max(1, Number(flag("--concurrency") ?? 2) || 2);
const dry = argv.includes("--dry");
const cliIndex = new Map<string, CliCallInfo>();
for (const f of (flag("--cli-logs") ?? "").split(",").map((s) => s.trim()).filter(Boolean)) for (const [k, v] of cliLogIndex(readFileSync(f, "utf8"))) cliIndex.set(k, v);
const cliOf = (r: AbRecord) => (r.usage ? cliIndex.get(usageKey(r.usage)) : undefined);

const out = resolve(outArg);
const judgeDir = join(out, flag("--judge-dir") ?? "judge");
const onlyCards = (flag("--cards") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
mkdirSync(judgeDir, { recursive: true });
const log = (s: string) => {
  const line = `${new Date().toISOString().slice(11, 19)} ${s}`;
  console.log(line);
  appendFileSync(join(judgeDir, "run.txt"), line + "\n");
};

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

// ───────────── 1) 기록 모으기 ─────────────
const readJson = <T,>(p: string): T | null => (existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : null);
const uidsOf = (arm: AbArm) => (existsSync(join(out, arm)) ? readdirSync(join(out, arm)).filter((d) => statSync(join(out, arm, d)).isDirectory()) : []);
const uids = [...new Set(AB_ARMS.flatMap(uidsOf))].sort();
// 끝내 실패: 실패 기록만 있고 답 기록이 없는 것
const failures = Object.fromEntries(AB_ARMS.map((arm) => [arm, uids.reduce((n, uid) => n + features.filter((f) => existsSync(failFile(out, arm, uid, f)) && !existsSync(recordFile(out, arm, uid, f))).length, 0)])) as Record<AbArm, number>;

interface Pair { feature: AbFeature; uid: string; base: AbRecord; new: AbRecord }
const rows: PairRow[] = [];
const pairs: Pair[] = [];
for (const f of features) {
  for (const uid of uids) {
    const base = readJson<AbRecord>(recordFile(out, "base", uid, f));
    const neu = readJson<AbRecord>(recordFile(out, "new", uid, f));
    if (!base && !neu) continue;
    if (onlyCards.length && !onlyCards.includes((base ?? neu)!.cardId)) continue;
    const problem = pairProblem(base, neu);
    rows.push({ feature: f, cardId: (base ?? neu)!.cardId, base, new: neu, problem });
    if (problem) log(`쌍 아님 ${f}/${uid}: ${problem}`);
    else pairs.push({ feature: f, uid, base: base!, new: neu! });
  }
}

// ───────────── 2) 키 파일 ─────────────
const keyFile = join(judgeDir, "judge-key.json");
const key: Record<string, { A: AbArm; B: AbArm }> = readJson(keyFile) ?? {};
for (const p of pairs) key[abPairId(p.feature, p.uid)] ??= abPairOrder(p.feature, p.uid);
if (!dry) writeFileSync(keyFile, JSON.stringify(key, null, 1));

// ───────────── 3) 묶음 ─────────────
/** 조각 → 묶음 조각(앱과 같은 chunkRef — 위치 표기 where 포함) */
const toChunkText = (c: BundleChunk): AbChunkText => {
  const r = chunkRef(c);
  return { key: r.key, title: r.title, text: r.text, ...(r.where ? { where: r.where } : {}) };
};
async function chunksOf(keys: string[]): Promise<AbChunkText[]> {
  if (!keys.length) return [];
  const { data, error } = await db.from("knowledge_chunks").select(BUNDLE_COLS).in("chunk_key", keys);
  if (error) throw new Error(`조각을 읽지 못함: ${error.message}`);
  return ((data ?? []) as BundleChunk[]).map(toChunkText).sort((a, b) => a.key.localeCompare(b.key));
}
/** 두 갈래가 받은 카드 전용 자료 — DB 저장본(기록의 이름과 같은 것, 실행기와 같은 판정) 다음에 --attach 파일(기록의 경로를 같은 읽기로) — file:N 번호와 같은 순서 */
async function filesOf(r: AbRecord): Promise<Array<{ name: string; text: string }>> {
  const attached = r.materials.attached ?? [];
  const names = r.materials.used.slice(0, r.materials.used.length - attached.length);
  const out: Array<{ name: string; text: string }> = [];
  if (names.length) {
    const { data: mats } = await db.from("card_materials").select(MATERIAL_COLS).eq("card_id", r.cardId).order("created_at");
    for (const m of ((mats ?? []) as MaterialRow[]).filter((m) => materialState(m) === "ready" && names.includes(m.file_name))) out.push({ name: m.file_name, text: m.parsed_text ?? "" });
  }
  for (const a of attached) out.push(await readAttachment(new Uint8Array(readFileSync(a.path)), a.name));
  return out;
}

interface Task { pair: Pair; k: { A: AbArm; B: AbArm }; request: string; outFile: string; keys: string[]; consult: number }
const tasks: Task[] = [];
const outcomes: AbPairOutcome[] = [];
for (const p of pairs) {
  const k = key[abPairId(p.feature, p.uid)];
  const { data: card, error } = await db.from("cards").select("data").eq("uid", p.uid).single();
  if (error || !card) throw new Error(`카드를 읽지 못함 ${p.uid}: ${error?.message}`);
  const mentioned = (r: AbRecord) => abMentionedKeys(p.feature, r.result);
  // 이 카드의 외부 컨설팅 의견(근거 아님) — 6절에 따로 싣고 4절 조각에서는 뺌
  const consult = (await loadCardConsult(db, p.base.cardId)).map(toChunkText);
  const consultKeys = new Set(consult.map((c) => c.key));
  const fetched = await chunksOf([...new Set([...mentioned(p.base), ...mentioned(p.new)])]);
  const existing = fetched.filter((c) => !consultKeys.has(c.key));
  const have = new Set(fetched.map((c) => c.key));
  const md = (arm: AbArm) => abAnswerMarkdown(p.feature, p[arm].result);
  const task = isWriterFeature(p.feature) ? fillFrom((isMgmtCard(card.data) ? assistPromptsMg : assistPrompts)().prompts, "request", `task.${p.feature}`) : null;
  // 최근 점검표: 어느 한쪽이라도 요약을 받았으면 심사자도 봄(받은 갈래는 묶음에 적지 않음)
  const given = new Set([p.base.inspection.given, p.new.inspection.given]);
  const ins = given.has("summary") || given.has("chat") ? await latestInspection(db, p.base.cardId) : null;
  const insText = ins ? [given.has("summary") ? assistInspectionBrief(ins) : "", given.has("chat") && !given.has("summary") ? inspectionBrief(ins) : ""].filter(Boolean).join("\n") : "";
  const request = buildAbPacket({ feature: p.feature, cardId: p.base.cardId, duty: dutyText(p.base, task), cardText: cardOutline(card.data), answerA: md(k.A), answerB: md(k.B), chunks: existing, files: await filesOf(p.base), consult, inspection: insText || undefined });
  const keysOf = (r: AbRecord) => mentioned(r).filter((x) => have.has(x)).length;
  outcomes.push({ feature: p.feature, uid: p.uid, cardId: p.base.cardId, metrics: { base: recordMetrics(p.base, keysOf(p.base), cliOf(p.base)), new: recordMetrics(p.new, keysOf(p.new), cliOf(p.new)) }, blindBreak: AB_ARMS.filter((a) => abBlindBreak(p.feature, p[a].result)) });
  tasks.push({ pair: p, k, request, outFile: join(judgeDir, p.feature, `${p.uid}.json`), keys: [...have], consult: consult.length });
}

log(`쌍 ${pairs.length}건 (${features.join(",")}) · 모델 ${MODEL}/${EFFORT} · 동시 ${concurrency} · 끝내 실패 base ${failures.base}·new ${failures.new} · CLI 로그 ${cliIndex.size}건`);
for (const t of tasks) log(`  ${existsSync(t.outFile) ? "[있음]" : "[할 일]"} ${t.pair.feature}/${t.pair.uid} (${t.pair.base.cardId}) · A=${t.k.A} · 묶음 ${t.request.length}자 · 조각 ${t.keys.length}건${t.consult ? ` · 컨설팅 의견 ${t.consult}건` : ""}`);

// ───────────── 4) 심사 ─────────────
const rubric = readFileSync("scripts/eval/prompts/writer-ab-judge.md", "utf8");
const schema = abJudgeJsonSchema();
if (!dry) {
  async function runTask(t: Task): Promise<void> {
    const name = `${t.pair.feature}/${t.pair.uid}`;
    if (existsSync(t.outFile)) return log(`있음, 건너뜀 ${name}`);
    let last = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      const t0 = Date.now();
      try {
        const res = await runClaudeCli({ system: rubric, prompt: t.request, schema, model: MODEL, effort: EFFORT, timeoutMs: TIMEOUT_MS });
        const checked = checkAbJudge(res.output);
        if (checked.ok) {
          mkdirSync(join(judgeDir, t.pair.feature), { recursive: true });
          const meta = { model: res.model, usage: res.usage, costUsd: res.costUsd, ms: Date.now() - t0, attempt, packetChars: t.request.length };
          writeFileSync(t.outFile, JSON.stringify({ feature: t.pair.feature, uid: t.pair.uid, cardId: t.pair.base.cardId, key: t.k, resolved: resolveAb(checked.value, t.k), judge: checked.value, _meta: meta }, null, 1));
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
  const j = readJson<{ resolved: AbPairOutcome["resolved"]; judge: { reason: string } }>(t.outFile);
  if (!j) continue;
  outcomes[i].resolved = j.resolved;
  const row = rows.find((r) => r.feature === t.pair.feature && r.base?.uid === t.pair.uid);
  if (row) Object.assign(row, { resolved: j.resolved, reason: j.judge.reason });
}
const summary = summarizeAb(outcomes, failures);
const md = [`# 공통 지식 맥락 줄이기 — base·new 쌍 심사 요약 (${new Date().toISOString()}, 심사 ${MODEL}/${EFFORT})`, "## 통과 기준", abSummaryTable(summary), "## 결정론 표", pairTable(rows, cliOf), "## 쌍 심사 표", verdictTable(rows)].join("\n\n");
writeFileSync(join(judgeDir, "summary.json"), JSON.stringify({ createdAt: new Date().toISOString(), model: `${MODEL}/${EFFORT}`, dry, features, summary, pairs: outcomes }, null, 1));
writeFileSync(join(judgeDir, "summary.md"), md);
console.log(`\n${md}`);
log(dry ? "--dry: 심사 AI는 부르지 않음" : "끝");
