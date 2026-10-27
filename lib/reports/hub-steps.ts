// 경평 초안 부서 허브(/my/report) 사업(경영관리는 지표)마다의 단계 띠(순수): ① 근거 넣기 → ② 과제별 초안 → ③ 확정 + 주 행동 하나.
// ③은 2026-10-27부터 「제출」이 아니라 부서 「확정」(바로 승인 상태 — 성과관리팀은 필요하면 메모와 함께 승인을 풂). 단계 열쇠 이름 submit은 그대로.
// 숫자는 제출 조건(lib/reports/submission.ts submitReadiness)을 그대로 씀 — 목차에서 뺀 과제는 셈에서 빠지고, 구성안만 있는 과제는 「초안 없는 과제」.
// 톤(components/ui/status-tone.ts 다섯): 계량 실적 미입력은 제출을 막지 않으므로 경고색(alert)이 아니라 우리 차례(doing)·시작 전(idle)
// (2026-10-18 결정 「경고색은 막힘에만」). 지금 단계만 doing, 끝나지 않은 나머지는 idle(돌려받음은 우리 차례라 늘 doing).
// UI-UX 핸드오프 2026-10-21 6.4·7.2·7.3(UX-D).

import type { ReportStatus } from "./model.ts";
import type { SubmitReadiness } from "./submission.ts";

/** 상태 표지 톤(components/ui/next-steps.tsx MarkTone과 같은 이름) */
export type HubTone = "idle" | "doing" | "handoff" | "done" | "alert";
export type HubStepKey = "evidence" | "draft" | "submit";

export interface HubStep {
  key: HubStepKey;
  label: string;
  tone: HubTone;
  state: string;
  /** 주 행동과 맞는 단계 */
  now: boolean;
}

/** 주 행동: evidence·submit은 그 패널의 절(앵커), draft는 uid 과제의 과제별 초안 */
export type HubAction = { step: "evidence" | "submit"; label: string } | { step: "draft"; label: string; uid: string; taskNo: string };

export interface HubSteps {
  steps: HubStep[];
  action: HubAction | null;
}

export interface HubStepsInput {
  /** 보고서 상태 — null이면 보고서 준비 전(reports 행 없음, 과제별 초안만 쓸 수 있음) */
  status: ReportStatus | null;
  /** 돌려받음(화면 판정과 같음: 승인이 아니고 마지막으로 낸 뒤 남긴 검토 메모가 있음) — 제출·승인 상태면 무시 */
  returned: boolean;
  readiness: SubmitReadiness;
  /** 이 보고서 카드들의 계량 지표 행 수 · 그중 입력하지 않은 수 */
  kpiTotal: number;
  kpiMissing: number;
  /** 보고서 추가자료 수 */
  materials: number;
  /** 부서 화면 보기(읽기 전용) — 주 행동 이름을 「보기」로 */
  preview: boolean;
}

export function hubSteps(input: HubStepsInput): HubSteps {
  const { status, readiness: r, kpiTotal, kpiMissing, materials, preview } = input;
  const waiting = status === null;
  const closed = status === "submitted" || status === "approved";
  const returned = input.returned && !closed && !waiting;
  const missing = r.missing.length;

  // ① 근거 넣기 — 계량 실적·추가자료는 보고서에 붙으므로 보고서 준비 전에는 할 수 없음
  const evidenceDone = !waiting && (kpiTotal === 0 || kpiMissing === 0);
  const evidenceState = waiting ? "보고서 준비 뒤 입력" : kpiTotal === 0 ? `추가자료 ${materials}건` : kpiMissing > 0 ? `계량 실적 ${kpiMissing}건 입력 필요` : `계량 실적 모두 입력 · 추가자료 ${materials}건`;

  // ② 과제별 초안 — 목차에 든 과제(total) 기준
  const draftDone = r.total > 0 && missing === 0;
  const draftState = missing > 0 ? `초안 없는 과제 ${missing}건` : r.total === 0 ? "목차에 든 과제 없음" : `${r.total}개 모두 있음${r.checks.length ? ` · 확인할 것 ${r.checks.length}가지` : ""}`;

  // ③ 확정 — 「자료 준비」 보고서는 확정 전이(canMove)가 없음: 첫 과제별 초안 저장 때 DB 트리거가 「초안 작성」으로 바꿈
  const submitState = waiting
    ? "보고서 준비 뒤 확정"
    : status === "approved"
      ? "확정함 · 승인 상태"
      : status === "submitted"
        ? "제출함 · 성과관리팀 검토 중"
        : returned
          ? "돌려받음 · 보완 뒤 다시 확정"
          : r.ready
            ? status === "preparing"
              ? "초안을 저장하면 확정할 수 있음"
              : "확정할 수 있음"
            : r.total === 0
              ? "확정할 과제 없음"
              : "초안이 모두 있어야 확정";
  const canSubmit = !waiting && status !== "preparing" && r.ready;

  // 지금 단계: 제출·승인이 아니면 1 → 2 → 3 중 처음 끝나지 않고 할 수 있는 단계
  const now: HubStepKey | null = closed ? null : !waiting && !evidenceDone ? "evidence" : missing > 0 ? "draft" : canSubmit ? "submit" : null;

  const tone = (key: HubStepKey, done: boolean): HubTone => (done ? "done" : key === now ? "doing" : "idle");
  const steps: HubStep[] = [
    { key: "evidence", label: "근거 넣기", tone: tone("evidence", evidenceDone), state: evidenceState, now: now === "evidence" },
    { key: "draft", label: "과제별 초안", tone: tone("draft", draftDone), state: draftState, now: now === "draft" },
    {
      key: "submit",
      label: "확정",
      tone: status === "approved" ? "done" : status === "submitted" ? "handoff" : returned ? "doing" : tone("submit", false),
      state: submitState,
      now: now === "submit",
    },
  ];

  let action: HubAction | null = null;
  if (now === "evidence") action = { step: "evidence", label: preview ? "계량 실적 보기" : "계량 실적 넣기" };
  else if (now === "draft") {
    // missing은 rows 중 목차에 든 것을 같은 순서로 거른 것 — 첫 과제의 uid는 rows에서 찾음
    const first = r.missing[0];
    const row = r.rows.find((x) => x.included && x.taskNo === first.taskNo);
    if (row) action = { step: "draft", label: `${first.taskNo} 초안 ${preview ? "보기" : "쓰기"}`, uid: row.uid, taskNo: first.taskNo };
  } else if (now === "submit") action = { step: "submit", label: preview ? "확정 절 보기" : "확정하러 가기" };

  return { steps, action };
}
