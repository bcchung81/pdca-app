// 「통째로 넣기 대 선별」 AI 비용 시뮬레이터(순수 계산 — AI 호출·DB 접속 없음).
// 요청 한 건의 토큰 구성(공유 앞부분·카드별 앞부분·캐시 안 하는 꼬리·출력)과 캐시 상태 비율로 연 비용을 냅니다.
// 단가는 pricing.ts의 pricingFor를 그대로 씁니다(1시간 캐시 쓰기는 입력 단가 ×2 — estimateUsd와 같은 규칙).
import { pricingFor } from "./pricing.ts";

export type CacheTtl = "5m" | "1h";
export type CacheState = "cold" | "warmShared" | "warmCard";

export interface RequestProfile {
  /** 같은 사업·같은 기능이면 카드와 무관하게 글자까지 같은 앞부분(시스템 + 공유 지식) */
  sharedTokens: number;
  /** 카드마다 다른 부분 중 캐시 표지를 다는 몫. 같은 카드 재요청일 때만 적중 */
  cardTokens: number;
  /** 캐시하지 않는 꼬리(요청 글·카드 본문) */
  tailTokens: number;
  outputTokens: number;
}

export interface CacheMix {
  cold: number;
  warmShared: number;
  warmCard: number;
}

export interface Scenario {
  cards: number;
  requestsPerCardMonth: number;
  /** 기본 12 */
  months?: number;
  mix: CacheMix;
}

/** 시뮬레이션 기준 모델(단가표에서 가져옴) */
export const SIM_MODEL = "claude-sonnet-5-5";

function rates() {
  const usd = pricingFor(SIM_MODEL);
  if (!usd) throw new Error(`단가표에 ${SIM_MODEL}이 없습니다`);
  return usd;
}

/** 요청 한 건의 비용(USD) */
export function requestCost(profile: RequestProfile, state: CacheState, ttl: CacheTtl = "5m"): number {
  const r = rates();
  const write = ttl === "1h" ? r.input * 2 : r.cacheWrite;
  const sharedRate = state === "cold" ? write : r.cacheRead;
  const cardRate = state === "warmCard" ? r.cacheRead : write;
  return (
    (profile.sharedTokens * sharedRate +
      profile.cardTokens * cardRate +
      profile.tailTokens * r.input +
      profile.outputTokens * r.output) /
    1_000_000
  );
}

function checkMix(mix: CacheMix): void {
  const parts = [mix.cold, mix.warmShared, mix.warmCard];
  if (parts.some((x) => !Number.isFinite(x) || x < 0)) throw new Error("캐시 상태 비율은 0 이상의 수여야 합니다");
  const sum = parts[0] + parts[1] + parts[2];
  if (Math.abs(sum - 1) > 1e-9) throw new Error(`캐시 상태 비율의 합이 1이 아닙니다(${sum})`);
}

export interface AnnualCost {
  requests: number;
  usd: number;
  perRequest: number;
}

/** 시나리오의 연(months) 비용 */
export function annualCost(profile: RequestProfile, scenario: Scenario, ttl: CacheTtl = "5m"): AnnualCost {
  checkMix(scenario.mix);
  const perRequest =
    scenario.mix.cold * requestCost(profile, "cold", ttl) +
    scenario.mix.warmShared * requestCost(profile, "warmShared", ttl) +
    scenario.mix.warmCard * requestCost(profile, "warmCard", ttl);
  const requests = scenario.cards * scenario.requestsPerCardMonth * (scenario.months ?? 12);
  return { requests, usd: requests * perRequest, perRequest };
}

export interface Comparison {
  full: AnnualCost;
  selected: AnnualCost;
  /** 선별 − 통째로 넣기(음수면 선별이 쌈) */
  diffUsd: number;
  /** 통째로 넣기 대비 %(0이면 0) */
  diffPct: number;
}

export function compare(full: RequestProfile, selected: RequestProfile, scenario: Scenario, ttl: CacheTtl = "5m"): Comparison {
  const f = annualCost(full, scenario, ttl);
  const s = annualCost(selected, scenario, ttl);
  const diffUsd = s.usd - f.usd;
  return { full: f, selected: s, diffUsd, diffPct: f.usd === 0 ? 0 : (diffUsd / f.usd) * 100 };
}

/**
 * 도착률로 캐시 상태 비율을 어림합니다.
 * 가정: 요청은 포아송 도착, 직전 요청이 TTL 안에 있었을 확률 p = 1 − exp(−λ·TTL).
 * - 같은 카드가 먼저: warmCard = p(λ = 같은 카드 시간당 요청 수)
 * - 남은 몫 중 같은 사업의 다른 카드 요청(λ = 같은 앞부분 요청 − 같은 카드 요청, 0 밑이면 0)이 TTL 안에 있었으면 warmShared
 * - 나머지는 cold. (같은 카드 요청도 공유 앞부분을 데우지만 warmCard가 이미 먼저 셈해 중복하지 않음)
 */
export function mixFromArrivals(a: {
  requestsPerHourSamePrefix: number;
  requestsPerHourSameCard: number;
  ttlMinutes: number;
}): CacheMix {
  const hours = a.ttlMinutes / 60;
  const within = (lambda: number) => (lambda > 0 && hours > 0 ? 1 - Math.exp(-lambda * hours) : 0);
  const warmCard = within(a.requestsPerHourSameCard);
  const others = Math.max(a.requestsPerHourSamePrefix - a.requestsPerHourSameCard, 0);
  const warmShared = (1 - warmCard) * within(others);
  return { cold: 1 - warmCard - warmShared, warmShared, warmCard };
}
