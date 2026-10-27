// AI 작성지원(카드 옆 창) 품질 측정 — 실행기(평가 전용·수동 실행).
// 서버 액션(app/(app)/cards/actions.ts runCardAssist)과 같은 근거·검증으로 카드 × 요청 종류마다 callWriter를 한 번씩 부르고 결과를 파일로 씀.
//  - 카드 = 운영 원장 카드 JSON(cards.data). 카드 전용 자료 = 그 카드의 card_materials 저장본 전체 글(materialState ready — 서버와 같은 판정).
//    안 읽었거나 판이 다른 자료는 서버라면 여기서 읽어 DB에 채우지만, 이 스크립트는 DB에 쓰지 않으려고 건너뛰고 기록(skipped)에 남김.
//  - 요청 종류: improve·discover = 요청 글 없음 / reflect = 붙여 넣은 글 없이 카드 전용 자료만(자료가 없으면 서버처럼 부르지 않고 건너뜀)
//    / followup = 최종 점검표(status ≠ draft, 점검월이 가장 늦은 1건) 미흡 행(점검표가 없으면 건너뜀, 미흡 0건이면 코드 결과 — AI 안 부름).
//  - 공통 지식 = loadCardBundle(db, card, "card", "writer") — 선별 여부는 환경변수(KNOWLEDGE_SELECT)가 정함. 여기서 바꾸지 않음.
// Claude는 로컬 CLI로만(AI_PROVIDER=cli, ANTHROPIC_API_KEY 비움). 운영 DB는 읽기만, ai_requests에도 쓰지 않음(기록 없는 callWriter).
// 실행: node --conditions=react-server --env-file=.env.local scripts/eval/writer-run.ts --out <폴더> --cards <id,…> --modes improve,discover,reflect,followup [--label base] [--concurrency 2] [--dry]
//  결과: <out>/writer/<label>/<cards.uid>/<mode>.json — 이미 있으면 건너뜀(이어 하기). 진행 줄 <out>/writer/run.txt
//  --dry: AI를 부르지 않고 할 일 목록과 요청 글 크기만(파일 안 씀)
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadCardBundle } from "../../lib/ai/context.ts";
import { type FollowupBasis, followupBasis } from "../../lib/ai/followup.ts";
import { MATERIAL_COLS, type MaterialDoc, type MaterialRow, fileRefs, materialState } from "../../lib/ai/material-text.ts";
import { runPool } from "../../lib/ai/pool.ts";
import { type Usage, callWriter, modelLabel, writerSystem, writerSystemMg } from "../../lib/ai/run.ts";
import { WRITER_MODES, type WriterMode, noRequirementResult, userPrompt, verifyResult } from "../../lib/ai/writer.ts";
import { isMgmtCard } from "../../lib/cards/mgmt-card.ts";
import { currentPeriod } from "../../lib/cards/view.ts";
import { type KnowledgeBundle, bundleRefs, listText, sharedTexts } from "../../lib/knowledge/bundle.ts";
import { readResult } from "../../lib/inspections/model.ts";
import { assistPrompts, assistPromptsMg } from "../../lib/prompts/sets.ts";
import { trackSpecOfUnit } from "../../lib/tracks/index.ts";

// Claude API는 쓰지 않음 — .env.local에 API 키가 있어도 CLI로(aiProvider는 부를 때 process.env를 읽음)
process.env.AI_PROVIDER = "cli";
process.env.ANTHROPIC_API_KEY = "";
delete process.env.VERCEL;

const MODES = Object.keys(WRITER_MODES) as WriterMode[];
const DEFAULT_MODES = ["improve", "discover", "reflect", "followup"];

const argv = process.argv.slice(2);
const flag = (name: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
const list = (name: string, def?: readonly string[]) => (flag(name) ?? def?.join(",") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const outArg = flag("--out");
const cardIds = list("--cards");
if (!outArg || !cardIds.length) {
  console.error("usage: node --conditions=react-server --env-file=.env.local scripts/eval/writer-run.ts --out <폴더> --cards <id,…> [--modes improve,discover,reflect,followup] [--label base] [--concurrency 2] [--dry]");
  process.exit(1);
}
const modes = list("--modes", DEFAULT_MODES) as WriterMode[];
const badModes = modes.filter((m) => !MODES.includes(m));
if (badModes.length) throw new Error(`모르는 요청 종류: ${badModes.join(", ")} (${MODES.join("·")})`);
const label = flag("--label") ?? "base";
const concurrency = Math.max(1, Number(flag("--concurrency") ?? 2) || 2);
const dry = argv.includes("--dry");
const out = resolve(outArg);
const runDir = join(out, "writer");
const labelDir = join(runDir, label);

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

interface CardRow {
  id: string;
  uid: string;
  evalUnitId: string;
  data: Record<string, unknown>;
  files: MaterialDoc[];
  skipped: string[];
  followup: FollowupBasis | null;
  kb: KnowledgeBundle;
}

/** 카드 원장 + 카드 전용 자료(저장본 전체 글만 — DB에 쓰지 않음) + 최종 점검표 + 공통 지식 묶음 */
async function loadCard(id: string): Promise<CardRow> {
  const { data: card, error } = await db.from("cards").select("id, uid, eval_unit_id, data, status").eq("id", id).single();
  if (error || !card) throw new Error(`카드를 읽지 못함 ${id}: ${error?.message}`);
  if (card.status !== "active") throw new Error(`보관한 카드 ${id}`);
  const { data: mats, error: me } = await db.from("card_materials").select(MATERIAL_COLS).eq("card_id", card.id).order("created_at");
  if (me) throw new Error(`카드 전용 자료를 읽지 못함 ${id}: ${me.message}`);
  const rows = (mats ?? []) as MaterialRow[];
  const files = rows.filter((r) => materialState(r) === "ready").map((r): MaterialDoc => ({ id: String(r.id), kind: "card", name: r.file_name, text: r.parsed_text ?? "" }));
  const skipped = rows.filter((r) => materialState(r) !== "ready").map((r) => `「${r.file_name}」(${materialState(r) === "failed" ? (r.parse_error ?? "읽기 실패") : "저장본 없음·판 다름 — 서버라면 이때 읽음"})`);
  // 서버와 같음: 보낸·확인한 것 중 점검월이 가장 늦은 1건(초안 제외)
  const { data: ins } = await db.from("inspections").select("period, status, result").eq("card_id", card.id).neq("status", "draft").order("period", { ascending: false }).limit(1).maybeSingle();
  const followup = followupBasis(ins ? { period: ins.period, status: ins.status, result: readResult(ins.result) } : null);
  const kb = await loadCardBundle(db, { id: card.id, evalUnitId: card.eval_unit_id, data: card.data }, "card", "writer");
  return { id: card.id, uid: card.uid, evalUnitId: card.eval_unit_id, data: card.data, files, skipped, followup, kb };
}

const period = currentPeriod();
const periodLabel = `${period.slice(0, 4)}년 ${Number(period.slice(5))}월`;
const promptFiles = (files: MaterialDoc[]) => files.map((d) => ({ name: d.name, text: d.text }));

/** 서버와 같은 요청: reflect는 붙여 넣은 글 없음(자료만), 나머지는 요청 글 없음 */
const reqOf = (c: CardRow, mode: WriterMode) => ({ mode, note: "", periodLabel, attachmentText: null, followup: mode === "followup" ? c.followup : null });

/** 할 일 판정 — 서버 runCardAssist와 같은 순서 */
type Plan = { kind: "call" } | { kind: "code"; reason: string } | { kind: "skip"; reason: string };
function planOf(c: CardRow, mode: WriterMode): Plan {
  if (mode === "followup") {
    if (!c.followup) return { kind: "skip", reason: "점검표 없음" };
    if (!c.followup.rows.length) return { kind: "code", reason: "미흡 0건(코드 결과, AI 안 부름)" };
  }
  if (mode === "reflect" && !c.files.length) return { kind: "skip", reason: "실적 자료 없음" };
  return { kind: "call" };
}

/** 서버 호출(callWriter → cardStructured)과 같은 조각으로 요청 글 크기 */
function requestChars(c: CardRow, mode: WriterMode): { system: number; shared: number; list: number; prompt: number; total: number } {
  const mg = isMgmtCard(c.data);
  const p = (mg ? assistPromptsMg : assistPrompts)().prompts;
  const system = (mg ? writerSystemMg : writerSystem)(trackSpecOfUnit(c.kb.unit)).length;
  const kbList = listText(p, c.kb);
  const prompt = userPrompt(p, c.data, kbList, { ...reqOf(c, mode), files: promptFiles(c.files) }).length;
  const shared = sharedTexts(p, c.kb).reduce((n, t) => n + t.length, 0);
  return { system, shared, list: kbList.length, prompt, total: system + shared + prompt };
}

// ---------------------------------------------------------------------------
// 준비(차례로): 카드 읽기
const loaded: CardRow[] = [];
for (const id of cardIds) loaded.push(await loadCard(id));
for (const c of loaded) if (c.skipped.length) console.warn(`경고: ${c.id} 카드 전용 자료 중 저장본이 없어 뺀 것 ${c.skipped.length}건 — ${c.skipped.join(", ")}`);

interface Task { card: CardRow; mode: WriterMode; plan: Plan; file: string }
const tasks: Task[] = loaded.flatMap((card) => modes.map((mode) => ({ card, mode, plan: planOf(card, mode), file: join(labelDir, card.uid, `${mode}.json`) })));
const man = (n: number) => `${(n / 10_000).toFixed(1)}만`;
const method = (c: CardRow) => (c.kb.select ? "선별" : "통째로");

if (dry) {
  console.log(`label=${label} · 기간 ${periodLabel} · 공통 지식 방식은 카드마다(환경변수 KNOWLEDGE_SELECT=${process.env.KNOWLEDGE_SELECT ?? ""})`);
  console.log("| 카드 | 요청 종류 | 할 일 | 공통 지식 | 자료 | 요청 글 합계(시스템/공통 지식/요청) |");
  console.log("|---|---|---|---|---:|---|");
  for (const t of tasks) {
    const what = t.plan.kind === "call" ? "AI 호출" : t.plan.kind === "code" ? `코드 결과 — ${t.plan.reason}` : `건너뜀 — ${t.plan.reason}`;
    const size = t.plan.kind === "call" ? requestChars(t.card, t.mode) : null;
    console.log(`| ${t.card.id} | ${t.mode} | ${what}${existsSync(t.file) ? " [있음]" : ""} | ${method(t.card)} | ${t.card.files.length} | ${size ? `${man(size.total)} (${man(size.system)}/${man(size.shared)}/${man(size.prompt)})` : "—"} |`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 실행(동시 N): 카드 × 요청 종류 — 이미 있으면 건너뜀
mkdirSync(runDir, { recursive: true });
const progress = (line: string) => {
  const l = `${new Date().toISOString()} ${line}`;
  console.log(l);
  appendFileSync(join(runDir, "run.txt"), `${l}\n`);
};
const usage5 = (u: Usage) => ({ input: u.input, output: u.output, cacheRead: u.cacheRead, cacheWrite: u.cacheWrite, cacheWrite1h: u.cacheWrite1h });
const save = (t: Task, rec: Record<string, unknown>) => {
  mkdirSync(join(labelDir, t.card.uid), { recursive: true });
  writeFileSync(t.file, JSON.stringify(rec, null, 1));
};

progress(`시작 · label=${label} · 할 일 ${tasks.length}건(이미 있음 ${tasks.filter((t) => existsSync(t.file)).length}) · 동시 ${concurrency}`);
let failed = 0;
await runPool(tasks, concurrency, async (t, i) => {
  const name = `${label}/${t.card.id}/${t.mode}`;
  const n = `${i + 1}/${tasks.length}`;
  if (existsSync(t.file)) return progress(`${n} 건너뜀(있음) ${name}`);
  const c = t.card;
  const base = { cardId: c.id, uid: c.uid, unit: c.evalUnitId, mode: t.mode, label, periodLabel, knowledge: method(c), materials: { used: c.files.map((f) => f.name), skipped: c.skipped } };
  if (t.plan.kind === "skip") {
    save(t, { ...base, skipped: t.plan.reason });
    return progress(`${n} 건너뜀(${t.plan.reason}) ${name}`);
  }
  if (t.plan.kind === "code") {
    save(t, { ...base, model: "코드(AI 호출 없음)", codeResult: true, sources: 0, followupBasis: c.followup, result: noRequirementResult(c.followup!) });
    return progress(`${n} 코드 결과(${t.plan.reason}) ${name}`);
  }
  const requestSize = requestChars(c, t.mode);
  progress(`${n} 시작 ${name} · 요청 약 ${requestSize.total}자 · ${method(c)}`);
  const t0 = Date.now();
  try {
    const call = await callWriter({ card: c.data, kb: c.kb, req: reqOf(c, t.mode), files: c.files });
    const sec = Math.round((Date.now() - t0) / 100) / 10;
    // 인용 대조: 공통 지식 조각(선별 방식이어도 선별 전 원문 전부 — bundleRefs) + 첨부 전체 글(file:N), 서버와 같음
    const followup = t.mode === "followup" ? c.followup : null;
    const result = verifyResult(call.result, c.data, [...bundleRefs(c.kb), ...fileRefs(c.files)], followup);
    const rec = { ...base, model: modelLabel(call), sec, usage: usage5(call.usage), sources: bundleRefs(c.kb).length + c.files.length, requestChars: requestSize.total, requestSize, followupBasis: followup, result };
    save(t, rec);
    progress(`${n} 끝 ${name} · ${sec}초 · 입력 ${rec.usage.input}+캐시 읽기 ${rec.usage.cacheRead}·쓰기 ${rec.usage.cacheWrite}/출력 ${rec.usage.output}`);
  } catch (e) {
    failed++;
    progress(`${n} 실패 ${name}: ${String(e instanceof Error ? e.message : e).slice(0, 300)}`);
  }
});
progress(`끝 · 실패 ${failed}/${tasks.length}`);
if (failed) process.exitCode = 1;
