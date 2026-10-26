// 카드의 「경영평가 지적사항」 칸에서 실제 지적 줄만 뽑는 순수 모듈(입출력 없음).
// 칸이 「∙ 경영평가 지적사항 없음」·「해당없음」이면 지적이 아니므로 지적개선 표지·평가 근거 검색어에 넣지 않는다.

const BULLET = /^[∙•·\-→※]\s*/;
/** 줄 전체가 「지적이 없다」는 뜻일 때만 맞음(끝 마침표 허용). 「산식 근거 없음 — 재산정 필요」처럼 다른 말이 섞이면 안 맞음 */
export const NO_FINDING_RE = /^(?:(?:경영평가\s*)?(?:지적\s*)?(?:사항\s*)?(?:이\s*)?없음|해당\s*(?:사항\s*)?없음|n\s*\/\s*a)\.?$/i;

/** 앞 기호·공백을 걷은 줄 */
const strip = (x: string) => x.replace(BULLET, "").trim();

/** 줄이 「지적 없음」 표시인가(기호 걷은 뒤 판정) */
export function isNoFindingLine(line: string): boolean {
  const s = strip(line);
  return NO_FINDING_RE.test(s);
}

/** 글줄 배열에서 실제 지적 줄만(문자열만, 앞 기호 걷기, 빈 줄·기호만 있는 줄·「없음」 줄 뺌) */
export function realFindingLines(arr: unknown): string[] {
  return (Array.isArray(arr) ? arr : [])
    .filter((x): x is string => typeof x === "string")
    .map(strip)
    .filter((x) => x && !/^[-–—·]+$/.test(x) && !NO_FINDING_RE.test(x));
}

/** 주요사업 카드의 실제 지적 줄(act.findings) */
export function cardFindings(card: unknown): string[] {
  return realFindingLines((card as { act?: { findings?: unknown } } | null | undefined)?.act?.findings);
}
