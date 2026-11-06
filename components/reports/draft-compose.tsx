"use client";

import { FileText, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { finishCardMaterialUpload, startCardMaterialUpload } from "../../app/(app)/cards/materials-actions";
import { getReportSelectPreview, runReportSectionDraft } from "../../app/(app)/reports/cards/actions";
import { runReportOutline } from "../../app/(app)/reports/cards/outline-actions";
import { type DraftRunKind, draftExpect, draftProgress, rangeText, remoteDraftProgress } from "../../lib/ai/progress.ts";
import { type AiJob, JOB_KINDS, type JobKind } from "../../lib/ai/jobs.ts";
import { markAiJobSeen, seenAiJob, settleAiJob, useAiJobs, useAiJobsDone } from "../workspace/ai-jobs";
import { ATTACH_ACCEPT, ATTACH_LABEL, isAttachableName } from "../../lib/ai/writer.ts";
import type { DraftThreadData } from "../../lib/reports/draft-thread.ts";
import { AiComposer, type AiComposerMode } from "../workspace/ai-composer";
import { AiProgress } from "../workspace/ai-progress";
import { scrollWithin } from "../workspace/scroll-within";
import { DropMenu } from "../ui/drop-menu";
import { uploadSigned } from "../ui/file-drop";
import { type AskStep, useAsk } from "../ui/confirm-dialog";
import { overwriteSteps } from "./draft-review";
import { FrameworkGallery } from "./framework-gallery";
import { type FrameChoice, frameLabel, isEmptyFrame } from "../../lib/reports/framework-pick.ts";
import { patternOf } from "../../lib/reports/framework-patterns.ts";
import { T } from "../ui/kit";
import { type DraftSelection, type SourceFile, type SourceProps, kb, selectionLine } from "./draft-workbench";
import { type DraftPick, mergeSources, pickOf } from "../../lib/reports/draft-sources.ts";
import { AnswerHead, AskBubble, TodoList, TurnView } from "./draft-turns";

/**
 * plan = 구성안대로 집필(승인하고 집필과 같음) · revise = 자료 반영 고치기(구성안대로 쓴 초안이 있을 때 — 같은 구성안대로 새 자료·요청 글을 더해 다시 씀, 2026-10-29) ·
 * outline = 구성안 (다시) 만들기 · draft = 구성안 없이 바로 만들기
 */
export type DraftMode = "plan" | "revise" | "outline" | "draft";
export type DraftBusy = false | DraftMode;
export type DraftMsg = { ok: boolean; text: string } | null;

/** 구성안 메모 상한(서버와 같음) */
const MEMO_MAX = 500;
/** 요청 칸 메모의 접근 이름(답의 「구성안 다시 만들기」가 이 이름으로 찾아 초점 — 구성안 고치기 창에도 입력 칸이 있음) */
const MEMO_LABEL = "요청 메모(구성안 만들기·집필에 씀)";
/** 지금 시각(ms) — 확인 창 콜백(ask)에서 불리는 함수라 린트(react-hooks/purity)가 렌더 중 호출로 오인해 Date.now를 한 겹 감쌈 */
const nowMs = () => Date.now();
/** 구성안 고치기 창 단추 중 AI 요청(판면 줄이기·저장은 결정론이라 진행 줄 없음) → 진행 줄의 요청 종류 · 말풍선 이름 */
const OUTLINE_BUSY: Partial<Record<string, { kind: DraftRunKind; label: string }>> = {
  story: { kind: "story", label: "짜임 바꾸기" },
  again: { kind: "again", label: "구성안 다시 만들기" },
  approve: { kind: "plan", label: "승인하고 집필" },
};
/** 요청 칸 칩 이름(구성안 · 집필 · 고치기 — 바로 만들기는 답의 조용한 단추로만) */
const CHIP: Partial<Record<DraftMode, string>> = { outline: "구성안", plan: "집필", revise: "고치기" };
/** 요청 종류 → 백그라운드 작업 종류(진행 표시 자리) */
const JOB_OF: Record<DraftMode, JobKind> = { outline: "outline", plan: "plan", revise: "revise", draft: "draft" };

/** 지금 도는(또는 막 끝난·실패한) 요청 — 화면 상태(새로 고치면 사라짐). sig = 보낼 때의 대화 차례 열쇠(바뀌면 서버 기록이 이어받음) */
interface Live {
  id: number;
  kind: DraftRunKind;
  label: string;
  lines: string[];
  at: number;
  sig: string;
  state: "run" | "done" | "error";
  message?: string;
  /** 요청 칸·답 단추로 보낸 것(아니면 구성안 고치기 창) */
  own: boolean;
  /** 서버가 돌려준 작업 id(받은 뒤) */
  requestId?: number;
}

/**
 * 경평 초안 과제별 초안 오른쪽 「AI 초안」(2026-11-04 사용자 결정 — ChatGPT처럼 요청 → 짧은 답): 위는 대화(저장된 구성안·초안·블록 고치기 차례 + 지금 도는 요청),
 * 아래는 붙박이 요청 칸(요청 종류 칩 구성안·집필·고치기 · 초안 근거 한 줄 · 첨부 칩 · 📎 · 요청 메모 · 보내기 — 과제원장 AI 작성지원과 같은 부품).
 * 마지막 답에만 할 일(「채울 자료 N건 ▸」 — 예전 점검 결과)과 다음 단추(승인하고 집필 · 구성안 고치기 · 다시 만들기 …)가 붙음. 단추는 요청 칸 보내기와 같은 send
 * (덮어쓰기·「구성안 없이 계속할까요?」 확인 그대로), 서버 액션·인자는 예전과 같음. 구성안 상세 편집은 「구성안 고치기」로 여는 오른쪽 창(작업 공간).
 */
export function DraftCompose(props: {
  uid: string;
  canWrite: boolean;
  hasSpec: boolean;
  hasOutline: boolean;
  /** 지금 초안이 구성안대로 쓰였음(spec.plan) — 기본 요청 종류가 「고치기」 */
  draftFromOutline: boolean;
  /** 대화 차례·할 일·상태(서버가 셈 — lib/reports/draft-thread.ts) */
  thread: DraftThreadData;
  /** 카드 화면(원장 실적 넣기) */
  cardHref: string;
  /** 제출·승인된 보고서의 과제(부서) */
  locked: boolean;
  /** 구성안 고치기 창 열기 */
  onOpenOutline: () => void;
  /** 왼쪽 종이의 블록으로(-1 = 추진성과) */
  onGotoBlock: (j: number) => void;
  /** 할 일을 펼쳐 그 자리로(휴대폰 머리 「할 일」 — 바뀔 때마다) */
  todoFocus: number;
  cardFiles: SourceFile[];
  reportFiles: SourceFile[] | null;
  lensCount: number;
  /** 최종 점검표의 미흡 요약(구성안 요청에 넣음 — 진행 줄) */
  inspection?: string | null;
  sel: DraftSelection;
  busy: DraftBusy;
  setBusy: (b: DraftBusy) => void;
  onOpenSources: () => void;
  /** 사람이 고친 블록 순번(다시 만들기 전 확인) */
  humanEdits: number[];
  /** 구성안에서 사람이 고르거나 더한 블록 수(구성안 다시 만들기 전 확인) */
  outlineHuman: number;
  /** 모양 종류마다 근거 있음(구성안이 있을 때 — 틀 갤러리의 준비 정도) */
  avail: Record<string, { ok: boolean; why: string }> | null;
  /** 구성안대로 집필·자료 반영 고치기(고친 구성안이 있으면 먼저 저장 → 승인하고 집필 — 작업 공간이 구성안 편집 상태로 함). pick = 지금 고른 근거, request = 요청 칸 글, revise = 자료 반영 고치기로 보냄. 돌려주는 requestId = 시작한 작업 */
  onPlan: (o: { pick: DraftPick; request?: string; revise?: boolean }) => Promise<{ ok: boolean; message: string; requestId?: number }>;
  /** 지금 구성안의 이야기 틀·차선 */
  currentStory: string | null;
  alternative: string | null;
  /** 이 창이 지금 보이는지(숨은 동안 끝난 요청은 돌아올 때 그 자리로 옮김) */
  active: boolean;
  /** 구성안 고치기 창 단추(짜임 바꾸기·다시 만들기·승인하고 집필·절 다시 짜기)로 도는 요청 — 같은 대화에 차례로 보임(frame = 그 요청에 넣은 구성 패턴·예시 절 이름, part = 경영관리 절 하나) */
  outlineRun: { busy: string | null; at: number; msg: DraftMsg; frame?: { pattern?: string; example?: string } | null; part?: boolean };
  /** 짜임 고르기에서 「여러 안 비교」(지금 고른 근거로 — 작업 공간이 대화 창을 엶) */
  onAlts?: (alts: FrameChoice[], request: string, sources: { card: string[]; report: string[]; prior: string[] }) => void;
  /** 구성안에 저장된 근거(구성안대로 집필·자료 반영 고치기는 여기에 지금 고른 첨부를 더함, 구성안 고치기 창의 다시 만들기는 그대로 씀 — 없으면 옛 구성안: 첨부 없이 전년 절 자동) */
  outlineSources: { card: string[]; report: string[]; prior: string[] } | null;
  /** 전년 절 이름·자동으로 고르는 절 */
  prior: SourceProps["prior"];
  /** 경영관리 카드(평가내용 → 대주제 → 절): 바로 만들기·구성안 전 틀 고르기 없음 — 구성안에서 절마다 틀을 고름 */
  mg?: boolean;
  /** 관리자(짜임 고르기의 여러 안 비용 어림을 보임) */
  admin?: boolean;
  /** 끝난 여러 안 작업을 비교 창으로 다시 엶(다른 화면에 갔다 온 뒤 — 대화의 「여러 안 보기」) */
  onOpenAlts?: (requestId: number) => void;
}) {
  const router = useRouter();
  const { sel, busy, thread } = props;
  // 기본 요청 종류: 구성안대로 쓴 초안이 있으면 「고치기」(자료 반영 고치기), 구성안이 있으면 「집필」, 없으면 「구성안」.
  // 기본이 바뀌면(구성안·초안이 새로 생기면 — 만들기 뒤 새로 고침) 기본을 따르던 요청 종류를 새 기본으로 옮김
  const defaultMode: DraftMode = props.hasOutline ? (props.hasSpec && props.draftFromOutline ? "revise" : "plan") : "outline";
  const [mode, setMode] = useState<DraftMode>(defaultMode);
  const [hadDefault, setHadDefault] = useState(defaultMode);
  if (hadDefault !== defaultMode) {
    setHadDefault(defaultMode);
    setMode(mode === hadDefault || mode === "plan" || mode === "revise" ? defaultMode : mode);
  }
  const [memo, setMemo] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  // 구성안 만들 때 고른 짜임(짜임 고르기 — 이야기 틀·구성 패턴·2025 예시 절, 없으면 AI가 고름)
  const [frame, setFrame] = useState<FrameChoice | null>(null);
  const [gallery, setGallery] = useState(false);
  const [todoOpen, setTodoOpen] = useState(false);

  const story = props.currentStory ? `(${props.currentStory})` : "";
  const MODES: Array<[DraftMode, string, string]> = [
    ...(defaultMode === "revise" ? [["revise", "자료 반영 고치기", `지금 구성안${story}의 짜임(블록·라벨·재료)은 그대로 두고, 구성안 뒤 고른 첨부와 요청 글을 더해 초안을 다시 씁니다(${rangeText(draftExpect("revise", props.mg))})`] as [DraftMode, string, string]] : []),
    ...(props.hasOutline ? [["plan", "구성안대로 집필", `지금 구성안${story}의 틀·블록 순서·도식대로 초안을 씁니다 — 구성안 뒤 고른 첨부와 요청 글도 넣고, 구성안을 승인합니다(${rangeText(draftExpect("plan", props.mg))})`] as [DraftMode, string, string]] : []),
    props.mg
      ? ["outline", props.hasOutline ? "구성안 다시 만들기" : "구성안 만들기", `이 카드가 맡을 평가내용·대주제·절과 절마다 이야기 틀·블록·재료를 먼저 만들어 보고 고친 뒤 승인하면 그 짜임대로 집필합니다(${rangeText(draftExpect("outline", true))})`]
      : ["outline", props.hasOutline ? "구성안 다시 만들기" : "구성안 만들기", `재료표·평가 논점·이야기 틀·블록 목록·그림 자리를 먼저 만들어 보고 고친 뒤 승인하면 그 짜임대로 집필합니다(${rangeText(draftExpect("outline", props.mg))})`],
    // 경영관리는 평가내용·대주제·절을 먼저 정해야 해 구성안 없이 바로 쓰지 않음(서버 runReportSectionDraft도 막음)
    ...(props.mg ? [] : [["draft", props.hasSpec ? "바로 다시 만들기" : "바로 만들기", props.hasOutline ? `구성안을 쓰지 않고 AI가 짜임을 새로 정해 한 번에 초안을 씁니다(${rangeText(draftExpect("draft"))})` : `구성안 없이 한 번에 초안을 씁니다(${rangeText(draftExpect("draft"))})`] as [DraftMode, string, string]]),
  ];
  const label = (m: DraftMode) => MODES.find(([k]) => k === m)?.[1] ?? "";
  const hint = (m: DraftMode) => MODES.find(([k]) => k === m)?.[2] ?? "";
  // 요청 칸 칩: 지금 쓸 수 있는 종류만(구성안은 늘, 집필은 구성안이 있을 때, 고치기는 구성안대로 쓴 초안이 있을 때)
  const chips: AiComposerMode<DraftMode>[] = (["outline", "plan", "revise"] as const).filter((m) => MODES.some(([k]) => k === m)).map((m) => ({ key: m, label: CHIP[m] ?? m, title: `${label(m)} — ${hint(m)}` }));
  // 뺀 자료(다시 넣을 수 있는 것): 카드 전용 자료 + 보고서 추가자료
  const excluded = [...props.cardFiles.filter((f) => f.attachable && sel.off.has(`c:${f.id}`)).map((f) => ({ key: `c:${f.id}`, f, report: false })), ...(props.reportFiles ?? []).filter((f) => f.attachable && sel.off.has(`r:${f.id}`)).map((f) => ({ key: `r:${f.id}`, f, report: true }))];
  const fileChips = [...sel.card.map((f) => ({ key: `c:${f.id}`, f, report: false })), ...sel.report.map((f) => ({ key: `r:${f.id}`, f, report: true }))];

  // 대화 차례 열쇠(서버가 새 기록을 내려주면 바뀜 — 끝난 요청의 말풍선을 서버 차례가 이어받을 때를 앎)
  const sig = thread.turns.map((t) => t.key).join("|");
  const [live, setLive] = useState<Live | null>(null);
  const [liveSeq, setLiveSeq] = useState(0);
  // 구성안 고치기 창에서 도는 요청: 시작·끝을 그리는 중에 대화 차례로 옮김(창은 닫히고 대화에서 진행 줄을 봄)
  const outlineBusy = props.outlineRun.busy ? OUTLINE_BUSY[props.outlineRun.busy] : undefined;
  const outlineKey = outlineBusy ? `${props.outlineRun.busy}:${props.outlineRun.at}` : null;
  const [seenOutlineKey, setSeenOutlineKey] = useState<string | null>(null);
  if (seenOutlineKey !== outlineKey) {
    setSeenOutlineKey(outlineKey);
    if (outlineBusy) {
      setLiveSeq(liveSeq + 1);
      setLive({ id: liveSeq + 1, kind: outlineBusy.kind, label: props.outlineRun.part && outlineBusy.kind === "story" ? "절 다시 짜기" : outlineBusy.label, lines: [], at: props.outlineRun.at, sig, state: "run", own: false });
    } else if (live && !live.own && live.state === "run") setLive(props.outlineRun.msg && !props.outlineRun.msg.ok ? { ...live, state: "error", message: props.outlineRun.msg.text } : { ...live, state: "done" });
  }
  // 끝난 요청은 서버 기록이 바뀌면(새 차례) 지움 — 그 전까지는 말풍선을 남겨 깜박이지 않게
  if (live?.state === "done" && live.sig !== sig) setLive(null);
  // 자료 반영 고치기로 쓴 초안(서버 기록에는 「구성안대로 집필」로 남음 — 쓴 종류를 저장하지 않음): 이 화면에서 막 보낸 것이면 그 이름으로(보낼 때의 차례 열쇠)
  const [revised, setRevised] = useState<string | null>(null);

  // 이 카드의 경평 초안 작업(서버 기록 — 어느 화면·어느 PC에서 시작했든, components/workspace/ai-jobs.ts). 이 화면에서 지금 보낸 요청(live)이 없을 때
  // 진행 중이면 진행 차례로, 다른 화면에 가 있는 동안 실패했으면 그 이유를, 여러 안이 다 됐으면 「여러 안 보기」를 보임(한 번 본 것은 다시 안 띄움)
  const allJobs = useAiJobs();
  const latestJob = allJobs.filter((j) => j.card?.uid === props.uid && JOB_KINDS[j.kind].group === "report").sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
  const [dismissed, setDismissed] = useState<number | null>(null);
  const serverJob = !live && latestJob && latestJob.id !== dismissed && (latestJob.state === "running" || (!seenAiJob(latestJob.id) && (latestJob.state === "error" || latestJob.kind === "alts"))) ? latestJob : null;
  const dismissJob = (id: number) => {
    markAiJobSeen(id);
    setDismissed(id);
  };
  // 이 카드의 경평 초안 작업이 끝나면 화면을 새로 그림(구성안·초안은 서버가 저장함 — 다른 화면에서 시작한 것도)
  const onJobsDone = useCallback(
    (done: AiJob[]) => {
      if (done.some((j) => j.card?.uid === props.uid && JOB_KINDS[j.kind].group === "report" && j.state === "ok" && j.kind !== "alts")) router.refresh();
    },
    [props.uid, router],
  );
  useAiJobsDone(onJobsDone);

  const running = live?.state === "run" ? live : null;
  const blocked = Boolean(running) || Boolean(busy) || Boolean(uploading) || serverJob?.state === "running";
  // 진행 줄의 「넣은 근거」(서버 prepareDraft와 같음): 구성안 만들기·바로 만들기는 지금 고른 근거, 구성안대로 집필·자료 반영 고치기는 구성안에 저장된 근거 ∪ 지금 고른 첨부(뺀 자료 제외 —
  // approveReportOutline mergeSources), 구성안 고치기 창의 다시 만들기·짜임 다시 짜기는 구성안에 저장된 근거
  const priorNames = (keys: string[]) =>
    keys
      .map((k) => props.prior.options.find((o) => o.key === k)?.label)
      .filter((x): x is string => Boolean(x))
      .slice(0, 2);
  const namesOf = (files: SourceFile[], ids: string[]) => ids.map((id) => files.find((f) => f.id === id)?.fileName).filter((x): x is string => Boolean(x));
  const src = props.outlineSources;
  const pick = pickOf(
    sel.card.map((f) => f.id),
    sel.report.map((f) => f.id),
    sel.off,
  );
  const merged = mergeSources(src, pick);
  const planFiles = [...namesOf(props.cardFiles, merged.sources.card), ...namesOf(props.reportFiles ?? [], merged.sources.report)];
  const addedFiles = [...namesOf(props.cardFiles, merged.added.card), ...namesOf(props.reportFiles ?? [], merged.added.report)];
  // 이번 요청에 요청 글을 보냈는지(진행 줄 「담당자 요청」 — 보낼 때 정함)
  const [sentRequest, setSentRequest] = useState(false);
  // 진행 줄의 「공통 지식」: 이 카드에 선별 방식이 적용되면 고른 원문 수(서버가 요청 때와 같은 묶음으로 셈, null이면 통째로 넣기). 요청을 보낼 수 없으면 안 물음
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    if (!props.canWrite) return;
    void getReportSelectPreview(props.uid).then(setSelected);
  }, [props.uid, props.canWrite]);
  const picked = selected ?? undefined;
  const spec =
    running &&
    draftProgress(
      running.kind,
      running.kind === "outline" || running.kind === "draft"
        ? { files: [...sel.card, ...sel.report].map((f) => f.fileName), prior: priorNames(sel.priorKeys), lens: props.lensCount, inspection: props.inspection, mg: props.mg, selected: picked, frame: running.own && running.kind === "outline" && frame ? { ...(frame.pattern ? { pattern: patternOf(frame.pattern)?.name ?? frame.pattern } : {}), ...(frame.example ? { example: frame.example.title } : {}) } : undefined }
        : running.kind === "plan" || running.kind === "revise"
          ? { files: planFiles, added: addedFiles, request: running.own && sentRequest, prior: priorNames(src ? src.prior : props.prior.auto), lens: props.lensCount, inspection: props.inspection, mg: props.mg, selected: picked }
          : { files: [...namesOf(props.cardFiles, src?.card ?? []), ...namesOf(props.reportFiles ?? [], src?.report ?? [])], prior: priorNames(src ? src.prior : props.prior.auto), lens: props.lensCount, inspection: props.inspection, mg: props.mg, selected: picked, frame: running.own ? undefined : (props.outlineRun.frame ?? undefined) },
    );

  // 스크롤(과제원장 AI 작성지원과 같음): 요청을 보내면 맨 아래(말풍선 + 진행 줄), 끝나 새 차례가 오면 마지막 답의 첫머리, 창을 열면 마지막 답의 첫머리.
  // 숨은 동안(다른 패널·닫힌 시트)에는 자리를 기억했다가 보일 때 옮김(scrollWithin이 숨은 상자에서는 false)
  const boxRef = useRef<HTMLDivElement>(null);
  const focus = useRef<"end" | "last" | null>("last");
  const liveKey = live ? `${live.id}:${live.state}` : "";
  useEffect(() => {
    focus.current = live && live.state !== "done" ? "end" : "last";
    // 차례·요청 상태가 바뀔 때만(그 사이 글·메모가 바뀔 때는 움직이지 않음)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, liveKey]);
  useEffect(() => {
    if (!props.active) return;
    const box = boxRef.current;
    if (!box || !focus.current) return;
    const at = focus.current;
    const el = at === "end" ? box.querySelector("[data-live]") : (box.querySelector("li[data-turn]:last-child [data-answer]") ?? box.querySelector("[data-empty]"));
    if (el && scrollWithin(box, el, at === "end" ? "end" : "start", true)) focus.current = null;
  }, [sig, liveKey, props.active]);
  // 휴대폰 머리 「할 일」: 할 일을 펼치고 그 자리로
  const [seenTodo, setSeenTodo] = useState(props.todoFocus);
  if (seenTodo !== props.todoFocus) {
    setSeenTodo(props.todoFocus);
    setTodoOpen(true);
  }
  useEffect(() => {
    if (!props.todoFocus) return;
    const id = requestAnimationFrame(() => {
      const box = boxRef.current;
      const el = box?.querySelector("[data-todo]");
      if (box && el) scrollWithin(box, el, "start", false);
    });
    return () => cancelAnimationFrame(id);
  }, [props.todoFocus]);

  /** 끌어 놓거나 고른 파일: AI가 읽는 형식·크기만 카드 전용 자료로 올림(새로 올린 자료는 곧바로 고른 근거에 들어감 — 다음 집필·자료 반영 고치기·블록 고치기가 씀) */
  const addFiles = async (list: FileList | File[]) => {
    if (!props.canWrite) return;
    setErr(null);
    let added = 0;
    for (const file of Array.from(list)) {
      if (!isAttachableName(file.name)) {
        setErr(`「${file.name}」 — AI는 ${ATTACH_LABEL} 파일만 읽습니다.`);
        continue;
      }
      if (file.size > 50 * 1024 * 1024) {
        setErr(`「${file.name}」 — 파일당 50MB까지입니다.`);
        continue;
      }
      setUploading(file.name);
      const r = await uploadSigned(
        "card-materials",
        file,
        (name, size) => startCardMaterialUpload(props.uid, name, size),
        (path, name, mime, size) => finishCardMaterialUpload(props.uid, path, name, mime, size),
      );
      if (r.ok) added++;
      else setErr(r.message ?? `「${file.name}」을(를) 올리지 못했습니다.`);
    }
    setUploading(null);
    if (added) router.refresh();
  };

  const { ask, dialog: askDialog } = useAsk();
  const doSend = async (m: DraftMode) => {
    const sources = { card: sel.card.map((f) => f.id), report: sel.report.map((f) => f.id), prior: sel.priorKeys };
    // 요청 글은 요청 칸이 그 종류일 때 쓴 것만(답의 단추가 다른 종류를 보내면 다른 종류에 쓴 메모를 넣지 않음), 바로 만들기는 받지 않음
    const own = m === mode && m !== "draft";
    const request = own ? memo.trim() : "";
    const files = sel.card.length + sel.report.length;
    const id = liveSeq + 1;
    setLiveSeq(id);
    const me: Live = { id, kind: m, label: label(m), lines: [request, m === "outline" && frame && !isEmptyFrame(frame) ? `짜임: ${frameLabel(frame)}` : "", files ? `첨부 ${files}건` : ""].filter(Boolean), at: nowMs(), sig, state: "run", own: true };
    setLive(me);
    setSentRequest(Boolean(request));
    setRevised(null);
    props.setBusy(m);
    // 앞서 보인 실패·여러 안 알림은 새 요청으로 대신함
    if (latestJob && latestJob.state !== "running") markAiJobSeen(latestJob.id);
    try {
      // 서버는 시작만 하고 작업 id를 돌려줌 — 작업이 끝날 때까지 기다림(다른 화면에 가도 서버는 끝까지 돌고, 돌아오면 서버 기록으로 진행 줄을 이어 받음)
      const started = m === "outline" ? runReportOutline(props.uid, sources, request || undefined, frame ?? undefined) : m === "plan" || m === "revise" ? props.onPlan({ pick, request: request || undefined, revise: m === "revise" }) : runReportSectionDraft(props.uid, sources);
      const r = await settleAiJob(started, JOB_OF[m], { card: { uid: props.uid }, onStart: (requestId) => setLive((l) => (l && l.id === id ? { ...l, requestId } : l)) });
      if (r.requestId) markAiJobSeen(r.requestId);
      setLive(r.ok ? { ...me, state: "done" } : { ...me, state: "error", message: r.message });
      if (r.ok) {
        if (own) setMemo("");
        if (m === "outline") setFrame(null);
        if (m === "revise") setRevised(sig);
        router.refresh();
      }
    } catch {
      const text = "요청이 끊겼습니다. 잠시 뒤 다시 시도해 주세요.";
      setLive({ ...me, state: "error", message: text });
    } finally {
      props.setBusy(false);
    }
  };
  // m: 보낼 요청 종류 — 요청 칸 보내기는 고른 칩(mode), 답의 단추는 그 단추의 종류. 확인 창은 둘 다 같음
  const send = (m: DraftMode = mode) => {
    if (!props.canWrite || blocked) return;
    // 확인이 필요한 순서 그대로 차례로 묻고, 모두 확인하면(필요 없으면 바로) 보냄 — 확인하는 동안 요청 칸은 모달에 막혀 값이 바뀌지 않으므로 보내는 값은 누른 때의 것을 씀
    const steps: AskStep[] = [];
    // 사람이 고친 블록이 있으면 「구성안 다시 만들기」「바로 다시 만들기」 전에 확인(덮이면 수정 이력에만 남음)
    if ((m === "outline" && props.hasOutline) || (m === "draft" && props.hasSpec)) steps.push(...overwriteSteps(props.humanEdits));
    if (m === "outline" && props.hasOutline && props.outlineHuman > 0) {
      steps.push({ title: "구성안을 다시 만들까요?", body: [`구성안에 담당자가 고르거나 더한 블록 ${props.outlineHuman}개가 있습니다. 다시 만들면 AI가 새로 짜고 고친 내용은 사라집니다.`], confirmLabel: "다시 만들기" });
    }
    // 구성안이 있는데 바로 만들기: 구성안(고른 틀)을 쓰지 않는다는 것을 먼저 알림
    if (m === "draft" && props.hasOutline) {
      steps.push({
        title: "구성안 없이 계속할까요?",
        body: [`바로 만들기는 지금 구성안${props.currentStory ? `(${props.currentStory})` : ""}을 쓰지 않고 AI가 짜임을 새로 정합니다.`, "구성안대로 쓰려면 「집필」을 고르세요."],
        confirmLabel: label("draft"),
      });
    }
    if ((m === "plan" || m === "revise") && props.hasSpec) steps.push(...overwriteSteps(props.humanEdits));
    ask(steps, () => void doSend(m));
  };
  /** 「구성안 (다시) 만들기」: 바로 보내지 않음 — 요청 칸을 그 종류로 바꾸고 메모 칸에 초점(바라는 점·짜임을 정하고 보냄) */
  const askOutline = () => {
    setMode("outline");
    requestAnimationFrame(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${MEMO_LABEL}"]`);
      if (!ta) return;
      ta.focus();
      ta.scrollIntoView({ block: "nearest" });
    });
  };

  // 다음 단추(마지막 답 아래): 저장된 상태로만 정함 — 아직 집필하지 않은 구성안이면 승인하고 집필 · 구성안 고치기 · 다시 만들기, 초안이 있으면 고치기·다시 쓰기
  const outlineLast = thread.turns.at(-1)?.kind === "outline";
  const btn = (key: string, text: string, onClick: () => void, kind: "primary" | "secondary" | "quiet", title?: string, make = true) => (
    <button key={key} type="button" disabled={make && blocked} title={title} onClick={onClick} className={kind === "primary" ? T.btnPrimarySm : kind === "quiet" ? T.btnQuiet : T.btnSm}>
      {text}
    </button>
  );
  const editBtn = btn("edit", "구성안 고치기", props.onOpenOutline, "secondary", "블록·도식·재료·짜임을 고치는 창을 엽니다(왼쪽은 구성안 판면)", false);
  const againBtn = btn("again", props.hasOutline ? "구성안 다시 만들기" : "구성안 만들기", askOutline, "quiet", `요청 칸에서 바라는 점·짜임을 정하고 보냅니다 — ${hint("outline")}`);
  const draftBtn = props.mg ? [] : [btn("draft", label("draft"), () => send("draft"), "quiet", hint("draft"))];
  const actions = props.locked
    ? thread.submit
      ? [
          <Link key="report" href={thread.submit.href} className={T.btnSm}>
            보고서 상태 보기
          </Link>,
        ]
      : []
    : !props.canWrite
      ? props.hasOutline
        ? [btn("view", "구성안 보기", props.onOpenOutline, "secondary", "구성안 창에서 재료·짜임을 봅니다", false)]
        : []
      : outlineLast
        ? [btn("plan", props.hasSpec ? "승인하고 다시 집필" : "승인하고 집필", () => send("plan"), "primary", hint("plan")), editBtn, againBtn, ...draftBtn]
        : props.hasSpec
          ? [...(props.hasOutline ? [props.draftFromOutline ? btn("revise", "자료 반영 고치기", () => send("revise"), "primary", hint("revise")) : btn("plan", "구성안대로 집필", () => send("plan"), "primary", hint("plan")), editBtn] : []), againBtn, ...draftBtn]
          : [];
  // 마지막 답에 붙는 것: 할 일 + 다음 단추 + 확정 링크
  const state = (
    <div className="flex min-w-0 flex-col gap-2.5 pt-1">
      <TodoList todo={thread.todo} cardHref={props.cardHref} open={todoOpen} onToggle={setTodoOpen} />
      {actions.length > 0 && <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2">{actions}</div>}
      {/* 확정은 과제별 화면에서 하지 않음 — 부서 허브(성과관리팀은 보고서 검토)로. 잠기면 다음 단추가 그리로 감 */}
      {props.hasSpec && thread.submit && !props.locked && (
        <Link href={thread.submit.href} className={`${T.btnQuiet} self-start`}>
          {thread.submit.label}
        </Link>
      )}
    </div>
  );
  // 자료 반영 고치기로 막 쓴 초안: 서버 기록이 바뀐 뒤의 마지막 초안 차례만 이름을 바꿈
  const revisedKey = revised !== null && revised !== sig ? thread.turns.findLast((t) => t.kind === "draft")?.key : undefined;
  const lastOutlineKey = thread.turns.findLast((t) => t.kind === "outline")?.key;

  return (
    <section
      aria-label="AI 초안"
      className="relative flex min-h-0 grow flex-col bg-paper"
      onDragOver={(e) => {
        if (!props.canWrite || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        if (!props.canWrite || !e.dataTransfer.files.length) return;
        e.preventDefault();
        setOver(false);
        void addFiles(e.dataTransfer.files);
      }}
    >
      {over && (
        <div className="pointer-events-none absolute inset-2 z-pop flex items-center justify-center rounded-xl border-2 border-dashed border-navy bg-paper/90 text-sm font-semibold text-navy">
          놓으면 이 과제의 카드 전용 자료로 올려 근거로 씁니다 · {ATTACH_LABEL}
        </div>
      )}

      {/* 대화: 요청(오른쪽 말풍선) → 답(짧은 요약 + 마지막 답에만 할 일·다음 단추) */}
      <div ref={boxRef} className="min-h-0 grow overflow-y-auto px-5 py-5">
        <div className="mx-auto flex max-w-[760px] min-w-0 flex-col gap-5">
          {thread.turns.length === 0 && (
            <div data-empty className="flex min-w-0 flex-col gap-2.5">
              <AnswerHead at={null} />
              <p className="text-sm leading-[1.6] break-keep text-ink">
                {props.mg ? "경영관리는 구성안에서 이 카드가 맡을 평가내용·대주제·절을 먼저 정한 뒤 집필합니다." : "구성안부터 만들어요 — 재료·짜임을 먼저 보고 고친 뒤 승인하면 그대로 집필합니다."}
                {props.canWrite && " 아래 칸에 바라는 점을 적고(선택) 보내세요."}
              </p>
              {thread.todo.groups.length > 0 && <TodoList todo={thread.todo} cardHref={props.cardHref} open={todoOpen} onToggle={setTodoOpen} />}
              {props.canWrite && !props.mg && <div className="flex">{btn("draft", "구성안 없이 바로 만들기", () => send("draft"), "quiet", hint("draft"))}</div>}
            </div>
          )}
          {thread.turns.length > 0 && (
            <ol className="m-0 flex min-w-0 list-none flex-col gap-5 p-0">
              {thread.turns.map((t, i) => (
                <TurnView
                  key={t.key}
                  turn={t}
                  askOverride={t.key === revisedKey ? { ask: "자료 반영 고치기", headline: "자료를 반영해 다시 썼어요(왼쪽 종이)" } : null}
                  state={i === thread.turns.length - 1 ? state : undefined}
                  onGotoBlock={props.onGotoBlock}
                  onOpenOutline={props.onOpenOutline}
                  showOutlineLink={t.kind === "outline" && t.key === lastOutlineKey && i < thread.turns.length - 1}
                />
              ))}
            </ol>
          )}
          {serverJob && (
            // 서버 기록의 작업(다른 화면·다른 PC에서 시작했거나 이 화면을 떠난 사이 끝난 것) — 근거 목록은 이 화면이 모르므로 비움
            <div data-live data-job={serverJob.id} className="flex min-w-0 flex-col gap-2.5">
              <AskBubble label={JOB_KINDS[serverJob.kind].label} lines={[]} />
              {serverJob.state === "running" && <AiProgress key={`job-${serverJob.id}`} spec={remoteDraftProgress(serverJob.kind, props.mg)} startedAt={Date.parse(serverJob.at)} />}
              {serverJob.state === "error" && (
                <div role="alert" className="flex min-w-0 items-start gap-2 rounded-md border border-error-line bg-error-bg px-3 py-2 text-ui text-error-strong">
                  <span className="min-w-0 grow">{serverJob.message}</span>
                  <button type="button" onClick={() => dismissJob(serverJob.id)} aria-label="알림 닫기" className="flex size-5 shrink-0 items-center justify-center rounded hover:text-ink">
                    <X size={13} aria-hidden="true" />
                  </button>
                </div>
              )}
              {serverJob.state === "ok" && serverJob.kind === "alts" && (
                <AnswerHead at={serverJob.endAt}>
                  <span className="text-ui text-ink">여러 안을 다 만들었어요</span>
                  {props.onOpenAlts && props.canWrite && (
                    <button type="button" onClick={() => props.onOpenAlts?.(serverJob.id)} className={T.btnSm}>
                      여러 안 보기
                    </button>
                  )}
                  <button type="button" onClick={() => dismissJob(serverJob.id)} className={T.btnQuiet} title="고르지 않고 닫기 — 결과는 저장되지 않음">
                    닫기
                  </button>
                </AnswerHead>
              )}
            </div>
          )}
          {live && (
            <div data-live className="flex min-w-0 flex-col gap-2.5">
              <AskBubble label={live.label} lines={live.lines} />
              {live.state === "run" && spec && <AiProgress key={`${live.kind}-${live.at}`} spec={spec} startedAt={live.at} />}
              {live.state === "done" && (
                <AnswerHead at={null}>
                  <span role="status" className="text-ui text-muted-2">
                    다 됐어요 — 화면을 새로 그리는 중…
                  </span>
                </AnswerHead>
              )}
              {live.state === "error" && (
                <p role="alert" className="rounded-md border border-error-line bg-error-bg px-3 py-2 text-ui text-error-strong">
                  {live.message}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 요청(아래 고정): 요청 종류 칩 → 초안 근거 → 첨부 → 메모·보내기 */}
      {props.canWrite ? (
        <AiComposer
          onSubmit={() => send()}
          modes={chips}
          mode={mode === "draft" ? defaultMode : mode}
          onMode={(m) => {
            setMode(m);
            if (m !== "outline") setFrame(null);
          }}
          below={
            <>
              <section aria-label="초안 근거" className="flex min-w-0 items-center gap-2 text-xs">
                <span className="min-w-0 truncate text-muted-2" title={`넣을 근거 — 원장 카드는 늘 넣음 · 보내면 ${rangeText(draftExpect(mode, props.mg))}`}>
                  초안 근거 — {selectionLine(sel)}
                </span>
                <button type="button" onClick={props.onOpenSources} className="shrink-0 text-link hover:underline">
                  근거 자료 열기
                </button>
              </section>
              {mode === "outline" && !props.mg && (
                <section aria-label="짜임" className="flex min-w-0 items-center gap-2 text-xs">
                  <span className="shrink-0 text-muted-2">짜임 —</span>
                  {frame && !isEmptyFrame(frame) ? (
                    <span className="flex h-6 min-w-0 items-center gap-1 rounded-md border border-navy/40 bg-paper pr-1 pl-2 text-ink" title={frameLabel(frame)}>
                      <span className="min-w-0 truncate">{frameLabel(frame)}</span>
                      <button type="button" disabled={Boolean(busy)} onClick={() => setFrame(null)} aria-label="고른 짜임 빼기(AI가 고름)" className="flex size-6 shrink-0 items-center justify-center rounded text-muted hover:text-ink disabled:cursor-not-allowed disabled:text-field-line disabled:hover:text-field-line">
                        <X size={12} aria-hidden="true" />
                      </button>
                    </span>
                  ) : (
                    <span className="min-w-0 truncate text-muted-2">AI가 재료를 보고 고름</span>
                  )}
                  <button type="button" disabled={Boolean(busy)} onClick={() => setGallery(true)} className="shrink-0 text-link hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline" title="이야기 틀 · 구성 패턴 · 2025 예시 절 중에서 고르거나 여러 안을 만들어 견줌">
                    짜임 고르기
                  </button>
                </section>
              )}
            </>
          }
          attachments={
            (fileChips.length > 0 || uploading || excluded.length > 0) && (
              <div aria-label="첨부" className="flex min-w-0 flex-wrap items-center gap-1.5">
                {fileChips.map(({ key, f, report }) => (
                  <span key={key} className="flex h-7 max-w-[240px] min-w-0 items-center gap-1 rounded-md border border-navy/40 bg-paper pr-1 pl-2 text-xs text-ink" title={`${report ? "보고서 추가자료" : "카드 전용 자료"} · ${f.fileName} · ${kb(f.bytes)}`}>
                    <FileText size={13} aria-hidden="true" className="shrink-0 text-navy" />
                    <span className="min-w-0 truncate">{f.fileName}</span>
                    <button type="button" disabled={Boolean(busy)} onClick={() => sel.toggle(key)} aria-label={`${f.fileName} 첨부 빼기`} className="flex size-6 shrink-0 items-center justify-center rounded text-muted hover:text-ink disabled:cursor-not-allowed disabled:text-field-line disabled:hover:text-field-line">
                      <X size={12} aria-hidden="true" />
                    </button>
                  </span>
                ))}
                {uploading && (
                  <span role="status" className="flex h-7 max-w-[240px] min-w-0 items-center rounded-md border border-dashed border-field-line px-2 text-xs text-muted-2">
                    <span className="min-w-0 truncate">{uploading} 올리는 중…</span>
                  </span>
                )}
                {excluded.length > 0 && (
                  // 목록은 화면 맨 위 층에 띄움(요청 입력줄의 높이 제한에 잘리지 않게 — components/ui/drop-menu.tsx)
                  <DropMenu label={<>{excluded.some((x) => x.report) ? "자료" : "카드 자료"} {excluded.length} ▾</>} buttonClass="h-7 rounded-md border border-field-line bg-paper px-2 text-xs text-muted-2 hover:border-navy">
                    {(close) =>
                      excluded.map(({ key, f, report }) => (
                        <button
                          key={key}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            close();
                            sel.toggle(key);
                          }}
                          className="flex min-w-0 items-center gap-2 px-3 py-1.5 text-left text-xs text-ink hover:bg-thead"
                          title={f.fileName}
                        >
                          <span className="min-w-0 grow truncate">{f.fileName}</span>
                          {report && <span className="shrink-0 text-xs text-muted">보고서</span>}
                          <span className="shrink-0 font-mono text-xs text-muted">{kb(f.bytes)}</span>
                        </button>
                      ))
                    }
                  </DropMenu>
                )}
              </div>
            )
          }
          attach={{ accept: ATTACH_ACCEPT, disabled: Boolean(uploading) || Boolean(busy), title: `파일 첨부 — 카드 전용 자료로 올려 고른 근거에 넣음(다음 집필·자료 반영 고치기·블록 고치기가 씀), 끌어 놓아도 됩니다(${ATTACH_LABEL})`, onFiles: (files) => void addFiles(files) }}
          value={memo}
          onChange={setMemo}
          maxLength={MEMO_MAX}
          ariaLabel={MEMO_LABEL}
          placeholder={mode === "outline" ? "구성안에 바라는 점(선택) ⌘↵" : mode === "revise" ? "고칠 방향(선택 — 짜임은 그대로, 근거로는 쓰지 않음) ⌘↵" : "집필에 바라는 점(선택 — 짜임은 그대로, 근거로는 쓰지 않음) ⌘↵"}
          submitDisabled={blocked}
          submitLabel={`${label(mode === "draft" ? defaultMode : mode)} 요청`}
          error={
            err && (
              <p role="alert" className="text-xs text-error">
                {err}
              </p>
            )
          }
        />
      ) : (
        <p className="shrink-0 border-t border-line bg-thead px-5 py-3 text-xs leading-5 text-muted-2">{props.locked ? "확정(또는 제출)한 보고서의 과제라 고칠 수 없습니다." : "이 과제를 맡은 부서나 성과관리팀이 초안을 만듭니다."}</p>
      )}
      <FrameworkGallery
        open={gallery}
        uid={props.uid}
        current={props.currentStory}
        aiStory={props.currentStory}
        alternative={props.alternative}
        avail={props.avail}
        initial={frame}
        confirmLabel="이 짜임으로 정하기"
        alts={props.canWrite && Boolean(props.onAlts)}
        showCost={props.admin}
        onPick={(x) => {
          setFrame(isEmptyFrame(x) ? null : x);
          setGallery(false);
        }}
        onAlts={(cands) => {
          // 여러 안의 요청 글 = 요청 칸 메모(이 창에는 요청 칸이 따로 없음), 근거 = 지금 고른 근거. 사람이 고친 구성안을 덮을지는 안을 고를 때 물음
          setGallery(false);
          props.onAlts?.(cands, memo.trim(), { card: sel.card.map((f) => f.id), report: sel.report.map((f) => f.id), prior: sel.priorKeys });
        }}
        onClose={() => setGallery(false)}
      />
      {askDialog}
    </section>
  );
}
