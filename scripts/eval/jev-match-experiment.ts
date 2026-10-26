// 실험: 과제 한 장의 「공통 지식 조각 관련 여부」 판단을 TypeSafe Jev에 맡기면 애매 비율이 어떻게 달라지는지 잰다.
// 운영 DB는 읽기만 하고(대응표·작업 등 아무것도 쓰지 않음), Jev에는 그 과제 요약과 그 사업의 매칭 후보 조각 글을 보낸다(외부 서비스 전송 — 사용자 승인 뒤에만).
// 기존 Claude light 판정(card_knowledge_scope method='ai')과 같은 후보 조각 위에서 나란히 비교한다.
// 실행: node --conditions=react-server --env-file=.env.local scripts/eval/jev-match-experiment.ts [--card <카드 id>] [--batch 25] [--high 0.8] [--low 0.2]
import { createClient } from "@supabase/supabase-js";
import { loadBundleChunks } from "../../lib/ai/context.ts";
import { matchCandidates } from "../../lib/ai/match.ts";
import { type Bands, DEFAULT_BANDS, bandOf, crossTab, scoreChunks, summarizeBands, typesafeCaller } from "../../lib/ai/typesafe.ts";

const args = process.argv.slice(2);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const cardId = value("--card") ?? "주요사업3/5-가";
const batchSize = Number(value("--batch") ?? 25);
const bands: Bands = { high: Number(value("--high") ?? DEFAULT_BANDS.high), low: Number(value("--low") ?? DEFAULT_BANDS.low) };
const apiKey = process.env.TYPESAFE_API_KEY;
if (!apiKey) throw new Error("TYPESAFE_API_KEY가 없습니다(.env.local)");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: card, error } = await db.from("cards").select("id, title, eval_unit_id, data").eq("id", cardId).single();
if (error || !card) throw new Error(`카드를 못 읽음: ${error?.message}`);
const chunks = await loadBundleChunks(db);
const candidates = matchCandidates(chunks, card.eval_unit_id);
const { data: scope } = await db.from("card_knowledge_scope").select("chunk_key, status, basis").eq("card_id", cardId).eq("method", "ai");
const existing = new Map<string, "auto" | "candidate">((scope ?? []).map((r) => [r.chunk_key as string, r.status as "auto" | "candidate"]));
const basisOf = new Map((scope ?? []).map((r) => [r.chunk_key as string, r.basis as string]));
const byKey = new Map(candidates.map((c) => [c.chunk_key, c]));
const title = (k: string) => `${byKey.get(k)?.unit_type} | ${(byKey.get(k)?.title ?? k).slice(0, 56)}`;

console.log(`과제 ${cardId} — ${card.title}`);
console.log(`후보 조각 ${candidates.length}건(Claude가 본 것과 같은 집합) · 묶음 ${batchSize} · 구간 확신≥${bands.high} 제외≤${bands.low}`);

const t0 = Date.now();
const r = await scoreChunks(typesafeCaller({ apiKey, model: process.env.TYPESAFE_MODEL ?? "jev-latest" }), card.data, candidates, { batchSize });
const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\nJev(${r.model}) 요청 ${r.requests}회 · ${secs}초 · 입력 ${r.usage.input_tokens.toLocaleString()} · 출력 ${r.usage.output_tokens.toLocaleString()} 토큰`);

const jev = new Map(r.scores.map((s) => [s.chunkKey, s.p]));
const ps = r.scores.map((s) => s.p);

// 1) 확률 분포 — 중간(애매)에 얼마나 몰리는가
const bins = new Array(10).fill(0) as number[];
for (const p of ps) bins[Math.min(9, Math.floor(p * 10))]++;
console.log("\n확률 분포(Jev, 후보 전체):");
bins.forEach((n, i) => console.log(`  ${(i / 10).toFixed(1)}~${((i + 1) / 10).toFixed(1)} ${String(n).padStart(4)} ${"█".repeat(Math.round((n / ps.length) * 60))}`));

// 2) 구간 요약 — Claude vs Jev
const cl = { auto: [...existing.values()].filter((s) => s === "auto").length, candidate: [...existing.values()].filter((s) => s === "candidate").length };
const clShare = cl.auto + cl.candidate ? cl.candidate / (cl.auto + cl.candidate) : 0;
console.log(`\nClaude light: 확신 ${cl.auto} · 애매 ${cl.candidate} · 관련 있음 중 애매 ${(clShare * 100).toFixed(0)}%`);
for (const b of [bands, { high: 0.9, low: 0.1 }, { high: 0.7, low: 0.3 }]) {
  const s = summarizeBands(ps, b);
  console.log(`Jev 구간 ${b.high}/${b.low}: 확신 ${s.auto} · 애매 ${s.candidate} · 제외 ${s.none} · 관련 있음 중 애매 ${(s.ambiguousShare * 100).toFixed(0)}%`);
}

// 3) 교차표 + 어긋난 조각
const t = crossTab(jev, existing, bands);
console.log("\n교차표(행 = Claude 판정, 열 = Jev 구간):");
for (const row of ["auto", "candidate", "absent"] as const) console.log(`  Claude ${row.padEnd(9)} → Jev 확신 ${t[row].auto} · 애매 ${t[row].candidate} · 제외 ${t[row].none}`);
const show = (label: string, keys: string[]) => {
  console.log(`\n${label} (${keys.length}건)`);
  for (const k of keys.slice(0, 6)) console.log(`  p=${jev.get(k)!.toFixed(2)} ${title(k)}${basisOf.get(k) ? `\n        Claude 근거: ${basisOf.get(k)!.slice(0, 80)}` : ""}`);
};
const keysOf = (pred: (k: string, p: number) => boolean) => [...jev].filter(([k, p]) => pred(k, p)).map(([k]) => k);
show("Claude 애매 → Jev 확신(≥high)", keysOf((k, p) => existing.get(k) === "candidate" && bandOf(p, bands) === "auto"));
show("Claude 애매 → Jev 제외(≤low)", keysOf((k, p) => existing.get(k) === "candidate" && bandOf(p, bands) === "none"));
show("Claude 확신 → Jev 제외(≤low)", keysOf((k, p) => existing.get(k) === "auto" && bandOf(p, bands) === "none"));
show("Claude 목록에 없음 → Jev 확신(≥high)", keysOf((k, p) => !existing.has(k) && bandOf(p, bands) === "auto"));
