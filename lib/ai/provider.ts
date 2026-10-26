/**
 * AI를 어디로 부를지 정하는 순수 로직(lib/ai/run.ts에서 씀).
 * "server-only"를 안 걸어 둔 별도 파일 — run.ts는 server-only라 일반 node --test로 못 불러오므로 이 파일을 테스트합니다.
 */

/**
 * - api: Claude API(ANTHROPIC_API_KEY) — 운영
 * - cli: 이 서버에 로그인된 Claude Code CLI — API 키를 받기 전 임시(로컬·사내 서버). Vercel에는 CLI가 없음
 * - codex: 이 PC에 로그인된 Codex CLI(OpenAI 모델) — **평가 전용**(경평 초안 모델 비교, lib/ai/codex-cli.ts). AI_PROVIDER=codex로 적을 때만 고름
 * AI_PROVIDER로 정하고, 비우면 API 키가 있으면 api, 없으면 cli.
 * Vercel(process.env.VERCEL)에서는 AI_PROVIDER·API 키 유무와 무관하게 늘 api —
 * Vercel에는 Claude Code CLI가 없어 spawn이 알 수 없는 오류로 실패하므로, 키가 없으면 structuredApi가
 * 「AI 키(ANTHROPIC_API_KEY)가 설정되지 않았습니다」로 분명히 실패하게 함
 */
export type AiProvider = "api" | "cli" | "codex";

export function aiProviderFrom(env: Record<string, string | undefined>): AiProvider {
  if (env.VERCEL) return "api";
  const p = (env.AI_PROVIDER ?? "").trim().toLowerCase();
  if (p === "api" || p === "cli" || p === "codex") return p;
  return env.ANTHROPIC_API_KEY ? "api" : "cli";
}

/**
 * Anthropic이 크레딧(잔액) 부족으로 거절한 오류 글인가(400 invalid_request_error 「credit balance is too low」).
 * 이 오류는 요청·첨부가 잘못된 게 아니라 결제 문제라 사용자에게 「첨부를 확인하라」고 하지 않고 「크레딧 부족」으로 알림(2026-09-30 API 키 시험에서 겪음)
 */
export function isCreditBalanceError(message: string): boolean {
  return /credit balance is too low/i.test(message);
}

/** 쓸 API 키 목록 — 기본 키(ANTHROPIC_API_KEY)가 앞, 예비 키(ANTHROPIC_API_KEY_FALLBACK)가 뒤. 공백 제거, 빈 값·같은 키 중복은 뺌 */
export function apiKeysFrom(env: Record<string, string | undefined>): string[] {
  const keys = [env.ANTHROPIC_API_KEY, env.ANTHROPIC_API_KEY_FALLBACK].map((k) => (k ?? "").trim()).filter(Boolean);
  return [...new Set(keys)];
}

/** 시도 순서 — 크레딧 소진 표시가 없는 키를 원래 순서로 먼저, 표시된 키를 뒤에(모두 소진이면 처음부터 다시 시도하게 되어 충전을 알아챔) */
export function keyOrder(keys: readonly string[], exhausted: ReadonlySet<string>): string[] {
  return [...keys.filter((k) => !exhausted.has(k)), ...keys.filter((k) => exhausted.has(k))];
}
