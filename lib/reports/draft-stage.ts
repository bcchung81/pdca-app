// 경평 초안 과제별 초안(/reports/cards/<uid>) 「AI 초안」 탭의 단계 레일(순수): 구성안 · 초안 · 점검 + 주 행동 하나 + 「다시 쓰기」 묶음.
// 단계는 저장된 값(구성안·구성안 승인·초안 spec·spec.plan·원장 개정·점검 건수)으로만 셈 — 탭을 누르거나 요청을 시작했다고 끝났다고 적지 않고 진행률도 없음.
// 행동은 요청 칸의 요청 종류(DraftMode: outline·plan·draft)나 보기(구성안·점검 결과·보고서 상태)뿐 — 실행은 화면이 기존 경로(요청 칸 보내기·덮어쓰기 확인)로 함.
// 종류를 고르는 곳은 레일 하나(요청 칸 칩 없음) — 그래서 쓸 수 있는 모든 상태에서 나머지 만들기 종류를 보조로 줌.
// 10-13 정제 시안 05 STAGE_RULE + UI-UX 핸드오프 2026-10-21 6.5(UX-C). 톤 이름은 components/ui/next-steps.tsx MarkTone과 같음.

/** 상태 표지 톤: idle 시작 전 · doing 우리 차례 · handoff 상대 차례 · done 끝 · alert 막힘 */
export type StageTone = "idle" | "doing" | "handoff" | "done" | "alert";
export type StageKey = "outline" | "draft" | "check";
/** outline·plan·draft = 요청 칸의 요청 종류 그대로 · show-outline·show-check = 그 자리를 펼쳐 보임 · report = 보고서 상태(허브) */
export type StageActionKey = "outline" | "plan" | "draft" | "show-outline" | "show-check" | "report";

export interface StageAction {
  key: StageActionKey;
  label: string;
  /** 조용한 단추(글자만) */
  quiet?: boolean;
}

export interface DraftStageStep {
  key: StageKey;
  label: string;
  state: string;
  tone: StageTone;
  /** 주 행동과 맞는 단계(aria-current="step") */
  now: boolean;
}

export interface DraftStageInput {
  hasOutline: boolean;
  /** 구성안 승인(card_report_drafts.outline_status = approved — 승인은 구성안대로 집필할 때만 저장됨) */
  outlineApproved: boolean;
  hasDraft: boolean;
  /** 지금 초안이 구성안대로 쓰였음(spec.plan) */
  draftFromOutline: boolean;
  /** 초안을 만든 뒤 원장이 바뀜(source_rev ≠ data_rev — submission.ts cardSubmitRow의 stale과 같은 판정) */
  stale: boolean;
  /** 점검 결과 탭 할 일(채울 자료 + 확인할 것) */
  checks: number;
  /** 경영관리(바로 만들기 없음 — 서버 runReportSectionDraft도 막음) */
  mg: boolean;
  /** 이 사람이 초안을 만들 수 있음(page.tsx canWrite — 잠김·부서 화면 보기면 이미 false) */
  canWrite: boolean;
  /** 부서 보고서가 제출·승인됨(부서만) */
  locked: boolean;
  /** 부서 화면 보기(읽기 전용) */
  deptView: boolean;
}

export interface DraftStage {
  steps: DraftStageStep[];
  /** 주 행동 하나(없으면 null) */
  primary: StageAction | null;
  /** 주 행동 옆 보조(초안이 없을 때 나머지 만들기 종류) */
  alt: StageAction[];
  /** 「다시 쓰기」 묶음(초안이 있고 쓸 수 있을 때) */
  redo: StageAction[];
  /** 「다시 쓰기」 묶음을 펼쳐 보임(원장이 바뀜 — 기존 초안 유지·다시 쓰기는 사람이 고름) */
  redoOpen: boolean;
}

export function draftStage(i: DraftStageInput): DraftStage {
  const { hasOutline, hasDraft } = i;
  const approved = hasOutline && i.outlineApproved;
  // 지금 단계: 초안이 있으면 점검, 구성안이 승인됐는데 초안이 없으면 초안, 나머지(없음·확인 전)는 구성안
  const now: StageKey = hasDraft ? "check" : approved ? "draft" : "outline";

  const outlineStep: Pick<DraftStageStep, "state" | "tone"> = !hasOutline
    ? { state: hasDraft ? "안 씀" : "없음", tone: "idle" }
    : !approved
      ? { state: "확인 전", tone: "doing" }
      : hasDraft && !i.draftFromOutline
        ? { state: "초안에 안 씀", tone: "idle" }
        : { state: hasDraft ? "승인 · 집필함" : "승인", tone: "done" };
  const draftStep: Pick<DraftStageStep, "state" | "tone"> = !hasDraft ? { state: "없음", tone: "idle" } : i.stale ? { state: "원장이 바뀜 · 다시 쓰기 권장", tone: "doing" } : { state: "초안 있음", tone: "done" };
  // 채울 자료·확인할 것은 대부분 초안이 일부러 남긴 사람 몫(올해 값 【확인】·그림 자리) — 받는 쪽 차례(handoff), 경고색 아님
  const checkStep: Pick<DraftStageStep, "state" | "tone"> = !hasDraft ? { state: "초안 뒤", tone: "idle" } : i.checks > 0 ? { state: `할 일 ${i.checks}`, tone: "handoff" } : { state: "확인할 것 없음", tone: "done" };
  const steps: DraftStageStep[] = [
    { key: "outline", label: "구성안", ...outlineStep, now: now === "outline" },
    { key: "draft", label: "초안", ...draftStep, now: now === "draft" },
    { key: "check", label: "점검", ...checkStep, now: now === "check" },
  ];

  const none = { steps, alt: [], redo: [], redoOpen: false };
  // 제출·승인된 보고서의 과제: 보고서 상태(허브)만 — 만들기·다시 쓰기 없음
  if (i.locked) return { ...none, primary: { key: "report", label: "보고서 상태 보기" } };
  // 읽기 전용(부서 화면 보기·고칠 수 없는 사람): 보기 행동만
  if (!i.canWrite || i.deptView) return { ...none, primary: hasDraft ? { key: "show-check", label: "점검 결과 보기" } : hasOutline ? { key: "show-outline", label: "구성안 보기" } : null };

  if (!hasDraft) {
    if (!hasOutline) return { ...none, primary: { key: "outline", label: "구성안 만들기" }, alt: i.mg ? [] : [{ key: "draft", label: "구성안 없이 바로 만들기", quiet: true }] };
    // 확인 전 구성안은 먼저 보고(구성안 패널의 「승인하고 집필」), 승인만 된 구성안은 그대로 집필
    // 요청 칸에 칩이 없으므로 구성안 다시 만들기·바로 만들기도 여기서 고름(경영관리는 바로 만들기 없음)
    const alt: StageAction[] = [{ key: "outline", label: "구성안 다시 만들기" }, ...(i.mg ? [] : [{ key: "draft" as const, label: "바로 만들기", quiet: true }])];
    return { ...none, primary: approved ? { key: "plan", label: "구성안대로 집필" } : { key: "show-outline", label: "구성안 보기" }, alt };
  }
  const redo: StageAction[] = [
    ...(hasOutline ? [{ key: "plan" as const, label: "구성안대로 집필" }] : []),
    { key: "outline", label: hasOutline ? "구성안 다시 만들기" : "구성안 만들기" },
    ...(i.mg ? [] : [{ key: "draft" as const, label: "바로 다시 만들기", quiet: true }]),
  ];
  return { steps, primary: { key: "show-check", label: "점검 결과 보기" }, alt: [], redo, redoOpen: i.stale };
}
