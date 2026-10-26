// 「요청 시점 TF-IDF 코사인」이 놓친 정답 조각(상위 K건 밖)을 열어 놓친 이유를 나누기 위한 표를 만든다(운영 DB 읽기만, 모델 호출 없음).
// 약한 정답 = 기존 Claude light 확신 판정(method='ai', status='auto') + 규칙 연결(method='rule', auto·confirmed). rank-recall.ts와 같은 기준.
// 실행: node --conditions=react-server --env-file=.env.local scripts/eval/rank-miss.ts [--k 30] [--out <json 경로>]
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadBundleChunks } from "../../lib/ai/context.ts";
import { matchCandidates } from "../../lib/ai/match.ts";
import { rankSimilar } from "../../lib/reports/prior.ts";
import type { LooseJson } from "../../lib/loose-json.ts";

const args = process.argv.slice(2);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const K = Number(value("--k") ?? 30);
const out = value("--out");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const chunks = await loadBundleChunks(db);

async function all(table: string, cols: string, f?: (q: LooseJson) => LooseJson): Promise<LooseJson[]> {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(cols).range(from, from + 999);
    if (f) q = f(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

const cards = await all("cards", "id, eval_unit_id, data", (q) => q.eq("status", "active"));
const scope = await all("card_knowledge_scope", "card_id, chunk_key, status, method, basis");
const byCard = new Map<string, typeof scope>();
for (const r of scope) byCard.set(r.card_id, [...(byCard.get(r.card_id) ?? []), r]);

interface Row {
  card: string;
  chunkKey: string;
  unitType: string;
  business: string | null;
  title: string;
  len: number;
  rank: number;
  of: number;
  method: string;
  basis: string;
}
const positives: Row[] = [];
const missed: Row[] = [];
for (const card of cards) {
  const cand = matchCandidates(chunks, card.eval_unit_id);
  const inC = new Map(cand.map((c) => [c.chunk_key, c]));
  const rows = (byCard.get(card.id) ?? []).filter((r) => inC.has(r.chunk_key) && ((r.method === "ai" && r.status === "auto") || (r.method === "rule" && (r.status === "auto" || r.status === "confirmed"))));
  if (!rows.length) continue;
  const order = rankSimilar(card.data, cand.map((c) => ({ key: c.chunk_key, head: c.title, text: c.text ?? "" }))).map((r) => r.key);
  for (const r of rows) {
    const c = inC.get(r.chunk_key)!;
    const row: Row = {
      card: card.id,
      chunkKey: r.chunk_key,
      unitType: c.unit_type,
      business: c.business ?? null,
      title: c.title,
      len: (c.text ?? "").length,
      rank: order.indexOf(r.chunk_key) + 1,
      of: cand.length,
      method: r.method,
      basis: (r.basis ?? "").replace(/\s+/g, " "),
    };
    positives.push(row);
    if (row.rank > K) missed.push(row);
  }
}

const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(0)}%` : "-");
console.log(`K=${K} · 정답 ${positives.length}건 중 상위 ${K} 밖 ${missed.length}건 (${pct(missed.length, positives.length)})\n`);

const group = <T,>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
};
const table = (label: string, key: (r: Row) => string) => {
  console.log(`■ ${label}   (놓친 수 / 정답 수 = 놓침 비율)`);
  const P = group(positives, key);
  const M = group(missed, key);
  for (const [k, ps] of [...P].sort((a, b) => (M.get(b[0])?.length ?? 0) - (M.get(a[0])?.length ?? 0))) console.log(`   ${k.padEnd(28)} ${String(M.get(k)?.length ?? 0).padStart(3)} / ${String(ps.length).padStart(3)} = ${pct(M.get(k)?.length ?? 0, ps.length)}`);
  console.log();
};
table("조각 종류(unit_type)", (r) => r.unitType);
table("정답 출처", (r) => r.method);
table("사업 지정 여부", (r) => (r.business ? "사업 지정" : "사업 미지정(공통)"));
const band = (n: number) => (n < 300 ? "~300자" : n < 800 ? "300~800자" : n < 2000 ? "800~2000자" : n < 5000 ? "2000~5000자" : "5000자~");
table("조각 길이", (r) => band(r.len));

const uniq = new Map<string, Row[]>();
for (const r of missed) uniq.set(r.chunkKey, [...(uniq.get(r.chunkKey) ?? []), r]);
console.log(`놓친 정답 ${missed.length}건 = 서로 다른 조각 ${uniq.size}개 (조각당 평균 ${(missed.length / uniq.size).toFixed(1)}장 카드에서 놓침)\n`);
console.log("■ 놓친 조각별(카드 수 많은 순)");
for (const [k, rs] of [...uniq].sort((a, b) => b[1].length - a[1].length)) {
  const r = rs[0];
  const all = positives.filter((p) => p.chunkKey === k).length;
  console.log(`  ${String(rs.length).padStart(2)}/${String(all).padStart(2)}장 | ${r.unitType} | ${r.len}자 | ${r.title.slice(0, 60)} | 평균 순위 ${Math.round(rs.reduce((a, x) => a + x.rank, 0) / rs.length)}/${r.of}`);
}
if (out) writeFileSync(out, JSON.stringify({ K, positives, missed }, null, 1));
