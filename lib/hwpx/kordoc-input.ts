// 개조식 초안(md-profile) → kordoc 입력 마크다운. report-harness scripts/to_kordoc_input.py를 옮긴 것(R087, 결정론).
// · 첫 줄 제목 → `# 제목`(평문이면 제목 박스·24pt가 안 붙음, R010)
// · 발신 줄 `< '26. 9. 6.(일), … >` → `<right>…</right>`(안 싸면 왼쪽으로 떨어짐, R012)
// · `□ ` → `- ` / `ㅇ ` → `  - ` / `- ` → `    - `(리터럴 기호를 두면 하위 대시가 상위 부호로 평탄화)
// · 표·※·＊ 줄은 그대로. ```text 인용 블록 안쪽 줄은 보이지 않는 표식(U+2060)을 붙여 넘김
// 그림 마커(도해:)는 이 앱의 보고서 블록에 없어 옮기지 않았습니다.

const SENDING = /^<\s*'?\d.*>$/;
const TABLE = /^\s*\|/;
const DEPTH: Array<[string, string]> = [
  ["□ ", "- "],
  ["ㅇ ", "  - "],
  ["○ ", "  - "],
];
const DASH = /^-\s+/;
const FENCE = /^\s*```/;
export const QUOTE_MARK = "⁠";

/** kordoc 4.15.3 줄 나눔 흉내(simulateWrap)의 줄 끝 금칙 글자(FORBID_END) */
const LINE_END_BANNED = new Set([..."$([{£¥〈《「『【〔₩"]);
/** 줄 끝 금칙 글자가 이 수보다 길게 이어지면 이 수마다 끊음(실제 초안 117건의 최대 연속은 2자) */
export const LINE_END_RUN_MAX = 8;
const JOINER = "\u2060";

/**
 * 줄 끝 금칙 글자 연속 끊기(2026-11-18 웹 취약점 점검 후속): kordoc은 줄을 나눌 때 줄 끝 금칙 글자를 다음 줄로 넘기려고
 * 줄 머리까지 되돌아가는데, 그 글자가 한 줄 넘게 이어지면 줄이 한 글자씩만 나아가 장평 맞추기(fitParagraph)가 줄 수 × 사다리만큼 느려짐.
 * LINE_END_RUN_MAX자마다 보이지 않는 이음 표식(U+2060, 인용 블록 표식과 같은 글자)을 끼워 되돌아가기를 끊음 — 보이는 글자는 그대로이고,
 * 그런 연속이 없는 글은 같은 문자열을 돌려줌(선형)
 */
export function breakLineEndRuns(text: string): string {
  const parts: string[] = [];
  let from = 0;
  let run = 0;
  for (let i = 0; i < text.length; i++) {
    if (!LINE_END_BANNED.has(text[i])) {
      run = 0;
      continue;
    }
    if (run === LINE_END_RUN_MAX) {
      parts.push(text.slice(from, i), JOINER);
      from = i;
      run = 0;
    }
    run++;
  }
  if (!parts.length) return text;
  parts.push(text.slice(from));
  return parts.join("");
}

export function toKordocInput(text: string): string {
  const out: string[] = [];
  let titleDone = false;
  let inQuote = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd(); // /\s+$/ 걷기와 같은 결과 — 공백이 긴 줄도 선형
    const body = line.trim();
    if (FENCE.test(line)) {
      inQuote = !inQuote;
      out.push(inQuote ? "```text" : "```");
      continue;
    }
    if (inQuote) {
      out.push(QUOTE_MARK + line);
      continue;
    }
    if (!titleDone && body) {
      out.push(`# ${body}`);
      titleDone = true;
      continue;
    }
    if (TABLE.test(line)) {
      out.push(line);
      continue;
    }
    if (SENDING.test(body)) {
      out.push(`<right>${body}</right>`);
      continue;
    }
    const depth = DEPTH.find(([mark]) => body.startsWith(mark));
    if (depth) out.push(depth[1] + body.slice(depth[0].length));
    else if (DASH.test(body) && !/^[-\s]+$/.test(body)) out.push(`    - ${body.replace(DASH, "")}`);
    else out.push(line);
  }
  return `${out.join("\n")}\n`;
}
