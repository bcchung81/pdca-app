"use client";

import { Ellipsis, FileText, FolderOpen, History, Maximize2, X } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import type { DraftProps } from "../../lib/cards/versions.ts";
import { fmtDateTime } from "../../lib/format.ts";
import { ListIconButton } from "../workspace/list-icon-button";
import { ArchiveCardForm } from "./archive-controls";
import type { WorkspaceProps } from "./card-workspace";
import { useAsk } from "../ui/confirm-dialog";
import { cardDomTarget, useDomHwpx } from "../reports/dom-hwpx-download";
import { T } from "../ui/kit";
import { ReviewBar } from "./card-workspace-bars";
import type { CardWorkspaceState } from "./use-card-workspace";

const DRAFT_LABEL: Record<DraftProps["status"], string> = { none: "원장과 같음", draft: "작성 중", submitted: "제출함 · 확인 대기", confirmed: "이달 확정됨" };

/** 작성본 막대의 영향 범위 안내(상태별 — 「저장」과 「확정」이 다른 일임을 보임). none은 월을 붙임. submitted는 2026-10-27 전에 낸 작성본뿐 */
function draftScopeNote(draft: DraftProps): string {
  const month = draft.label.replace(/ 작성본$/, "");
  if (draft.status === "none") return `고치면 ${month} 작성본에 저장 · 원장은 그대로`;
  if (draft.status === "draft") return "확정하면 바뀐 곳이 원장에 바로 반영";
  if (draft.status === "submitted") return "성과관리팀 차례 · 확인하면 원장에 반영";
  return "원장에 반영됨";
}

/** 처음 쓰는 사람 안내를 닫았는지 — 이 브라우저에 기억. 서버 첫 그림은 「닫음」(숨김)이라 하이드레이션이 어긋나지 않음 */
const HINT_KEY = "pdca-card-edit-hint";
const HINT_EVENT = "pdca-card-edit-hint-change";
let hintClosedHere = false;
const hintStore = {
  subscribe(on: () => void) {
    window.addEventListener(HINT_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(HINT_EVENT, on);
      window.removeEventListener("storage", on);
    };
  },
  closed(): boolean {
    if (hintClosedHere) return true;
    try {
      return window.localStorage.getItem(HINT_KEY) === "1";
    } catch {
      return false;
    }
  },
  close() {
    hintClosedHere = true;
    try {
      window.localStorage.setItem(HINT_KEY, "1");
    } catch {
      // 기억하지 못하면 이 화면에서만 닫음
    }
    window.dispatchEvent(new Event(HINT_EVENT));
  },
};

function EditHint() {
  const closed = useSyncExternalStore(hintStore.subscribe, hintStore.closed, () => true);
  if (closed) return null;
  return (
    <div className="flex min-w-0 items-start gap-2 border-t border-line bg-field px-6 py-1.5 text-xs text-muted-2">
      <p className="min-w-0 grow">카드의 글을 눌러 바로 고칩니다 · 자동 저장됩니다 · 원장은 「확정(원장 반영)」을 누를 때 바뀝니다</p>
      <button type="button" aria-label="안내 닫기" title="안내 닫기" onClick={hintStore.close} className="-my-1 inline-flex size-6 shrink-0 items-center justify-center rounded text-muted hover:bg-row-hover hover:text-navy">
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}

type HeaderProps = { props: WorkspaceProps; ws: CardWorkspaceState };

/** 머리: 과제 제목 줄 + 작성본 막대 + 안내·비교·보관·닫기 확인·알림 */
export function WorkspaceHeader({ props, ws }: HeaderProps) {
  const { draft, variant } = props;
  return (
    <div className="flex shrink-0 flex-col border-b border-line">
      {/* 전체 페이지(전체 보기)는 머리 한 줄 — 돌아가기·과제번호·과제명 · 버튼(메뉴·화면 탭은 틀이 숨김, 머리띠 아래 전부 작성 영역) */}
      <div className={`flex justify-between gap-4 ${variant === "page" ? "min-h-14 items-center px-5 py-2" : "items-start px-6 pt-4 pb-3"}`}>
        <HeaderTitle props={props} />
        <HeaderButtons props={props} ws={ws} />
      </div>

      {draft && <DraftBar props={props} ws={ws} />}
      {draft && ws.draftMode && !props.readOnly && <EditHint />}
      {props.notice && <p className="border-t border-line bg-field px-6 py-1.5 text-xs text-muted-2">{props.notice}</p>}
      {props.review && <ReviewBar review={props.review} editor={ws.editor} onDone={ws.setMessage} />}

      {ws.archiving && <ArchiveCardForm uid={props.uid} onDone={ws.setMessage} onCancel={() => ws.setArchiving(false)} />}
      {ws.leaving && <LeaveBar ws={ws} />}
      {ws.message && (
        <p role="status" className="border-t border-line px-6 py-1.5 text-xs text-muted-2">
          {ws.message}
        </p>
      )}
    </div>
  );
}

function HeaderTitle({ props }: { props: WorkspaceProps }) {
  if (props.variant === "page") {
    return (
      <div className="flex min-w-0 items-baseline gap-3">
        <span className="shrink-0 font-mono text-xs whitespace-nowrap text-muted" title={`${props.group} · ${props.taskNo} · ${props.editionLabel} 현행 카드 · 원본 양식`}>
          {props.group} · {props.taskNo}
        </span>
        <h2 className="min-w-0 truncate font-serif text-title leading-8 font-bold tracking-[-0.3px] text-navy" title={props.title}>
          {props.title}
        </h2>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="truncate font-mono text-xs text-muted">
        {props.group} · {props.taskNo} · {props.editionLabel} 현행 카드 · 원본 양식
      </span>
      <h2 className="line-clamp-2 font-serif text-lg leading-snug font-bold text-navy" title={props.title}>
        {props.title}
      </h2>
    </div>
  );
}

/** 머리 오른쪽 아이콘 묶음: 목록 · 경평 초안 · 자료 · 수정 이력 · 더보기 · (옆 창) 전체 페이지·닫기 */
function HeaderButtons({ props, ws }: HeaderProps) {
  const { variant } = props;
  const { editor, router, side, toggle } = ws;
  return (
    <div className="flex shrink-0 items-center justify-end gap-2">
      <ListIconButton label={ws.listLabel} onClick={() => void ws.close()} />
      <Link href={ws.reportHref} aria-label="경평 초안" title="경평 초안 — 과제별 초안 열기" className={`${T.iconBtn} border-field-line text-ink hover:border-navy`}>
        <FileText size={16} aria-hidden />
      </Link>
      <button type="button" aria-pressed={side === "materials"} aria-label="자료" title="자료 — 카드 전용 자료" onClick={() => toggle("materials")} className={`${T.iconBtn} ${side === "materials" ? "border-navy bg-navy text-white" : "border-field-line text-ink hover:border-navy"}`}>
        <FolderOpen size={16} aria-hidden />
      </button>
      <button type="button" aria-pressed={side === "history"} aria-label="수정 이력" title="수정 이력" onClick={() => toggle("history")} className={`${T.iconBtn} ${side === "history" ? "border-navy bg-navy text-white" : "border-field-line text-ink hover:border-navy"}`}>
        <History size={16} aria-hidden />
      </button>
      <MoreMenu props={props} ws={ws} />
      {variant === "peek" && (
        <Link
          href={ws.pageHref}
          onClick={async (e) => {
            e.preventDefault();
            const go = async () => {
              await editor.current?.flush();
              router.push(ws.pageHref);
            };
            if (editor.current?.busy()) ws.setLeaving(() => () => void go());
            else await go();
          }}
          aria-label="전체 페이지로 열기"
          title="전체 페이지로 열기"
          className={`${T.iconBtn} border-field-line text-ink hover:border-navy`}
        >
          <Maximize2 size={15} aria-hidden />
        </Link>
      )}
      {variant === "peek" && (
        <button type="button" onClick={() => void ws.close()} aria-label="닫고 목록으로 (Esc)" title="닫고 목록으로 (Esc)" className={`${T.iconBtn} border-field-line text-muted hover:border-navy`}>
          <X size={16} aria-hidden />
        </button>
      )}
    </div>
  );
}

/** 더보기 메뉴: 한글 내려받기(원본 배치 · 화면 그대로) · 작성본 채우기 · 현행화 · 보관 */
function MoreMenu({ props, ws }: HeaderProps) {
  const { draft } = props;
  const { menu, setMenu, draftMode, menuRef } = ws;
  // 한글(화면 그대로): 원본 배치가 있는 카드만(숨은 사본이 원본 배치로 그림). 편집 중인 글을 먼저 저장해 사본(서버 내용)이 화면과 같게
  const dom = useDomHwpx();
  return (
    <div ref={menuRef} className="relative">
      {dom.ui}
      <button type="button" aria-haspopup="menu" aria-expanded={menu} aria-label="더보기" title="더보기 — 한글 내려받기·채우기·현행화·보관" onClick={() => setMenu(!menu)} className={`${T.iconBtn} ${menu ? "border-navy text-navy" : "border-field-line text-ink hover:border-navy"}`}>
        <Ellipsis size={16} aria-hidden />
      </button>
      {menu && (
        <div role="menu" aria-label="카드 더보기" className="absolute top-9 right-0 z-menu flex w-60 flex-col rounded-md border border-line-strong bg-paper py-1 text-ui shadow-menu">
          <a role="menuitem" href={`/cards/${props.uid}/hwpx`} download onClick={() => setMenu(false)} className="px-3 py-2 text-ink no-underline hover:bg-row-hover">
            한글(HWPX)로 내려받기
            <span className="block text-xs text-muted">지금 보이는 {draftMode ? "작성본" : "원장"} 카드 · 9.16 양식</span>
          </a>
          {props.layout && (
            <button
              role="menuitem"
              type="button"
              disabled={dom.busy}
              onClick={() => {
                setMenu(false);
                dom.startTarget(cardDomTarget(props.uid, async () => (await ws.editor.current?.flush()) ?? true));
              }}
              className={`px-3 py-2 text-left text-ink hover:bg-row-hover ${T.off}`}
            >
              한글(화면 그대로)
              <span className="block text-xs text-muted">화면 모양 그대로 옮김 · 다시 올리기(채우기·현행화)에는 위 파일</span>
            </button>
          )}
          {draftMode && !props.readOnly && (
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setMenu(false);
                ws.setOther("import");
              }}
              className="px-3 py-2 text-left text-ink hover:bg-row-hover"
            >
              한글 파일로 작성본 채우기
              <span className="block text-xs text-muted">한글에서 고친 카드를 올려 바뀐 곳만 반영</span>
            </button>
          )}
          {!draft && !props.preview && !props.readOnly && (
            <>
              <Link role="menuitem" href="/cards/import" onClick={() => setMenu(false)} className="px-3 py-2 text-ink no-underline hover:bg-row-hover">
                한글 파일로 현행화
                <span className="block text-xs text-muted">부서가 보낸 한글 파일로 원장을 최신으로</span>
              </Link>
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setMenu(false);
                  ws.setArchiving(true);
                }}
                className="border-t border-line px-3 py-2 text-left text-warn hover:bg-warn-bg"
              >
                과제 삭제(보관)…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** 부서 작성본 막대: 이름·상태·저장 시각·돌려받은 메모 · 확정(원장 반영) 단추 — 남은 제출 작성본은 제출 취소(부서 화면 보기는 읽기 전용 표시) */
function DraftBar({ props, ws }: HeaderProps) {
  const draft = props.draft;
  const { ask, dialog } = useAsk();
  if (!draft) return null;
  const { pending, draftMode, draftOp } = ws;
  const month = draft.label.replace(/ 작성본$/, "");
  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-6 py-2 text-ui ${draft.note && draft.status === "draft" ? "bg-warn-bg" : "bg-info-bg"}`}>
      <span className="shrink-0 font-semibold text-navy">{draft.label}</span>
      <span className="shrink-0 rounded-chip border border-link px-[5px] text-xs leading-5 text-link">{DRAFT_LABEL[draft.status]}</span>
      {draftMode && <span className="min-w-0 text-xs text-muted">{draftScopeNote(draft)}</span>}
      {draft.savedAt && <span className="shrink-0 font-mono text-xs text-muted">저장 {fmtDateTime(draft.savedAt)}</span>}
      {draft.note && draft.status === "draft" && (
        <span className="min-w-0 truncate text-warn" title={draft.note}>
          돌려받음: {draft.note}
        </span>
      )}
      {draftMode && (
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {draft.status === "submitted" ? (
            <button type="button" disabled={pending} onClick={() => draftOp("withdraw")} className={T.btn}>
              제출 취소
            </button>
          ) : (
            <button
              type="button"
              disabled={pending || draft.status === "none" || draft.status === "confirmed"}
              onClick={() =>
                ask(
                  [
                    {
                      title: `${month} 작성본을 원장에 반영할까요?`,
                      body: ["작성본에서 바꾼 곳이 과제 원장에 바로 반영됩니다(성과관리팀 확인 단계 없음). 성과관리팀은 수정 이력에서 보고, 필요하면 원장을 고칩니다.", "확정한 뒤 다시 고치면 새 작성본이 시작됩니다."],
                      confirmLabel: "확정",
                    },
                  ],
                  () => draftOp("confirm"),
                )
              }
              className={T.btnPrimary}
              title={draft.status === "none" ? "카드를 고치면 확정할 수 있습니다" : undefined}
            >
              확정(원장 반영)
            </button>
          )}
          {dialog}
        </span>
      )}
      {props.preview && <span className="ml-auto shrink-0 text-xs text-muted">부서 화면 보기 · 읽기 전용</span>}
    </div>
  );
}

/** AI가 코멘트를 처리하는 중 닫으려 할 때의 확인 막대 */
function LeaveBar({ ws }: { ws: CardWorkspaceState }) {
  const { leaving, setLeaving } = ws;
  return (
    <div role="alertdialog" aria-label="닫기 확인" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-warn-bg px-6 py-2 text-ui">
      <span className="min-w-0 text-warn">AI가 코멘트를 처리하고 있습니다. 지금 닫으면 결과가 카드에 반영되지 않습니다.</span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        <button type="button" onClick={() => setLeaving(null)} className={T.btnPrimary}>
          기다리기
        </button>
        <button
          type="button"
          onClick={() => {
            const go = leaving;
            setLeaving(null);
            go?.();
          }}
          className={`flex h-8 shrink-0 items-center rounded-md border px-2.5 text-xs font-semibold whitespace-nowrap no-underline border-warn bg-paper text-warn ${T.off}`}
        >
          그래도 닫기
        </button>
      </span>
    </div>
  );
}
