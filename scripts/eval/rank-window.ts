// 「긴 조각은 문단 단위로 견주면 닮은 순이 나아지는가」를 잰다(운영 DB 읽기만, 모델 호출 없음, 새 정답 없음).
// 정답은 rank-recall.ts와 같음: Claude light 확신(ai·auto) + 규칙 연결(rule·auto·confirmed). 비교 대상:
//  base   = 지금의 rankSimilar(조각 전체 글로 한 번에 견줌)
//  window = 긴 조각을 W자 창으로 잘라 창마다 견주고 조각 점수 = 창 점수의 최댓값(제목은 창마다 붙음, IDF는 모든 창으로 셈)
//  mix    = max(base 점수, window 점수)
// 실행: node --conditions=react-server --env-file=.env.local scripts/eval/rank-window.ts [--w 500] [--min 800]
import { createClient } from "@supabase/supabase-js";
import { loadBundleChunks } from "../../lib/ai/context.ts";
import { matchCandidates } from "../../lib/ai/match.ts";
import { cardVector, rankSimilar, sectionVector } from "../../lib/reports/prior.ts";
import type { LooseJson } from "../../lib/loose-json.ts";

const args = process.argv.slice(2);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const W = Number(value("--w") ?? 500);
const MIN = Number(value("--min") ?? 800);
const KS = [10, 20, 30, 50];

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const chunks = await loadBundleChunks(db);

async function all(table: string, cols: string, f?: (q: LooseJson) => LooseJson): Promise<LooseJson[]> {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(cols).range(from, from + 999);
    if (f) q = f(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

// prior.ts의 cosine과 같은 셈(그쪽은 내보내지 않아 여기에 같게 둠)
function cosine(a: Map<string, number>, b: Map<string, number>, idf: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [g, x] of a) {
    const w = idf.get(g) ?? 0;
    const xa = x * w;
    na += xa * xa;
    const y = b.get(g);
    if (y) dot += xa * y * w;
  }
  for (const [g, y] of b) {
    const w = idf.get(g) ?? 0;
    nb += y * w * (y * w);
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** 조각 글을 W자 창(절반씩 겹침)으로 자름. MIN자 이하면 통째로 한 창 */
function windows(text: string): string[] {
  if (text.length <= MIN) return [text];
  const out: string[] = [];
  const step = Math.floor(W / 2);
  for (let i = 0; i < text.length; i += step) {
    out.push(text.slice(i, i + W));
    if (i + W >= text.length) break;
  }
  return out;
}

const sec = (title: string, text: string) => ({ key: "", business: "", taskNo: "", mark: "", title, taskTitle: "", targetName: "", page: null, text });

function windowRank(cardData: unknown, docs: Array<{ key: string; head: string; text: string }>): Map<string, number> {
  const items = docs.flatMap((d) => windows(d.text).map((t) => ({ key: d.key, vec: sectionVector(sec(d.head, t)) })));
  const df = new Map<string, number>();
  for (const it of items) for (const g of it.vec.keys()) df.set(g, (df.get(g) ?? 0) + 1);
  const n = items.length;
  const idf = new Map([...df].map(([g, d]) => [g, Math.log((n + 1) / (d + 0.5))]));
  const cv = cardVector(cardData);
  const best = new Map<string, number>();
  for (const it of items) best.set(it.key, Math.max(best.get(it.key) ?? 0, cosine(cv, it.vec, idf)));
  return best;
}

const cards = await all("cards", "id, eval_unit_id, data", (q) => q.eq("status", "active"));
const scope = await all("card_knowledge_scope", "card_id, chunk_key, status, method");
const byCard = new Map<string, typeof scope>();
for (const r of scope) byCard.set(r.card_id, [...(byCard.get(r.card_id) ?? []), r]);

type Acc = { P: number; hit: Record<number, number>; longP: number; longHit30: number };
const mk = (): Acc => ({ P: 0, hit: Object.fromEntries(KS.map((k) => [k, 0])), longP: 0, longHit30: 0 });
const acc = { strong: { base: mk(), window: mk(), mix: mk() }, claude: { base: mk(), window: mk(), mix: mk() } };
let used = 0;

for (const card of cards) {
  const cand = matchCandidates(chunks, card.eval_unit_id);
  const rows = byCard.get(card.id) ?? [];
  const inC = new Map(cand.map((c) => [c.chunk_key, c]));
  const strong = new Set(rows.filter((r) => inC.has(r.chunk_key) && ((r.method === "ai" && r.status === "auto") || (r.method === "rule" && (r.status === "auto" || r.status === "confirmed")))).map((r) => r.chunk_key));
  const claude = new Set(rows.filter((r) => inC.has(r.chunk_key) && r.method === "ai" && r.status === "auto").map((r) => r.chunk_key));
  if (!strong.size) continue;
  used++;
  const docs = cand.map((c) => ({ key: c.chunk_key, head: c.title, text: c.text ?? "" }));
  const baseScore = new Map(rankSimilar(card.data, docs).map((r) => [r.key, r.score]));
  const winScore = windowRank(card.data, docs);
  const order = (score: Map<string, number>) => docs.map((d, i) => ({ key: d.key, s: score.get(d.key) ?? 0, i })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.key);
  const orders = {
    base: order(baseScore),
    window: order(winScore),
    mix: order(new Map(docs.map((d) => [d.key, Math.max(baseScore.get(d.key) ?? 0, winScore.get(d.key) ?? 0)]))),
  };
  for (const [label, set] of [["strong", strong], ["claude", claude]] as const) {
    for (const m of ["base", "window", "mix"] as const) {
      const a = acc[label][m];
      a.P += set.size;
      for (const k of KS) a.hit[k] += orders[m].slice(0, k).filter((x) => set.has(x)).length;
      for (const key of set) {
        if ((inC.get(key)!.text ?? "").length >= 2000) {
          a.longP++;
          if (orders[m].slice(0, 30).includes(key)) a.longHit30++;
        }
      }
    }
  }
}

const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(1)}%`.padStart(6);
console.log(`창 ${W}자 · ${MIN}자 이하는 통째 · 카드 ${used}장\n`);
for (const label of ["strong", "claude"] as const) {
  console.log(`■ 정답 = ${label === "strong" ? "Claude 확신 + 규칙 연결" : "Claude 확신만(규칙 제외)"}   재현율  ${KS.map((k) => `K=${String(k).padStart(2)}`).join("   ")}   | 긴 조각(2000자↑) 상위30 재현`);
  for (const m of ["base", "window", "mix"] as const) {
    const a = acc[label][m];
    console.log(`   ${m.padEnd(7)} (정답 ${a.P}건)        ${KS.map((k) => pct(a.hit[k], a.P)).join("   ")}   | ${a.longHit30}/${a.longP} = ${pct(a.longHit30, a.longP)}`);
  }
  console.log();
}
