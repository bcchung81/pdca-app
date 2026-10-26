// Jev 2차 실험(docs/plan/참고자료-진행현황.md 「Jev 2차 실험 — 사전 기록」): 여러 과제 × 질문 문구 변형(strict·loose).
// 운영 DB는 읽기만 하고(아무것도 쓰지 않음), Jev에는 각 과제의 요약과 그 사업 매칭 후보 조각 글을 보낸다(외부 서비스 전송 — 사용자 승인 뒤에만).
// 사전에 적어 둔 결정 규칙(evaluateRule)과 예측 네 개를 결과에 자동으로 대조한다.
// 실행: node --conditions=react-server --env-file=.env.local scripts/eval/jev-match-batch.ts [--dry-run]
import { createClient } from "@supabase/supabase-js";
import { loadBundleChunks } from "../../lib/ai/context.ts";
import { matchCandidates } from "../../lib/ai/match.ts";
import {
  DEFAULT_BANDS,
  type CardComparison,
  type WordingVariant,
  bandCounts,
  cardComparison,
  evaluateRule,
  scoreChunks,
  summarizeBands,
  typesafeCaller,
} from "../../lib/ai/typesafe.ts";

/** 「기본 문구」로 결정 규칙을 재는 5장(애매 후보가 많은 4장 + 적은 1장) */
const RULE_CARDS = ["주요사업1/7-나", "주요사업1/9-가", "주요사업2/1-다", "주요사업3/1-다", "주요사업1/4-가"];
/** 1차 실험 과제 — 재현성(같은 문구로 다시)과 문구 변형 민감도를 봄. 결정 규칙 합계에는 넣지 않음 */
const FIRST_CARD = "주요사업3/5-가";
const dry = process.argv.includes("--dry-run");
const apiKey = process.env.TYPESAFE_API_KEY;
if (!apiKey && !dry) throw new Error("TYPESAFE_API_KEY가 없습니다(.env.local)");
const call = typesafeCaller({ apiKey: apiKey ?? "", model: process.env.TYPESAFE_MODEL ?? "jev-latest" });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const chunks = await loadBundleChunks(db);

interface Run {
  card: string;
  variant: WordingVariant;
  cmp: CardComparison;
  summary: ReturnType<typeof summarizeBands>;
  claude: { auto: number; candidate: number };
  rule: { keys: string[]; ps: number[]; missing: number };
  tokens: number;
  secs: number;
}
const runs: Run[] = [];

async function runCard(cardId: string, variant: WordingVariant) {
  const { data: card, error } = await db.from("cards").select("id, eval_unit_id, data").eq("id", cardId).single();
  if (error || !card) throw new Error(`카드를 못 읽음 ${cardId}: ${error?.message}`);
  const candidates = matchCandidates(chunks, card.eval_unit_id);
  const { data: scope } = await db.from("card_knowledge_scope").select("chunk_key, status, method").eq("card_id", cardId);
  const existing = new Map<string, "auto" | "candidate">((scope ?? []).filter((r) => r.method === "ai").map((r) => [r.chunk_key as string, r.status as "auto" | "candidate"]));
  const ruleKeys = (scope ?? []).filter((r) => r.method === "rule" && (r.status === "auto" || r.status === "confirmed")).map((r) => r.chunk_key as string);
  if (dry) {
    console.log(`[dry] ${cardId} ${variant}: 후보 ${candidates.length}건 · 요청 ${Math.ceil(candidates.length / 25)}회 · Claude 확신 ${[...existing.values()].filter((s) => s === "auto").length} 애매 ${[...existing.values()].filter((s) => s === "candidate").length} · 규칙 연결 ${ruleKeys.length}`);
    return;
  }
  const t0 = Date.now();
  const r = await scoreChunks(call, card.data, candidates, { batchSize: 25, variant });
  const secs = (Date.now() - t0) / 1000;
  const jev = new Map(r.scores.map((s) => [s.chunkKey, s.p]));
  const cmp = cardComparison(jev, existing);
  const summary = summarizeBands(r.scores.map((s) => s.p));
  const rc = bandCounts(jev, ruleKeys);
  const ps = ruleKeys.filter((k) => jev.has(k)).map((k) => jev.get(k)!);
  const claude = { auto: [...existing.values()].filter((s) => s === "auto").length, candidate: [...existing.values()].filter((s) => s === "candidate").length };
  runs.push({ card: cardId, variant, cmp, summary, claude, rule: { keys: ruleKeys, ps, missing: rc.missing }, tokens: r.usage.input_tokens + r.usage.output_tokens, secs });
  console.log(
    `${cardId.padEnd(15)} ${variant.padEnd(6)} 후보 ${String(candidates.length).padStart(3)} | Jev 확신 ${String(summary.auto).padStart(2)} 애매 ${String(summary.candidate).padStart(2)} 제외 ${String(summary.none).padStart(3)} (애매 ${(summary.ambiguousShare * 100).toFixed(0)}%) | Claude 확신 ${claude.auto}→Jev제외 ${cmp.claudeAutoNone} · Claude 애매 ${claude.candidate}→Jev제외 ${cmp.claudeCandNone} | 규칙연결 ${ruleKeys.length ? ps.map((p) => p.toFixed(2)).join("/") : "-"} | ${secs.toFixed(1)}초`,
  );
}

console.log(`구간 확신≥${DEFAULT_BANDS.high} 제외≤${DEFAULT_BANDS.low}${dry ? " (dry-run: 전송 없음)" : ""}\n`);
for (const c of RULE_CARDS) await runCard(c, "strict");
await runCard(FIRST_CARD, "strict");
for (const c of [...RULE_CARDS, FIRST_CARD]) await runCard(c, "loose");
if (dry) process.exit(0);

// ── 결정 규칙(기본 문구, 5장 합계)
const strict = runs.filter((r) => r.variant === "strict" && RULE_CARDS.includes(r.card));
const rule = evaluateRule(strict.map((r) => r.cmp));
console.log(`\n■ 결정 규칙(기본 문구 5장 합계): Claude 확신을 Jev가 제외 ${rule.autoDropped}건(허용 ≤1) · Claude 후보 ${rule.candTotal}건 중 제외 ${rule.candDropped}건 = ${(rule.candDropShare * 100).toFixed(0)}%(기준 ≥30%) → ${rule.pass ? "통과 — 2차 걸러내기·정렬로 검토" : "미달 — 접음"}`);
for (const why of rule.reasons) console.log(`   · ${why}`);

// ── 예측 대조
const cands = rule.candDropShare;
console.log("\n■ 사전 예측 대조");
console.log(`(a) 후보 제외율 20~40% 예측: 실제 ${(cands * 100).toFixed(0)}% → ${cands >= 0.2 && cands <= 0.4 ? "맞음" : "빗나감"}`);
console.log(`(b) Claude 확신 제외 0~1건 예측: 실제 ${rule.autoDropped}건 → ${rule.autoDropped <= 1 ? "맞음" : "빗나감"}`);
const autoSum = (v: WordingVariant) => runs.filter((r) => r.variant === v && RULE_CARDS.includes(r.card)).reduce((a, r) => a + r.summary.auto, 0);
const sA = autoSum("strict");
const lA = autoSum("loose");
const looseDropped = runs.filter((r) => r.variant === "loose" && RULE_CARDS.includes(r.card)).reduce((a, r) => a + r.cmp.claudeAutoNone, 0);
console.log(`(c) 완화 문구에서 확신이 +50% 이상(그리고 Claude 확신 제외 0~1건) 예측: 확신 ${sA}→${lA}(${sA ? `${(((lA - sA) / sA) * 100).toFixed(0)}%` : "n/a"}), Claude 확신 제외 ${looseDropped}건 → ${sA && (lA - sA) / sA >= 0.5 && looseDropped <= 1 ? "맞음" : "빗나감"}`);
for (const v of ["strict", "loose"] as const) {
  const ps = runs.filter((r) => r.variant === v).flatMap((r) => r.rule.ps);
  const hit = ps.filter((p) => p >= 0.5).length;
  console.log(`(d) 규칙 연결 조각 p≥0.5가 4건 이상 예측(${v}): ${hit}/${ps.length}건${runs.filter((r) => r.variant === v).some((r) => r.rule.missing) ? " (후보 집합에 없는 조각 있음)" : ""} → ${hit >= 4 ? "맞음" : "빗나감"}`);
}

// ── 재현성·문구 민감도(1차 과제)
const first = (v: WordingVariant) => runs.find((r) => r.card === FIRST_CARD && r.variant === v);
const f1 = first("strict");
const f2 = first("loose");
if (f1 && f2) {
  console.log(`\n■ 1차 과제 ${FIRST_CARD}: 1차 실험(기본 문구) 확신 7·애매 26·제외 198 vs 이번 기본 ${f1.summary.auto}·${f1.summary.candidate}·${f1.summary.none} → ${f1.summary.auto === 7 && f1.summary.candidate === 26 ? "같은 결과(재현됨)" : "달라짐(재현 안 됨 — 확률이 실행마다 흔들림)"}; 완화 ${f2.summary.auto}·${f2.summary.candidate}·${f2.summary.none}`);
}
const tokens = runs.reduce((a, r) => a + r.tokens, 0);
console.log(`\n실행 ${runs.length}회 · 토큰 ${tokens.toLocaleString()} · ${runs.reduce((a, r) => a + r.secs, 0).toFixed(0)}초`);
