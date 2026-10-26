import type { SegTone, Tone } from "./kit";
import type { InspectionStatus } from "../../lib/inspections/model.ts";
import type { ReportStatus } from "../../lib/reports/model.ts";
import type { FitTone } from "../../lib/reports/fit.ts";
import type { MarkTone } from "./next-steps";

/**
 * 상태 → 톤 표(한 곳). 규칙: idle 시작 전 · doing 진행(우리 차례) · handoff 넘겨짐(상대 차례) · done 끝 · alert 막힘·예외만.
 * 상태를 칩(Tag)·진행 막대(StatPanel segments)로 그리는 곳은 모두 이 표를 씀 — 막힘·마감·오류 경고는 여기 두지 않고 warn을 그대로 씀.
 * 서버·클라이언트 어디서나 씀(순수 상수).
 */
export interface StatusTone {
  tag: Tone;
  seg: SegTone;
}
const IDLE: StatusTone = { tag: "muted", seg: "line" };
const DOING: StatusTone = { tag: "link", seg: "accent" };
const HANDOFF: StatusTone = { tag: "handoff", seg: "handoff" };
const DONE: StatusTone = { tag: "navy", seg: "navy" };

/** 월간 점검 상태(none = 아직 점검표 없음) */
export const INSPECTION_STATUS_TONE: Record<InspectionStatus | "none", StatusTone> = { none: IDLE, draft: DOING, sent: HANDOFF, acknowledged: DONE };

/** 경평 보고서 상태 */
export const REPORT_STATUS_TONE: Record<ReportStatus, StatusTone> = { preparing: IDLE, drafting: DOING, submitted: HANDOFF, approved: DONE };

/**
 * 판면 판정(lib/reports/fit.ts fitVerdict) → 칩 톤: 분량 맞음은 중립(muted — 할 일 없음), 빔·조금 넘침은 우리 차례(link),
 * 넘침(104% 초과 — 제출 확인 목록에 오름)만 경고. 판정 톤은 상태가 아니라 셈 결과라 위 표와 따로 둠
 */
export const FIT_TAG: Record<FitTone, Tone> = { done: "muted", doing: "link", alert: "warnSolid" };

/** 상태 표지 톤(next-steps.tsx MarkTone — 단계 띠·레일) → 상태 글 칩 톤. 위 표와 같은 색(시작 전 muted · 우리 차례 link · 넘겨짐 handoff · 끝 navy), 막힘만 warnSolid */
export const MARK_TAG: Record<MarkTone, Tone> = { idle: IDLE.tag, doing: DOING.tag, handoff: HANDOFF.tag, done: DONE.tag, alert: "warnSolid" };
