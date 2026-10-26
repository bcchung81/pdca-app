// 내 과제(/my) 「N월에 할 일」 띠(순수): 이 화면 과제의 그 달 작성본·받은 점검·과제별 초안 상태 → 단계 목록 + 주 행동 하나.
// 숫자는 행선 화면과 같은 셈 — 점검은 /my/inspections 「확인할 것」(고른 트랙의 받은 점검), 초안은 /my/report 제출 조건(submitReadiness의 missing).
// 우선순위(UI-UX 핸드오프 2026-10-21 6.1): 돌려받은 작성본 → 확인할 점검 → 초안 없는 과제 → 그 달 작성본 시작 전 → 작성 중(아직 안 냄)인 작성본.
// 톤: 보낸 점검표 「확인 필요」는 부서 입장의 우리 차례라 doing(docs/design/screen-frame.md 상태 톤), 제출한 작성본은 성과관리팀 차례라 handoff.

import { monthLabel } from "../format.ts";
import type { InspectionStatus } from "../inspections/model.ts";
import { type SubmitCard, submitReadiness } from "../reports/submission.ts";
import { type TrackId, trackOfUnit } from "../tracks/index.ts";
import { compareTaskNo, compareUnitId } from "./view.ts";
import type { VersionStatus } from "./versions.ts";

/** 상태 표지 톤(components/ui/status-tone.ts의 다섯 톤과 같은 이름) */
export type StepTone = "idle" | "doing" | "handoff" | "done" | "alert";
export type StepKey = "returned" | "reflect" | "submit" | "inspect" | "draft";

export interface TodoStep {
  key: StepKey;
  tone: StepTone;
  label: string;
  state: string;
  /** 주 행동과 맞는 단계 */
  now: boolean;
}

/** 주 행동: returned·start·continue는 그 과제 카드 옆 창(uid), inspect는 확인할 점검 목록, draft는 경평 초안 허브 */
export type TodoAction = { kind: "returned" | "start" | "continue"; label: string; uid: string; taskNo: string } | { kind: "inspect" | "draft"; label: string };

export interface MyTodo {
  title: string;
  steps: TodoStep[];
  action: TodoAction | null;
}

export interface MyTodoInput {
  /** 작성 기간 YYYY-MM */
  period: string;
  /** 머리띠에서 고른 트랙 — 받은 점검을 /my/inspections처럼 이 트랙 과제 것만 셈 */
  track: TrackId;
  /** 이 화면의 과제 행(부서 담당자 = 지정 과제, 부서 화면 보기 = 그 부서) */
  rows: Array<{ id: string; uid: string; taskNo: string; evalUnitId: string }>;
  /** versionStates 결과(카드 id → 그 달 작성본: 열린 작성본 또는 그 달 확정) */
  versions: ReadonlyMap<string, { status: VersionStatus; note: string | null }>;
  /** receivedInspections 결과(보냄 = 확인 필요, 확인함) */
  inspections: Array<{ status: InspectionStatus; card: { evalUnitId: string } }>;
  /** loadSubmitCards 결과를 펼친 것(그 해 과제별 초안) */
  drafts: SubmitCard[];
}

export function myTodo(input: MyTodoInput): MyTodo {
  const month = monthLabel(input.period);
  const rows = [...input.rows].sort((a, b) => compareUnitId(a.evalUnitId, b.evalUnitId) || compareTaskNo(a.taskNo, b.taskNo));
  const n = rows.length;
  const ver = (id: string) => input.versions.get(id);
  const returned = rows.filter((r) => ver(r.id)?.status === "draft" && ver(r.id)?.note);
  const started = rows.filter((r) => ver(r.id)).length;
  const submitted = rows.filter((r) => ver(r.id)?.status === "submitted").length;
  const confirmed = rows.filter((r) => ver(r.id)?.status === "confirmed").length;
  const received = input.inspections.filter((i) => trackOfUnit(i.card.evalUnitId) === input.track);
  const toAck = received.filter((i) => i.status === "sent").length;
  const ids = new Set(rows.map((r) => r.id));
  const readiness = submitReadiness(input.drafts.filter((c) => ids.has(c.id)));
  const missing = readiness.missing.length;
  const notStarted = rows.find((r) => !ver(r.id));
  const writing = rows.filter((r) => ver(r.id)?.status === "draft" && !ver(r.id)?.note);

  const action: TodoAction | null = returned.length
    ? { kind: "returned", label: `${returned[0].taskNo} 보완하기`, uid: returned[0].uid, taskNo: returned[0].taskNo }
    : toAck
      ? { kind: "inspect", label: "점검 결과 확인" }
      : missing
        ? { kind: "draft", label: "경평 초안 쓰기" }
        : notStarted
          ? { kind: "start", label: `${notStarted.taskNo} 실적 반영하기`, uid: notStarted.uid, taskNo: notStarted.taskNo }
          : writing.length
            ? { kind: "continue", label: `${writing[0].taskNo} 이어서 작성`, uid: writing[0].uid, taskNo: writing[0].taskNo }
            : null;
  const nowKey: StepKey | null = !action ? null : action.kind === "returned" ? "returned" : action.kind === "inspect" ? "inspect" : action.kind === "draft" ? "draft" : action.kind === "continue" ? "submit" : "reflect";

  const progress = (left: number, total: number): StepTone => (left === 0 ? "done" : left === total ? "idle" : "doing");
  const steps: Array<Omit<TodoStep, "now">> = [];
  if (returned.length) steps.push({ key: "returned", tone: "alert", label: "돌려받은 작성본", state: `${returned.length}건 보완 필요` });
  steps.push({ key: "reflect", tone: progress(n - started, n), label: `${month} 실적 반영`, state: `${n}개 중 ${started}개` });
  steps.push(
    submitted
      ? { key: "submit", tone: "handoff", label: "작성본 제출", state: `${submitted}건 · 성과관리팀 확인 대기` }
      : writing.length
        ? { key: "submit", tone: "doing", label: "작성본 제출", state: `작성 중 ${writing.length}건 · 제출 전` }
        : n && confirmed === n
        ? { key: "submit", tone: "done", label: "작성본 제출", state: "모두 확정" }
        : { key: "submit", tone: "idle", label: "작성본 제출", state: "반영한 뒤 · 성과관리팀이 확정" },
  );
  if (received.length) steps.push({ key: "inspect", tone: toAck ? "doing" : "done", label: "점검 결과 확인", state: toAck ? `받은 ${received.length}건 중 ${toAck}건 확인 필요` : "모두 확인함" });
  if (readiness.total) steps.push({ key: "draft", tone: progress(missing, readiness.total), label: "경평 초안", state: missing ? `초안 없는 과제 ${missing}건` : "과제별 초안 모두 있음" });

  return { title: `${month}에 할 일`, steps: steps.map((s) => ({ ...s, now: s.key === nowKey })), action };
}
