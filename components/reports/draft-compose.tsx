"use client";

import { ChevronRight, FileText, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { finishCardMaterialUpload, startCardMaterialUpload } from "../../app/(app)/cards/materials-actions";
import { getReportSelectPreview, runReportSectionDraft } from "../../app/(app)/reports/cards/actions";
import { runReportOutline } from "../../app/(app)/reports/cards/outline-actions";
import { type DraftRunKind, OUTLINE_RUNS, draftExpect, draftProgress, rangeText } from "../../lib/ai/progress.ts";
import { ATTACH_ACCEPT, ATTACH_LABEL, isAttachableName } from "../../lib/ai/writer.ts";
import { AiComposer } from "../workspace/ai-composer";
import { AiProgress } from "../workspace/ai-progress";
import { holdScroll } from "../workspace/scroll-within";
import { DropMenu } from "../ui/drop-menu";
import { uploadSigned } from "../ui/file-drop";
import { type AskStep, useAsk } from "../ui/confirm-dialog";
import { overwriteSteps } from "./draft-review";
import { FrameworkGallery } from "./framework-gallery";
import { type FrameChoice, frameLabel, isEmptyFrame } from "../../lib/reports/framework-pick.ts";
import { patternOf } from "../../lib/reports/framework-patterns.ts";
import { FIT_RANGE_TEXT, fitVerdict } from "../../lib/reports/fit.ts";
import { type DraftStage, type StageAction, type StageKey, draftStage } from "../../lib/reports/draft-stage.ts";
import { T, Tag } from "../ui/kit";
import { StatusMark } from "../ui/next-steps";
import { MARK_TAG } from "../ui/status-tone.ts";
import { type DraftSelection, type SourceFile, type SourceProps, kb, selectionLine } from "./draft-workbench";

/** plan = 구성안대로 집필(승인하고 집필과 같음) · outline = 구성안 (다시) 만들기 · draft = 구성안 없이 바로 만들기 */
export type DraftMode = "plan" | "outline" | "draft";
export type DraftBusy = false | DraftMode;
export type DraftMsg = { ok: boolean; text: string } | null;

/** 단계 레일 재료(서버가 셈 — app/(app)/reports/cards/[uid]/derive.ts draftMetaOf) */
export interface DraftMeta {
  /** 초안을 만든 뒤 원장이 바뀜 */
  stale: boolean;
  /** 구성안대로 쓴 초안의 짜임 맞음(spec.plan) */
  plan: { matched: number; total: number } | null;
  /** 판면 어림(mm) */
  fit: { total: number; budget: number } | null;
  /** 점검 결과 탭 할 일 나눔: 채울 자료 · 확인할 것 */
  need: number;
  warn: number;
  /** 구성안 한 줄(모델·시각) */
  outlineInfo: string | null;
  /** 「제출은 …에서」 링크(점검 단계 아래, 잠김이면 주 행동 「보고서 상태 보기」가 감) */
  submit: { href: string; label: string } | null;
}

/** 구성안 메모 상한(서버와 같음) */
const MEMO_MAX = 500;
/** 요청 칸 메모의 접근 이름(레일 「구성안 (다시) 만들기」가 이 이름으로 찾아 초점) */
const MEMO_LABEL = "요청 메모(구성안 만들기에만 씀)";
/** 지금 시각(ms) — 확인 창 콜백(ask)에서 불리는 함수라 린트(react-hooks/purity)가 렌더 중 호출로 오인해 Date.now를 한 겹 감쌈 */
const nowMs = () => Date.now();
/** 구성안 패널 단추 중 AI 요청(판면 줄이기·저장은 결정론이라 진행 줄 없음) → 진행 줄의 요청 종류 */
const OUTLINE_BUSY: Partial<Record<string, DraftRunKind>> = { story: "story", again: "again", approve: "plan" };
/** 옮겨 갈 자리: 진행 줄 · 구성안 머리(맨 위) · 요청 칸 결과 알림 · 구성안 패널 결과 알림 */
type Spot = "progress" | "top" | "msg" | "outline-msg";

/**
 * 경평 초안 과제별 초안 오른쪽 「AI 초안」 탭(과제원장 AI 작성지원과 같은 짜임): 맨 위는 단계 레일(구성안 · 초안 · 점검 + 주 단추 하나 + 「다시 쓰기」 묶음 — 2026-10-21),
 * 그 아래 결과(구성안이 있으면 구성안 패널·진행·알림), 아래는 붙박이 요청 칸(요청 종류 칩 · 초안 근거 한 줄 · 첨부 칩 · 📎 · 요청 메모 · 보내기).
 * 레일의 만들기 단추는 요청 칸 보내기와 같은 send(요청 종류만 그 단추 것 — 덮어쓰기 확인 그대로). 서버 액션·인자는 예전 근거 고르기 패널과 같음.
 */
export function DraftCompose(props: {
  uid: string;
  canWrite: boolean;
  hasSpec: boolean;
  hasOutline: boolean;
  /** 구성안 패널(서버가 그림) */
  outline: ReactNode | null;
  /** 지금 초안 한 줄(모델·시각) — 단계 레일의 초안 메타 줄 */
  draftInfo: string | null;
  meta: DraftMeta;
  /** 구성안 승인(구성안대로 집필함) */
  outlineApproved: boolean;
  /** 점검 결과 탭 할 일(채울 자료 + 확인할 것) */
  checkCount: number;
  /** 제출·승인된 보고서의 과제(부서) */
  locked: boolean;
  /** 부서 화면 보기(읽기 전용) */
  deptView: boolean;
  /** 「점검 결과」 탭으로 */
  onShowCheck: () => void;
  /** 구성안 판·구성안 패널 펼치기 */
  onShowOutline: () => void;
  cardFiles: SourceFile[];
  reportFiles: SourceFile[] | null;
  lensCount: number;
  /** 최종 점검표의 미흡 요약(구성안 요청에 넣음 — 진행 줄) */
  inspection?: string | null;
  sel: DraftSelection;
  busy: DraftBusy;
  setBusy: (b: DraftBusy) => void;
  msg: DraftMsg;
  setMsg: (m: DraftMsg) => void;
  onOpenSources: () => void;
  /** 사람이 고친 블록 순번(다시 만들기 전 확인) */
  humanEdits: number[];
  /** 구성안에서 사람이 고르거나 더한 블록 수(구성안 다시 만들기 전 확인) */
  outlineHuman: number;
  /** 모양 종류마다 근거 있음(구성안이 있을 때 — 틀 갤러리의 준비 정도) */
  avail: Record<string, { ok: boolean; why: string }> | null;
  /** 구성안대로 집필(고친 구성안이 있으면 먼저 저장 → 승인하고 집필 — 작업 공간이 구성안 편집 상태로 함) */
  onPlan: () => Promise<{ ok: boolean; message: string }>;
  /** 지금 구성안의 이야기 틀·차선 */
  currentStory: string | null;
  alternative: string | null;
  /** 이 탭이 지금 보이는지(숨은 동안 끝난 요청은 돌아올 때 결과로 옮김) */
  active: boolean;
  /** 구성안 패널 단추(짜임 바꾸기·다시 만들기·승인하고 집필)로 도는 요청 — 같은 진행 줄을 여기 보임(frame = 그 요청에 넣은 구성 패턴·예시 절 이름) */
  outlineRun: { busy: string | null; at: number; msg: DraftMsg; frame?: { pattern?: string; example?: string } | null };
  /** 짜임 고르기에서 「여러 안 비교」(지금 고른 근거로 — 작업 공간이 대화 창을 엶) */
  onAlts?: (alts: FrameChoice[], request: string, sources: { card: string[]; report: string[]; prior: string[] }) => void;
  /** 구성안에 저장된 근거(구성안대로 집필·다시 만들기가 씀 — 없으면 옛 구성안: 첨부 없이 전년 절 자동) */
  outlineSources: { card: string[]; report: string[]; prior: string[] } | null;
  /** 전년 절 이름·자동으로 고르는 절 */
  prior: SourceProps["prior"];
  /** 경영관리 카드(평가내용 → 대주제 → 절): 바로 만들기·구성안 전 틀 고르기 없음 — 구성안에서 절마다 틀을 고름 */
  mg?: boolean;
}) {
  const router = useRouter();
  const { sel, busy } = props;
  // 구성안이 있으면 「구성안대로 집필」이 기본(2026-09-28 — 예전에는 「구성안 다시 만들기 | 바로 다시 만들기」뿐이라 바로 만들기로 써서 고른 틀이 무시됐음).
  // 구성안이 새로 생기면(만들기 뒤 새로 고침) 그 칩으로 옮김
  const defaultMode: DraftMode = props.hasOutline ? "plan" : "outline";
  const [mode, setMode] = useState<DraftMode>(defaultMode);
  const [hadOutline, setHadOutline] = useState(props.hasOutline);
  if (hadOutline !== props.hasOutline) {
    setHadOutline(props.hasOutline);
    setMode(defaultMode === "plan" ? "plan" : mode === "plan" ? "outline" : mode);
  }
  const [memo, setMemo] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  // 구성안 만들 때 고른 짜임(짜임 고르기 — 이야기 틀·구성 패턴·2025 예시 절, 없으면 AI가 고름)
  const [frame, setFrame] = useState<FrameChoice | null>(null);
  const [gallery, setGallery] = useState(false);

  const MODES: Array<[DraftMode, string, string]> = [
    ...(props.hasOutline ? [["plan", "구성안대로 집필", `지금 구성안${props.currentStory ? `(${props.currentStory})` : ""}의 틀·블록 순서·도식대로 초안을 씁니다 — 구성안을 승인합니다(${rangeText(draftExpect("plan", props.mg))})`] as [DraftMode, string, string]] : []),
    props.mg
      ? ["outline", props.hasOutline ? "구성안 다시 만들기" : "구성안 만들기", `이 카드가 맡을 평가내용·대주제·절과 절마다 이야기 틀·블록·재료를 먼저 만들어 보고 고친 뒤 승인하면 그 짜임대로 집필합니다(${rangeText(draftExpect("outline", true))})`]
      : ["outline", props.hasOutline ? "구성안 다시 만들기" : "구성안 만들기", `재료표·평가 논점·이야기 틀·블록 목록·그림 자리를 먼저 만들어 보고 고친 뒤 승인하면 그 짜임대로 집필합니다(${rangeText(draftExpect("outline", props.mg))})`],
    // 경영관리는 평가내용·대주제·절을 먼저 정해야 해 구성안 없이 바로 쓰지 않음(서버 runReportSectionDraft도 막음)
    ...(props.mg ? [] : [["draft", props.hasSpec ? "바로 다시 만들기" : "바로 만들기", props.hasOutline ? `구성안을 쓰지 않고 AI가 짜임을 새로 정해 한 번에 초안을 씁니다(${rangeText(draftExpect("draft"))})` : `구성안 없이 한 번에 초안을 씁니다(${rangeText(draftExpect("draft"))})`] as [DraftMode, string, string]]),
  ];
  const label = (m: DraftMode) => MODES.find(([k]) => k === m)?.[1] ?? "";
  // 뺀 자료(다시 넣을 수 있는 것): 카드 전용 자료 + 보고서 추가자료
  const excluded = [...props.cardFiles.filter((f) => f.attachable && sel.off.has(`c:${f.id}`)).map((f) => ({ key: `c:${f.id}`, f, report: false })), ...(props.reportFiles ?? []).filter((f) => f.attachable && sel.off.has(`r:${f.id}`)).map((f) => ({ key: `r:${f.id}`, f, report: true }))];
  const chips = [...sel.card.map((f) => ({ key: `c:${f.id}`, f, report: false })), ...sel.report.map((f) => ({ key: `r:${f.id}`, f, report: true }))];
  // 지금 도는 AI 요청: 이 요청 칸(busy) 또는 구성안 패널 단추 — 진행 줄과 스크롤이 함께 봄
  const [startedAt, setStartedAt] = useState(0);
  const outlineKind = props.outlineRun.busy ? OUTLINE_BUSY[props.outlineRun.busy] : undefined;
  const run: { kind: DraftRunKind; at: number; own: boolean } | null = busy ? { kind: busy, at: startedAt, own: true } : outlineKind ? { kind: outlineKind, at: props.outlineRun.at, own: false } : null;
  const blocked = Boolean(run) || Boolean(uploading);
  // 진행 줄의 「넣은 근거」: 구성안 만들기·바로 만들기는 지금 고른 근거, 구성안대로 집필·다시 만들기는 구성안에 저장된 근거(서버 prepareDraft와 같음)
  const priorNames = (keys: string[]) =>
    keys
      .map((k) => props.prior.options.find((o) => o.key === k)?.label)
      .filter((x): x is string => Boolean(x))
      .slice(0, 2);
  const namesOf = (files: SourceFile[], ids: string[]) => ids.map((id) => files.find((f) => f.id === id)?.fileName).filter((x): x is string => Boolean(x));
  const src = props.outlineSources;
  // 진행 줄의 「공통 지식」: 이 카드에 선별 방식이 적용되면 고른 원문 수(서버가 요청 때와 같은 묶음으로 셈, null이면 통째로 넣기). 요청을 보낼 수 없으면 안 물음
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    if (!props.canWrite) return;
    void getReportSelectPreview(props.uid).then(setSelected);
  }, [props.uid, props.canWrite]);
  const picked = selected ?? undefined;
  const spec =
    run &&
    draftProgress(
      run.kind,
      run.kind === "outline" || run.kind === "draft"
        ? { files: [...sel.card, ...sel.report].map((f) => f.fileName), prior: priorNames(sel.priorKeys), lens: props.lensCount, inspection: props.inspection, mg: props.mg, selected: picked, frame: run.own && run.kind === "outline" && frame ? { ...(frame.pattern ? { pattern: patternOf(frame.pattern)?.name ?? frame.pattern } : {}), ...(frame.example ? { example: frame.example.title } : {}) } : undefined }
        : { files: [...namesOf(props.cardFiles, src?.card ?? []), ...namesOf(props.reportFiles ?? [], src?.report ?? [])], prior: priorNames(src ? src.prior : props.prior.auto), lens: props.lensCount, inspection: props.inspection, mg: props.mg, selected: picked, frame: run.own ? undefined : (props.outlineRun.frame ?? undefined) },
    );

  // 스크롤(2026-09-29 사용자 결정): 요청을 보내면 진행 줄로, 끝나면 결과로 — 구성안을 만든 요청이 잘 끝나면 구성안 머리(맨 위), 초안·오류면 결과 알림.
  // 새로 고침으로 구성안이 다시 그려지는 동안 그 자리를 지키고(holdScroll), 탭이 숨어 있으면 자리를 기억했다가 보일 때 옮김
  const boxRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const progRef = useRef<HTMLDivElement>(null);
  const msgRef = useRef<HTMLParagraphElement>(null);
  const spot = useRef<Spot | null>(null);
  const lastRun = useRef<{ kind: DraftRunKind; own: boolean } | null>(null);
  const stopHold = useRef<() => void>(() => {});
  const runKey = run ? `${run.own ? "own" : "outline"}:${run.kind}` : "";
  useEffect(() => {
    if (run) {
      lastRun.current = { kind: run.kind, own: run.own };
      spot.current = "progress";
    } else if (lastRun.current) {
      const r = lastRun.current;
      lastRun.current = null;
      const ok = (r.own ? props.msg : props.outlineRun.msg)?.ok;
      spot.current = ok && OUTLINE_RUNS.has(r.kind) ? "top" : r.own ? "msg" : "outline-msg";
    }
    const box = boxRef.current;
    const to = spot.current;
    if (!box || !to || !props.active) return;
    const target = (): Element | null => (to === "progress" ? progRef.current : to === "top" ? box.firstElementChild : to === "msg" ? msgRef.current : box.querySelector("[data-outline-msg]"));
    stopHold.current();
    const h = holdScroll(box, target, to === "top" ? "start" : "end");
    if (h.ok) {
      spot.current = null;
      stopHold.current = h.stop;
    }
    // 요청이 시작·끝날 때와 탭이 보일 때만(그 사이 글·메모가 바뀔 때는 움직이지 않음)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey, props.active]);
  useEffect(() => () => stopHold.current(), []);

  /** 끌어 놓거나 고른 파일: AI가 읽는 형식·크기만 카드 전용 자료로 올림(새로 올린 자료는 곧바로 초안 근거에 들어감) */
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
    // 쓰는 동안은 진행 줄(경과 시간·넣은 근거)이 알림을 대신함 — 지난 결과 알림은 지움
    setStartedAt(nowMs());
    props.setBusy(m);
    props.setMsg(null);
    try {
      const r = m === "outline" ? await runReportOutline(props.uid, sources, memo.trim() || undefined, frame ?? undefined) : m === "plan" ? await props.onPlan() : await runReportSectionDraft(props.uid, sources);
      props.setMsg({ ok: r.ok, text: r.message });
      if (r.ok) {
        if (m === "outline") {
          setMemo("");
          setFrame(null);
        }
        router.refresh();
      }
    } catch {
      props.setMsg({ ok: false, text: "요청이 끊겼습니다. 잠시 뒤 다시 시도해 주세요." });
    } finally {
      props.setBusy(false);
    }
  };
  // m: 보낼 요청 종류 — 요청 칸 보내기는 고른 칩(mode), 단계 레일의 단추는 그 단추의 종류(칩도 그것으로 옮김). 확인 창은 둘 다 같음
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
        body: [`바로 만들기는 지금 구성안${props.currentStory ? `(${props.currentStory})` : ""}을 쓰지 않고 AI가 짜임을 새로 정합니다.`, "구성안대로 쓰려면 「구성안대로 집필」을 고르세요."],
        confirmLabel: label("draft"),
      });
    }
    if (m === "plan" && props.hasSpec) steps.push(...overwriteSteps(props.humanEdits));
    ask(steps, () => void doSend(m));
  };

  // 단계 레일(lib/reports/draft-stage.ts): 저장된 구성안·초안·보고서 상태로만 셈. 만들기 단추는 요청 칸 보내기와 같은 경로(send — 덮어쓰기 확인 그대로)
  const stage = draftStage({
    hasOutline: props.hasOutline,
    outlineApproved: props.outlineApproved,
    hasDraft: props.hasSpec,
    draftFromOutline: Boolean(props.meta.plan),
    stale: props.meta.stale,
    checks: props.checkCount,
    mg: Boolean(props.mg),
    canWrite: props.canWrite,
    locked: props.locked,
    deptView: props.deptView,
  });
  const onStage = (a: StageAction) => {
    if (a.key === "show-check") props.onShowCheck();
    else if (a.key === "show-outline") {
      props.onShowOutline();
      // 펼친 구성안 패널(이 탭 안)로 — 다시 그린 뒤
      requestAnimationFrame(() => {
        boxRef.current?.querySelector('section[aria-label="구성안"]')?.scrollIntoView({ block: "start" });
      });
    } else if (a.key === "outline") {
      // 바로 실행하지 않음 — 요청 칸에서 바라는 점·짜임을 정하고 보냄(메모 칸은 outline일 때만 활성이라 상태가 바뀐 뒤 초점)
      setMode("outline");
      requestAnimationFrame(() => {
        // 구성안 패널(위)에도 입력 칸이 있어 요청 칸 메모를 이름으로 찾음(AiComposer ariaLabel과 같은 글)
        const ta = rootRef.current?.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${MEMO_LABEL}"]`);
        if (!ta) return;
        ta.focus();
        ta.scrollIntoView({ block: "nearest" });
      });
    } else if (a.key === "plan" || a.key === "draft") {
      // 요청 칸 mode는 바꾸지 않음(칩이 없고 이 단추가 바로 보냄)
      send(a.key);
    }
  };

  return (
    <section
      ref={rootRef}
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
          놓으면 카드 전용 자료로 올려 초안 근거에 넣습니다 · {ATTACH_LABEL}
        </div>
      )}

      {/* 단계 레일 · 결과: 구성안(있으면) · 진행 · 알림 */}
      <div ref={boxRef} className="min-h-0 grow overflow-y-auto px-5 py-5">
        <div className="mx-auto flex max-w-[800px] min-w-0 flex-col gap-4">
          <DraftRail
            stage={stage}
            meta={props.meta}
            draftInfo={props.draftInfo}
            blocked={blocked}
            hint={(k) => MODES.find(([m]) => m === k)?.[2]}
            onAction={onStage}
          />
          {props.outline}
          {/* 경영관리는 바로 만들기가 없어 구성안부터(서버도 막음) — 구성안이 없을 때만 안내 */}
          {!props.outline && props.mg && props.canWrite && <p className="text-xs leading-5 text-muted-2">경영관리는 구성안에서 이 카드가 맡을 평가내용·대주제·절을 먼저 정한 뒤 집필합니다.</p>}
          {run && spec && (
            <div ref={progRef}>
              <AiProgress key={`${run.kind}-${run.at}`} spec={spec} startedAt={run.at} />
            </div>
          )}
          {!busy && props.msg && (
            <p ref={msgRef} role={props.msg.ok ? "status" : "alert"} className={props.msg.ok ? "text-ui leading-6 text-muted-2" : "rounded-md border border-error-line bg-error-bg px-3 py-2 text-ui text-error-strong"}>
              {props.msg.text}
            </p>
          )}
        </div>
      </div>

      {/* 요청(아래 고정): 요청 종류 → 초안 근거 → 첨부 → 메모·보내기 */}
      {props.canWrite ? (
        <AiComposer
          onSubmit={() => send()}
          head={
            <div aria-live="polite" className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-[18px] text-muted-2">
              <span className="min-w-0">
                보내면 <b className="font-semibold text-navy">{label(mode)}</b> <span>· {rangeText(draftExpect(mode, props.mg))}</span>
              </span>
              {mode !== defaultMode && (
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    setMemo("");
                    setFrame(null);
                    setMode(defaultMode);
                  }}
                  className={`${T.btnQuiet} ml-auto`}
                >
                  취소
                </button>
              )}
            </div>
          }
          below={
            <>
              <section aria-label="초안 근거" className="flex min-w-0 items-center gap-2 text-xs">
                <span className="min-w-0 truncate text-muted-2" title="넣을 근거 — 원장 카드는 늘 넣음">
                  초안 근거 — {selectionLine(sel, props.lensCount)}
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
            (chips.length > 0 || uploading || excluded.length > 0) && (
              <div aria-label="첨부" className="flex min-w-0 flex-wrap items-center gap-1.5">
                {chips.map(({ key, f, report }) => (
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
          attach={{ accept: ATTACH_ACCEPT, disabled: Boolean(uploading) || Boolean(busy), title: `파일 첨부 — 카드 전용 자료로 올려 초안 근거에 넣음, 끌어 놓아도 됩니다(${ATTACH_LABEL})`, onFiles: (files) => void addFiles(files) }}
          value={memo}
          onChange={setMemo}
          maxLength={MEMO_MAX}
          disabled={mode !== "outline"}
          ariaLabel={MEMO_LABEL}
          placeholder={mode === "outline" ? "구성안에 바라는 점(선택) ⌘↵" : mode === "plan" ? "구성안 블록 메모대로 씁니다 — 보내기 ⌘↵" : "메모 없이 바로 만듭니다"}
          submitDisabled={blocked}
          submitLabel={`${label(mode)} 요청`}
          error={
            <>
              {err && (
                <p role="alert" className="text-xs text-error">
                  {err}
                </p>
              )}
            </>
          }
        />
      ) : (
        <p className="shrink-0 border-t border-line bg-thead px-5 py-3 text-xs leading-5 text-muted-2">이 과제를 맡은 부서나 성과관리팀이 초안을 만듭니다.</p>
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

/** 판면 판정 톤 → 메타 줄 글자색(맞음은 메타 줄 그대로, 빔·조금 넘침은 우리 차례, 넘침만 경고색) */
const FIT_TEXT = { done: "", doing: "text-st-doing-text", alert: "font-semibold text-warn" } as const;
const SHOW_TITLE: Partial<Record<StageAction["key"], string>> = {
  "show-check": "오른쪽 「점검 결과」 탭 — 채울 자료·확인할 것을 누르면 왼쪽 초안의 그 자리로",
  "show-outline": "구성안 판면으로 바꾸고 구성안을 펼침 — 고친 뒤 「승인하고 집필」",
  report: "경평 초안 허브에서 보고서 상태(확정)를 봅니다",
};

/**
 * 단계 레일(10-13 정제 시안 05 ol.rail — 셈은 lib/reports/draft-stage.ts): 단계마다 상태 표지 + 이름 + 상태 칩 + 작은 메타 줄(지금 단계 aria-current="step"),
 * 그 아래 주 단추 하나(T.btnPrimary) + 보조, 초안이 있으면 접힌 「다시 쓰기」 묶음(원장이 바뀌면 펼침). 진행률·남은 시간은 그리지 않음.
 */
function DraftRail(props: { stage: DraftStage; meta: DraftMeta; draftInfo: string | null; blocked: boolean; hint: (k: DraftMode) => string | undefined; onAction: (a: StageAction) => void }) {
  const { stage, meta, draftInfo } = props;
  const fitPct = meta.fit ? Math.round((meta.fit.total / meta.fit.budget) * 100) : null;
  const fv = fitPct !== null ? fitVerdict(fitPct) : null;

  const metaLine = (key: StageKey): ReactNode => {
    if (key === "outline") return meta.outlineInfo ? <p className="min-w-0 truncate text-xs text-muted" title={`지금 구성안 · ${meta.outlineInfo}`}>{meta.outlineInfo}</p> : null;
    if (key === "draft") {
      if (!draftInfo) return null;
      const title = [`지금 초안 · ${draftInfo}`, meta.plan ? `구성안대로 짜임 ${meta.plan.matched}/${meta.plan.total}` : "", fv && meta.fit ? `${fv.label}(${fv.hint}) — 판면 어림 ${meta.fit.total}/${meta.fit.budget}mm · ${fitPct}% · ${FIT_RANGE_TEXT}` : ""].filter(Boolean).join(" · ");
      return (
        <p className="min-w-0 truncate text-xs text-muted" title={title}>
          {draftInfo}
          {meta.plan && (
            <>
              {" "}· 짜임 <span className="font-mono">{`${meta.plan.matched}/${meta.plan.total}`}</span>
            </>
          )}
          {fv && (
            <>
              {" "}· <span className={FIT_TEXT[fv.tone]}>{`${fv.label} · ${fitPct}%`}</span>
            </>
          )}
        </p>
      );
    }
    if (!draftInfo || meta.need + meta.warn === 0) return null;
    return <p className="min-w-0 truncate text-xs text-muted">{`채울 자료 ${meta.need} · 확인할 것 ${meta.warn}`}</p>;
  };

  const button = (a: StageAction, kind: "primary" | "secondary" | "quiet") => {
    const cls = kind === "primary" ? T.btnPrimary : kind === "quiet" ? T.btnQuiet : T.btn;
    if (a.key === "report")
      return (
        <Link key={a.key} href={meta.submit?.href ?? "/my/report"} title={SHOW_TITLE.report} className={cls}>
          {a.label}
        </Link>
      );
    const make = a.key === "outline" || a.key === "plan" || a.key === "draft";
    return (
      <button key={a.key} type="button" disabled={make && props.blocked} title={a.key === "outline" ? `요청 칸에서 바라는 점·짜임을 정하고 보냅니다 — ${props.hint("outline") ?? ""}` : make ? props.hint(a.key as DraftMode) : SHOW_TITLE[a.key]} onClick={() => props.onAction(a)} className={cls}>
        {a.label}
      </button>
    );
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* 파이프라인: 컨테이너 폭 20rem(320px) 이상이면 세 칸 한 줄 + 칸 사이 ›, 그보다 좁으면 세로 */}
      <div className="@container min-w-0">
        <ol aria-label="초안 단계" className="m-0 grid list-none grid-cols-1 gap-3 p-0 @min-[20rem]:grid-cols-3 @min-[20rem]:gap-x-4">
          {stage.steps.map((s, i) => (
            <li key={s.key} aria-current={s.now ? "step" : undefined} className={`relative flex min-w-0 flex-col gap-1 rounded-md border px-2 py-1.5 ${s.now ? "border-navy bg-thead" : "border-line"}`}>
              <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                <span className="flex h-5 shrink-0 items-center">
                  <StatusMark tone={s.tone} />
                </span>
                <span className={`text-sm leading-5 font-semibold whitespace-nowrap ${s.now ? "text-navy" : "text-ink"}`}>{s.label}</span>
                <Tag tone={MARK_TAG[s.tone]}>{s.state}</Tag>
              </div>
              {metaLine(s.key)}
              {i < stage.steps.length - 1 && <ChevronRight size={14} aria-hidden="true" className="absolute top-2.5 -right-[15px] hidden text-muted-2 @min-[20rem]:block" />}
            </li>
          ))}
        </ol>
      </div>
      {/* 제출은 과제별 화면에서 하지 않음 — 부서 허브(성과관리팀은 보고서 검토)로. 잠기면 주 단추가 그리로 감 */}
      {meta.submit && stage.primary?.key !== "report" && stage.steps.some((s) => s.key === "check") && (
        <Link href={meta.submit.href} className={`${T.btnQuiet} self-start`}>
          {meta.submit.label}
        </Link>
      )}
      {(stage.primary || stage.alt.length > 0) && (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          {stage.primary && button(stage.primary, "primary")}
          {stage.alt.map((a) => button(a, a.quiet ? "quiet" : "secondary"))}
        </div>
      )}
      {stage.redo.length > 0 && (
        // 원장이 바뀌면 펼친 채로(기존 초안 유지·다시 쓰기는 사람이 고름) — 상태가 바뀌면 다시 그 기본으로
        <details key={stage.redoOpen ? "open" : "closed"} open={stage.redoOpen} className="group min-w-0">
          <summary className="flex min-h-6 cursor-pointer list-none items-center gap-1 text-ui font-semibold text-navy [&::-webkit-details-marker]:hidden">
            <ChevronRight size={14} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-90" />
            다시 쓰기
            <span className="min-w-0 truncate text-xs font-normal text-muted-2">— 지금 초안을 새로 씀</span>
          </summary>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">{stage.redo.map((a) => button(a, a.quiet ? "quiet" : "secondary"))}</div>
        </details>
      )}
    </div>
  );
}
