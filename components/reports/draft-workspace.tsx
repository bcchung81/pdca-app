"use client";

import { draftExpect, draftProgress, rangeText } from "../../lib/ai/progress.ts";
import type { FrameChoice } from "../../lib/reports/framework-pick.ts";
import { ChevronLeft, ChevronRight, Ellipsis, FolderOpen, History, PanelRightClose, PanelRightOpen, Save, X } from "lucide-react";
import Link from "next/link";
import { type KeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { fitTextLines } from "../../lib/reports/fit-dom";
import { reportFontsReady } from "./report-font-probe";
import { Toast } from "../cards/review/review-ui";
import { ListIconButton } from "../workspace/list-icon-button";
import { PaneResizer, usePaneWidth } from "../workspace/pane-resizer";
import { type PaneTabItem, PaneTabs } from "../workspace/pane-tabs";
import { paneClass, paneWidthStyle } from "../workspace/right-pane.ts";
import { type StepZoomRange, useFitZoom } from "../workspace/use-fit-zoom.ts";
import { ZoomControl } from "../workspace/zoom-control";
import { type DraftBusy, DraftCompose, type DraftMeta, type DraftMsg } from "./draft-compose";
import { DraftComposer, DraftHistory, DraftReviewNote, DraftSelectionBar, RESULT_AT, flashBlock, hoverBlock, useDraftReview } from "./draft-review";
import { DraftSources, type SourceProps, useDraftSelection } from "./draft-workbench";
import { approveReportOutline, saveReportOutline } from "../../app/(app)/reports/cards/outline-actions";
import type { ToastSpec } from "../cards/review/use-card-review";
import { AutosaveSwitch } from "../workspace/autosave";
import { useDraftTextEdit } from "./draft-text-edit";
import { PICK_HIGHLIGHT_CSS } from "../cards/pick-highlight.ts";
import { FrameworkGallery } from "./framework-gallery";
import { OutlineNotes } from "./outline-notes";
import { type OutlineData, OutlinePanel, partName, rowOf, useOutlineEdit } from "./outline-panel";
import { type AltsRequest, OutlineAlts, startAlts } from "./outline-alts";
import { T } from "../ui/kit";
import { ShapePicker } from "./shape-picker";
import { type DomHwpxItem, useDomHwpx } from "./dom-hwpx-download";
import { BlockShapes } from "./block-shapes";
import type { ShapeMenuItem } from "../../lib/reports/block-shape.ts";

type Tab = "ai" | "check";
/** 더보기 항목: 링크(download면 내려받기) 또는 화면 그대로 한글 내려받기(dom — 누르면 숨은 사본을 떠 서버로 보냄, dom-hwpx-download.tsx) */
export type MenuItem = { href: string; label: string; hint?: string; download?: boolean; dom?: DomHwpxItem };
type Sib = { href: string; taskNo: string; title: string } | null;

/** 머리의 아이콘 단추(과제원장 옆 창·전체 페이지와 같은 모양, 이름은 aria-label·title) */

/** 종이 폭(본문 170mm + 좌우 여백 6mm = 182mm) CSS px */
const PAPER_PX = (182 * 96) / 25.4;
/** 여백 메모 열 폭 + 종이와의 간격, 왼쪽 열 안 좌우 여백(px-6 두 번) */
const NOTES_PX = 272 + 20;
const PAD_PX = 48;
/** 맞춤 확대 범위(남는 폭 ÷ 종이 폭) */
const FIT_ZOOM = { min: 0.8, max: 1.6 } as const;
/** 단추로 고르는 범위 */
const HAND_ZOOM: StepZoomRange = { min: 0.5, max: 2, step: 0.1 };
const ZOOM_KEY = "report-zoom";
/** 종이 위 블록 강조(과제원장 카드 리뷰어와 같은 모양 — globals.css의 .kca-card 규칙을 보고서 종이에) */
const PAPER_MARK_CSS = `[aria-label="구성안 판면"] [data-block]{cursor:pointer}
.k-text-edit .kca-dg-doc .k-t{border-radius:2px;transition:background-color .12s}
.k-text-edit .kca-dg-doc .k-t:hover{background:rgba(0,105,158,.08);cursor:text}
.kca-dg-doc .k-t.k-editing{background:#fff;outline:2px solid #1b1760;outline-offset:1px;white-space:pre-wrap;cursor:text}
.kca-dg-doc .k-t.k-saving{opacity:.45}
.kca-dg-doc .k-t.k-dirty{background:rgba(255,241,194,.6);text-decoration:underline dashed rgba(138,90,0,.75);text-underline-offset:3px}
.kca-dg-doc .kc-anchor-hot{outline:2px solid var(--hl-hot);outline-offset:2px}
.kca-dg-doc .kc-off{opacity:.35}`;

/**
 * 경평 초안 과제별 초안 작업 공간(과제원장 전체 페이지 — components/cards/card-workspace.tsx와 같은 짜임):
 * 머리 한 줄(돌아가기 · 앞뒤 과제 · 과제번호 · 과제명 | 근거 자료 · 더보기) → 왼쪽은 도구줄 + 종이(초안 또는 구성안 판면) + 여백 메모(구성안 블록마다 — 과제원장 여백 메모 자리),
 * 오른쪽은 「AI 초안 | 점검 결과」 탭 — 근거 자료는 그 자리에 잠시 바꿔 열고 ✕·Esc로 탭에 돌아옴.
 * 종이는 남는 폭에 맞춰 CSS zoom으로 확대(기본 맞춤, 도구줄 −·+로 고르면 이 브라우저에 기억). 좁은 창(종이 80% + 여백 메모를 못 담음)은 여백 메모 대신 오른쪽 구성안 목록.
 * 고른 근거(첨부·전년 절)와 구성안 편집 상태는 이 부품이 들고 요청 칸·근거 자료 패널·구성안 패널·여백 메모가 함께 씀. 세 패널은 늘 그려 두고 숨김만(입력·선택이 남음).
 */
export function DraftWorkspace(
  props: SourceProps & {
    uid: string;
    title: string;
    taskNo: string;
    group: string;
    /** 과제번호에 붙이는 설명(연도·사업명·부서) */
    place: string;
    /** 구성안 요청에 넣는 최종 점검표의 미흡 요약(「’26.9 점검 · 미흡 2」 — 없으면 null, 진행 줄 「넣은 근거」) */
    inspection?: string | null;
    back: { href: string; label: string };
    prev: Sib;
    next: Sib;
    menu: MenuItem[];
    canWrite: boolean;
    /** 제출·승인된 보고서의 과제(부서만 — 성과관리팀·관리자는 늘 false) — 쓰기 도구를 숨기고 머리 아래 띠로 안내 */
    locked: boolean;
    hasSpec: boolean;
    draftInfo: string | null;
    /** 「AI 초안」 탭 단계 레일 재료(원장 바뀜·짜임·판면·점검 나눔·구성안 메타·제출 링크 — derive.ts draftMetaOf) */
    draftMeta: DraftMeta;
    /** 왼쪽 도구줄 칩(서버가 그림: 과제·판면·반영 근거·상태)과 오른쪽 끝(BP·내려받기) */
    toolbar: ReactNode;
    toolbarEnd: ReactNode;
    /** 보고서 미리보기 또는 빈 안내 */
    preview: ReactNode;
    /** 구성안(있을 때) */
    outline: OutlineData | null;
    /** 구성안 블록마다 초안 블록 순번(planMatch) */
    match: Array<number | null>;
    /** 처음 볼 판(구성안이 확인 전·초안 없음·짝이 절반 미만이면 구성안) */
    defaultView: "draft" | "outline";
    /** 점검 결과 탭 내용(서버가 그림 — data-jump 단추를 누르면 미리보기의 그 자리로) */
    check: ReactNode;
    checkCount: number;
    /** 초안 행 updated_at(블록 목록 초안일 때만 — 블록 고치기의 동시 편집 확인값, 없으면 블록 고치기 끔) */
    version: string | null;
    /** 사람이 고친 블록 순번(다시 만들기 전 경고) */
    humanEdits: number[];
    /** 경영관리 카드(평가내용 → 대주제 → 절 — 바로 만들기 없음, 구성안에서 절마다 틀) */
    mg?: boolean;
    /** 「다른 모양으로」 모양 목록(이 트랙·근거 조건 — lib/reports/block-shape.ts shapeMenu)과 초안 블록마다 지금 모양 코드 */
    shapeMenu?: ShapeMenuItem[];
    blockCodes?: string[];
    /** 부서 화면 보기(성과관리팀·관리자가 ?team=으로 — 읽기 전용): canWrite는 이미 false, 끌어 고르기 도구줄(「질문」 AI 호출 포함)도 그리지 않고 머리에 표시 */
    deptView?: boolean;
  },
) {
  const [tab, setTab] = useState<Tab>("ai");
  const [other, setOther] = useState<null | "sources" | "history" | "shapes">(null);
  // 「다른 모양으로」 대상 블록(끌어 고르기 도구줄 「다른 모양」 — 오른쪽 자리에 잠시 열고, 닫아도 결과는 같은 블록이면 남음)
  const [shapeAt, setShapeAt] = useState<{ blockIndex: number; quote: string; key: number } | null>(null);
  // 오른쪽 창 접기(좁은 화면에서 왼쪽 문서 폭을 확보 — 기억하지 않음). 접어도 언마운트하지 않아 AI 요청 진행·입력 중인 글이 남음
  const [paneOpen, setPaneOpen] = useState(true);
  const side = other ?? tab;
  const sel = useDraftSelection(props);
  const [busy, setBusy] = useState<DraftBusy>(false);
  const [msg, setMsg] = useState<DraftMsg>(null);
  // 「다른 짜임 여러 안」 대화 창(짜임 고르기에서 시작 — 요청 칸·구성안 패널·경영관리 절 모두 여기 하나)
  const [alts, setAlts] = useState<AltsRequest | null>(null);
  /** 여러 안 진행 줄 — 실제로 넣는 근거(서버 prepareDraft와 같음: 고른 첨부·전년 절, 구성안에서 시작하면 구성안에 저장된 근거) */
  const altProgress = (n: number, src: { card: string[]; report: string[]; prior?: string[] } | null | undefined) =>
    draftProgress("alts", {
      files: src ? [...props.cardFiles.filter((f) => src.card.includes(f.id)).map((f) => f.fileName), ...(props.reportFiles ?? []).filter((f) => src.report.includes(f.id)).map((f) => f.fileName)] : [],
      prior: (src?.prior ?? props.prior.auto)
        .map((k) => props.prior.options.find((o) => o.key === k)?.label)
        .filter((x): x is string => Boolean(x))
        .slice(0, 2),
      lens: props.lens.length,
      inspection: props.inspection ?? null,
      mg: props.mg,
      alts: n,
    });
  /** 여러 안 시작(누른 처리기에서 — 서버 호출은 startAlts가 한 번) */
  const openAlts = (cands: FrameChoice[], request: string, o: { sources?: { card: string[]; report: string[]; prior?: string[] }; part?: string; confirm: string | null }) =>
    setAlts(startAlts(props.uid, { alts: cands, request, sources: o.sources, part: o.part, confirm: o.confirm, progress: altProgress(cands.length, o.sources) }));
  // 오른쪽 창의 내용을 여는 곳은 모두 이것으로 — 접혀 있으면 먼저 펼침(k가 null이면 탭으로)
  const openSide = (k: "sources" | "history" | "shapes" | null) => {
    setOther(k);
    setPaneOpen(true);
  };
  const paperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const outline = props.outline;
  const ed = useOutlineEdit(props.uid, outline);
  // 초안 | 구성안 판: 둘 다 있을 때만 바꿔 봄
  const [view, setView] = useState<"draft" | "outline">(props.defaultView);
  const shown = !outline ? "draft" : !props.hasSpec ? "outline" : view;
  // 블록 고치기(초안 판·블록 목록 초안): 끌어 고른 글 → 도구줄 → 여백 작성 카드 → 결과 메모. 여백 열은 좁은 창에서도 이때는 둠
  const reviewOn = shown === "draft" && Boolean(props.version) && !props.deptView;
  const review = useDraftReview({ uid: props.uid, version: props.version, enabled: reviewOn, canEdit: props.canWrite, paper: paperRef, content: contentRef });
  // 왼쪽 열 폭 → 여백 메모를 둘 수 있는지(margin) · 맞춤 확대(종이는 늘 182mm 고정 폭 — docWidthPx)
  // 구성안 블록 메모(도식 구조)는 「구성안」 판에서만 여백에(2026-09-28 사용자 요구 — 초안 판에 도식 구조가 섞여 보였음). 초안 판의 여백은 블록 고치기 메모만
  const marginOf = (leftW: number) => Boolean(outline) && shown === "outline" && leftW > 0 && leftW >= PAPER_PX * FIT_ZOOM.min + NOTES_PX + PAD_PX;
  const columnOf = (leftW: number) => marginOf(leftW) || reviewOn;
  const { width: paneW, setWidth: setPaneW, setLive: setPaneLive, dragging: paneDragging, setDragging: setPaneDragging } = usePaneWidth("report-pane-w");
  const { scrollRef, zoom, hand, setZoom, leftW } = useFitZoom({
    storageKey: ZOOM_KEY,
    docWidthPx: PAPER_PX,
    reservePx: (w) => PAD_PX + (columnOf(w) ? NOTES_PX : 0),
    fitRange: FIT_ZOOM,
    handRange: HAND_ZOOM,
    paused: paneDragging,
  });
  const margin = marginOf(leftW);
  const column = columnOf(leftW);
  // 확대·판이 바뀌면 자간 맞춤을 다시(줄 수는 실제 글꼴 폭으로 재므로 확대 뒤 다시 잼 — 여백 메모는 크기 변화로 다시 섬). 글꼴 표지(자간 보정)가 달린 뒤에
  useEffect(() => {
    const el = paperRef.current;
    if (!el || shown !== "draft") return;
    let off = false;
    void reportFontsReady().then(() => {
      if (!off) fitTextLines(el);
    });
    return () => {
      off = true;
    };
  }, [zoom, shown]);

  // Esc: 근거 자료 패널을 닫고 탭으로(더보기 메뉴가 열려 있으면 메뉴가 먼저 받음 — 메뉴는 capture 단계에서 preventDefault)
  useEffect(() => {
    if (!other) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) setOther(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [other]);

  const paneTabs: PaneTabItem<Tab>[] = [
    { key: "ai", label: "AI 초안" },
    // 배지 = 채울 자료 + 확인할 것 — 대부분 초안이 일부러 남긴 사람 몫이라 경고색이 아니라 받는 쪽 차례(10-13 시안 C)
    { key: "check", label: "점검 결과", badge: props.checkCount, badgeTone: "handoff", title: props.checkCount ? `채울 자료·확인할 것 ${props.checkCount}건` : undefined },
  ];

  // 점검 결과의 항목 → 왼쪽 미리보기의 그 자리로 옮겨 잠시 강조(글로 찾음 — 못 찾으면 아무것도 안 함). 구성안 판이면 초안 판으로 바꾼 뒤
  const onJump = (e: ReactMouseEvent<HTMLDivElement>) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-jump]");
    if (!b) return;
    const kind = b.dataset.jump;
    // 성과관리팀 코멘트: 블록 순번(data-block)으로 바로 찾아 깜박임(kc-flash — 카드 리뷰어와 같은 표시)
    if (kind === "comment") {
      const j = Number(b.dataset.block);
      if (!Number.isInteger(j)) return;
      const go = () => flashBlock(paperRef.current, j);
      if (shown === "outline" && props.hasSpec) {
        setView("draft");
        setTimeout(go, 60);
      } else go();
      return;
    }
    const want = norm(b.dataset.text ?? "");
    if (!want) return;
    const nth = Number(b.dataset.nth ?? 0) || 0;
    const find = () => {
      const root = paperRef.current;
      if (!root) return;
      const pool =
        kind === "need"
          ? [...root.querySelectorAll(".k-need")].filter((el) => norm(el.textContent ?? "") === want)
          : kind === "fig"
            ? [...root.querySelectorAll(".k-fig")].filter((el) => norm(el.querySelector(".k-fig__desc")?.textContent ?? "") === want)
            : kind === "weak"
              ? [...root.querySelectorAll(".k-weak")].filter((el) => sameSentence(norm(el.textContent ?? ""), want))
              : [];
      const el = pool[Math.min(nth, pool.length - 1)];
      if (!(el instanceof HTMLElement)) return;
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: still ? "auto" : "smooth" });
      el.animate(
        [
          { outline: "3px solid rgba(199,154,0,0.95)", outlineOffset: "2px" },
          { outline: "3px solid rgba(199,154,0,0.95)", outlineOffset: "2px", offset: 0.6 },
          { outline: "3px solid rgba(199,154,0,0)", outlineOffset: "2px" },
        ],
        { duration: still ? 2400 : 1800, easing: "ease-out" },
      );
    };
    if (shown === "outline" && props.hasSpec) {
      setView("draft");
      setTimeout(find, 60);
    } else find();
  };

  // 여백 메모의 재료 칩 → 오른쪽 AI 초안 탭 구성안의 재료 목록 그 재료(펼쳐 강조 — 구성안 패널이 맡음)
  const showMaterial = (mid: string) => {
    openSide(null);
    setTab("ai");
    ed.focusMaterial(mid);
  };

  const pane = (on: boolean) => `${on ? "flex" : "hidden"} min-h-0 grow flex-col`;
  const segBtn = (on: boolean) => `flex h-8 items-center px-2.5 text-xs font-semibold whitespace-nowrap ${on ? "bg-navy text-white" : "bg-paper text-ink hover:text-navy"}`;

  const head = (
    <div className="flex shrink-0 flex-col border-b border-line">
      <div className="flex min-h-14 items-center justify-between gap-4 px-5 py-2">
        <div className="flex min-w-0 items-center gap-3">
          {(props.prev || props.next) && (
            <nav aria-label="같은 보고서의 다른 과제" className="flex shrink-0 items-center gap-1">
              <SibLink sib={props.prev} dir="prev" />
              <SibLink sib={props.next} dir="next" />
            </nav>
          )}
          <span className="shrink-0 font-mono text-xs whitespace-nowrap text-muted" title={props.place}>
            {props.group} · {props.taskNo}
          </span>
          <h1 className="min-w-0 truncate font-serif text-title leading-8 font-bold tracking-[-0.3px] text-navy" title={props.title}>
            {props.title}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {props.deptView && <span className="shrink-0 text-xs text-muted">부서 화면 보기 · 읽기 전용</span>}
          <ListIconButton href={props.back.href} label={props.back.label} />
          <button
            type="button"
            aria-pressed={paneOpen && side === "history"}
            aria-label="수정 이력"
            title="수정 이력 — 블록 고치기·되돌리기"
            onClick={() => (paneOpen && other === "history" ? openSide(null) : openSide("history"))}
            className={`${T.iconBtn} ${paneOpen && side === "history" ? "border-navy bg-navy text-white" : "border-field-line text-ink hover:border-navy"}`}
          >
            <History size={16} aria-hidden />
          </button>
          <button
            type="button"
            aria-pressed={paneOpen && side === "sources"}
            aria-label="근거 자료"
            title="근거 자료 — 전년 보고서 절·평가 기준·카드 전용 자료·보고서 추가자료 고르기"
            onClick={() => (paneOpen && other === "sources" ? openSide(null) : openSide("sources"))}
            className={`${T.iconBtn} ${paneOpen && side === "sources" ? "border-navy bg-navy text-white" : "border-field-line text-ink hover:border-navy"}`}
          >
            <FolderOpen size={16} aria-hidden />
          </button>
          <button
            type="button"
            aria-expanded={paneOpen}
            aria-controls={`${id}-pane`}
            aria-label={paneOpen ? "오른쪽 창 접기" : "오른쪽 창 펴기"}
            title={paneOpen ? "오른쪽 창 접기 — 문서를 넓게 봅니다" : "오른쪽 창 펴기"}
            onClick={() => setPaneOpen((v) => !v)}
            className={`${T.iconBtn} border-field-line text-ink hover:border-navy`}
          >
            {paneOpen ? <PanelRightClose size={16} aria-hidden /> : <PanelRightOpen size={16} aria-hidden />}
          </button>
          <MoreMenu items={props.menu} />
          {/* 닫기(2026-09-29 사용자 요구 — 과제원장 옆 창처럼 맨 오른쪽 ✕): 목록 아이콘과 같은 곳(이 화면을 연 곳)으로 — 링크라 고친 글은 먼저 저장(onLinkCapture) */}
          <Link href={props.back.href} aria-label={`닫기 — ${props.back.label}`} title={`닫기 — ${props.back.label}`} className={`${T.iconBtn} border-field-line text-muted hover:border-navy`}>
            <X size={16} aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );

  // ── 글 직접 고치기(2026-09-28 「과제원장처럼 두 번 눌러 고치기」 + 자동 저장·저장 단추): components/reports/draft-text-edit.ts
  const [textToast, setTextToast] = useState<{ key: number; spec: ToastSpec } | null>(null);
  const textEditable = shown === "draft" && Boolean(props.version) && props.canWrite && !props.locked;
  const text = useDraftTextEdit({ uid: props.uid, version: props.version, enabled: textEditable, paperRef, onError: (m) => setTextToast({ key: Date.now(), spec: { text: m, tone: "warn", ms: 5000 } }) });
  // 두 번 누를 때 낱말 고르기를 막고(고치기), 그 밖에는 블록 고치기의 끌어 고르기
  const onPaperMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (text.blocksMouseDown(e)) {
      if (e.detail >= 2) e.preventDefault();
      return;
    }
    review.onPaperMouseDown(e);
  };

  // 요청 칸 「구성안대로 집필」: 고친(저장 안 한) 구성안이 있으면 먼저 저장하고 승인하고 집필(구성안 패널의 「승인하고 집필」과 같음)
  const planDraft = async () => {
    if (ed.dirty) {
      const saved = await saveReportOutline(props.uid, { edit: ed.edit });
      if (!saved.ok) return saved;
    }
    return approveReportOutline(props.uid);
  };
  // 종이의 블록을 누르면 그 구성안 블록 메모가 펼쳐짐(여백 메모가 없으면 오른쪽 구성안 목록에서) — 끌어 고른 글이 있으면(블록 고치기) 그대로 둠
  const openNoteAt = (e: ReactMouseEvent<HTMLDivElement>) => {
    // 초안 판에서는 구성안 메모를 펼치지 않음(도식 구조는 구성안 판에서만)
    if (!outline || shown !== "outline" || window.getSelection()?.toString() || (e.target as HTMLElement).closest(".k-editing")) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-block]");
    if (!el) return;
    const idx = Number(el.dataset.block);
    const pos = shown === "outline" ? idx : ed.items.findIndex((x) => x.block.from !== null && props.match[x.block.from] === idx);
    const it = ed.items[pos];
    if (!it) return;
    ed.setOpenKey(it.key);
    if (!margin) {
      openSide(null);
      setTab("ai");
      ed.setOpen(true);
    }
  };
  const outlinePanel = outline ? <OutlinePanel uid={props.uid} canWrite={props.canWrite} ed={ed} margin={margin} humanEdits={props.humanEdits} onShowMaterial={showMaterial} /> : null;
  // 구성안 판면(와이어프레임): 고치는 동안에도 서버 미리보기(previewReportOutline)가 다시 그린 판면 — 블록마다 data-block = 지금 순서
  const sheetView = ed.view ?? outline?.view ?? null;
  const sheet =
    outline && sheetView ? (
      <section aria-label="구성안 판면" className={`min-w-0 transition-opacity ${ed.previewing ? "opacity-70" : ""}`}>
        <style>{outline.sheetCss}</style>
        <div dangerouslySetInnerHTML={{ __html: sheetView.sheetHtml }} />
      </section>
    ) : null;
  // 도식 목록 대상 블록의 지금 모양·AI 추천 모양(칩 표시)
  const pickItem = ed.picker ? ed.items[ed.picker.pos]?.block : null;
  const pickOrig = pickItem && pickItem.from !== null ? outline?.outline.blocks[pickItem.from] : null;
  const codeOf = (kind: string, variant: string) => (rowOf(outline?.names.table ?? [], kind, variant)?.code ?? kind);

  return (
    <main className="flex min-h-0 min-w-0 grow flex-col bg-paper" onClickCapture={text.onLinkCapture}>
      <style>{PAPER_MARK_CSS}</style>
      <style>{PICK_HIGHLIGHT_CSS}</style>
      {head}
      {props.locked && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-warn-bg px-5 py-2 text-ui text-warn">
          <span>확정(또는 제출)한 보고서의 과제입니다 — 고치려면 「경평 초안」에서 확정 취소(또는 제출 취소)를 해 주세요.</span>
          <Link href="/my/report" className="shrink-0 font-semibold text-link no-underline hover:underline">
            경평 초안 열기 →
          </Link>
        </div>
      )}
      <div className="flex min-h-0 grow">
        {/* 왼쪽: 보고서(과제원장의 카드 편집기 자리) — 도구줄 + 회색 바탕 위 종이(확대) + 여백 메모 */}
        <div className="relative flex min-w-0 grow flex-col">
          <div className="flex min-h-14 shrink-0 items-center gap-x-2 border-b border-line bg-thead px-5 py-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:thin]">{props.toolbar}</div>
            <span className="ml-auto flex shrink-0 items-center gap-2">
              {outline && props.hasSpec && (
                <span role="group" aria-label="보는 판" className="inline-flex overflow-hidden rounded-md border border-field-line">
                  <button type="button" aria-pressed={shown === "draft"} onClick={() => setView("draft")} className={segBtn(shown === "draft")} title="AI가 쓴 초안">
                    초안
                  </button>
                  <button type="button" aria-pressed={shown === "outline"} onClick={() => setView("outline")} className={`${segBtn(shown === "outline")} border-l border-field-line`} title="구성안 블록을 높이 예산대로 쌓은 판면">
                    구성안
                  </button>
                </span>
              )}
              <ZoomControl zoom={zoom} fitted={hand === null} range={HAND_ZOOM} onZoom={setZoom} />
              {/* 글 직접 고치기의 자동 저장·저장(과제원장 편집기와 같은 자리·모양) */}
              {textEditable && (
                <>
                  <AutosaveSwitch on={text.autosave} onToggle={text.toggleAutosave} />
                  <span role="status" aria-live="polite" className={`text-xs whitespace-nowrap ${text.status.kind === "error" ? "text-error" : text.status.kind === "dirty" ? "text-warn" : "text-muted-2"}`}>
                    {text.status.text}
                    {text.pendingCount > 1 && text.status.kind === "dirty" ? ` ${text.pendingCount}곳` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => void text.saveAll()}
                    disabled={text.status.kind === "saving"}
                    aria-label="지금 저장"
                    title={text.autosave ? "지금 저장(자동 저장 켜짐 — 고친 뒤 1.5초면 저장)" : "지금 저장(자동 저장 꺼짐)"}
                    className={`${T.iconBtn} border-field-line bg-paper text-navy hover:border-navy`}
                  >
                    <Save size={15} aria-hidden="true" />
                  </button>
                </>
              )}
              {props.toolbarEnd}
            </span>
          </div>
          <div ref={scrollRef} className="min-h-0 grow overflow-auto bg-[#e9eae9]">
            <div ref={contentRef} className="relative flex w-max min-w-full items-start justify-center gap-5 px-6 py-5">
              {/* 끌어 고르기 시작만 기억(도구줄은 창의 mouseup에서 — 블록 고치기) */}
              <div
                ref={paperRef}
                className={`shrink-0 ${textEditable ? "k-text-edit" : ""}`}
                style={{ zoom }}
                onMouseDown={onPaperMouseDown}
                onClick={openNoteAt}
                onDoubleClick={text.startEdit}
                title={textEditable ? "글을 두 번 누르면 그 자리에서 고칩니다(Enter 끝 · Esc 취소)" : undefined}
              >
                {shown === "outline" ? sheet : props.preview}
              </div>
              {column && (
                <OutlineNotes
                  box={paperRef}
                  layoutKey={`${shown}|${zoom}`}
                  view={shown}
                  data={outline}
                  showOutline={Boolean(outline) && margin}
                  ed={ed}
                  canEdit={props.canWrite && !props.locked}
                  match={props.match}
                  zoom={zoom}
                  onShowMaterial={showMaterial}
                  onShowOutline={() => setView("outline")}
                  composer={reviewOn && review.composer ? <DraftComposer state={review.composer} canEdit={props.canWrite} onChange={review.setComposer} onSend={review.sendComposer} onClose={review.closeComposer} /> : null}
                  reviewNotes={
                    reviewOn
                      ? review.notes.map((n) => (
                          <DraftReviewNote
                            key={n.id}
                            n={n}
                            paused={review.paused}
                            canEdit={props.canWrite}
                            onGoto={() => flashBlock(paperRef.current, n.blockIndex)}
                            onHover={(on) => hoverBlock(paperRef.current, on ? n.blockIndex : null)}
                            onCancel={() => {
                              const back = review.cancel(n.id);
                              if (back) review.setComposer({ blockIndex: back.blockIndex, others: [], quote: back.quote, kind: back.kind, text: back.request });
                            }}
                            onUndo={() => void review.undo(n)}
                            onRetry={() => review.retry(n.id)}
                            onRemove={() => review.remove(n.id)}
                            onRefresh={review.refresh}
                          />
                        ))
                      : null
                  }
                  reviewCount={reviewOn ? review.notes.length : 0}
                />
              )}
              {reviewOn && review.pick && (
                <DraftSelectionBar
                  top={review.pick.top}
                  left={review.pick.left}
                  canEdit={props.canWrite}
                  onPick={review.onPick}
                  // 추진성과 상자(RESULT_AT)는 모양 바꾸기 없음 — 「AI 수정 요청」·「질문」만
                  onShape={
                    props.shapeMenu && review.pick.blockIndex !== RESULT_AT
                      ? () => {
                          const at = review.takePick();
                          if (!at) return;
                          setShapeAt((cur) => (cur && cur.blockIndex === at.blockIndex ? { ...cur, quote: at.quote } : { ...at, key: Date.now() }));
                          openSide("shapes");
                        }
                      : undefined
                  }
                />
              )}
            </div>
          </div>
          <Toast key={review.toast?.key ?? 0} spec={review.toast?.spec ?? null} onDone={review.clearToast} />
          {textToast && <Toast key={`t${textToast.key}`} spec={textToast.spec} onDone={() => setTextToast(null)} />}
        </div>
        {paneOpen && <PaneResizer width={paneW} onWidth={setPaneLive} onDragging={setPaneDragging} onCommit={setPaneW} label="오른쪽 패널 폭 조절" />}
        {/* 오른쪽: 탭(AI 초안 | 점검 결과) 또는 근거 자료 — 구성안 블록 목록이 여백 메모로 나가 좁게(440px) */}
        <div id={`${id}-pane`} ref={rightRef} className={`${paneOpen ? "flex" : "hidden"} ${paneClass(paneW)} flex-col border-l border-line bg-paper`} style={paneWidthStyle(paneW)}>
          <div className={`${other ? "hidden" : "flex"} h-14 shrink-0 items-stretch border-b border-line px-5`}>
            <PaneTabs id={id} ariaLabel="AI 초안·점검 결과" tabs={paneTabs} active={tab} onChange={setTab} />
          </div>
          <div id={`${id}-ai`} role="tabpanel" aria-labelledby={`${id}-ai-tab`} className={pane(side === "ai")}>
            <DraftCompose
              uid={props.uid}
              canWrite={props.canWrite}
              hasSpec={props.hasSpec}
              hasOutline={Boolean(outline)}
              outline={outlinePanel}
              draftInfo={props.draftInfo}
              meta={props.draftMeta}
              outlineApproved={outline?.status === "approved"}
              checkCount={props.checkCount}
              locked={props.locked}
              deptView={Boolean(props.deptView)}
              onShowCheck={() => {
                openSide(null);
                setTab("check");
              }}
              onShowOutline={() => {
                // 구성안 판(왼쪽 판면)으로 바꾸고 구성안 패널을 펼침 — 패널의 「승인하고 집필」로 이어짐
                openSide(null);
                setTab("ai");
                setView("outline");
                ed.setOpen(true);
              }}
              cardFiles={props.cardFiles}
              reportFiles={props.reportFiles}
              lensCount={props.lens.length}
              inspection={props.inspection ?? null}
              sel={sel}
              busy={busy}
              setBusy={setBusy}
              msg={msg}
              setMsg={setMsg}
              onOpenSources={() => openSide("sources")}
              humanEdits={props.humanEdits}
              outlineHuman={outline ? (ed.view ?? outline.view).human : 0}
              avail={outline ? (ed.view ?? outline.view).avail : null}
              currentStory={outline?.outline.story || null}
              onPlan={planDraft}
              alternative={outline?.outline.alternative || null}
              active={side === "ai"}
              outlineRun={{ busy: ed.busy, at: ed.busyAt, msg: ed.msg, frame: ed.busyFrame }}
              onAlts={(cands, request, sources) => openAlts(cands, request, { sources, confirm: outline && (ed.view ?? outline.view).human > 0 ? `구성안에 담당자가 고르거나 더한 블록 ${(ed.view ?? outline.view).human}개가 있습니다. 고른 안으로 바꾸면 고친 내용은 사라집니다. 계속할까요?` : null })}
              outlineSources={outline?.outline.sources ?? null}
              prior={props.prior}
              mg={props.mg}
            />
          </div>
          <div id={`${id}-check`} role="tabpanel" aria-labelledby={`${id}-check-tab`} className={pane(side === "check")}>
            {/* 항목 단추(data-jump)는 서버가 그림 — 누르면(키보드로 눌러도 click이 올라옴) 여기서 받아 미리보기의 그 자리로 */}
            <div onClick={onJump} className="min-h-0 grow overflow-y-auto px-5 py-4">
              {props.check}
            </div>
          </div>
          <div className={pane(side === "sources")}>
            <DraftSources {...props} sel={sel} busy={Boolean(busy)} onClose={() => setOther(null)} />
          </div>
          {shapeAt && props.shapeMenu && (
            <div className={pane(side === "shapes")}>
              <BlockShapes
                key={shapeAt.key}
                uid={props.uid}
                blockIndex={shapeAt.blockIndex}
                quote={shapeAt.quote}
                version={props.version}
                currentCode={props.blockCodes?.[shapeAt.blockIndex] ?? ""}
                menu={props.shapeMenu}
                mg={Boolean(props.mg)}
                onClose={() => setOther(null)}
                onRefresh={review.refresh}
                onApplied={(r, request) => {
                  review.record({ blockIndex: r.blockIndex, request, reply: r.reply, message: r.message, editId: r.editId, changed: r.changed, version: r.version });
                  setShapeAt(null);
                  setOther(null);
                }}
              />
            </div>
          )}
          {side === "history" && (
            <div className={pane(true)}>
              <DraftHistory
                uid={props.uid}
                version={props.version}
                onClose={() => setOther(null)}
                onGoto={(j) => {
                  setView("draft");
                  setTimeout(() => flashBlock(paperRef.current, j), 60);
                }}
              />
            </div>
          )}
        </div>
      </div>
      {outline && (
        <>
          <ShapePicker
            open={Boolean(ed.picker)}
            uid={props.uid}
            edit={ed.edit}
            target={ed.picker}
            table={outline.names.table}
            current={ed.picker?.mode === "change" && pickItem ? codeOf(pickItem.kind, pickItem.variant) : null}
            aiCodes={pickOrig ? [...(pickOrig.ai ? [codeOf(pickOrig.ai.kind, pickOrig.ai.variant)] : []), ...(pickOrig.alts ?? []).map((a) => codeOf(a.kind, a.variant))] : []}
            aiReasons={pickOrig ? Object.fromEntries([...(pickOrig.ai ? [[codeOf(pickOrig.ai.kind, pickOrig.ai.variant), "처음 구성안에서 고른 도식"]] : []), ...(pickOrig.alts ?? []).filter((a) => a.why).map((a) => [codeOf(a.kind, a.variant), a.why])]) : {}}
            fit={(ed.view ?? outline.view).fit}
            context={ed.picker && pickItem ? `${ed.picker.pos + 1}번 「${pickItem.label || rowOf(outline.names.table, pickItem.kind, pickItem.variant)?.name || "블록"}」` : undefined}
            onPick={ed.pick}
            onClose={() => ed.setPicker(null)}
          />
          <FrameworkGallery
            open={ed.gallery}
            uid={props.uid}
            current={outline.outline.story || null}
            aiStory={outline.outline.story || null}
            alternative={outline.outline.alternative || null}
            avail={(ed.view ?? outline.view).avail}
            busy={Boolean(ed.busy)}
            confirmLabel={`이 짜임으로 구성안 다시 만들기(${rangeText(draftExpect("story", props.mg))})`}
            request={{ initial: ed.memo }}
            alts={props.canWrite}
            onPick={(frame, request) => ed.regenerate(frame, request)}
            onAlts={(cands, request) => {
              ed.setGallery(false);
              openAlts(cands, request, { sources: outline.outline.sources, confirm: ed.regenWarning });
            }}
            onClose={() => ed.setGallery(false)}
          />
          {/* 경영관리 절별 「짜임 고르기」(2026-10-12): 그 절만 이야기 틀·구성 패턴·2025 예시 절·요청 글로 다시 짜거나 여러 안 */}
          {outline.outline.mg && (
            <FrameworkGallery
              open={Boolean(ed.partGallery)}
              uid={props.uid}
              mg
              context={(() => {
                const meta = outline.outline.mg.parts.find((x) => x.key === ed.partGallery);
                return meta ? partName(meta, ed.parts.find((x) => x.key === meta.key)?.title ?? meta.title) : undefined;
              })()}
              current={outline.outline.mg.parts.find((x) => x.key === ed.partGallery)?.story || null}
              busy={Boolean(ed.busy)}
              confirmLabel={`이 짜임으로 절 다시 짜기(${rangeText(draftExpect("story", true))})`}
              request={{ initial: "" }}
              alts={props.canWrite}
              onPick={(frame, request) => ed.partGallery && ed.regeneratePart(ed.partGallery, frame, request)}
              onAlts={(cands, request) => {
                const key = ed.partGallery;
                if (!key) return;
                ed.setPartGallery(null);
                openAlts(cands, request, { sources: outline.outline.sources, part: key, confirm: ed.partWarning(key) });
              }}
              onClose={() => ed.setPartGallery(null)}
            />
          )}
        </>
      )}
      <OutlineAlts uid={props.uid} req={alts} onClose={() => setAlts(null)} onAdopted={(message) => setMsg({ ok: true, text: message })} />
    </main>
  );
}

/** 비교용 글: 빈칸·강조 표시·자리표시 괄호를 걷음 */
const norm = (s: string) => s.replace(/\*\*|\^\{|【확인:|】|\s+/g, "").replace(/[{}]/g, "");
/** 근거 약한 문장 찾기: 같은 글이거나 앞 24자가 같으면 */
const sameSentence = (a: string, b: string) => a === b || (a.length >= 8 && b.length >= 8 && a.slice(0, 24) === b.slice(0, 24));

function SibLink({ sib, dir }: { sib: Sib; dir: "prev" | "next" }) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  const cls = "flex size-7 shrink-0 items-center justify-center rounded-md border no-underline";
  if (!sib)
    return (
      <span aria-hidden className={`${cls} border-line text-muted opacity-40`}>
        <Icon size={15} />
      </span>
    );
  const name = `${dir === "prev" ? "앞" : "다음"} 과제 ${sib.taskNo} ${sib.title}`;
  return (
    <Link href={sib.href} aria-label={name} title={name} className={`${cls} border-field-line text-ink hover:border-navy`}>
      <Icon size={15} aria-hidden />
    </Link>
  );
}

/** 머리의 더보기(… 단추): 바깥 누르기·Esc로 닫히고, 위·아래 화살표로 항목을 옮김 */
function MoreMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  // 화면 그대로 한글 내려받기 — 메뉴가 닫혀도 진행·확인 창이 남도록 늘 그려지는 이 부품이 가짐
  const hwpx = useDomHwpx();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    // capture 단계: 근거 자료 패널의 Esc보다 먼저 받아 메뉴만 닫음
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onEsc, true);
    // 열면 첫 항목에 초점(키보드로 바로 고를 수 있게)
    box.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onEsc, true);
    };
  }, [open]);

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = [...(box.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    if (!list.length) return;
    const i = list.indexOf(document.activeElement as HTMLElement);
    const go = (j: number) => {
      e.preventDefault();
      list[(j + list.length) % list.length]?.focus();
    };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list.length - 1);
    else if (e.key === "Tab") setOpen(false);
  };
  const itemCls = "px-3 py-2 text-ink no-underline hover:bg-row-hover focus:bg-row-hover focus:outline-none";

  return (
    <div ref={box} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="더보기"
        title="더보기 — 카드 보기·보고서에서 보기·HTML 내려받기"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`${T.iconBtn} ${open ? "border-navy text-navy" : "border-field-line text-ink hover:border-navy"}`}
      >
        <Ellipsis size={16} aria-hidden />
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label="과제별 초안 더보기" onKeyDown={onMenuKey} className="absolute top-9 right-0 z-menu flex w-64 flex-col rounded-md border border-line-strong bg-paper py-1 text-ui shadow-menu">
          {items.map((it) => {
            const body = (
              <>
                {it.label}
                {it.hint && <span className="block text-xs text-muted">{it.hint}</span>}
              </>
            );
            if (it.dom) {
              const dom = it.dom;
              return (
                <button
                  key={it.href}
                  type="button"
                  role="menuitem"
                  disabled={hwpx.busy}
                  onClick={() => {
                    setOpen(false);
                    hwpx.start(dom);
                  }}
                  className={`${itemCls} text-left ${T.off}`}
                >
                  {body}
                </button>
              );
            }
            return it.download ? (
              <a key={it.href} role="menuitem" href={it.href} download onClick={() => setOpen(false)} className={itemCls}>
                {body}
              </a>
            ) : (
              <Link key={it.href} role="menuitem" href={it.href} onClick={() => setOpen(false)} className={itemCls}>
                {body}
              </Link>
            );
          })}
        </div>
      )}
      {hwpx.ui}
    </div>
  );
}
