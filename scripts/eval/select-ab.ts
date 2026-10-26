// 공통 지식 「통째로 넣기(full) 대 선별(sel)」 병행 비교 — 카드 AI(작성지원 「개선 제안」·「질문」)(지식공급 하이브리드 선별 계획 §5 7단계·§6.3, 평가 전용·수동 실행).
// 서버 액션(app/(app)/cards/actions.ts runCardAssist·runCardChat)과 같은 근거·검증으로 카드 × 기능 × 방식마다 AI를 한 번씩 부르고 결과를 파일로 씀.
//  - 카드 = 운영 원장 카드 JSON(cards.data), 카드 전용 자료 = 그 카드의 card_materials 저장본 전체 글(materialState ready — 서버와 같은 판정).
//    안 읽었거나 판이 다른 자료는 서버라면 여기서 읽어 DB에 채우지만, 이 스크립트는 DB에 쓰지 않으려고 건너뛰고 결과에 이름을 남김.
//  - 작성지원 = 요청 종류 「개선 제안」(improve)·요청 글 없음, 결과는 서버가 화면에 돌려주는 검증된 결과(verifyResult — 인용 대조 상태 포함).
//  - 질문 = 모든 카드에 같은 질문 한 번(이력 없음) + 최종 점검표(보낸·확인한 것 중 점검월이 가장 늦은 1건, 없으면 없는 대로 — 서버와 같음).
//  - full = KNOWLEDGE_SELECT 비움, sel = KNOWLEDGE_SELECT=card + setSelectionSource(selectionFromDir(<out>)) — <out>/selection.json·<out>/rules/*.md(scripts/lib/select-dir.ts).
//    sel인데 그 카드가 선별되지 못해(선별 결과·규칙 문서 없음, 규칙 문서가 기준류 자리를 다 못 대신함) 통째로 넣기로 가면 fellBack: true + 경고(비교가 무의미).
// Claude는 로컬 CLI로만(AI_PROVIDER=cli, ANTHROPIC_API_KEY 비움 — CLI 자식에는 API 키를 넘기지 않음, lib/ai/cli.ts). 운영 DB는 읽기만, ai_requests에도 쓰지 않음(기록 없는 callWriter·callChat).
// 실행: node --conditions=react-server --env-file=.env.local scripts/eval/select-ab.ts --out docs/analysis/eval/2026-10-26-select [--cards <id,…>] [--arms full,sel] [--features writer,chat] [--concurrency 2] [--dry]
//  결과: <out>/ab/<arm>/<cards.uid>/<feature>.json — 이미 있으면 건너뜀(이어 하기). 진행 줄 <out>/ab/run.txt
//  --dry: AI를 부르지 않고 카드 × 기능 × 방식의 요청 글 크기만 <out>/ab/sizes.json과 표로(입력 감소량을 결정론으로 잼). 선별 결과가 아직 없으면 sel은 fellBack으로 찍힘(정상)
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chatPrompt, inspectionBrief } from "../../lib/ai/chat.ts";
import { loadCardBundle, setSelectionSource } from "../../lib/ai/context.ts";
import { MATERIAL_COLS, type MaterialDoc, type MaterialRow, fileRefs, materialState } from "../../lib/ai/material-text.ts";
import { runPool } from "../../lib/ai/pool.ts";
import { type Usage, callChat, callWriter, chatSystem, chatSystemMg, modelLabel, writerSystem, writerSystemMg } from "../../lib/ai/run.ts";
import { userPrompt, verifyResult } from "../../lib/ai/writer.ts";
import { isMgmtCard } from "../../lib/cards/mgmt-card.ts";
import { currentPeriod } from "../../lib/cards/view.ts";
import { type KnowledgeBundle, bundleRefs, listText, sharedTexts } from "../../lib/knowledge/bundle.ts";
import { readResult } from "../../lib/inspections/model.ts";
import { assistPrompts, assistPromptsMg, chatPrompts, chatPromptsMg } from "../../lib/prompts/sets.ts";
import { trackSpecOfUnit } from "../../lib/tracks/index.ts";
import { selectionFromDir } from "../lib/select-dir.ts";

// Claude API는 쓰지 않음 — .env.local에 API 키가 있어도 CLI로(aiProvider는 부를 때 process.env를 읽음)
process.env.AI_PROVIDER = "cli";
process.env.ANTHROPIC_API_KEY = "";
delete process.env.VERCEL;

const DEFAULT_CARDS = ["주요사업1/7-가", "주요사업2/1-가", "주요사업3/5-가", "경영관리1/1-1", "경영관리3/3-1", "경영관리4/4-2"];
const QUESTION = "이 과제의 '25 평가위원 지적과 실사 질의응답에 비춰, 올해 과제관리카드에서 보완해야 할 점 세 가지를 근거와 함께 알려 주세요.";
const ARMS = ["full", "sel"] as const;
const FEATURES = ["writer", "chat"] as const;
type Arm = (typeof ARMS)[number];
type Feature = (typeof FEATURES)[number];

const argv = process.argv.slice(2);
const flag = (name: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
const list = (name: string, def: readonly string[]) => (flag(name) ?? def.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
const outArg = flag("--out");
if (!outArg) {
  console.error("usage: node --conditions=react-server --env-file=.env.local scripts/eval/select-ab.ts --out <dir> [--cards <id,…>] [--arms full,sel] [--features writer,chat] [--concurrency 2] [--dry]");
  process.exit(1);
}
const out = resolve(outArg);
const abDir = join(out, "ab");
const cards = list("--cards", DEFAULT_CARDS);
const arms = list("--arms", ARMS) as Arm[];
const features = list("--features", FEATURES) as Feature[];
const bad = [...arms.filter((a) => !ARMS.includes(a)), ...features.filter((f) => !FEATURES.includes(f))];
if (bad.length) throw new Error(`모르는 방식·기능: ${bad.join(", ")} (방식 full·sel, 기능 writer·chat)`);
const concurrency = Math.max(1, Number(flag("--concurrency") ?? 2) || 2);
const dry = argv.includes("--dry");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
setSelectionSource(selectionFromDir(out));

interface CardRow {
  id: string;
  uid: string;
  evalUnitId: string;
  data: Record<string, unknown>;
  files: MaterialDoc[];
  skipped: string[];
  inspection: string;
}

/** 카드 원장 + 카드 전용 자료(저장본 전체 글만 — DB에 쓰지 않음) + 최종 점검표 요약(질문용) */
async function loadCard(id: string): Promise<CardRow> {
  const { data: card, error } = await db.from("cards").select("id, uid, eval_unit_id, data, status").eq("id", id).single();
  if (error || !card) throw new Error(`카드를 읽지 못함 ${id}: ${error?.message}`);
  if (card.status !== "active") throw new Error(`보관한 카드 ${id}`);
  const { data: mats, error: me } = await db.from("card_materials").select(MATERIAL_COLS).eq("card_id", card.id).order("created_at");
  if (me) throw new Error(`카드 전용 자료를 읽지 못함 ${id}: ${me.message}`);
  const rows = (mats ?? []) as MaterialRow[];
  const files = rows.filter((r) => materialState(r) === "ready").map((r): MaterialDoc => ({ id: String(r.id), kind: "card", name: r.file_name, text: r.parsed_text ?? "" }));
  const skipped = rows.filter((r) => materialState(r) !== "ready").map((r) => `「${r.file_name}」(${materialState(r) === "failed" ? (r.parse_error ?? "읽기 실패") : "저장본 없음·판 다름 — 서버라면 이때 읽음"})`);
  const { data: ins } = await db.from("inspections").select("period, status, result").eq("card_id", card.id).neq("status", "draft").order("period", { ascending: false }).limit(1).maybeSingle();
  return { id: card.id, uid: card.uid, evalUnitId: card.eval_unit_id, data: card.data, files, skipped, inspection: inspectionBrief(ins ? { period: ins.period, status: ins.status, result: readResult(ins.result) } : null) };
}

/** 방식마다 공통 지식 묶음 — KNOWLEDGE_SELECT를 바꿔 가며 차례로 만듦(AI 호출은 뒤에 동시에 돌리므로 환경변수를 미리 다 씀) */
async function bundleFor(c: CardRow, arm: Arm): Promise<{ kb: KnowledgeBundle; fellBack: boolean }> {
  process.env.KNOWLEDGE_SELECT = arm === "sel" ? "card" : "";
  try {
    const kb = await loadCardBundle(db, { id: c.id, evalUnitId: c.evalUnitId, data: c.data }, "card");
    return { kb, fellBack: arm === "sel" && !kb.select };
  } finally {
    process.env.KNOWLEDGE_SELECT = "";
  }
}

const period = currentPeriod();
const periodLabel = `${period.slice(0, 4)}년 ${Number(period.slice(5))}월`;
const promptFiles = (files: MaterialDoc[]) => files.map((d) => ({ name: d.name, text: d.text }));
const writerReq = () => ({ mode: "improve" as const, note: "", periodLabel, attachmentText: null, followup: null });
const chatReq = (c: CardRow) => ({ question: QUESTION, history: [], periodLabel, inspection: c.inspection });

interface RequestSize {
  systemChars: number;
  sharedChars: number[];
  listChars: number;
  /** 요청 글(목록표·카드·첨부 포함 — CLI는 공통 지식 덩이 뒤에 이어 붙임) */
  promptChars: number;
}

/** 서버 호출(callWriter·callChat → cardStructured)과 같은 조각으로 요청 글 크기 */
function requestSize(c: CardRow, feature: Feature, kb: KnowledgeBundle): RequestSize {
  const mg = isMgmtCard(c.data);
  const track = trackSpecOfUnit(kb.unit);
  const p = (feature === "writer" ? (mg ? assistPromptsMg : assistPrompts) : mg ? chatPromptsMg : chatPrompts)().prompts;
  const system = feature === "writer" ? (mg ? writerSystemMg : writerSystem)(track) : (mg ? chatSystemMg : chatSystem)(track);
  const kbList = listText(p, kb);
  const files = promptFiles(c.files);
  const prompt = feature === "writer" ? userPrompt(p, c.data, kbList, { ...writerReq(), files }) : chatPrompt(p, c.data, kbList, { ...chatReq(c), files });
  return { systemChars: system.length, sharedChars: sharedTexts(p, kb).map((t) => t.length), listChars: kbList.length, promptChars: prompt.length };
}
const totalOf = (r: RequestSize) => r.systemChars + r.sharedChars.reduce((n, x) => n + x, 0) + r.promptChars;

// ---------------------------------------------------------------------------
// 준비(차례로): 카드 읽기 → 방식마다 묶음

const loaded: CardRow[] = [];
for (const id of cards) loaded.push(await loadCard(id));
const bundles = new Map<string, { kb: KnowledgeBundle; fellBack: boolean }>();
const bkey = (c: CardRow, arm: Arm) => `${c.id}#${arm}`;
for (const c of loaded) for (const arm of arms) bundles.set(bkey(c, arm), await bundleFor(c, arm));
for (const c of loaded) {
  if (c.skipped.length) console.warn(`경고: ${c.id} 카드 전용 자료 중 저장본이 없어 뺀 것 ${c.skipped.length}건 — ${c.skipped.join(", ")}`);
  if (arms.includes("sel") && bundles.get(bkey(c, "sel"))!.fellBack) console.warn(`경고: ${c.id} — sel인데 선별되지 못해 통째로 넣기로 감(fellBack). 이 카드의 sel 결과는 비교에 쓰면 안 됨`);
}

if (dry) {
  const rows = loaded.flatMap((c) =>
    features.flatMap((feature) =>
      arms.map((arm) => {
        const { kb, fellBack } = bundles.get(bkey(c, arm))!;
        return { cardId: c.id, uid: c.uid, feature, arm, fellBack, files: c.files.length, request: requestSize(c, feature, kb), picked: kb.select?.picked.length ?? null, unpicked: kb.select?.unpicked.length ?? null };
      }),
    ),
  );
  mkdirSync(abDir, { recursive: true });
  writeFileSync(join(abDir, "sizes.json"), JSON.stringify({ createdAt: new Date().toISOString(), cards, arms, features, rows }, null, 1));
  const man = (n: number) => `${(n / 10_000).toFixed(1)}만`;
  console.log("| 카드 | 기능 | 방식 | 시스템 | 공통 지식 덩이 | 요청 글(목록표) | 합계 | full 대비 |");
  console.log("|---|---|---|---:|---|---:|---:|---:|");
  for (const r of rows) {
    const full = rows.find((x) => x.cardId === r.cardId && x.feature === r.feature && x.arm === "full");
    const delta = full && r.arm !== "full" ? `${(((totalOf(r.request) - totalOf(full.request)) / totalOf(full.request)) * 100).toFixed(1)}%` : "—";
    console.log(`| ${r.cardId} | ${r.feature} | ${r.arm}${r.fellBack ? "(fellBack)" : ""} | ${man(r.request.systemChars)} | ${r.request.sharedChars.map(man).join(" + ") || "—"} | ${man(r.request.promptChars)}(${man(r.request.listChars)}) | ${man(totalOf(r.request))} | ${delta} |`);
  }
  console.log(`\n글자 수(만 자). 합계 = 시스템 + 공통 지식 덩이 + 요청 글. 기록: ${join(abDir, "sizes.json")}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 실행(동시 N): 카드 × 기능 × 방식 — 이미 있으면 건너뜀

interface Task {
  card: CardRow;
  feature: Feature;
  arm: Arm;
  file: string;
}
const tasks: Task[] = loaded.flatMap((card) => features.flatMap((feature) => arms.map((arm) => ({ card, feature, arm, file: join(abDir, arm, card.uid, `${feature}.json`) }))));
mkdirSync(abDir, { recursive: true });
const progress = (line: string) => {
  const l = `${new Date().toISOString()} ${line}`;
  console.log(l);
  appendFileSync(join(abDir, "run.txt"), `${l}\n`);
};
const usage5 = (u: Usage) => ({ input: u.input, output: u.output, cacheRead: u.cacheRead, cacheWrite: u.cacheWrite, cacheWrite1h: u.cacheWrite1h });

progress(`시작 · 할 일 ${tasks.length}건(이미 있음 ${tasks.filter((t) => existsSync(t.file)).length}) · 동시 ${concurrency}`);
let failed = 0;
await runPool(tasks, concurrency, async (t, i) => {
  const name = `${t.arm}/${t.card.id}/${t.feature}`;
  if (existsSync(t.file)) return progress(`${i + 1}/${tasks.length} 건너뜀(있음) ${name}`);
  const { kb, fellBack } = bundles.get(bkey(t.card, t.arm))!;
  if (fellBack) progress(`${i + 1}/${tasks.length} 경고 ${name} — 선별되지 못해 통째로 넣기로 감(fellBack)`);
  const request = requestSize(t.card, t.feature, kb);
  progress(`${i + 1}/${tasks.length} 시작 ${name} · 요청 약 ${totalOf(request)}자`);
  const t0 = Date.now();
  try {
    const base = { cardId: t.card.id, uid: t.card.uid, arm: t.arm, feature: t.feature };
    let rec: Record<string, unknown>;
    if (t.feature === "writer") {
      const call = await callWriter({ card: t.card.data, kb, req: writerReq(), files: t.card.files });
      const elapsedMs = Date.now() - t0;
      // 인용 대조: 공통 지식 조각(선별 방식이어도 선별 전 원문 전부 — bundleRefs) + 첨부 전체 글(file:N), 서버와 같음
      const result = verifyResult(call.result, t.card.data, [...bundleRefs(kb), ...fileRefs(t.card.files)], null);
      rec = { ...base, model: modelLabel(call), elapsedMs, usage: usage5(call.usage), request, fellBack, materials: { used: t.card.files.map((f) => f.name), skipped: t.card.skipped }, result };
    } else {
      const call = await callChat({ card: t.card.data, kb, req: chatReq(t.card), files: t.card.files });
      const elapsedMs = Date.now() - t0;
      rec = { ...base, model: modelLabel(call), elapsedMs, usage: usage5(call.usage), request, fellBack, materials: { used: t.card.files.map((f) => f.name), skipped: t.card.skipped }, result: { question: QUESTION, answer: call.result.answer.trim() } };
    }
    mkdirSync(join(abDir, t.arm, t.card.uid), { recursive: true });
    writeFileSync(t.file, JSON.stringify(rec, null, 1));
    const u = rec.usage as ReturnType<typeof usage5>;
    progress(`${i + 1}/${tasks.length} 끝 ${name} · ${Math.round((rec.elapsedMs as number) / 1000)}초 · 입력 ${u.input}+캐시 읽기 ${u.cacheRead}·쓰기 ${u.cacheWrite}/출력 ${u.output}`);
  } catch (e) {
    failed++;
    progress(`${i + 1}/${tasks.length} 실패 ${name}: ${String(e instanceof Error ? e.message : e).slice(0, 300)}`);
  }
});
progress(`끝 · 실패 ${failed}/${tasks.length}`);
if (failed) process.exitCode = 1;
