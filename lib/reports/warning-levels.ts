// 경평 초안 경고 등급(순수, 2026-10-17 품질 향상 A — 경고 홍수 줄이기).
// 초안 경고(card_report_drafts.warnings)는 앞머리 「문장:」「판면:」… 또는 글 패턴으로 종류를 알 수 있고, 이 모듈은 글을 바꾸지 않고 등급만 매긴다
// (저장된 경고·프롬프트·판 해시와 호환). 운영 측정(43장 평균 4.3건)에서 문장·칸 채우기·추진성과 표현 같은 참고성 신호가 사실 문제를 묻어 버려 둘로 가름.
//  - block(막힘): 제출 전에 사람이 꼭 봐야 하는 사실·판면 문제 — 근거에 없는 숫자·전년 인용·올해 실적 누락·실적 칸의 계획 표현·판면/분량 넘침·카드 밖 부분 넘침·빠진 근거/절
//  - info(참고): 문장·칸 채우기·추진성과 표현·그림·짜임 다양성 등 다듬기 신호. 모르는 앞머리도 info
// 앞머리 표 WARNING_HEADS는 경고를 만드는 코드(lib/reports/*.ts·draft-write.ts)의 앞머리와 같아야 하며 warning-levels.test.ts가 코드를 읽어 대조한다.

export type WarningLevel = "block" | "info";

/** 앞머리(「…:」 앞 글) → 기본 등급. 같은 앞머리에서 글에 따라 갈리는 것은 WARNING_RULES가 먼저 정함 */
export const WARNING_HEADS: Readonly<Record<string, WarningLevel>> = {
  // ── block: 사실·판면
  "올해 실적": "block", // 수치 띠·추진성과에 올해 실적이 없음(자리표시 개수 초과만 info — 규칙)
  "전년 인용": "block", // 2025 보고서 글에서만 찾은 인용을 올해 블록에 씀
  판면: "block", // 어림 높이가 판면 밖(넘침 block, 빔 info — 규칙)
  분량: "block", // 경영관리 배정 쪽수 ±25%(많음 block, 적음 info — 규칙)
  첨부: "block", // AI가 읽지 못한 첨부를 빼고 씀(근거 빠짐)
  "빈 칸": "block", // 표·수치 띠의 값 칸이 비어 있음
  "실적 칸": "block", // 추진성과·추진실적 칸에 계획 표현(예정·할 계획)이나 아직 안 온 시점(lib/reports/result-plan.ts, 2026-10-17 F1)
  // ── info: 문장·표현·짜임
  문장: "info",
  문체: "info",
  "칸 채우기": "info",
  추진성과: "info", // 추진성과가 블록 수치를 되풀이
  "추진성과 막대": "info",
  "추진성과 강조 띠": "info",
  그림: "info",
  "그림 자리": "info",
  도식: "info",
  짜임: "info",
  절: "info", // 경영관리 절을 성과로 닫지 않음
  구성안: "info", // 승인한 짜임과 다름(절이 빠진 경우만 block — 규칙)
  "근거 약함": "info", // 신호일 뿐 판정이 아님
  "자동 고치기": "info", // 실패·시간 부족 — 남은 문제는 각자 경고로 따로 나옴
  갈래: "info",
  "갈래 칩": "info",
  막대: "info", // 블록 정리에서 뺀 막대
  "수치 띠": "info", // 블록 정리에서 뺀 수치 띠
  "글 한도": "info",
  "칸 수": "info",
  모양: "info",
  재료: "info",
  "재료 없는 블록": "info",
  겹침: "info",
  평가내용: "info",
  구성: "info", // 구성안 정리가 블록·절을 뺌
  "목적 없는 블록": "info",
  "목소리–해법": "info",
  "성과 축": "info",
  틀: "info",
  "반복 수치": "info", // 같은 수치를 서로 다른 블록 3개 이상(경영관리는 절 2개 이상)에 되풀이(lib/reports/repeat-figures.ts, 2026-10-27)
  "계획→실적": "info", // 실적 칸 줄이 카드 계획 줄과 많이 겹치고 실행 근거와는 적게 겹침(lib/reports/result-plan.ts planAsResult, 2026-10-27)
  계량지표: "info", // 카드 계량지표 이름이 초안에 없음 — 주요사업만(lib/reports/kpi-cover.ts, 2026-10-27)
  // 블록 정리가 근거 없는 인용·사례·정의를 뺀 줄의 머리(블록 종류 또는 종류(라벨))
  quotes: "info",
  voices: "info",
  case: "info",
  define: "info",
};

/** 앞머리로 못 가리는 글·앞머리 예외(위에서부터 먼저 맞는 것). 글은 바꾸지 않고 등급만 정함 */
export const WARNING_RULES: ReadonlyArray<{ test: RegExp; level: WarningLevel }> = [
  { test: /^올해 실적: 자리표시가 \d+개/, level: "info" },
  { test: /^판면: .*빕니다/, level: "info" },
  { test: /^판면: .*넘칩니다/, level: "block" },
  { test: /^분량: .*대비 \+\d+%/, level: "block" },
  { test: /^분량: /, level: "info" },
  { test: /^구성안: 승인한 절 \d+개 중 \d+개/, level: "block" },
  // 앞머리 없는 글
  { test: /에 없는 숫자 \d+개/, level: "block" }, // 「카드·근거 자료에 없는 숫자 N개」(초안)·「근거에 없는 숫자 N개」
  { test: /^추진성과 상자가 비었습니다/, level: "block" },
  { test: /^사람이 고친 블록 \d+개/, level: "info" },
  { test: /^도식 블록이 2개보다 적습니다/, level: "info" },
  // 사업 조판 검사 레일의 조판 알림(lib/reports/business-layout.ts)
  { test: /^카드 밖 부분 \d+쪽 넘침/, level: "block" },
  { test: /^카드 밖 부분을 불러오지 못해/, level: "block" },
  { test: /^지표 전체 [\d.]+쪽이 작성분량 .*많음/, level: "block" },
  { test: /^지표 전체 [\d.]+쪽이 작성분량 .*적음/, level: "info" },
  { test: /^비어 있는 칸 \d+개/, level: "info" },
  { test: /^\d+쪽이 \d+%만 참/, level: "info" },
];

/** 경고 앞머리(「머리: 본문」의 머리, 없으면 빈 글) — 머리 글은 콜론 앞 24자 이내, 줄바꿈·숫자 시작 제외 */
export function warningHead(text: string): string {
  const m = /^([^:：\n]{1,24})[:：]\s/.exec(text.trim());
  return m ? m[1].trim() : "";
}

/** 블록 정리 줄의 머리 `kind(라벨)` → `kind` */
const headKey = (head: string) => head.replace(/\(.*\)$/, "");

/** 경고 글 → 등급. 규칙 → 앞머리 표 → (모르면) info */
export function warningLevel(text: string): WarningLevel {
  const t = text.trim();
  for (const r of WARNING_RULES) if (r.test.test(t)) return r.level;
  const head = warningHead(t);
  return WARNING_HEADS[head] ?? WARNING_HEADS[headKey(head)] ?? "info";
}

export interface GradedWarning {
  text: string;
  level: WarningLevel;
}

/** 등급 매기고 정렬: block 먼저, 같은 등급 안은 원래 순서(안정 정렬) */
export function gradeWarnings(list: readonly string[]): GradedWarning[] {
  const graded = list.map((text) => ({ text, level: warningLevel(text) }));
  return [...graded.filter((w) => w.level === "block"), ...graded.filter((w) => w.level === "info")];
}

/** 기본으로 보이는 경고 수(막힘 + 참고 합쳐) — 막힘이 이 수를 넘으면 막힘만 보임 */
export const WARNING_SHOWN_MAX = 3;

export interface WarningView {
  /** 기본으로 보이는 경고(막힘 전부 + 참고는 합쳐 WARNING_SHOWN_MAX개까지) */
  shown: GradedWarning[];
  /** 「참고 N개 더 보기」로 접히는 경고(모두 참고) */
  folded: GradedWarning[];
  blockCount: number;
  infoCount: number;
}

/** 경고 목록 → 기본 표시(막힘 전부 + 참고는 WARNING_SHOWN_MAX에서 막힘 수를 뺀 만큼)와 접힌 참고 */
export function warningView(list: readonly string[]): WarningView {
  const graded = gradeWarnings(list);
  const blocks = graded.filter((w) => w.level === "block");
  const infos = graded.filter((w) => w.level === "info");
  const room = Math.max(0, WARNING_SHOWN_MAX - blocks.length);
  return { shown: [...blocks, ...infos.slice(0, room)], folded: infos.slice(room), blockCount: blocks.length, infoCount: infos.length };
}
