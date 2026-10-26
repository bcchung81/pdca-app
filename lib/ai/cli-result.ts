// Claude Code CLI 결과 JSON 읽기(순수). cli.ts가 쓰고, 테스트가 직접 부릅니다.


export class CliUnavailableError extends Error {}
export class CliFailedError extends Error {
  detail?: string;
  /** 실패 종류(본문 없음 — ai_requests.error에 남겨도 되는 것): CLI subtype·턴 수·중단 이유 */
  meta?: string;
  constructor(message: string, detail?: string, meta?: string) {
    super(message);
    this.detail = detail;
    this.meta = meta;
  }
}

export interface CliResult {
  output: unknown;
  model: string;
  /** cacheWrite1h = 캐시 쓰기 중 1시간 캐시 몫(CLI가 알려 줄 때만, 없으면 0) */
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number; cacheWrite1h: number };
  costUsd: number | null;
}

/** CLI 결과 JSON(--output-format json) 중 이 앱이 읽는 칸 */
interface CliJson {
  is_error?: boolean;
  subtype?: string;
  result?: unknown;
  num_turns?: number;
  stop_reason?: string;
  structured_output?: unknown;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; cache_creation?: { ephemeral_1h_input_tokens?: number } };
  modelUsage?: Record<string, unknown>;
  total_cost_usd?: unknown;
}

/** CLI의 결과 JSON(--output-format json) → 구조화 출력·모델·토큰. 순수 함수(테스트용으로 따로 둠) */
export function readCliResult(stdout: string, fallbackModel: string): CliResult {
  let d: CliJson | null;
  try {
    d = JSON.parse(stdout.trim());
  } catch {
    throw new CliFailedError("AI 답을 읽지 못했습니다.", stdout.slice(0, 500));
  }
  if (d?.is_error || d?.subtype !== "success") {
    const text = String(d?.result ?? d?.subtype ?? "");
    if (/log ?in|authenticat|credential|oauth/i.test(text)) throw new CliUnavailableError("서버의 Claude Code가 로그인되어 있지 않습니다. 관리자에게 알려 주세요(서버에서 claude 로그인).");
    // 「You've hit your session limit · resets 3:10pm」 같은 구독 세션 한도도 사용량 한도(2026-10-17 — 예전에는 「답을 끝내지 못했습니다」로 잘못 안내)
    if (/usage limit|rate limit|limit reached|session limit|hit your [\w ]*limit|overloaded/i.test(text)) throw new CliFailedError("AI 사용량 한도에 걸렸습니다. 잠시 뒤 다시 시도해 주세요.", text.slice(0, 500));
    throw new CliFailedError("AI가 답을 끝내지 못했습니다. 요청을 좁혀 다시 시도해 주세요.", text.slice(0, 500), `subtype=${d?.subtype ?? "-"} turns=${d?.num_turns ?? "-"} stop=${d?.stop_reason ?? "-"}`);
  }
  if (d.structured_output == null) throw new CliFailedError("AI 답의 형식을 읽지 못했습니다.", String(d.result ?? "").slice(0, 500));
  const u = d.usage ?? {};
  const model = Object.keys(d.modelUsage ?? {})[0] ?? fallbackModel;
  return {
    output: d.structured_output,
    model,
    // API 응답과 같은 뜻으로: input = 캐시 밖 입력만, 캐시 쓰기는 cacheWrite로 따로(2026-09-28 — 예전에는 input에 캐시 쓰기를 더해 비용 어림에서 두 번 셈).
    // 이 변경 전 기록(cache_write_tokens 없음)은 input에 캐시 쓰기가 들어 있음
    usage: { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, cacheWrite1h: u.cache_creation?.ephemeral_1h_input_tokens ?? 0 },
    costUsd: typeof d.total_cost_usd === "number" ? d.total_cost_usd : null,
  };
}
