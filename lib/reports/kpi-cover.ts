// 경평 초안 「카드 계량지표 빠짐」 결정론 점검(순수, 2026-10-27 품질 측정 후속 — 주요사업만, 참고 경고).
// 블라인드 심사: 주요사업3/5-가 초안이 카드 계량지표 「ICT기금 부채자산 비율 개선 성과」를 어디에도 다루지 않아 재정건전성의 부채 감축 축이 비었음.
// 지표 이름의 낱말(일반어·같은 카드 다른 지표와 함께 쓰는 낱말 제외)이 초안 글에 절반도 안 나오면 알림 — 「분담금 조성 성과」처럼 줄여 쓴 것은 다룬 것으로 봄.
// 경영관리는 지표가 많아(카드당 3~13개) 이 점검을 하지 않음. 올해 실적 재료(actuals.ts)도 같은 낱말 셈으로 성과 칸 줄을 지표에 붙임.

/** 지표 이름에서 겹침을 셀 때 빼는 일반어(어느 지표에나 붙는 말) */
const GENERIC = new Set(["성과", "실적", "목표", "제고", "개선", "향상", "달성", "달성률", "건수", "비율", "비중", "지수", "실적률", "확대", "강화", "증가", "감소", "관련", "대비", "신설", "기준", "누적", "연간", "평균", "이상", "이하", "수준", "및", "등"]);

/** 지표 이름 → 낱말(괄호 안 단위·「(신설)」 표지·한 글자 낱말·일반어 제외) */
export function kpiWords(name: string): string[] {
  const t = name.replace(/\([^)]*\)/g, " ").replace(/[^가-힣A-Za-z0-9]+/g, " ");
  return [...new Set(t.split(" ").filter((w) => w.length >= 2 && !GENERIC.has(w)))];
}

/** 이 비율 이상의 낱말이 글에 있으면 다룬 것 */
export const KPI_COVER_MIN = 0.5;

/** 같은 카드의 지표 이름들 → 지표마다 셀 낱말: 다른 지표와 함께 쓰는 낱말(「ICT기금」)은 뺌. 빼고 나서 남는 것이 없으면 뺀 것 그대로 */
export function kpiKeyWords(names: string[]): string[][] {
  const words = names.map(kpiWords);
  return words.map((ws, i) => {
    const own = ws.filter((w) => !words.some((other, j) => j !== i && other.includes(w)));
    return own.length ? own : ws;
  });
}

/** 낱말들 중 글(빈칸을 걷고 봄 — 「부채 자산」·「부채자산」 같음)에 있는 비율. 낱말이 없으면 1 */
export function wordCover(words: string[], text: string): number {
  if (!words.length) return 1;
  const hay = text.replace(/\s+/g, "").toLowerCase();
  return words.filter((w) => hay.includes(w.toLowerCase())).length / words.length;
}

/** 초안 글에 안 나온 지표 이름(나온 순) */
export function missingKpis(names: string[], text: string): string[] {
  const keys = kpiKeyWords(names);
  return names.filter((_, i) => wordCover(keys[i], text) < KPI_COVER_MIN);
}

/** 경고 한 줄(참고 — warning-levels.ts 「계량지표」). 빠진 지표가 없으면 null */
export function kpiMissingWarning(names: string[], text: string): string | null {
  const miss = missingKpis(names, text);
  if (!miss.length) return null;
  return `계량지표: 카드 계량지표 ${miss.map((n) => `「${n}」`).join("·")}이(가) 초안에 없음 — 평가위원이 지표 실적을 찾으므로 그 지표의 올해 실적(없으면 【확인: …】)을 한 곳에`;
}
