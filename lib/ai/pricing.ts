// AI 사용량 비용 어림(순수). 관리자 「AI 사용량」 화면이 씁니다.
// 단가는 docs.claude.com 요금 문서(2026-09-28 확인, USD/100만 토큰) 기준입니다. 부가세 별도, 실제 청구와 다를 수 있습니다.
// 캐시 쓰기 단가는 5분 캐시(기본) 몫이고, 1시간 캐시 몫은 입력 단가의 2배로 따로 셈합니다.

export interface Usd {
  input: number;
  output: number;
  /** 캐시 쓰기(5분) */ cacheWrite: number;
  cacheRead: number;
}

/** 모델 이름(정규화한 접두) → 단가. 긴 이름부터 대조해 가장 긴 접두로 찾습니다(예: opus-5-5가 opus-5보다 먼저) */
const PRICING: Array<{ prefix: string; usd: Usd }> = [
  { prefix: "claude-opus-5-5", usd: { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 } },
  { prefix: "claude-opus-5", usd: { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 } },
  { prefix: "claude-sonnet-5", usd: { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 } },
  { prefix: "claude-haiku-4-5", usd: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 } },
  { prefix: "claude-fable-5-1", usd: { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 0.25 } },
].sort((a, b) => b.prefix.length - a.prefix.length);

/**
 * ai_requests.model 값 → 단가표 이름으로 정규화.
 * - 앞의 "cli/" 걷기(예: "cli/claude-opus-5-5")
 * - 뒤의 " · Claude Code" 같은 표시용 꼬리 걷기(modelLabel이 붙임)
 * - 날짜 꼬리(예: "-20260315", "-2026-03-15") 걷기 — API가 돌려주는 model에 붙을 수 있음
 */
function normalizeModel(model: string): string {
  let m = model.trim();
  m = m.replace(/^cli\//, "");
  m = m.replace(/\s*·.*$/, "");
  m = m.replace(/-\d{4}-?\d{2}-?\d{2}$/, "");
  return m.trim();
}

/** 단가표에서 모델을 찾음(가장 긴 접두 일치). 모르는 모델은 null */
export function pricingFor(model: string | null | undefined): Usd | null {
  if (!model) return null;
  const norm = normalizeModel(model);
  for (const p of PRICING) if (norm === p.prefix || norm.startsWith(`${p.prefix}-`)) return p.usd;
  return null;
}

/** 이 기록이 CLI(구독)로 돈 것인지 — 화면에서 「API 환산」임을 알리는 데 씀(비용은 실제로 청구되지 않음). 평가 전용 Codex(「codex/」·「· Codex」)도 구독 */
export function isCliModel(model: string | null | undefined): boolean {
  if (!model) return false;
  return model.startsWith("cli/") || model.includes("Claude Code") || model.startsWith("codex/") || model.includes("· Codex");
}

/** 토큰 사용량 → 추정 USD(모르는 모델이면 null). cacheWrite1h는 cacheWrite(전체) 중 1시간 캐시 몫(입력 단가의 2배), 나머지는 5분 단가 */
export function estimateUsd(
  model: string | null | undefined,
  tokens: { input: number; output: number; cacheRead?: number; cacheWrite?: number; cacheWrite1h?: number },
): number | null {
  const usd = pricingFor(model);
  if (!usd) return null;
  const perM = (n: number, rate: number) => (n / 1_000_000) * rate;
  const cacheWrite = tokens.cacheWrite ?? 0;
  const write1h = Math.min(tokens.cacheWrite1h ?? 0, cacheWrite);
  const write5m = cacheWrite - write1h;
  return (
    perM(tokens.input, usd.input) +
    perM(tokens.output, usd.output) +
    perM(tokens.cacheRead ?? 0, usd.cacheRead) +
    perM(write5m, usd.cacheWrite) +
    perM(write1h, usd.input * 2)
  );
}

/** ai_requests 삽입용 토큰 칸 이름으로 매핑 */
export function aiUsageColumns(u: { input: number; output: number; cacheRead: number; cacheWrite: number; cacheWrite1h: number }) {
  return {
    input_tokens: u.input,
    output_tokens: u.output,
    cache_read_tokens: u.cacheRead,
    cache_write_tokens: u.cacheWrite,
    cache_write_1h_tokens: u.cacheWrite1h,
  };
}
