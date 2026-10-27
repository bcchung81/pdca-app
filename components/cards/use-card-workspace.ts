import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { confirmMyDraft, setDraftStatus } from "../../app/(app)/my/actions";
import { withReturn } from "../../lib/nav/return-to.ts";
import { usePaneWidth } from "../workspace/pane-resizer";
import { paneClass, paneWidthStyle } from "../workspace/right-pane.ts";
import type { CardEditorHandle } from "./card-editor";
import type { WorkspaceProps } from "./card-workspace";

/**
 * 카드 작업 공간의 화면 상태·효과(오른쪽 패널 탭, 더보기 메뉴, 닫기 확인, 작성본 확정(원장 반영)·남은 제출 취소).
 * 머리(card-workspace-header)와 본문(card-workspace-body)이 이 값을 받아 그립니다.
 */
export function useCardWorkspace(props: WorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const editor = useRef<CardEditorHandle>(null);
  const shell = useRef<HTMLElement>(null);
  const closing = useRef(false);
  // 오른쪽 패널은 늘 열려 있음: 기본은 「AI 작성지원 | 점검 결과」 탭(점검 결과에서 오면 ?panes=inspection으로 점검 결과 탭).
  // 자료·수정 이력·한글 파일 채우기는 그 자리에 잠시 바꿔 열고, 닫으면 탭으로 돌아옴
  const [tab, setTab] = useState<"ai" | "inspection">(() => ((props.initialPanes ?? "").split(",")[0] === "inspection" ? "inspection" : "ai"));
  const [other, setOther] = useState<null | "history" | "materials" | "import">(null);
  const side = other ?? tab;
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [archiving, setArchiving] = useState(false);
  const [savedTick, setSavedTick] = useState(0);
  // AI가 코멘트를 처리하는 중에 닫으려 할 때: 확인 막대(닫으면 결과가 카드에 반영되지 않음)
  const [leaving, setLeaving] = useState<null | (() => void)>(null);
  const aiOpen = side === "ai";
  const inspOpen = side === "inspection";
  const toggle = (next: NonNullable<typeof other>) => setOther((cur) => (cur === next ? null : next));
  // 두 탭은 한 패널: 탭을 바꿔도 AI 입력·첨부와 불러온 점검표가 남게 한 번 연 탭은 숨겨 둠(자료·수정 이력으로 바꾸면 내림)
  const assistPane = other === null;
  const [inspSeen, setInspSeen] = useState(inspOpen);
  if (inspOpen !== inspSeen && (inspOpen || !assistPane)) setInspSeen(inspOpen);
  const paneId = useId();
  // 오른쪽 패널(AI 작성지원·점검 결과·자료·수정 이력·한글 파일 채우기)은 모두 같은 반응형 폭(경평 초안과 같은 규칙) — 패널을 바꿔도 카드 쪽이 들락날락하지 않게.
  // 여백 메모 열(드래그 「AI 수정 요청」)이 보이면 카드 쪽 배율(useFitZoom)이 그 폭만큼 빼고 셈 — 옆 창 폭 자체를 늘리지 않음
  const { width: paneW, setWidth: setPaneW, setLive: setPaneLive, dragging: paneDragging, setDragging: setPaneDragging } = usePaneWidth("card-pane-w");
  const sidePane = `${paneClass(paneW)} border-l border-line`;
  const sidePaneStyle = paneWidthStyle(paneW);
  // 서명 URL은 처음 값으로 고정(다시 그려지며 입력 중인 글이 흔들리지 않게). 한글 파일로 채운 새 그림만 더함
  const [imageUrls, setImageUrls] = useState(props.imageUrls);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { closeHref, variant, draft } = props;
  const draftMode = Boolean(draft) && !props.preview;
  const pageHref = props.pageHref ?? `/cards/${props.uid}`;
  const listLabel = props.returnLabel ?? "목록";
  // 경평 초안 바로가기: 지금 화면 주소(옆 창이면 목록+peek 주소)를 돌아갈 곳으로 넘김
  const here = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ""}`;
  const reportHref = withReturn(`/reports/cards/${props.uid}`, here);

  const leave = useCallback(async () => {
    if (closing.current) return;
    closing.current = true;
    await editor.current?.flush();
    router.push(closeHref, { scroll: false });
  }, [closeHref, router]);
  // AI가 코멘트를 처리하는 중이면 바로 닫지 않고 확인 막대를 띄움
  const close = useCallback(async () => {
    if (editor.current?.busy()) setLeaving(() => () => void leave());
    else await leave();
  }, [leave]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (menu) setMenu(false);
      else if (other) setOther(null);
      else if (variant === "peek") void close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [other, menu, close, variant]);

  useEffect(() => {
    if (variant !== "peek") return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t || shell.current?.contains(t)) return;
      if (t.closest("[data-card-link]") || t.closest("[data-keep-peek]")) return;
      void close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [close, variant]);

  // 더보기 메뉴: 바깥을 누르면 닫힘
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menu]);

  const onSaved = useCallback(() => {
    setSavedTick((n) => n + 1);
    router.refresh();
  }, [router]);

  // 확정(원장 반영): 편집기에 남은 변경을 먼저 저장한 뒤 — 저장 못 하면 확정하지 않음(옛 작성본이 원장에 들어가지 않게)
  const draftOp = (op: "confirm" | "withdraw") =>
    startTransition(async () => {
      if (op === "confirm" && !(await editor.current?.flush())) {
        setMessage("저장하지 못해 확정하지 않았습니다.");
        return;
      }
      const res = op === "confirm" ? await confirmMyDraft(props.uid) : await setDraftStatus(props.uid, op);
      setMessage(
        res.ok
          ? op === "confirm"
            ? (res.message ?? "확정해 원장에 반영했습니다.")
            : "제출을 취소했습니다. 다시 고칠 수 있습니다."
          : `${res.message ?? "처리하지 못했습니다."} 화면을 새로 고쳐 최신 상태를 확인해 주세요.`,
      );
      router.refresh();
    });

  return {
    router, editor, shell, tab, setTab, other, setOther, side, menu, setMenu, menuRef, archiving, setArchiving, savedTick, leaving, setLeaving,
    aiOpen, inspOpen, toggle, assistPane, inspSeen, paneId, paneW, setPaneW, setPaneLive, paneDragging, setPaneDragging, sidePane, sidePaneStyle,
    imageUrls, setImageUrls, message, setMessage, pending, draftMode, pageHref, listLabel, reportHref, close, onSaved, draftOp,
  };
}

export type CardWorkspaceState = ReturnType<typeof useCardWorkspace>;
