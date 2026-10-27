// AI 답이 「빈 답」(구조화 출력은 스키마를 통과했지만 자리 글만 든 답)인지 가리는 순수 판정과 한 번 다시 부르기.
// 실측: 작성지원 CLI 38회 중 1회가 headline·summary = "placeholder", 제안·인용 0건으로 왔음(2026-10-27). 좁게 — 실제 내용이 하나라도 있으면 빈 답이 아님.
import type { ChatResult } from "./chat.ts";
import type { WriterResult } from "./writer.ts";

/** 빈 답이면 다시 부르는 횟수(첫 호출 뒤 한 번만) */
export const DEGENERATE_RETRIES = 1;
/** 그래도 빈 답일 때 사용자에게 보일 글 */
export const DEGENERATE_MESSAGE = "AI 답이 비어 있습니다 — 잠시 뒤 다시 시도해 주세요.";

export class DegenerateAnswerError extends Error {}

/** 자리 글로 보는 낱말(정규화 뒤 — 소문자, 글자·숫자만) */
const PLACEHOLDER_WORDS = new Set(["placeholder", "placeholdertext", "todo", "tbd", "loremipsum", "loremipsumdolorsitamet"]);

/** 비었거나 자리 글뿐인 글인가: 공백·문장부호만(「...」「-」), 또는 정규화하면 자리 낱말 하나(대소문자·앞뒤 문장부호 무시) */
export function isPlaceholderText(s: string | null | undefined): boolean {
  if (s == null) return true;
  const core = s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  return core === "" || PLACEHOLDER_WORDS.has(core);
}

/** 작성지원 빈 답: headline·summary가 비었거나 자리 글이고, 제안·인용·월별 행·되묻기·보완 점검 행이 모두 없을 때만 */
export function isDegenerateWriter(r: WriterResult): boolean {
  if (!isPlaceholderText(r.headline) || !isPlaceholderText(r.summary)) return false;
  return r.suggestions.length === 0 && r.citations.length === 0 && !r.monthly_row && isPlaceholderText(r.need_input) && (r.followup ?? []).length === 0;
}

/** 질문 빈 답: answer가 비었거나 자리 글뿐 */
export function isDegenerateChat(r: ChatResult): boolean {
  return isPlaceholderText(r.answer);
}

/**
 * 한 번 부르고 빈 답이면 DEGENERATE_RETRIES번까지 다시 부름. 다시 부른 호출의 토큰은 usage에 합침(기록 한 줄에 전체 비용).
 * 끝내 빈 답이면 DegenerateAnswerError
 */
export async function retryIfDegenerate<C extends { usage: U }, U extends { input: number; output: number; cacheRead: number; cacheWrite: number; cacheWrite1h: number }>(
  call: () => Promise<C>,
  isBad: (c: C) => boolean,
): Promise<C> {
  const total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0 };
  for (let attempt = 0; ; attempt++) {
    const c = await call();
    total.input += c.usage.input;
    total.output += c.usage.output;
    total.cacheRead += c.usage.cacheRead;
    total.cacheWrite += c.usage.cacheWrite;
    total.cacheWrite1h += c.usage.cacheWrite1h;
    if (!isBad(c)) return { ...c, usage: { ...c.usage, ...total } };
    if (attempt >= DEGENERATE_RETRIES) throw new DegenerateAnswerError(DEGENERATE_MESSAGE);
    console.warn("AI 빈 답 — 한 번 다시 부름");
  }
}
