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

export function toKordocInput(text: string): string {
  const out: string[] = [];
  let titleDone = false;
  let inQuote = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
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
