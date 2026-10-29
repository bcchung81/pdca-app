// 2025 보고서 불릿 길이 셈(두 트랙 공용 규칙) — 칸 글 한도의 불릿 기준 길이(lib/tracks TrackSpec.reportBulletChars)의 근거.
// 경영관리 scripts/eval/mg-fill-baseline.ts · 주요사업 scripts/eval/biz-bullet-baseline.ts가 같은 규칙으로 셈.
// 규칙: 글을 <br>·표 칸 경계(<tr>·<td>·<th>·|)·줄바꿈으로 나눈 줄 중 「∙」·「•」로 시작하는 줄이 불릿(마크업은 빼고 앞뒤 공백 정리).
// 불릿 길이 = 머리 기호와 그 뒤 공백을 뺀 글자 수(공백 포함 — String length).

/** 글 전체의 불릿(「∙•」로 시작하는 줄, 머리 기호 뺀 글) */
export function allBullets(md: string): string[] {
  return md
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<\/?t[dhr][^>]*>|\|/g, "\n")
    .split("\n")
    .map((x) => x.replace(/<[^>]+>/g, "").trim())
    .filter((x) => /^[∙•]/.test(x))
    .map((x) => x.replace(/^[∙•]\s*/, ""));
}

/** 불릿 평균 글자 수·10자 이하 비율(불릿이 없으면 0) */
export function bulletStats(bl: string[]): { bullets: number; bulletAvgLen: number; bulletShortShare: number } {
  return {
    bullets: bl.length,
    bulletAvgLen: bl.length ? bl.reduce((s, b) => s + b.length, 0) / bl.length : 0,
    bulletShortShare: bl.length ? bl.filter((b) => b.length <= 10).length / bl.length : 0,
  };
}

export const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
