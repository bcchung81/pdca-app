// 「요청 시점 결정론 관련도」가 AI 사전 매칭 결과를 얼마나 복원하는지 잰다(새 라벨·외부 서비스 없음, 운영 DB는 읽기만).
// 약한 정답 = 기존 Claude light 판정(card_knowledge_scope method='ai')과 규칙(3-gram) 연결. 정답이 아니므로 「사람이 확정한 정답」의 대용일 뿐이다.
// 비교 대상: (1) bigram TF-IDF 코사인(lib/reports/prior.ts rankSimilar — 이미 요청 시점에 쓰는 함수) (2) PGroonga 전문검색(search_knowledge — 경평 평가 근거가 쓰는 질의) (3) 무작위 기대값(K/N).
// 실행: node --conditions=react-server --env-file=.env.local scripts/eval/rank-recall.ts
import { createClient } from "@supabase/supabase-js";
import { loadBundleChunks } from "../../lib/ai/context.ts";
import { matchCandidates } from "../../lib/ai/match.ts";
import { buildSearchQuery } from "../../lib/knowledge/search-query.ts";
import { rankSimilar } from "../../lib/reports/prior.ts";
import { lensTopic } from "../../lib/reports/lens.ts";
import { SCOPE_UNIT_TYPES } from "../../lib/prep/scope.ts";
import type { LooseJson } from "../../lib/loose-json.ts";

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

const cards = await all("cards", "id, eval_unit_id, data", (q) => q.eq("status", "active"));
const scope = await all("card_knowledge_scope", "card_id, chunk_key, status, method");
const byCard = new Map<string, typeof scope>();
for (const r of scope) byCard.set(r.card_id, [...(byCard.get(r.card_id) ?? []), r]);

type Hits = Record<string, number[]>; // 방법 → K별 적중 수
const zero = () => Object.fromEntries(KS.map((k) => [k, 0])) as Record<number, number>;
const acc = { claude: { P: 0, bigram: zero(), pgroonga: zero(), random: zero() }, strong: { P: 0, bigram: zero(), pgroonga: zero(), random: zero() }, broad: { P: 0, bigram: zero(), pgroonga: zero(), random: zero() } };
let usedCards = 0;
const pgReachable = { strong: 0, total: 0 };
let pgErr = 0;
const medianPct: number[] = [];
const sizes = { total: 0, top: Object.fromEntries(KS.map((k) => [k, 0])) as Record<number, number>, cards: 0 };
void ({} as Hits);

for (const card of cards) {
  const cand = matchCandidates(chunks, card.eval_unit_id);
  const N = cand.length;
  const rows = byCard.get(card.id) ?? [];
  const inC = new Set(cand.map((c) => c.chunk_key));
  const strong = new Set(rows.filter((r) => inC.has(r.chunk_key) && ((r.method === "ai" && r.status === "auto") || (r.method === "rule" && (r.status === "auto" || r.status === "confirmed")))).map((r) => r.chunk_key));
  const broad = new Set([...strong, ...rows.filter((r) => inC.has(r.chunk_key) && r.method === "ai" && r.status === "candidate").map((r) => r.chunk_key)]);
  // 순환 논리 확인용: 규칙(3-gram) 연결은 코사인과 같은 글자 겹침 신호라 빼고 Claude 확신만 정답으로 삼은 집합
  const claudeOnly = new Set(rows.filter((r) => inC.has(r.chunk_key) && r.method === "ai" && r.status === "auto").map((r) => r.chunk_key));
  if (!strong.size) continue;
  usedCards++;

  // (1) bigram TF-IDF 코사인
  const bg = rankSimilar(card.data, cand.map((c) => ({ key: c.chunk_key, head: c.title, text: c.text ?? "" }))).map((r) => r.key);
  const pos = (key: string) => bg.indexOf(key) + 1;
  // 상위 K건 전문의 글자 수(투입량 어림)
  const len = new Map(cand.map((c) => [c.chunk_key, (c.text ?? "").length + c.title.length]));
  sizes.total += cand.reduce((a, c) => a + (len.get(c.chunk_key) ?? 0), 0);
  for (const k of KS) sizes.top[k] += bg.slice(0, k).reduce((a, x) => a + (len.get(x) ?? 0), 0);
  sizes.cards++;
  medianPct.push([...strong].map((k) => pos(k) / N).sort((a, b) => a - b)[Math.floor(strong.size / 2)]);

  // (2) PGroonga — 경평 평가 근거와 같은 질의(과제명·실행과제·지표·지적 400자, OR), 이 사업 + 공통지표만(RPC가 business = any(...)라 사업 미지정 조각은 못 찾음)
  const q = buildSearchQuery(lensTopic(card.data), "any");
  const bizs = [card.eval_unit_id, "BZ-4"];
  const { data: pg, error } = q ? await db.rpc("search_knowledge", { query: q, businesses: bizs, unit_types: [...SCOPE_UNIT_TYPES], max_rows: 100 }) : { data: [], error: null };
  if (error) pgErr++;
  const pgKeys = ((pg ?? []) as Array<{ chunk_key: string }>).map((r) => r.chunk_key).filter((k) => inC.has(k));
  const reach = (k: string) => cand.find((c) => c.chunk_key === k)?.business != null;
  pgReachable.total += strong.size;
  pgReachable.strong += [...strong].filter(reach).length;

  for (const [label, set] of [["claude", claudeOnly], ["strong", strong], ["broad", broad]] as const) {
    acc[label].P += set.size;
    for (const k of KS) {
      acc[label].bigram[k] += bg.slice(0, k).filter((x) => set.has(x)).length;
      acc[label].pgroonga[k] += pgKeys.slice(0, k).filter((x) => set.has(x)).length;
      acc[label].random[k] += Math.min(1, k / N) * set.size;
    }
  }
}

const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(0)}%`.padStart(4);
console.log(`카드 ${cards.length}장 중 약한 정답(Claude 확신·규칙 연결)이 있는 ${usedCards}장 평가 · PGroonga RPC 오류 ${pgErr}건`);
console.log(`PGroonga가 원천적으로 못 찾는 정답(사업 미지정 조각): ${pgReachable.total - pgReachable.strong}건 / ${pgReachable.total}건 (${pct(pgReachable.total - pgReachable.strong, pgReachable.total)})`);
console.log(`정답 조각 대비 무작위 조각 수 — 후보 조각 약 230~250건 기준`);
for (const label of ["claude", "strong", "broad"] as const) {
  const a = acc[label];
  console.log(`\n■ ${{ claude: "정답 = Claude 확신만(규칙 연결 제외 — 순환 논리 확인)", strong: "정답 = Claude 확신 + 규칙 연결", broad: "정답 = Claude 확신 + 애매 + 규칙 연결" }[label]} (정답 조각 ${a.P}건)`);
  console.log("   상위 K건 안에 든 정답 비율(재현율)      " + KS.map((k) => `K=${String(k).padStart(2)}`).join("   "));
  for (const m of ["bigram", "pgroonga", "random"] as const) console.log(`   ${{ bigram: "TF-IDF 코사인   ", pgroonga: "PGroonga 전문검색", random: "무작위(기대값)  " }[m]}      ` + KS.map((k) => pct(a[m][k], a.P)).join("     "));
}
medianPct.sort((x, y) => x - y);
console.log(`\nTF-IDF 코사인에서 정답 조각의 중앙 순위 백분위(카드별 중앙값의 중앙값): 상위 ${(medianPct[Math.floor(medianPct.length / 2)] * 100).toFixed(0)}%`);
console.log(`\n후보 조각 전문 글자 수(카드 평균): 전체 ${Math.round(sizes.total / sizes.cards / 1000)}천 자 — TF-IDF 상위 K건만: ` + KS.map((k) => `K=${k} ${Math.round(sizes.top[k] / sizes.cards / 1000)}천 자(${((sizes.top[k] / sizes.total) * 100).toFixed(0)}%)`).join(" · "));
