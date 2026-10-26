// 선별 방식 실험 4단계(지식공급 하이브리드 선별 계획 §4.2·§5 4단계·§6.2) — 판정기 비교와 선별 결과 만들기.
// 정답지(labels/<uid>.json — yes·maybe·no)가 있는 카드의 후보 조각 전부를 Jev(TypeSafe, API)와 경량 모델(현행 과제 매칭, Claude CLI)에 판정시키고,
// 같은 정답지로 재현율·정밀도·놓친 yes·애매 몫을 잰 뒤 미리 정한 규칙(§6.2)으로 설정을 고르고 selection-keep/relax.json을 만든다.
// 운영 DB는 읽기만(cards·knowledge_chunks select). Claude API는 부르지 않음(runClaudeCli = CLI만, 자식 환경에 API 키 안 넘김). Jev는 시험 카드 요약·조각 글을 외부로 보냄(사용자 승인됨).
// 실행: node --conditions=react-server --env-file=.env.local scripts/eval/judge-compare.ts --out docs/analysis/eval/2026-10-26-select
//   [--judges jev,light] [--concurrency 2] [--variant strict|loose] [--no-run](판정 호출 없이 있는 결과로 표만 다시)
// 이어 하기: judges/<judge>/<uid>.json(카드별) · judges/light/_parts(묶음별). ranks/가 나중에 생기면 같은 명령을 다시 돌리면 점수 문턱·완화형이 채워짐(판정은 다시 안 부름).
// Jev 질문 문구: lib/ai/typesafe.ts 기본(strict) — 정답지 no 기준의 「사업이 같다는 이유만 / 같은 평가 항목이지만 다른 사안」과 같은 뜻이고
// yes 정의(지표·지적·대상 직접)와 CRITERIA_TRUE가 같은 뜻이라 strict를 고름. loose는 그 줄을 빼 maybe까지 yes로 끌어올리는 쪽이라 정답지와 어긋남(실행 전에 정함, 결과를 보고 바꾸지 않음).
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { runClaudeCli } from "../../lib/ai/cli.ts";
import { loadBundleChunks } from "../../lib/ai/context.ts";
import { type MatchResult, matchPrompt, matchShared, parseMatches, splitByBudget } from "../../lib/ai/match.ts";
import { specForFeature } from "../../lib/ai/models.ts";
import { type WordingVariant, WORDING_VARIANTS, scoreChunks, typesafeCaller } from "../../lib/ai/typesafe.ts";
import type { BundleChunk } from "../../lib/knowledge/bundle.ts";
import { flattenHtmlTables } from "../../lib/knowledge/rich-text.ts";
import { fillFrom } from "../../lib/prompts/template.ts";
import { matchPrompts } from "../../lib/prompts/sets.ts";
import { trackSpecOfUnit } from "../../lib/tracks/index.ts";

const argv = process.argv.slice(2);
const opt = (n: string): string | undefined => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const out = opt("--out");
if (!out) throw new Error("사용법: judge-compare.ts --out <dir> [--judges jev,light] [--concurrency 2] [--variant strict|loose] [--no-run]");
const judges = (opt("--judges") ?? "jev,light").split(",").map((s) => s.trim()).filter(Boolean);
const concurrency = Math.max(1, Number(opt("--concurrency") ?? 2) || 2);
const variant = (opt("--variant") ?? "strict") as WordingVariant;
if (!WORDING_VARIANTS.includes(variant)) throw new Error(`알 수 없는 문구 변형: ${variant}`);
const noRun = argv.includes("--no-run");
const jevName = variant === "strict" ? "jev" : `jev-${variant}`;

const judgesDir = `${out}/judges`;
mkdirSync(`${judgesDir}/${jevName}`, { recursive: true });
mkdirSync(`${judgesDir}/light/_parts`, { recursive: true });
const log = (s: string) => {
  const line = `${new Date().toISOString().slice(11, 19)} ${s}`;
  console.log(line);
  appendFileSync(`${judgesDir}/run.txt`, line + "\n");
};

// ───────────── 정답지·카드·후보 ─────────────
interface Label { cardId: string; uid: string; unit: string; items: { key: string; verdict: "yes" | "maybe" | "no"; basis: string; role: string }[] }
const labelFiles = readdirSync(`${out}/labels`).filter((f) => /^[0-9a-f-]{36}\.json$/.test(f));
const labels: Label[] = labelFiles.map((f) => JSON.parse(readFileSync(`${out}/labels/${f}`, "utf8")));
if (!labels.length) throw new Error("labels/ 에 정답지가 없습니다 — label-scope.ts 먼저");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const chunkSets = { biz: await loadBundleChunks(db, trackSpecOfUnit("BZ-1")), mg: await loadBundleChunks(db, trackSpecOfUnit("MG-1")) };

interface Card { label: Label; data: unknown; title: string; chunks: BundleChunk[]; byKey: Map<string, BundleChunk> }
const cards: Card[] = [];
for (const label of labels) {
  const { data: row, error } = await db.from("cards").select("data").eq("uid", label.uid).single();
  if (error || !row) throw new Error(`카드를 읽지 못함: ${label.cardId} (${error?.message})`);
  const all = label.unit.startsWith("MG-") ? chunkSets.mg : chunkSets.biz;
  const want = new Set(label.items.map((i) => i.key));
  // 후보 = 정답지의 조각 전부(정렬만 matchCandidates와 같게: 문서 → 적재 순서)
  const chunks = all.filter((c) => want.has(c.chunk_key));
  chunks.sort((a, b) => a.doc_id.localeCompare(b.doc_id) || a.seq - b.seq || a.chunk_key.localeCompare(b.chunk_key));
  if (chunks.length !== want.size) throw new Error(`${label.cardId}: 정답지 후보 ${want.size}건 중 DB에서 ${chunks.length}건만 찾음`);
  const d = row.data as Record<string, unknown>;
  cards.push({ label, data: d, title: String(d.title ?? label.cardId), chunks, byKey: new Map(chunks.map((c) => [c.chunk_key, c])) });
}
log(`카드 ${cards.length}장, 후보 ${cards.reduce((n, c) => n + c.chunks.length, 0)}건, 판정기 ${judges.join(",")}${noRun ? " (--no-run)" : ""}`);

// ───────────── 판정기 1: Jev ─────────────
interface JevFile { cardId: string; variant: string; model: string; requests: number; usage: { input_tokens: number; output_tokens: number }; ms: number; scores: { chunkKey: string; p: number }[] }
const jevFile = (c: Card) => `${judgesDir}/${jevName}/${c.label.uid}.json`;
const jevDone = (c: Card) => {
  if (!existsSync(jevFile(c))) return false;
  const d = JSON.parse(readFileSync(jevFile(c), "utf8")) as JevFile;
  return d.variant === variant && d.scores.length === c.chunks.length && c.chunks.every((ch) => d.scores.some((s) => s.chunkKey === ch.chunk_key));
};
/** Jev 상태(cardState)는 주요사업 카드의 act.findings만 읽으므로 경영관리 카드의 「지적 및 개선방안」 지적 칸을 같은 자리에 옮겨 줌(typesafe.ts를 안 고치려고) */
function jevCard(data: unknown): unknown {
  const d = (data ?? {}) as { act?: { findings?: unknown }; findings?: { rows?: { finding?: unknown }[] } };
  const mg = (Array.isArray(d.findings?.rows) ? d.findings!.rows! : []).map((r) => r?.finding).filter((x): x is string => typeof x === "string" && !!x.trim());
  if (!mg.length) return data;
  const own = Array.isArray(d.act?.findings) ? (d.act!.findings as unknown[]) : [];
  return { ...d, act: { ...d.act, findings: [...own, ...mg] } };
}
async function runJev(c: Card) {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new Error("TYPESAFE_API_KEY가 없습니다(.env.local)");
  const call = typesafeCaller({ apiKey, model: process.env.TYPESAFE_MODEL ?? "jev-latest" });
  const t0 = Date.now();
  const r = await scoreChunks(call, jevCard(c.data), c.chunks, { batchSize: 25, variant });
  const file: JevFile = { cardId: c.label.cardId, variant, model: r.model, requests: r.requests, usage: r.usage, ms: Date.now() - t0, scores: r.scores };
  writeFileSync(jevFile(c), JSON.stringify(file));
  log(`Jev 완료 ${c.label.cardId} — 조각 ${c.chunks.length}건, 요청 ${r.requests}회, 토큰 ${r.usage.input_tokens + r.usage.output_tokens}, ${Math.round(file.ms / 1000)}초`);
}

// ───────────── 판정기 2: 경량 모델(현행 매칭, CLI) ─────────────
const { prompts: matchSet, schema: matchSchema } = matchPrompts();
const lightSpec = specForFeature("prep_match", "cli");
const lightJsonSchema = (() => {
  const s = z.toJSONSchema(matchSchema, { target: "draft-7" }) as Record<string, unknown>;
  delete s.$schema;
  return s;
})();
interface LightTask { card: Card; n: number; of: number; group: BundleChunk[] }
const lightTasks: LightTask[] = cards.flatMap((card) => {
  const groups = splitByBudget(card.chunks);
  return groups.map((group, i) => ({ card, n: i + 1, of: groups.length, group }));
});
const lightFile = (t: LightTask) => `${judgesDir}/light/_parts/${t.card.label.uid}-${String(t.n).padStart(2, "0")}.json`;
interface LightPart { model: string; usage: unknown; costUsd: number | null; ms: number; of: number; keys: string[]; hits: { chunkKey: string; status: "auto" | "candidate"; rank: number }[]; dropped: number }
const lightDone = (t: LightTask) => {
  if (!existsSync(lightFile(t))) return false;
  const d = JSON.parse(readFileSync(lightFile(t), "utf8")) as LightPart;
  return d.of === t.of && d.keys.length === t.group.length && t.group.every((c) => d.keys.includes(c.chunk_key));
};
async function runLight(t: LightTask) {
  const unit = t.card.label.unit;
  const system = fillFrom(matchSet, "system", "system");
  const prompt = `${matchShared(matchSet, unit, t.group)}\n\n${matchPrompt(matchSet, unit, t.card.data)}`;
  let last = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const t0 = Date.now();
    try {
      const res = await runClaudeCli({ system, prompt, schema: lightJsonSchema, model: lightSpec.cliModel, effort: lightSpec.effort, timeoutMs: 480_000 });
      const parsed = matchSchema.safeParse(res.output);
      if (!parsed.success) throw new Error(`답 형식 오류: ${parsed.error.message.slice(0, 200)}`);
      const { hits, dropped } = parseMatches(parsed.data as MatchResult, new Set(t.group.map((c) => c.chunk_key)));
      const part: LightPart = { model: res.model, usage: res.usage, costUsd: res.costUsd, ms: Date.now() - t0, of: t.of, keys: t.group.map((c) => c.chunk_key), hits: hits.map((h) => ({ chunkKey: h.chunkKey, status: h.status as "auto" | "candidate", rank: h.rank ?? 0 })), dropped };
      writeFileSync(lightFile(t), JSON.stringify(part));
      log(`경량 완료 ${t.card.label.cardId} 묶음 ${t.n}/${t.of} — 확신 ${hits.filter((h) => h.status === "auto").length} 애매 ${hits.filter((h) => h.status === "candidate").length} (${Math.round(part.ms / 1000)}초)`);
      return;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
      log(`경량 실패 ${t.card.label.cardId} 묶음 ${t.n}/${t.of} (시도 ${attempt}): ${last.slice(0, 200)}`);
    }
  }
  throw new Error(`경량 판정 실패: ${t.card.label.cardId} 묶음 ${t.n}`);
}

async function pool<T>(items: T[], fn: (x: T) => Promise<void>) {
  let next = 0;
  const failed: string[] = [];
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const x = items[next++];
        try {
          await fn(x);
        } catch (e) {
          failed.push(e instanceof Error ? e.message : String(e));
        }
      }
    }),
  );
  return failed;
}

const wall: Record<string, number> = {};
if (!noRun) {
  if (judges.includes("jev")) {
    const todo = cards.filter((c) => !jevDone(c));
    log(`Jev(${variant}): 남은 카드 ${todo.length}/${cards.length}`);
    const t0 = Date.now();
    const failed = await pool(todo, runJev);
    if (todo.length) wall.jev = Date.now() - t0;
    for (const f of failed) log(`Jev 오류: ${f}`);
  }
  if (judges.includes("light")) {
    const todo = lightTasks.filter((t) => !lightDone(t));
    log(`경량(${lightSpec.cliModel}/${lightSpec.effort}): 남은 묶음 ${todo.length}/${lightTasks.length}`);
    const t0 = Date.now();
    const failed = await pool(todo, runLight);
    if (todo.length) wall.light = Date.now() - t0;
    for (const f of failed) log(`경량 오류: ${f}`);
  }
}

// ───────────── 판정 결과 모으기 ─────────────
type Verdict = "yes" | "maybe" | "no";
interface Scored {
  key: string;
  verdict: Verdict;
  chars: number;
  p: number | null; // Jev
  lightStatus: "auto" | "candidate" | "none" | null; // 경량
  lightScore: number | null; // 경량 정렬용(확신 > 애매, 답 순서)
}
interface CardData { card: Card; rows: Scored[]; ranks: Record<string, string[]> | null }
const hasJev = cards.every(jevDone);
const hasLight = lightTasks.every(lightDone);
const cardData: CardData[] = cards.map((card) => {
  const jev = hasJev ? new Map((JSON.parse(readFileSync(jevFile(card), "utf8")) as JevFile).scores.map((s) => [s.chunkKey, s.p])) : null;
  const light = new Map<string, { status: "auto" | "candidate"; score: number }>();
  if (hasLight) {
    for (const t of lightTasks.filter((x) => x.card === card)) {
      for (const h of (JSON.parse(readFileSync(lightFile(t), "utf8")) as LightPart).hits) light.set(h.chunkKey, { status: h.status, score: (h.status === "auto" ? 2 : 1) - h.rank / 10_000 });
    }
  }
  const verdictOf = new Map(card.label.items.map((i) => [i.key, i.verdict]));
  const rows = card.chunks.map<Scored>((c) => ({
    key: c.chunk_key,
    verdict: verdictOf.get(c.chunk_key)!,
    chars: (c.text ?? "").length,
    p: jev ? jev.get(c.chunk_key)! : null,
    lightStatus: hasLight ? (light.get(c.chunk_key)?.status ?? "none") : null,
    lightScore: hasLight ? (light.get(c.chunk_key)?.score ?? 0) : null,
  }));
  const rankFile = `${out}/ranks/${card.label.uid}.json`;
  const ranks = existsSync(rankFile) ? ((JSON.parse(readFileSync(rankFile, "utf8")) as { methods: Record<string, string[]> }).methods) : null;
  return { card, rows, ranks };
});
const haveRanks = cardData.every((d) => d.ranks);

// ───────────── 설정(선택 규칙) ─────────────
interface Setting {
  id: string;
  judge: string;
  /** 점수 높은 순 정렬 값(없으면 선택 안 됨) — 점수 문턱 설정은 ranks로 */
  pick: (d: CardData) => string[]; // 고른 key들(점수 높은 순)
  ambiguous?: (r: Scored) => boolean;
}
const rowsOf = (d: CardData) => new Map(d.rows.map((r) => [r.key, r]));
const jevPick = (th: number) => (d: CardData) => d.rows.filter((r) => r.p! >= th).sort((a, b) => b.p! - a.p!).map((r) => r.key);
const jevAmb = (r: Scored) => r.p! >= 0.2 && r.p! < 0.8;
const lightPick = (candidate: boolean) => (d: CardData) =>
  d.rows.filter((r) => r.lightStatus === "auto" || (candidate && r.lightStatus === "candidate")).sort((a, b) => b.lightScore! - a.lightScore!).map((r) => r.key);
const lightAmb = (r: Scored) => r.lightStatus === "candidate";

const judgeSettings: Setting[] = [];
if (hasJev) for (const th of [0.2, 0.3, 0.5, 0.7]) judgeSettings.push({ id: `${jevName} p≥${th}`, judge: jevName, pick: jevPick(th), ambiguous: jevAmb });
if (hasLight) {
  judgeSettings.push({ id: "light auto만", judge: "light", pick: lightPick(false), ambiguous: lightAmb });
  judgeSettings.push({ id: "light auto+candidate", judge: "light", pick: lightPick(true), ambiguous: lightAmb });
}

// 점수 문턱만(ranks): 방식별 상위 N. 완화형은 가장 좋은 융합 방식 하나의 상위 100 안에서만 판정기
const FUSIONS = ["hybrid2", "hybrid3", "hybrid2_e5small", "hybrid3_e5small", "hybrid2_bgem3", "hybrid3_bgem3"];
const TOPS = [25, 50, 100];
const allRows = cardData.flatMap((d) => d.rows);
const yesTotal = allRows.filter((r) => r.verdict === "yes").length;
const maybeTotal = allRows.filter((r) => r.verdict === "maybe").length;
const rankSettings: Setting[] = [];
let bestFusion: string | null = null;
if (haveRanks) {
  const methods = Object.keys(cardData[0].ranks!).filter((m) => cardData.every((d) => d.ranks![m]));
  for (const m of methods) for (const n of TOPS) rankSettings.push({ id: `${m} 상위 ${n}`, judge: "rank", pick: (d) => d.ranks![m].slice(0, n) });
  // 융합 방식 고르기(미리 정함): 상위 100 안의 yes 재현율이 가장 높은 것, 같으면 FUSIONS 앞쪽
  const recall100 = (m: string) => cardData.reduce((n, d) => n + d.ranks![m].slice(0, 100).filter((k) => rowsOf(d).get(k)?.verdict === "yes").length, 0);
  bestFusion = FUSIONS.filter((m) => methods.includes(m)).reduce<string | null>((best, m) => (best === null || recall100(m) > recall100(best) ? m : best), null);
}

interface Stat {
  id: string;
  judge: string;
  branch: "keep" | "relax" | "score";
  selected: number;
  chars: number;
  yes: number;
  maybe: number;
  recallYes: number;
  recallMaybe: number;
  precisionYes: number;
  missedYes: number;
  ambShare: number | null;
}
function statOf(id: string, judge: string, branch: Stat["branch"], picks: Map<CardData, string[]>, amb?: (r: Scored) => boolean): Stat {
  let selected = 0, chars = 0, yes = 0, maybe = 0, ambN = 0;
  for (const [d, keys] of picks) {
    const m = rowsOf(d);
    for (const k of keys) {
      const r = m.get(k)!;
      selected++;
      chars += r.chars;
      if (r.verdict === "yes") yes++;
      if (r.verdict === "maybe") maybe++;
      if (amb?.(r)) ambN++;
    }
  }
  return { id, judge, branch, selected, chars, yes, maybe, recallYes: yesTotal ? yes / yesTotal : 0, recallMaybe: maybeTotal ? maybe / maybeTotal : 0, precisionYes: selected ? yes / selected : 0, missedYes: yesTotal ? 1 - yes / yesTotal : 0, ambShare: amb ? (selected ? ambN / selected : 0) : null };
}
const picksOf = (s: Setting, restrict?: (d: CardData) => Set<string>) => new Map(cardData.map((d) => [d, restrict ? s.pick(d).filter((k) => restrict(d).has(k)) : s.pick(d)] as const));
const top100 = (d: CardData) => new Set(d.ranks![bestFusion!].slice(0, 100));

const stats: Stat[] = [];
const picksStore = new Map<string, Map<CardData, string[]>>(); // `${branch}:${id}`
for (const s of judgeSettings) {
  const keep = picksOf(s);
  picksStore.set(`keep:${s.id}`, keep);
  stats.push(statOf(s.id, s.judge, "keep", keep, s.ambiguous));
  if (haveRanks && bestFusion) {
    const relax = picksOf(s, top100);
    picksStore.set(`relax:${s.id}`, relax);
    stats.push(statOf(`${s.id} ∩ ${bestFusion} 상위 100`, s.judge, "relax", relax, s.ambiguous));
  }
}
for (const s of rankSettings) stats.push(statOf(s.id, s.judge, "score", picksOf(s)));

// ───────────── 미리 정한 판정 규칙(§6.2) ─────────────
const MAX_MISSED = 0.02;
const MAX_AMB = 0.3;
interface Choice { branch: "keep" | "relax"; stat: Stat; settingId: string; passed: boolean; note: string }
function choose(branch: "keep" | "relax"): Choice | null {
  const cand = stats.filter((s) => s.branch === branch);
  if (!cand.length) return null;
  const pass = cand.filter((s) => s.missedYes <= MAX_MISSED && (s.ambShare ?? 0) <= MAX_AMB);
  const pickMin = (list: Stat[], key: (s: Stat) => number) => list.reduce((b, s) => (key(s) < key(b) ? s : b));
  const st = pass.length ? pickMin(pass, (s) => s.chars) : pickMin(cand, (s) => s.missedYes * 1e9 + s.chars / 1e3);
  const settingId = branch === "relax" ? st.id.replace(/ ∩ .*$/, "") : st.id;
  return { branch, stat: st, settingId, passed: pass.length > 0, note: pass.length ? `규칙 통과 ${pass.length}개 중 고른 글자 수 최소` : `통과한 설정 없음 — 놓친 yes가 가장 적은 설정을 고름` };
}
const chosen = { keep: choose("keep"), relax: choose("relax") };

// 선별 결과 파일
const selection: Record<"keep" | "relax", Record<string, { keys: string[] }> | null> = { keep: null, relax: null };
for (const b of ["keep", "relax"] as const) {
  const c = chosen[b];
  if (!c) continue;
  const picks = picksStore.get(`${b}:${c.settingId}`)!;
  selection[b] = Object.fromEntries([...picks].map(([d, keys]) => [d.card.label.cardId, { keys }]));
  writeFileSync(
    `${out}/selection-${b}.json`,
    JSON.stringify({ version: 1, judge: c.stat.judge, setting: c.settingId, ...(b === "relax" ? { fusion: bestFusion, top: 100 } : {}), rule: { maxMissedYes: MAX_MISSED, maxAmbiguousShare: MAX_AMB, passed: c.passed, note: c.note }, cards: selection[b] }, null, 1),
  );
}
const jaccard = (a: string[], b: string[]) => {
  const A = new Set(a), B = new Set(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  return A.size + B.size - inter ? inter / (A.size + B.size - inter) : 1;
};
const overlap = selection.keep && selection.relax ? Object.fromEntries(cards.map((c) => [c.label.cardId, jaccard(selection.keep![c.label.cardId].keys, selection.relax![c.label.cardId].keys)])) : null;

// ───────────── 비용·시간 ─────────────
const cost: Record<string, unknown> = {};
if (hasJev) {
  const fs = cards.map((c) => JSON.parse(readFileSync(jevFile(c), "utf8")) as JevFile);
  cost[jevName] = { requests: fs.reduce((n, f) => n + f.requests, 0), inputTokens: fs.reduce((n, f) => n + f.usage.input_tokens, 0), outputTokens: fs.reduce((n, f) => n + f.usage.output_tokens, 0), requestSeconds: Math.round(fs.reduce((n, f) => n + f.ms, 0) / 1000), model: fs[0].model };
}
if (hasLight) {
  const ps = lightTasks.map((t) => JSON.parse(readFileSync(lightFile(t), "utf8")) as LightPart);
  cost.light = { requests: ps.length, costUsdCli: Math.round(ps.reduce((n, p) => n + (p.costUsd ?? 0), 0) * 100) / 100, requestSeconds: Math.round(ps.reduce((n, p) => n + p.ms, 0) / 1000), droppedHits: ps.reduce((n, p) => n + p.dropped, 0), model: ps[0].model, spec: `${lightSpec.cliModel}/${lightSpec.effort}` };
}

// 카드별 표(고른 설정 기준)
const perCard = cardData.map((d) => {
  const yes = d.rows.filter((r) => r.verdict === "yes").length;
  const row: Record<string, unknown> = { cardId: d.card.label.cardId, candidates: d.rows.length, yes, maybe: d.rows.filter((r) => r.verdict === "maybe").length };
  for (const b of ["keep", "relax"] as const) {
    const keys = selection[b]?.[d.card.label.cardId]?.keys;
    if (!keys) continue;
    const m = rowsOf(d);
    const y = keys.filter((k) => m.get(k)!.verdict === "yes").length;
    row[b] = { selected: keys.length, chars: keys.reduce((n, k) => n + m.get(k)!.chars, 0), yes: y, missedYes: yes ? 1 - y / yes : 0 };
  }
  return row;
});

writeFileSync(`${judgesDir}/summary.json`, JSON.stringify({ out, variant, jevQuestion: variant, bestFusion, haveRanks, totals: { candidates: allRows.length, yes: yesTotal, maybe: maybeTotal, chars: allRows.reduce((n, r) => n + r.chars, 0) }, rule: { maxMissedYes: MAX_MISSED, maxAmbiguousShare: MAX_AMB }, chosen, overlap, stats, perCard, cost, wallMs: wall }, null, 1));

// ───────────── 표 출력 ─────────────
const pct = (x: number | null) => (x === null ? "—" : `${(x * 100).toFixed(1)}%`);
console.log(`\n정답: 후보 ${allRows.length}건 · yes ${yesTotal} · maybe ${maybeTotal} · 글자 ${allRows.reduce((n, r) => n + r.chars, 0).toLocaleString()}`);
console.log("\n| 갈래 | 설정 | 고른 수 | 글자 수 | yes 재현율 | 정밀도 | 놓친 yes | maybe 재현율 | 애매 몫 |\n|---|---|---|---|---|---|---|---|---|");
for (const s of stats) console.log(`| ${s.branch} | ${s.id} | ${s.selected} | ${s.chars.toLocaleString()} | ${pct(s.recallYes)} | ${pct(s.precisionYes)} | ${pct(s.missedYes)} | ${pct(s.recallMaybe)} | ${pct(s.ambShare)} |`);
for (const b of ["keep", "relax"] as const) {
  const c = chosen[b];
  if (!c) {
    console.log(`\n[${b}] ${b === "relax" ? "ranks 없음 — 완화형 비움" : "판정 결과 없음"}`);
    continue;
  }
  const banner = c.passed ? "" : "!!! 규칙(놓친 yes ≤2% 그리고 애매 ≤30%)을 통과한 설정이 없음 — 놓친 yes가 가장 적은 설정을 대신 고름 !!! ";
  console.log(`\n[${b}] ${banner}고른 설정: ${c.stat.id} — 고른 ${c.stat.selected}건·${c.stat.chars.toLocaleString()}자·놓친 yes ${pct(c.stat.missedYes)}·애매 ${pct(c.stat.ambShare)} (${c.note})`);
}
if (overlap) console.log(`\n두 갈래 카드별 자카드: ${Object.entries(overlap).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(" · ")}`);

// ───────────── 사람 판정 표본(D4) ─────────────
if (hasJev && hasLight) {
  type Reason = "정답 yes인데 판정기가 놓침" | "정답 no인데 판정기가 고름" | "Jev와 경량 모델이 갈림" | "정답 maybe, 판정기가 갈림";
  const cand: { d: CardData; r: Scored; reason: Reason }[] = [];
  for (const d of cardData) {
    for (const r of d.rows) {
      const jHi = r.p! >= 0.5, jLo = r.p! < 0.2, lHi = r.lightStatus === "auto", lLo = r.lightStatus === "none";
      let reason: Reason | null = null;
      if (r.verdict === "yes" && (jLo || lLo) && !(jHi || lHi)) reason = "정답 yes인데 판정기가 놓침";
      else if (r.verdict === "no" && (jHi || lHi)) reason = "정답 no인데 판정기가 고름";
      else if ((jHi && lLo) || (lHi && jLo)) reason = "Jev와 경량 모델이 갈림";
      else if (r.verdict === "maybe" && ((jHi && lLo) || (lHi && jLo) || (jHi !== lHi))) reason = "정답 maybe, 판정기가 갈림";
      if (reason) cand.push({ d, r, reason });
    }
  }
  const picked: typeof cand = [];
  const QUOTA = 5; // 카드 6장 × 5 = 30
  for (const d of cardData) {
    const mine = cand.filter((x) => x.d === d);
    const byReason = new Map<string, typeof cand>();
    for (const x of mine) byReason.set(x.reason, [...(byReason.get(x.reason) ?? []), x]);
    // 이유별로 돌아가며, 이유 안에서는 조각 성격이 고르게(key 정렬로 재현 가능)
    const lists = [...byReason.values()].map((l) => l.sort((a, b) => a.r.key.localeCompare(b.r.key)));
    let taken = 0;
    for (let i = 0; taken < QUOTA && lists.some((l) => l.length > i); i++) for (const l of lists) if (taken < QUOTA && l[i]) { picked.push(l[i]); taken++; }
  }
  // 카드당 몫으로 30건이 안 차면 남은 갈린 것에서 카드가 고르게 돌아가며 채움
  const rest = cardData.map((d) => cand.filter((x) => x.d === d && !picked.includes(x)));
  for (let i = 0; picked.length < 30 && rest.some((l) => l.length > i); i++) for (const l of rest) if (picked.length < 30 && l[i]) picked.push(l[i]);
  const lines = [`# 판정기 사람 확인 표본 (${picked.length}건 — 기관 자료라 git 밖)`, "", `정답지·Jev(${variant})·경량 모델 판정이 갈린 것 중 카드당 ${QUOTA}건 우선, 모자라면 남은 것으로 최대 30건. 후보 중 갈린 것 ${cand.length}건. 「사람 판정」 칸에 yes/maybe/no를 적어 주세요(yes = 정답지 기준: 이 과제의 지표·지적·대상을 직접 다루거나 근거로 바로 씀).`, ""];
  picked.forEach(({ d, r, reason }, i) => {
    const c = d.card.byKey.get(r.key)!;
    const lab = d.card.label.items.find((x) => x.key === r.key)!;
    const text = flattenHtmlTables(c.text ?? "").replace(/\s+/g, " ").trim();
    lines.push(
      `## ${i + 1}. ${d.card.label.cardId} — ${d.card.title}`,
      `- 갈린 이유: ${reason}`,
      `- 조각: \`${r.key}\` (${c.unit_type} · ${lab.role}) — ${c.title}`,
      `- 정답지: **${r.verdict}** — ${lab.basis}`,
      `- Jev p=${r.p!.toFixed(2)} · 경량 ${r.lightStatus === "auto" ? "확신" : r.lightStatus === "candidate" ? "애매" : "무관"}`,
      `- 글 앞 600자: ${text.slice(0, 600)}${text.length > 600 ? "…" : ""}`,
      `- 사람 판정(yes/maybe/no): `,
      "",
    );
  });
  writeFileSync(`${judgesDir}/human-review.md`, lines.join("\n"));
  console.log(`\n사람 판정 표본 ${picked.length}건 → ${judgesDir}/human-review.md (갈린 것 전체 ${cand.length}건)`);
} else {
  console.log("\n판정기 둘 다 끝나지 않아 사람 판정 표본은 만들지 않음");
}
console.log(`비용·시간: ${JSON.stringify(cost)} 이번 실행 벽시계(ms) ${JSON.stringify(wall)}`);
