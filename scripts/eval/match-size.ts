// 과제 대응 매칭(참고자료 3단계 match_knowledge)의 규모 측정 — 모델을 부르지 않고, 운영 DB는 읽기만 한다.
// 사업별 매칭 후보 조각(수·글자·유형)과 한 번 묻는 묶음 수, 카드 × 묶음 = 호출 수, 요청 입력 크기(1자 = 1토큰 어림)와
// API light 단가 기준 비용 어림을 출력한다. 표본 실행(pnpm prep run --ai)을 승인받기 전에 규모를 알리려는 도구.
// 실행: node --conditions=react-server --env-file=.env.local scripts/eval/match-size.ts [--business BZ-1] [--doc <문서 id>]
import { createClient } from "@supabase/supabase-js";
import { loadBundleChunks } from "../../lib/ai/context.ts";
import { MATCH_GROUP_CHARS, matchCandidates, matchPrompt, matchShared, splitByBudget } from "../../lib/ai/match.ts";
import { LIGHT_MODEL_DEFAULT } from "../../lib/ai/models.ts";
import { estimateUsd } from "../../lib/ai/pricing.ts";
import { matchPrompts } from "../../lib/prompts/sets.ts";
import { fillFrom } from "../../lib/prompts/template.ts";

const args = process.argv.slice(2);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const onlyBusiness = value("--business");
const doc = value("--doc");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const { prompts } = matchPrompts();
const system = fillFrom(prompts, "system", "system");

const chunks = await loadBundleChunks(db);
const { data: cards, error } = await db.from("cards").select("id, eval_unit_id, data").eq("status", "active");
if (error) throw new Error(`cards: ${error.message}`);

/** 호출 하나가 내놓는 답 토큰 어림: 해당 조각 25건 × (key·근거 한 줄) ≈ 60토큰 — 가정이라 표본 실행 뒤 실측으로 바꿈 */
const OUT_TOKENS = 1_500;
const man = (n: number) => `${(n / 10_000).toFixed(1)}만`;

let calls = 0;
let inputTotal = 0;
let usdTotal = 0;
console.log(`사업별 매칭 후보(대응표 대상 유형, 규칙 범위) — 묶음 상한 ${man(MATCH_GROUP_CHARS)}자${doc ? ` · 문서 ${doc}만` : ""}`);
for (const unit of [...new Set((cards ?? []).map((c) => c.eval_unit_id as string))].sort()) {
  if (onlyBusiness && unit !== onlyBusiness) continue;
  const candidates = matchCandidates(chunks, unit, doc ? [doc] : undefined);
  const groups = splitByBudget(candidates);
  const unitCards = (cards ?? []).filter((c) => c.eval_unit_id === unit);
  const byType = new Map<string, { n: number; chars: number }>();
  for (const c of candidates) {
    const t = byType.get(c.unit_type) ?? { n: 0, chars: 0 };
    byType.set(c.unit_type, { n: t.n + 1, chars: t.chars + (c.text?.length ?? 0) });
  }
  console.log(`\n${unit} — 카드 ${unitCards.length}장 · 후보 조각 ${candidates.length}건 · 묶음 ${groups.length}개`);
  for (const [t, v] of [...byType].sort((a, b) => b[1].chars - a[1].chars)) console.log(`  ${t.padEnd(18)} ${String(v.n).padStart(4)}건 ${man(v.chars).padStart(8)}자`);
  groups.forEach((g, i) => {
    const shared = matchShared(prompts, unit, g).length;
    const perCard = unitCards.map((c) => matchPrompt(prompts, unit, c.data).length);
    const avgCard = perCard.length ? Math.round(perCard.reduce((a, b) => a + b, 0) / perCard.length) : 0;
    const maxCard = Math.max(0, ...perCard);
    const input = system.length + shared + maxCard;
    calls += unitCards.length;
    inputTotal += unitCards.length * (system.length + shared + avgCard);
    // 연속 호출 가정: 묶음의 첫 호출은 캐시 쓰기, 나머지는 캐시 읽기(5분 안에 이어 부를 때)
    const n = unitCards.length;
    const usd = n
      ? (estimateUsd(LIGHT_MODEL_DEFAULT, { input: avgCard * n, output: OUT_TOKENS * n, cacheWrite: shared + system.length, cacheRead: (shared + system.length) * (n - 1) }) ?? 0)
      : 0;
    usdTotal += usd;
    console.log(`  묶음 ${i + 1}: 조각 ${g.length}건 · 공유 글 ${man(shared)}자 · 카드 요약 평균 ${avgCard.toLocaleString()}자(최대 ${maxCard.toLocaleString()}) · 요청 최대 ${man(input)}토큰 · 호출 ${n}회 · 어림 $${usd.toFixed(2)}`);
  });
}
console.log(`\n합계: 호출 ${calls}회 · 입력 어림 ${man(inputTotal)}토큰(캐시 없이) · 답 어림 ${man(OUT_TOKENS * calls)}토큰 · API light(${LIGHT_MODEL_DEFAULT}) 비용 어림 $${usdTotal.toFixed(2)} — 캐시를 쓰고 연속 호출한다고 가정(CLI는 캐시가 이어지지 않아 입력을 그대로 다 씀)`);
