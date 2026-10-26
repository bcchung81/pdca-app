// 경평 초안 평가 논점 커버(결정론, 순수, 어림 — 낱말 신호만 봄) — 초안 글에 5개 논점(실행·효율·대응·전년대비·국민체감)을 가리키는 낱말이
// 있는지만 봅니다. 판정이 아니라 신호입니다(그 논점을 실제로 잘 다뤘는지는 사람이 봄). 평가 채점 도구(scripts/eval/eval-report-score.ts)와
// 과제별 초안 화면(app/(app)/reports/cards/[uid]/page.tsx)이 같은 규칙을 씁니다(4단계 검증 보강, 2026-09-27).

import { type ReportSectionSpec, sectionText } from "./section.ts";

/** 논점 축(화면 칩 순서) */
export const LENS_AXES = ["실행", "효율", "대응", "전년대비", "국민체감"] as const;
export type LensAxis = (typeof LENS_AXES)[number];

const LENS_HINTS: Record<LensAxis, RegExp> = {
  실행: /단계|일정|완료|착수|추진/,
  효율: /시간|비용|인력|예산|절감|단축/,
  대응: /리스크|지적|보완|개선|해소/,
  전년대비: /’2[45]년?[^’]{0,20}(→|대비)|대비\s*\d|전년/,
  국민체감: /국민|시민|이용자|근로자|현장|안전/,
};

export interface LensCover {
  checks: Record<LensAxis, boolean>;
  count: number;
}

/** 초안 글에 논점 5축 낱말 신호가 있는지(다룸/빠짐) + 다룬 개수 */
export function lensCover(spec: ReportSectionSpec): LensCover {
  const text = sectionText(spec);
  const checks = Object.fromEntries(LENS_AXES.map((k) => [k, LENS_HINTS[k].test(text)])) as Record<LensAxis, boolean>;
  return { checks, count: Object.values(checks).filter(Boolean).length };
}
