// 하이브리드 검색 재현율(지식공급 하이브리드 선별 계획 3단계 — docs/plan/지식공급-하이브리드선별-계획.md §5 3·§6.1).
// 시험 카드마다 후보 집합(buildBundle 「report」 층 조각 중 선별 대상 성격) 안에서 순위를 매깁니다:
//   (a) 글자 TF-IDF(rankSimilar — 요청 때 쓰는 함수) (b) PGroonga(search_knowledge, 질의는 buildSearchQuery(lensTopic)) (c) 로컬 임베딩 코사인(모델별)
//   (d) 순위 융합(RRF): 임베딩+PGroonga(hybrid2), 임베딩+PGroonga+TF-IDF(hybrid3)
// 정답지(<out>/labels/<uid>.json, items[].verdict yes/maybe/no)가 있으면 재현율을 내고, 없으면 순위 파일만 만들고 끝냅니다.
// 운영 DB는 읽기만. AI 호출 없음. 임베딩은 이 PC에서 계산(모델 파일만 Hugging Face에서 처음 한 번 내려받음 — 조각 글은 밖으로 보내지 않음).
// 기관 자료(조각 글·임베딩·순위)는 git 밖 <out>(docs/analysis/ 아래)에만 씁니다.
// 실행: node --conditions=react-server --env-file=.env.local scripts/eval/hybrid-recall.ts --out docs/analysis/eval/2026-10-26-select [--models e5small,bgem3]
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadBundleChunks } from "../../lib/ai/context.ts";
import { type BundleChunk, buildBundle } from "../../lib/knowledge/bundle.ts";
import type { ChunkRole } from "../../lib/knowledge/chunk-role.ts";
import { cardQueryText, rankByCosine, recallAt, rrf, selectableCandidates } from "../../lib/knowledge/hybrid.ts";
import { buildSearchQuery } from "../../lib/knowledge/search-query.ts";
import { lensTopic } from "../../lib/reports/lens.ts";
import { rankSimilar } from "../../lib/reports/prior.ts";
import { trackSpecOfUnit } from "../../lib/tracks/index.ts";
import type { LooseJson } from "../../lib/loose-json.ts";

const CARD_IDS = ["주요사업1/7-가", "주요사업2/1-가", "주요사업3/5-가", "경영관리1/1-1", "경영관리3/3-1", "경영관리4/4-2"];
const KS = [25, 50, 100];
/** 질의 글 상한(글자) — 두 모델에 같은 글을 줌. e5는 512토큰에서 더 잘림(결과에 적음) */
const QUERY_CHARS = 1500;
/** search_knowledge 한 번에 돌려주는 최대 건수(RPC가 100으로 막음) */
const PG_MAX = 100;

interface ModelSpec {
  id: string;
  dtype: "q8";
  pooling: "mean" | "cls";
  queryPrefix: string;
  passagePrefix: string;
}
const MODELS: Record<string, ModelSpec> = {
  // 다국어 e5 small(384차원, 512토큰) — 「query: 」/「passage: 」 접두, 평균 풀링
  e5small: { id: "Xenova/multilingual-e5-small", dtype: "q8", pooling: "mean", queryPrefix: "query: ", passagePrefix: "passage: " },
  // BGE-M3 밀집 벡터(1024차원, 8192토큰) — 접두 없음, CLS 풀링
  bgem3: { id: "Xenova/bge-m3", dtype: "q8", pooling: "cls", queryPrefix: "", passagePrefix: "" },
};

// ---------------------------------------------------------------------------
// 인자

const argv = process.argv.slice(2);
const arg = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const outArg = arg("--out");
if (!outArg) throw new Error("--out <폴더>가 필요합니다(예: docs/analysis/eval/2026-10-26-select)");
const OUT = resolve(outArg);
const modelNames = (arg("--models") ?? "e5small,bgem3").split(",").map((s) => s.trim()).filter(Boolean);
for (const m of modelNames) if (!MODELS[m]) throw new Error(`모르는 모델: ${m}(가능: ${Object.keys(MODELS).join(", ")})`);
/** 융합에 쓰는 임베딩 — bge-m3가 있으면 그것, 아니면 첫 모델 */
const PRIMARY = modelNames.includes("bgem3") ? "bgem3" : modelNames[0];

// ---------------------------------------------------------------------------
// 운영 DB 읽기

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: cardRows, error: cardErr } = await db.from("cards").select("id, uid, eval_unit_id, data").in("id", CARD_IDS);
if (cardErr) throw new Error(`cards: ${cardErr.message}`);
const cards = CARD_IDS.map((id) => {
  const c = (cardRows ?? []).find((r) => r.id === id);
  if (!c) throw new Error(`카드 없음: ${id}`);
  return c as { id: string; uid: string; eval_unit_id: string; data: LooseJson };
});

interface Cand {
  key: string;
  title: string;
  text: string;
  role: ChunkRole;
  chunk: BundleChunk;
}
interface CardCtx {
  id: string;
  uid: string;
  unit: string;
  data: LooseJson;
  cands: Cand[];
  query: string;
}

const ctxs: CardCtx[] = [];
for (const c of cards) {
  // 앱(loadCardBundle)과 같게: 평가단위 트랙의 조각, 경영관리 카드는 eval_unit_id가 곧 지표(MG-n)라 knowledgeUnit을 따로 넘기지 않음
  const chunks = await loadBundleChunks(db, trackSpecOfUnit(c.eval_unit_id));
  const byKey = new Map(chunks.map((x) => [x.chunk_key, x]));
  const bundle = buildBundle(chunks, { evalUnitId: c.eval_unit_id, data: c.data }, [], null, "report");
  const cands = selectableCandidates(bundle).map((x) => ({ ...x, chunk: byKey.get(x.key)! }));
  ctxs.push({ id: c.id, uid: c.uid, unit: bundle.unit, data: c.data, cands, query: cardQueryText(c.data, QUERY_CHARS) });
}

// ---------------------------------------------------------------------------
// (b) PGroonga — RPC가 100건까지만 돌려줘 후보를 문서 → 조각 종류 → 사업으로 나눠 부르고 점수로 합침
// pgroonga_score는 질의 낱말의 일치 수로 매기는 값이라 같은 질의면 나눠 부른 결과끼리 견줄 수 있다고 봄(추정 — 결과에 적음)

interface PgRow {
  chunk_key: string;
  score: number;
}
async function pgCall(query: string, part: Cand[]): Promise<PgRow[]> {
  const docs = [...new Set(part.map((c) => c.chunk.doc_id))];
  const types = [...new Set(part.map((c) => c.chunk.unit_type))];
  const hasNull = part.some((c) => c.chunk.business == null);
  const bizs = hasNull ? null : [...new Set(part.map((c) => c.chunk.business as string))];
  const tracks = [...new Set(part.map((c) => c.chunk.track))];
  const { data, error } = await db.rpc("search_knowledge", { query, tracks, businesses: bizs, unit_types: types, doc_ids: docs, max_rows: PG_MAX });
  if (error) throw new Error(`search_knowledge: ${error.message}`);
  return (data ?? []) as PgRow[];
}
async function pgRank(query: string, cands: Cand[]): Promise<{ keys: string[]; truncated: number; calls: number }> {
  const inC = new Set(cands.map((c) => c.key));
  const rows: PgRow[] = [];
  let truncated = 0;
  let calls = 0;
  const splitters: Array<(c: Cand) => string> = [(c) => c.chunk.doc_id, (c) => c.chunk.unit_type, (c) => c.chunk.business ?? "(없음)"];
  // 100건이 꽉 차면 다음 기준으로 나눠 다시 부름(한 무리로만 나뉘는 기준은 건너뜀 — 같은 인자 호출이라). 더 못 나누면 꽉 찬 채로 셈
  const run = async (part: Cand[], level: number): Promise<void> => {
    calls++;
    const got = await pgCall(query, part);
    if (got.length >= PG_MAX)
      for (let l = level; l < splitters.length; l++) {
        const groups = [...Map.groupBy(part, splitters[l]).values()];
        if (groups.length < 2) continue;
        for (const g of groups) await run(g, l + 1);
        return;
      }
    if (got.length >= PG_MAX) truncated++;
    rows.push(...got);
  };
  if (query) await run(cands, 0);
  const best = new Map<string, number>();
  for (const r of rows) if (inC.has(r.chunk_key)) best.set(r.chunk_key, Math.max(best.get(r.chunk_key) ?? -Infinity, r.score));
  const keys = [...best.keys()].sort((a, b) => best.get(b)! - best.get(a)! || (a < b ? -1 : a > b ? 1 : 0));
  return { keys, truncated, calls };
}

// ---------------------------------------------------------------------------
// (c) 로컬 임베딩 — 캐시 <out>/emb/<모델>/cache.json(조각 키 + 넣은 글 해시). 모델 파일은 <out>/emb/_hf

interface CacheEntry {
  h: string;
  /** 넣은 글의 토큰 수(특수 토큰 포함, 자르기 전) */
  n: number;
  v: string;
}
interface EmbedStats {
  model: string;
  hf: string;
  dtype: string;
  maxTokens: number | null;
  passages: number;
  computed: number;
  cached: number;
  truncatedPassages: number;
  truncatedQueries: number;
  loadMs: number;
  embedMs: number;
}
const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const toB64 = (v: Float32Array) => Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString("base64");
const fromB64 = (s: string) => {
  const b = Buffer.from(s, "base64");
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
};

async function embedAll(name: string, items: Array<{ key: string; text: string }>): Promise<{ vecs: Map<string, Float32Array>; tokens: Map<string, number>; stats: Omit<EmbedStats, "truncatedPassages" | "truncatedQueries" | "passages"> & { maxTokens: number | null } }> {
  const spec = MODELS[name];
  const dir = join(OUT, "emb", name);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "cache.json");
  const cache: { model: string; dtype: string; pooling: string; maxTokens: number | null; entries: Record<string, CacheEntry> } = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : { model: spec.id, dtype: spec.dtype, pooling: spec.pooling, maxTokens: null, entries: {} };
  if (cache.model !== spec.id || cache.dtype !== spec.dtype || cache.pooling !== spec.pooling) throw new Error(`${file}: 다른 모델의 캐시입니다 — 지우고 다시 돌리세요`);
  const missing = items.filter((it) => cache.entries[it.key]?.h !== sha(it.text));
  let loadMs = 0;
  let embedMs = 0;
  if (missing.length) {
    const t0 = Date.now();
    const { pipeline, env } = await import("@huggingface/transformers");
    env.cacheDir = join(OUT, "emb", "_hf");
    const ext = await pipeline("feature-extraction", spec.id, { dtype: spec.dtype });
    loadMs = Date.now() - t0;
    const max = Number(ext.tokenizer.model_max_length);
    cache.maxTokens = Number.isFinite(max) ? max : null;
    const lens = new Map(missing.map((it) => [it.key, ext.tokenizer.encode(it.text).length]));
    // 길이순으로 묶어 덧붙임(padding)을 줄임 — 한 묶음 토큰 합 16,384 이하·32건 이하
    const order = [...missing].sort((a, b) => lens.get(a.key)! - lens.get(b.key)!);
    const t1 = Date.now();
    for (let i = 0; i < order.length; ) {
      const batch = [order[i++]];
      while (i < order.length && batch.length < 32 && (batch.length + 1) * Math.min(lens.get(order[i].key)!, max) <= 16_384) batch.push(order[i++]);
      const out = await ext(batch.map((b) => b.text), { pooling: spec.pooling, normalize: true });
      const dim = out.dims[1];
      const flat = out.data as Float32Array;
      batch.forEach((b, j) => {
        cache.entries[b.key] = { h: sha(b.text), n: lens.get(b.key)!, v: toB64(Float32Array.from(flat.subarray(j * dim, (j + 1) * dim))) };
      });
      process.stdout.write(`\r  ${name}: ${Math.min(i, order.length)}/${order.length}건 임베딩`);
    }
    process.stdout.write("\n");
    embedMs = Date.now() - t1;
    writeFileSync(file, JSON.stringify(cache));
  }
  return {
    vecs: new Map(items.map((it) => [it.key, fromB64(cache.entries[it.key].v)])),
    tokens: new Map(items.map((it) => [it.key, cache.entries[it.key].n])),
    stats: { model: name, hf: spec.id, dtype: spec.dtype, maxTokens: cache.maxTokens, computed: missing.length, cached: items.length - missing.length, loadMs, embedMs },
  };
}

const passageText = (c: Cand) => `${c.title}\n${c.text}`;
const uniq = new Map<string, Cand>();
for (const x of ctxs) for (const c of x.cands) uniq.set(c.key, c);

const embedRanks = new Map<string, Map<string, string[]>>(); // 모델 → 카드 uid → 순위
const embedStats: EmbedStats[] = [];
for (const name of modelNames) {
  const spec = MODELS[name];
  console.log(`임베딩 ${name}(${spec.id}, ${spec.dtype}) — 고유 조각 ${uniq.size}건 + 질의 ${ctxs.length}건`);
  const items = [
    ...[...uniq.values()].map((c) => ({ key: `p:${c.key}`, text: spec.passagePrefix + passageText(c) })),
    ...ctxs.map((x) => ({ key: `q:${x.uid}`, text: spec.queryPrefix + x.query })),
  ];
  const { vecs, tokens, stats } = await embedAll(name, items);
  const max = stats.maxTokens ?? Infinity;
  const over = (k: string) => tokens.get(k)! > max;
  embedStats.push({
    ...stats,
    passages: uniq.size,
    truncatedPassages: [...uniq.keys()].filter((k) => over(`p:${k}`)).length,
    truncatedQueries: ctxs.filter((x) => over(`q:${x.uid}`)).length,
  });
  const per = new Map<string, string[]>();
  for (const x of ctxs) per.set(x.uid, rankByCosine(vecs.get(`q:${x.uid}`)!, x.cands.map((c) => ({ key: c.key, vec: vecs.get(`p:${c.key}`)! }))));
  embedRanks.set(name, per);
}

// ---------------------------------------------------------------------------
// 순위 파일

mkdirSync(join(OUT, "ranks"), { recursive: true });
const methodsOf = new Map<string, Record<string, string[]>>();
const pgInfo: Record<string, { matched: number; truncatedCalls: number; calls: number; query: string }> = {};
for (const x of ctxs) {
  const tfidf = rankSimilar(x.data, x.cands.map((c) => ({ key: c.key, head: c.title, text: c.text }))).map((r) => r.key);
  const q = buildSearchQuery(lensTopic(x.data), "any");
  const pg = await pgRank(q, x.cands);
  pgInfo[x.uid] = { matched: pg.keys.length, truncatedCalls: pg.truncated, calls: pg.calls, query: q };
  const methods: Record<string, string[]> = { tfidf, pgroonga: pg.keys };
  for (const name of modelNames) methods[name] = embedRanks.get(name)!.get(x.uid)!;
  methods.hybrid2 = rrf([methods[PRIMARY], pg.keys]);
  methods.hybrid3 = rrf([methods[PRIMARY], pg.keys, tfidf]);
  // 모델이 둘 이상이면 모델별 융합도 함께(어느 임베딩이 융합에 나은지 보려고)
  if (modelNames.length > 1) for (const name of modelNames) {
    methods[`hybrid2_${name}`] = rrf([methods[name], pg.keys]);
    methods[`hybrid3_${name}`] = rrf([methods[name], pg.keys, tfidf]);
  }
  methodsOf.set(x.uid, methods);
  writeFileSync(
    join(OUT, "ranks", `${x.uid}.json`),
    JSON.stringify({ cardId: x.id, unit: x.unit, candidates: x.cands.length, methods, meta: { hybridEmbedding: PRIMARY, rrfK: 60, pgroongaMatched: pg.keys.length, pgroongaTruncatedCalls: pg.truncated } }, null, 1),
  );
  console.log(`${x.id}(${x.unit}) 후보 ${x.cands.length}건 · PGroonga 일치 ${pg.keys.length}건(호출 ${pg.calls}회, 100건 꽉 참 ${pg.truncated}회) → ranks/${x.uid}.json`);
}
console.log("\n임베딩 시간·잘림");
for (const s of embedStats)
  console.log(`  ${s.model}: 모델 읽기 ${(s.loadMs / 1000).toFixed(1)}초 · 임베딩 ${(s.embedMs / 1000).toFixed(1)}초(새로 ${s.computed}건, 캐시 ${s.cached}건) · 입력 상한 ${s.maxTokens}토큰 — 넘어 앞부분만 쓴 조각 ${s.truncatedPassages}/${s.passages}건, 질의 ${s.truncatedQueries}/${ctxs.length}건`);

// ---------------------------------------------------------------------------
// 재현율 — 정답지가 있는 카드만

interface LabelItem {
  key?: string;
  chunk_key?: string;
  verdict?: string;
}
const labeled = ctxs.filter((x) => existsSync(join(OUT, "labels", `${x.uid}.json`)));
if (!labeled.length) {
  console.log(`\n정답지 없음(${join(OUT, "labels")}/<uid>.json) — 순위 파일만 만들었습니다. 정답지가 생기면 다시 돌리세요(임베딩은 캐시를 씀).`);
  process.exit(0);
}
if (labeled.length < ctxs.length) console.log(`\n정답지 없는 카드(재현율에서 뺌): ${ctxs.filter((x) => !labeled.includes(x)).map((x) => x.id).join(", ")}`);

// 현행 선별 기준선: 대응표 자동·확정(운영 DB 읽기만) — 순위가 없는 집합이라 「그 집합을 다 넣었을 때」 재현율
const scopeOf = new Map<string, Set<string>>();
{
  const { data, error } = await db.from("card_knowledge_scope").select("card_id, chunk_key, status").in("card_id", labeled.map((x) => x.id)).in("status", ["auto", "confirmed"]);
  if (error) throw new Error(`card_knowledge_scope: ${error.message}`);
  for (const r of data ?? []) scopeOf.set(r.card_id, (scopeOf.get(r.card_id) ?? new Set()).add(r.chunk_key));
}

const BASES = { yes: ["yes"], yesMaybe: ["yes", "maybe"] } as const;
type Base = keyof typeof BASES;
const ROLES: ChunkRole[] = ["critique", "survey", "prior", "case"];
const methodNames = [...new Set(labeled.flatMap((x) => Object.keys(methodsOf.get(x.uid)!)))];

interface Tally {
  hit: number;
  pos: number;
}
const add = (t: Tally, hit: number, pos: number) => {
  t.hit += hit;
  t.pos += pos;
};
/** 상위 k건 안 정답 수 */
const hitsAt = (ranked: string[], pos: Set<string>, k: number) => ranked.slice(0, k).filter((key) => pos.has(key)).length;
const micro: Record<Base, Record<string, Record<string, Tally>>> = { yes: {}, yesMaybe: {} }; // 기준 → 방법 → "k" 또는 "k:성격"
const macro: Record<Base, Record<string, Record<number, number[]>>> = { yes: {}, yesMaybe: {} };
const scopeMicro: Record<Base, Tally & { size: number }> = { yes: { hit: 0, pos: 0, size: 0 }, yesMaybe: { hit: 0, pos: 0, size: 0 } };
const perCard: LooseJson[] = [];

for (const x of labeled) {
  const raw = JSON.parse(readFileSync(join(OUT, "labels", `${x.uid}.json`), "utf8"));
  const items: LabelItem[] = raw.items ?? [];
  const keyOf = (it: LabelItem) => it.key ?? it.chunk_key;
  if (items.some((it) => !keyOf(it))) throw new Error(`labels/${x.uid}.json: items[]에 key(또는 chunk_key)가 없는 줄이 있습니다`);
  const roleOf = new Map(x.cands.map((c) => [c.key, c.role]));
  const methods = methodsOf.get(x.uid)!;
  const scope = scopeOf.get(x.id) ?? new Set<string>();
  const card: LooseJson = { cardId: x.id, uid: x.uid, unit: x.unit, candidates: x.cands.length, labeled: items.length, scopeSize: [...scope].filter((k) => roleOf.has(k)).length, bases: {} };
  for (const base of Object.keys(BASES) as Base[]) {
    const all = items.filter((it) => (BASES[base] as readonly string[]).includes(String(it.verdict))).map((it) => keyOf(it)!);
    const pos = all.filter((k) => roleOf.has(k));
    const outside = all.length - pos.length;
    const b: LooseJson = { positives: pos.length, outsideCandidates: outside, byRole: Object.fromEntries(ROLES.map((r) => [r, pos.filter((k) => roleOf.get(k) === r).length])), recall: {} };
    for (const m of methodNames) {
      const ranked = methods[m] ?? [];
      b.recall[m] = {};
      const tm = (micro[base][m] ??= {});
      for (const k of KS) {
        const r = recallAt(ranked, pos, k);
        b.recall[m][k] = r;
        if (r != null) ((macro[base][m] ??= {})[k] ??= []).push(r);
        add((tm[String(k)] ??= { hit: 0, pos: 0 }), hitsAt(ranked, new Set(pos), k), pos.length);
        for (const role of ROLES) {
          const rp = new Set(pos.filter((key) => roleOf.get(key) === role));
          add((tm[`${k}:${role}`] ??= { hit: 0, pos: 0 }), hitsAt(ranked, rp, k), rp.size);
        }
      }
    }
    const sHit = pos.filter((k) => scope.has(k)).length;
    b.scope = { size: card.scopeSize, recall: pos.length ? sHit / pos.length : null };
    add(scopeMicro[base], sHit, pos.length);
    scopeMicro[base].size += card.scopeSize;
    card.bases[base] = b;
  }
  perCard.push(card);
}

const pct = (t: Tally | undefined) => (t && t.pos ? `${((t.hit / t.pos) * 100).toFixed(0)}%` : "—");
const mean = (xs: number[] | undefined) => (xs?.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pctN = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(0)}%`);
const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - [...s].length));

for (const base of Object.keys(BASES) as Base[]) {
  const P = micro[base][methodNames[0]]?.["100"]?.pos ?? 0;
  console.log(`\n■ 정답 = ${base === "yes" ? "yes" : "yes+maybe"} (카드 ${labeled.length}장, 후보 안 정답 ${P}건 — 전체 합산, 괄호는 카드 평균)`);
  console.log(`  ${pad("방법", 20)}${KS.map((k) => pad(`@${k}`, 14)).join("")}`);
  for (const m of methodNames) console.log(`  ${pad(m, 20)}${KS.map((k) => pad(`${pct(micro[base][m]?.[String(k)])} (${pctN(mean(macro[base][m]?.[k]))})`, 14)).join("")}`);
  const s = scopeMicro[base];
  console.log(`  ${pad("현행 대응표(자동·확정)", 20)}${pct(s)} — 집합 크기 카드 평균 ${(s.size / labeled.length).toFixed(0)}건(순위 없음)`);
  console.log(`  성격별 @50 / @100(후보 안 정답 수)`);
  console.log(`  ${pad("방법", 20)}${ROLES.map((r) => pad(`${r}(${micro[base][methodNames[0]]?.[`100:${r}`]?.pos ?? 0})`, 16)).join("")}`);
  for (const m of methodNames) console.log(`  ${pad(m, 20)}${ROLES.map((r) => pad(`${pct(micro[base][m]?.[`50:${r}`])} / ${pct(micro[base][m]?.[`100:${r}`])}`, 16)).join("")}`);
}
const outsideYes = perCard.reduce((a, c) => a + c.bases.yes.outsideCandidates, 0);
if (outsideYes) console.log(`\n정답(yes) 중 후보 집합 밖 ${outsideYes}건 — 재현율 분모에서 뺌(검색이 원천적으로 못 보는 몫)`);
console.log(`\n§6.1 기준: 후보 100개에서 확정(yes) 재현율 ≥95%`);

const summary = (base: Base) =>
  Object.fromEntries(
    methodNames.map((m) => [
      m,
      {
        micro: Object.fromEntries(KS.map((k) => [k, micro[base][m]?.[String(k)] ?? null])),
        macro: Object.fromEntries(KS.map((k) => [k, mean(macro[base][m]?.[k])])),
        byRole: Object.fromEntries(ROLES.map((r) => [r, Object.fromEntries(KS.map((k) => [k, micro[base][m]?.[`${k}:${r}`] ?? null]))])),
      },
    ]),
  );
writeFileSync(
  join(OUT, "recall.json"),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      ks: KS,
      hybridEmbedding: PRIMARY,
      rrfK: 60,
      queryChars: QUERY_CHARS,
      embed: embedStats,
      pgroonga: pgInfo,
      cards: perCard,
      summary: { yes: summary("yes"), yesMaybe: summary("yesMaybe") },
      scopeBaseline: scopeMicro,
    },
    null,
    1,
  ),
);
console.log(`\n→ ${join(OUT, "recall.json")}`);
