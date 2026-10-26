// 공통 지식 선별 결과 만들기(지식공급 하이브리드 선별 결과 §3.3) — 카드마다 범위 안 사례류 조각 전부를 Jev(TypeSafe, strict)로 채점하고
// p ≥ 0.2인 것을 유지형으로 골라(상위 N 자르기 없음) 순위(p 내림차순)를 매긴다. 대응표(card_knowledge_scope)에서 rejected인 조각은 뺀다.
// 운영 DB는 읽기만. `--write`만 card_knowledge_select에 쓰며(서비스 키, 건수 출력 뒤 `--yes`가 있어야 함) 카드별로 「그 카드 행을 지우고 다시 넣기」.
// Claude는 부르지 않음. Jev는 카드 요약·조각 글을 외부로 보냄(사용자 승인됨).
// 실행: node --conditions=react-server --env-file=.env.local scripts/knowledge/select-build.ts --track 주요사업 --out docs/analysis/eval/2026-10-26-select/build
//   [--cards id,…] [--concurrency 3] [--dry](Jev 안 부름) [--write [--yes]]
// 이어 하기: <out>/<cards.uid>.json(카드별 Jev 결과) · <out>/summary.json. 시험 카드 3장은 judges/jev/에 같은 문구(strict)·같은 후보면 재사용.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadBundleChunks } from "../../lib/ai/context.ts";
import { scoreChunks, typesafeCaller } from "../../lib/ai/typesafe.ts";
import { buildBundle, bundleRefs, type BundleChunk } from "../../lib/knowledge/bundle.ts";
import { SELECTABLE_ROLES, chunkRole } from "../../lib/knowledge/chunk-role.ts";
import { SELECT_THRESHOLD, judgeLabel, pickSelected, selectRows, type SelectRow } from "../../lib/knowledge/select-build.ts";
import { trackSpecOfUnit } from "../../lib/tracks/index.ts";

const argv = process.argv.slice(2);
const opt = (n: string): string | undefined => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const out = opt("--out");
const track = opt("--track");
if (!out || !track) throw new Error("사용법: select-build.ts --track 주요사업 --out <dir> [--cards id,…] [--concurrency 3] [--dry] [--write [--yes]]");
if (track !== "주요사업") throw new Error("지금은 주요사업만 지원합니다(경영관리는 카드 요약 규칙이 달라 judge-compare의 jevCard 이동이 필요)");
const only = opt("--cards")?.split(",").map((s) => s.trim()).filter(Boolean);
const concurrency = Math.max(1, Number(opt("--concurrency") ?? 3) || 3);
const dry = argv.includes("--dry");
const write = argv.includes("--write");
const yes = argv.includes("--yes");
const VARIANT = "strict";
const EVAL_JEV_DIR = "docs/analysis/eval/2026-10-26-select/judges/jev";
mkdirSync(out, { recursive: true });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const chunks = await loadBundleChunks(db, trackSpecOfUnit("BZ-1"));
const metaOf = new Map(chunks.map((c) => [c.chunk_key, c]));

interface Card { id: string; uid: string; unit: string; data: unknown; candidates: BundleChunk[]; rejected: Set<string> }
const { data: rows, error } = await db.from("cards").select("id, uid, eval_unit_id, data").eq("status", "active").not("eval_unit_id", "like", "MG-%").order("id");
if (error) throw new Error(`카드를 읽지 못함: ${error.message}`);
let cardRows = rows!;
if (only) {
  const missing = only.filter((id) => !cardRows.some((r) => r.id === id));
  if (missing.length) throw new Error(`없는 카드: ${missing.join(", ")}`);
  cardRows = cardRows.filter((r) => only.includes(r.id));
}

async function rejectedOf(cardId: string): Promise<Set<string>> {
  const set = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error: e } = await db.from("card_knowledge_scope").select("chunk_key").eq("card_id", cardId).eq("status", "rejected").range(from, from + 999);
    if (e) throw new Error(`대응표를 읽지 못함 ${cardId}: ${e.message}`);
    for (const r of data!) set.add(r.chunk_key);
    if (data!.length < 1000) break;
  }
  return set;
}

const cards: Card[] = [];
for (const r of cardRows) {
  const unit = String(r.eval_unit_id);
  // judge-compare·label-scope와 같은 후보: 경평 초안(report) 묶음의 층 조각 중 사례류, 문서 → 적재 순서
  const kb = buildBundle(chunks, { evalUnitId: unit, data: r.data }, [], null, "report");
  const cand = bundleRefs(kb).map((x) => metaOf.get(x.key)!).filter((c) => SELECTABLE_ROLES.includes(chunkRole(c)));
  cand.sort((a, b) => a.doc_id.localeCompare(b.doc_id) || a.seq - b.seq || a.chunk_key.localeCompare(b.chunk_key));
  cards.push({ id: String(r.id), uid: String(r.uid), unit, data: r.data, candidates: cand, rejected: await rejectedOf(String(r.id)) });
}
console.log(`카드 ${cards.length}장, 후보 ${cards.reduce((n, c) => n + c.candidates.length, 0)}건, rejected 대응 ${cards.reduce((n, c) => n + c.rejected.size, 0)}건${dry ? " (--dry: Jev 안 부름)" : ""}`);
if (dry) {
  for (const c of cards) console.log(`  ${c.id} (${c.uid}): 후보 ${c.candidates.length} · rejected ${c.candidates.filter((x) => c.rejected.has(x.chunk_key)).length}`);
  process.exit(0);
}

// ───────────── Jev 채점(이어 하기) ─────────────
interface JevFile { cardId: string; variant: string; model: string; requests: number; usage: { input_tokens: number; output_tokens: number }; ms: number; scores: { chunkKey: string; p: number }[]; reused?: boolean }
const cacheFile = (c: Card) => `${out}/${c.uid}.json`;
const covers = (f: JevFile, c: Card) => f.variant === VARIANT && f.scores.length === c.candidates.length && c.candidates.every((x) => f.scores.some((s) => s.chunkKey === x.chunk_key));
function loadCached(c: Card): JevFile | null {
  for (const [file, reused] of [[cacheFile(c), false], [`${EVAL_JEV_DIR}/${c.uid}.json`, true]] as const) {
    if (!existsSync(file)) continue;
    const f = JSON.parse(readFileSync(file, "utf8")) as JevFile;
    if (covers(f, c)) return { ...f, reused: reused || f.reused };
  }
  return null;
}
async function scoreCard(c: Card): Promise<JevFile> {
  const hit = loadCached(c);
  if (hit) {
    if (!existsSync(cacheFile(c))) writeFileSync(cacheFile(c), JSON.stringify(hit));
    return hit;
  }
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new Error("TYPESAFE_API_KEY가 없습니다(.env.local)");
  const call = typesafeCaller({ apiKey, model: process.env.TYPESAFE_MODEL ?? "jev-latest" });
  const t0 = Date.now();
  const r = await scoreChunks(call, c.data, c.candidates, { batchSize: 25, variant: VARIANT });
  const f: JevFile = { cardId: c.id, variant: VARIANT, model: r.model, requests: r.requests, usage: r.usage, ms: Date.now() - t0, scores: r.scores };
  writeFileSync(cacheFile(c), JSON.stringify(f));
  console.log(`Jev 완료 ${c.id} — 후보 ${c.candidates.length}건, 요청 ${r.requests}회, 토큰 ${r.usage.input_tokens + r.usage.output_tokens}, ${Math.round(f.ms / 1000)}초`);
  return f;
}

const t0 = Date.now();
const results = new Map<string, JevFile>();
const failed: string[] = [];
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(concurrency, cards.length) }, async () => {
    while (next < cards.length) {
      const c = cards[next++];
      try {
        results.set(c.id, await scoreCard(c));
      } catch (e) {
        failed.push(`${c.id}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }),
);
for (const f of failed) console.log(`Jev 오류 ${f}`);

// ───────────── 고르기·요약 ─────────────
const models = [...new Set([...results.values()].map((f) => f.model))];
if (models.length > 1) throw new Error(`카드마다 Jev 모델이 다름: ${models.join(", ")} — 같은 모델로 다시 돌려야 함`);
const judge = judgeLabel(models[0] ?? "jev-unknown", VARIANT, SELECT_THRESHOLD);
const perCard = [];
const allRows: SelectRow[] = [];
for (const c of cards) {
  const f = results.get(c.id);
  if (!f) continue;
  const { selected, rejectedExcluded } = pickSelected(f.scores, c.rejected);
  const chars = selected.reduce((n, s) => n + (metaOf.get(s.chunkKey)?.text ?? "").length, 0);
  allRows.push(...selectRows(c.id, selected, judge));
  perCard.push({ cardId: c.id, uid: c.uid, candidates: c.candidates.length, selected: selected.length, selectedChars: chars, rejectedExcluded, reused: !!f.reused });
}
const fresh = [...results.values()].filter((f) => !f.reused);
const sum = (k: "input_tokens" | "output_tokens", fs: JevFile[]) => fs.reduce((n, f) => n + f.usage[k], 0);
const summary = {
  track, judge, threshold: SELECT_THRESHOLD, variant: VARIANT, cards: perCard.length, failed,
  totals: { candidates: perCard.reduce((n, p) => n + p.candidates, 0), selected: perCard.reduce((n, p) => n + p.selected, 0), selectedChars: perCard.reduce((n, p) => n + p.selectedChars, 0), rejectedExcluded: perCard.reduce((n, p) => n + p.rejectedExcluded, 0) },
  jev: { model: models[0], newCards: fresh.length, reusedCards: results.size - fresh.length, requests: fresh.reduce((n, f) => n + f.requests, 0), inputTokens: sum("input_tokens", fresh), outputTokens: sum("output_tokens", fresh), wallMs: Date.now() - t0 },
  perCard,
};
writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 1));
console.log(`요약 → ${out}/summary.json : ${JSON.stringify({ ...summary, perCard: undefined })}`);
if (failed.length) {
  console.log("실패한 카드가 있어 --write는 하지 않습니다(같은 명령을 다시 돌리면 이어 합니다)");
  process.exit(1);
}

// ───────────── 쓰기(--write --yes) ─────────────
if (write) {
  console.log(`\n쓰기 예정: card_knowledge_select — 카드 ${perCard.length}장, 행 ${allRows.length}건, judge ${judge}`);
  if (!yes) {
    console.log("--yes가 없어 멈춥니다.");
    process.exit(0);
  }
  // 넣기 전 검증: 행은 한 카드·조각당 하나, 조각은 모두 DB에 있는 것(이미 읽어 온 조각)
  const bad = allRows.filter((r) => !metaOf.has(r.chunk_key));
  if (bad.length) throw new Error(`DB에 없는 조각 ${bad.length}건 — 쓰지 않음`);
  const probe = await db.from("card_knowledge_select").select("card_id").limit(1);
  if (probe.error) throw new Error(`card_knowledge_select 표를 읽지 못함(마이그레이션 먼저): ${probe.error.message}`);
  for (const c of cards) {
    const mine = allRows.filter((r) => r.card_id === c.id);
    const { data: before, error: e1 } = await db.from("card_knowledge_select").select("card_id, chunk_key, rank, score, judge, created_at").eq("card_id", c.id);
    if (e1) throw new Error(`이전 행을 읽지 못함 ${c.id}: ${e1.message}`);
    const del = await db.from("card_knowledge_select").delete().eq("card_id", c.id);
    if (del.error) throw new Error(`지우기 실패 ${c.id}: ${del.error.message}`);
    const ins = mine.length ? await db.from("card_knowledge_select").insert(mine) : { error: null };
    if (ins.error) {
      // 이전 상태 되돌리기(트랜잭션이 아니라 최선 노력)
      const back = before!.length ? await db.from("card_knowledge_select").insert(before!) : { error: null };
      throw new Error(`넣기 실패 ${c.id}: ${ins.error.message} — 이전 행 ${before!.length}건 ${back.error ? `되돌리기도 실패(${back.error.message})` : "되돌림"}`);
    }
    console.log(`쓴 ${c.id}: ${mine.length}건(이전 ${before!.length}건 교체)`);
  }
}
