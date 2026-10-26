"use client";

import type { CardLayout } from "../../lib/hwp/layout.ts";
import type { DraftProps, ReviewProps } from "../../lib/cards/versions.ts";
import type { ReactNode, RefObject } from "react";
import { usePeekFocus } from "../shell/peek-escape";
import { WorkspaceBody } from "./card-workspace-body";
import { WorkspaceHeader } from "./card-workspace-header";
import { useCardWorkspace } from "./use-card-workspace.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface WorkspaceProps {
  variant: "peek" | "page";
  uid: string;
  group: string;
  taskNo: string;
  title: string;
  editionLabel: string;
  initial: any;
  imageUrls: Record<string, string>;
  /** 원본 배치(한글 파일에서 뗀 카드 표) — 없으면 원본 양식 렌더러 */
  layout?: CardLayout | null;
  /** 과제 속성(PDCA 단계·진도율·상태) — 도구줄 편집 칩은 없앴지만 타입 호환을 위해 남김(안 넘겨도 됨) */
  readOnly: boolean;
  closeHref: string;
  defaultPeriod: string;
  /** 부서 담당자(또는 부서 화면 보기): 이달 작성본 */
  draft?: DraftProps;
  /** 성과관리팀: 제출된 작성본 비교·확정 */
  review?: ReviewProps;
  /** 부서 화면 보기(읽기 전용) */
  preview?: boolean;
  /** 전체 쪽 주소 */
  pageHref?: string;
  /** 부서 작성본에서 잠근 고정 영역 경로 */
  locked?: string[];
  /** 성과관리팀: 고정 영역 확정 시각(없으면 미확정) — 확정·풀기 막대 */
  fixedLockedAt?: string | null;
  /** 머리 아래 안내(예: 주관 부서로 읽는 다른 부서 과제) */
  notice?: string;
  /** 불러온 열린 작성본 번호(부서 작성본 저장 확인용) */
  versionId?: number | null;
  /** 불러온 원장 개정 번호(원장 저장 확인용) */
  rev?: number;
  /** 처음 열 오른쪽 패널(주소 ?panes= — 점검 결과에서 「카드 열어 보완」은 inspection) */
  initialPanes?: string;
  /** 머리 목록 아이콘(옆 창·전체 페이지 모두)의 돌아갈 곳 이름(없으면 「목록」) */
  returnLabel?: string;
}

/**
 * 카드 본문 작업 공간: 원본 양식(편집·읽기) + AI 작성지원.
 * 성과관리팀은 원장을 바로 고치고, 부서 담당자는 이달 작성본을 고쳐 제출합니다.
 * 옆 창에서는 ✕·Esc·창 바깥 누르기로 닫히고, 닫기 전에 남은 변경을 저장합니다(수정 내역 보존).
 * 상태·효과는 use-card-workspace, 머리는 card-workspace-header, 본문(편집기·오른쪽 패널)은 card-workspace-body.
 */
export function CardWorkspace(props: WorkspaceProps) {
  const ws = useCardWorkspace(props);
  const { shell } = ws;
  const header = <WorkspaceHeader props={props} ws={ws} />;
  const body = <WorkspaceBody props={props} ws={ws} />;

  if (props.variant === "page") {
    return (
      <main ref={shell} className="flex min-h-0 min-w-0 grow flex-col bg-paper">
        {header}
        {body}
      </main>
    );
  }
  return (
    <CardPeek shell={shell}>
      {header}
      {body}
    </CardPeek>
  );
}

/** 옆 창으로 쓰일 때만 초점 관리(전체 페이지 variant는 이 컴포넌트를 쓰지 않음) */
function CardPeek({ shell, children }: { shell: RefObject<HTMLElement | null>; children: ReactNode }) {
  usePeekFocus(shell);
  return (
    <aside ref={shell} role="dialog" aria-label="과제관리카드 원문" className="peek-sheet flex w-full max-w-[1720px] flex-col border-l border-line-strong bg-paper shadow-peek">
      {children}
    </aside>
  );
}
