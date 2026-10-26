// 판(版)·원문·용도 표지(순수). 조각 글은 고치지 않고 요청 때 위치(where) 꼬리표로 붙입니다 — DB 변경 없음.
// 근거: `plan-2607.pdf`(관리계획 7월판)를 최종본으로 한다는 사용자 결정(2026-10-07). 7월판 Ⅱ 참고2 「주요사업 계량지표 수정(안)」(재경부 업무연락 7.13 「필수개선 지표」 — KCA 6개 중 3개)이
// '26 편람('26.1.29 최초)과 다르게 정한 곳은 개선(안)이 유효하고, '25 자료에 나오는 지표 중 '26 편람에서 이름이 바뀌었거나 교체·폐지된 것은 그렇게 알려 줍니다(지표 사전 METRICS_2025의 relation).

import { REPORT_METHOD_USAGE } from "./usage.ts";

/** 7월판 개선(안)으로 바뀐 '26 편람(최초) 조각 → 개선(안)에서의 모습. 값은 plan-2607.pdf 28쪽(참고2) 표 그대로 */
export const HANDBOOK_REVISIONS_2607: Record<string, string> = {
  "plan-2607/handbook26/BZ-1": "7월판 개선(안) 기준: 배점 23점 — 근로자 무사고 달성 노력(3점)이 주요사업2에서 옮겨 와 지표 4개(전파품질 8·근로자 무사고 3·공공용 주파수 3·성과관리 9)",
  "plan-2607/handbook26/BZ-2": "7월판 개선(안) 기준: 배점 15점 — 인명구조 및 재난 관리 강화 성과는 복합지표(4점:4점)가 개별지표 2개(검사 성과 3점·개선 처리 노력 5점)로, 근로자 무사고 달성 노력(3점)은 주요사업1로 이동",
  "plan-2607/handbook26/BZ-2/m1": "7월판 개선(안) 기준: 복합지표(1개)를 개별지표 2개(인명안전 무선국 검사 성과 3점·개선 처리 노력 5점)로 나누고 가중치 4점:4점 → 3점:5점",
  "plan-2607/handbook26/BZ-2/m2": "7월판 개선(안) 기준: 이 지표는 주요사업1로 이동·재배치(3점)",
  "plan-2607/handbook26/BZ-3": "7월판 개선(안) 기준: 배점 16점은 그대로, 기금 재정 효율화 성과가 지표 3개(차입금리 대비 기금 운용수익 성과 1점·기금 분담금 재원 조성 성과 3점·기금 운용평가 결과 1점 신설)로 바뀜",
  "plan-2607/handbook26/BZ-3/m1": "7월판 개선(안) 기준: 지표 신설(기금 운용평가 결과 1점)과 가중치 조정(2점:3점 → 1점:3점:1점)",
};

/**
 * 원문 자체의 오기·표기 차이·옮겨 적지 못한 곳(2026-10-07 데이터 결함 점검). 조각 글은 원문 그대로 두므로 인용 대조는 그대로이고,
 * 모델은 이 꼬리표로 「원문이 이렇게 적혀 있음」을 알고 읽는다 — 원문을 고쳐 적거나 어느 쪽이 맞다고 단정하지 않는다.
 */
export const SOURCE_ERRATA: Record<string, string> = {
  "att3-2604/s4/R01": "원문 오기: 본문의 「2025년 주요사업2에 관련된 예산요구서」는 주요사업2 절(att3-2604/s5/R01)의 문구를 옮겨 적은 것으로 보임 — 이 조각은 주요사업1 절(대상사업1 전파품질 향상)의 답변",
  "plan-2607/narr/I/3/s2": "같은 실적(자격검정 및 취득교육 고객만족도)을 평가위원 의견·중간보고서 지적은 85.376으로 적음 — 이 조각은 85.37로 적은 표기 차이(원문 그대로)",
  "plan-2607/eval25/BZ-2/e4/p02": "같은 실적(자격검정 및 취득교육 고객만족도)을 관리계획 서술 Ⅰ-3은 85.37로 적음 — 이 조각은 85.376으로 적은 표기 차이(원문 그대로)",
  "mid25-biz/BZ-2/13": "같은 실적(자격검정 및 취득교육 고객만족도)을 관리계획 서술 Ⅰ-3은 85.37로 적음 — 이 조각은 85.376으로 적은 표기 차이(원문 그대로)",
  "att3-2604/s6/Q14": "원문의 측정 산식 수식 기호가 글로 옮겨지지 않아(글리프 소실) 산식 모양이 빠져 있음 — 산식은 원문 PDF에서 확인해야 하며 수식 기호를 짐작해 적지 말 것",
};

const RELATION_NOTE: Record<string, (name2026: string | null) => string | null> = {
  "명칭 변경": (n) => (n ? `'25 지표 — '26 편람에서 「${n}」로 명칭 변경` : null),
  교체: (n) => (n ? `'25 지표 — '26 편람에서 「${n}」로 교체` : null),
  폐지: () => "'25 지표 — '26 편람에서 폐지",
};

interface NoteInput {
  chunk_key: string;
  unit_type?: string;
  meta?: Record<string, unknown> | null;
}

/** 판·'25 지표 이름 변화 표지(「※」 없는 글) */
function versionNote(c: NoteInput): string | null {
  const fixed = HANDBOOK_REVISIONS_2607[c.chunk_key];
  if (fixed) return fixed;
  // '25 자료(실사·지적 등)만: '26 편람 조각은 이미 '26 이름이라 대상이 아님
  if (c.unit_type === "handbook_indicator" || c.chunk_key.includes("/handbook26/")) return null;
  const rel = c.meta?.metric_relation;
  const name2026 = typeof c.meta?.metric_2026 === "string" ? c.meta.metric_2026 : null;
  return typeof rel === "string" ? (RELATION_NOTE[rel]?.(name2026) ?? null) : null;
}

/** 원문이 같은 글을 두 번 적은 조각(적재 때 meta.duplicate_of에 앞 조각 key를 기록) */
function duplicateNote(c: NoteInput): string | null {
  const of = c.meta?.duplicate_of;
  return typeof of === "string" && of ? `원문이 같은 글을 ${of} 조각에도 적음 — 한 건으로 볼 것` : null;
}

/** 경평 초안 작성 방법론 자료(meta.usage) — 경평 초안 요청에서만 보임(layerOf). 사실·숫자·사례의 근거가 아니라고 조각마다 알림 */
export const METHOD_NOTE = "작성 방법론 자료 — 보고서를 어떻게 쓰고 무엇을 앞세울지의 참고이며 사실·숫자·사례의 근거가 아님";
function methodNote(c: NoteInput): string | null {
  return c.meta?.usage === REPORT_METHOD_USAGE ? METHOD_NOTE : null;
}

/** 지적 시정조치 계획(unit_type corrective_action) — 조치계획 칸은 기관이 하겠다고 약속한 것이라 이행 실적이 아님. 지적사항 칸은 평가 결과 그대로 */
export const PLAN_NOTE = "시정조치 계획 — 조치계획은 기관이 하겠다고 약속한 것이며 이행 실적·사실·숫자의 근거가 아님(「~할 계획」으로만 쓸 것)";
function planNote(c: NoteInput): string | null {
  return c.unit_type === "corrective_action" ? PLAN_NOTE : null;
}

/** where 꼬리표(「※ …」, 여럿이면 「 · 」로 이음) — 붙일 것이 없으면 null */
export function revisionNote(c: NoteInput): string | null {
  const notes = [methodNote(c), planNote(c), SOURCE_ERRATA[c.chunk_key], duplicateNote(c), versionNote(c)].filter(Boolean);
  return notes.length ? notes.map((n) => `※ ${n}`).join(" · ") : null;
}

/** 근거 자료의 위치 글 = 조각 머리말 + 판 표지 */
export function whereWithNote(c: NoteInput & { context_prefix?: string | null }): string | undefined {
  return [c.context_prefix, revisionNote(c)].filter(Boolean).join(" · ") || undefined;
}
