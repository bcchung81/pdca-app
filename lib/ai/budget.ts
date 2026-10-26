// AI 요청 입력 크기 — 자르지 않고, 넘치면 멈춰 알림(참고자료 설계 §4.3·§7, 순수 함수).
// 글자→토큰은 0단계 측정(docs/reference-materials.md §11: 관리계획 0.970·전년 보고서 0.998·실사 0.919 토큰/자)을 올려 1자 = 1토큰으로 셈.

/** 1자당 토큰(측정 최댓값 0.998을 올림 — 모자라게 세지 않음) */
export const TOKENS_PER_CHAR = 1;
/**
 * 한 요청 입력 상한(결정 D7 — 40만에서 시작해 실측으로 조정). 2단계(규칙 범위 전부) 뒤 59장 실측(scripts/eval/prompt-size.ts, 2026-09-29):
 * 경평 집필 첫 요청 33.7만~38.5만 자라 자동 고치기(앞 초안을 다시 보냄)·구성안 글·첨부가 붙으면 40만을 넘으므로 50만(모델 입력 한도 100만의 절반)으로 올림.
 * 실제 토큰은 글자의 약 0.95배(CLI usage 실측 34.4만 토큰/36.3만 자)라 어림은 여전히 넉넉한 쪽
 */
export const INPUT_BUDGET = 500_000;

export const estimateTokens = (chars: number) => Math.ceil(chars * TOKENS_PER_CHAR);

export class BudgetError extends Error {}

const man = (n: number) => `${(n / 10_000).toFixed(1)}만`;

/**
 * 시스템 프롬프트 + 요청 글이 상한을 넘으면 BudgetError. files는 안내용(요청 글에 이미 들어 있음) — 큰 자료부터 셋의 이름을 알림.
 * 근거 메모(6단계)가 생기기 전까지는 사람이 자료를 빼는 것이 유일한 방법
 */
export function checkBudget(system: string, prompt: string, files: Array<{ name: string; text: string }> = []): void {
  const tokens = estimateTokens(system.length + prompt.length);
  if (tokens <= INPUT_BUDGET) return;
  const big = [...files]
    .sort((a, b) => b.text.length - a.text.length)
    .slice(0, 3)
    .map((f) => `「${f.name}」(${man(f.text.length)} 자)`);
  throw new BudgetError(
    `근거 자료가 너무 많습니다 — 약 ${man(tokens)} 토큰으로 한 번에 넣을 수 있는 ${man(INPUT_BUDGET)} 토큰을 넘어, 자르지 않고 멈췄습니다.${big.length ? ` 큰 자료부터 빼 주세요: ${big.join(", ")}` : ""}`,
  );
}
