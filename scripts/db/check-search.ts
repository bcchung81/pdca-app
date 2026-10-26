// 적재 뒤 한국어 검색(PGroonga) 확인. 질의는 적재 때와 같은 정규화(foldForSearch)를 거칩니다.
//
//   pnpm db:check-search

import { createClient } from "@supabase/supabase-js";
import { buildSearchQuery } from "../../lib/knowledge/search-query.ts";

// 질의 → 상위 결과에 있어야 하는 조각(분석 §5-5·§7의 표본). mode all = 모든 낱말, any = 하나라도(점수 순)
const CASES: Array<{ query: string; mode?: "all" | "any"; filters?: Record<string, unknown>; expect: string }> = [
  { query: "조기개선 국수 산정", mode: "all", expect: "att3-2604/s1/Q01" },
  { query: "5G 특화망 테스트베드", mode: "all", filters: { businesses: ["BZ-1"] }, expect: "att3-2604/s4/Q01" },
  { query: "자격검정 PCSI", mode: "all", filters: { businesses: ["BZ-2"] }, expect: "mid25-biz/BZ-2/13" },
  // 카드 문장으로 지적 찾기: 긴 실사 답변이 점수를 가져가므로 지적 유형으로 거름
  {
    query: "자격검정 취득교육 고객만족도 목표 미달성 원인분석",
    mode: "any",
    filters: { businesses: ["BZ-2"], unit_types: ["finding_row", "evaluator_comment"] },
    expect: "mid25-biz/BZ-2/13",
  },
  { query: "안테나 자동 판독 사후 검증 시간", mode: "all", expect: "mid25-biz/BZ-1/03" },
  { query: "AI･XR 스튜디오", mode: "all", expect: "att3-2604/s6/Q01" }, // 가운뎃점 변종도 같은 결과
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SECRET_KEY가 필요합니다(.env.local)");
  const db = createClient(url, key, { auth: { persistSession: false } });
  let failed = 0;
  for (const c of CASES) {
    const { data, error } = await db.rpc("search_knowledge", { query: buildSearchQuery(c.query, c.mode), max_rows: 5, ...c.filters });
    if (error) {
      failed += 1;
      console.log(`실패 "${c.query}": ${error.message}`);
      continue;
    }
    const keys = (data as Array<{ chunk_key: string; score: number }>).map((r) => `${r.chunk_key}(${Math.round(r.score)})`);
    const ok = !c.expect || keys.some((k) => k.startsWith(c.expect));
    if (!ok) failed += 1;
    console.log(`${ok ? "통과" : "실패"} "${c.query}" → ${keys.join(", ") || "결과 없음"}`);
  }
  if (failed) process.exitCode = 1;
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exitCode = 1;
});
