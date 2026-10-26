// 「통째로 넣기 대 선별」 연간 AI 비용 시나리오 표(순수 계산 — AI·DB 안 씀). lib/ai/cost-sim.ts를 씁니다.
// 기본 프로필은 2026-10-07 CLI 실측을 API 단가로 환산한 추정(출처 docs/consulting/AI-시스템-설명자료.md 7.1·7.2, git 밖)이고
// 선별 방식 값은 설계 어림(실측 전)입니다. --profiles <json>은 {"full":{"writer":{…},"chat":{…}},"selected":{…}} 모양으로 덮어씁니다.
// 실행: node scripts/eval/cost-sim.ts [--profiles <json>] [--ttl 5m|1h] [--json <출력 경로>]
import { readFileSync, writeFileSync } from "node:fs";
import { type CacheMix, type CacheTtl, type RequestProfile, annualCost, compare, requestCost } from "../../lib/ai/cost-sim.ts";

interface ProfileSet {
  writer: RequestProfile;
  chat: RequestProfile;
}
interface Profiles {
  full: ProfileSet;
  selected: ProfileSet;
}

const DEFAULTS: Profiles = {
  full: {
    writer: { sharedTokens: 271000, cardTokens: 0, tailTokens: 10000, outputTokens: 26646 },
    chat: { sharedTokens: 254000, cardTokens: 0, tailTokens: 10000, outputTokens: 15542 },
  },
  selected: {
    writer: { sharedTokens: 45000, cardTokens: 40000, tailTokens: 10000, outputTokens: 26646 },
    chat: { sharedTokens: 45000, cardTokens: 40000, tailTokens: 10000, outputTokens: 15542 },
  },
};

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const ttlArg = opt("--ttl") ?? "5m";
if (ttlArg !== "5m" && ttlArg !== "1h") throw new Error("--ttl은 5m 또는 1h");
const ttl: CacheTtl = ttlArg;
const profilesPath = opt("--profiles");
const profiles: Profiles = profilesPath ? JSON.parse(readFileSync(profilesPath, "utf8")) : DEFAULTS;

const CARDS = 102;
const usd2 = (n: number) => `$${n.toFixed(2)}`;
const usd0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

console.log(`# 통째로 넣기 대 선별 — 연간 AI 비용 시뮬레이션 (카드 ${CARDS}장, 12개월, 캐시 ${ttl}, Sonnet 5.5 단가)`);
console.log(profilesPath ? `프로필: ${profilesPath}` : "프로필: 기본값(CLI 실측 환산 추정 + 선별 설계 어림)");

console.log("\n## 요청당 비용");
console.log("| 캐시 상태 | 작성지원 통째로 | 작성지원 선별 | 질문 통째로 | 질문 선별 |");
console.log("|---|---|---|---|---|");
for (const [state, label] of [["cold", "cold(식음)"], ["warmShared", "warmShared(같은 사업)"], ["warmCard", "warmCard(같은 카드)"]] as const) {
  console.log(
    `| ${label} | ${usd2(requestCost(profiles.full.writer, state, ttl))} | ${usd2(requestCost(profiles.selected.writer, state, ttl))} | ${usd2(requestCost(profiles.full.chat, state, ttl))} | ${usd2(requestCost(profiles.selected.chat, state, ttl))} |`,
  );
}

console.log("\n## 연간 비용 시나리오");
console.log("| 과제당 월 요청 | 식은 비율 | 기능 | 통째로 넣기 | 선별 | 차이 | 차이(%) |");
console.log("|---|---|---|---|---|---|---|");
const rows: unknown[] = [];
for (const rpm of [2, 5, 10]) {
  for (const coldShare of [0.8, 0.5]) {
    const mix: CacheMix = { cold: coldShare, warmShared: 0, warmCard: 1 - coldShare };
    const sc = { cards: CARDS, requestsPerCardMonth: rpm, mix };
    const w = compare(profiles.full.writer, profiles.selected.writer, sc, ttl);
    const c = compare(profiles.full.chat, profiles.selected.chat, sc, ttl);
    // 대화형 합계: 작성지원·질문을 반반 섞은 요청(각 요청 수의 절반씩)
    const half = { ...sc, requestsPerCardMonth: rpm / 2 };
    const fullSum = annualCost(profiles.full.writer, half, ttl).usd + annualCost(profiles.full.chat, half, ttl).usd;
    const selSum = annualCost(profiles.selected.writer, half, ttl).usd + annualCost(profiles.selected.chat, half, ttl).usd;
    const mixed = { full: fullSum, selected: selSum, diffUsd: selSum - fullSum, diffPct: fullSum === 0 ? 0 : ((selSum - fullSum) / fullSum) * 100 };
    const line = (name: string, r: { full: number; selected: number; diffUsd: number; diffPct: number }) =>
      console.log(`| ${rpm}회 | ${coldShare * 100}% | ${name} | ${usd0(r.full)} | ${usd0(r.selected)} | ${usd0(r.diffUsd)} | ${pct(r.diffPct)} |`);
    line("작성지원", { full: w.full.usd, selected: w.selected.usd, diffUsd: w.diffUsd, diffPct: w.diffPct });
    line("질문", { full: c.full.usd, selected: c.selected.usd, diffUsd: c.diffUsd, diffPct: c.diffPct });
    line("대화형 합계(반반)", mixed);
    rows.push({ requestsPerCardMonth: rpm, coldShare, writer: w, chat: c, mixed });
  }
}

const jsonPath = opt("--json");
if (jsonPath) {
  writeFileSync(jsonPath, JSON.stringify({ ttl, cards: CARDS, profiles, rows }, null, 2));
  console.log(`\nJSON 저장: ${jsonPath}`);
}
