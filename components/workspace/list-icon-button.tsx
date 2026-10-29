"use client";

import { ChevronLeft, List } from "lucide-react";
import Link from "next/link";
import type { MouseEventHandler } from "react";
import { T } from "../ui/kit";
import { PHONE_QUERY, useMedia } from "./use-narrow.ts";

const cls = `${T.iconBtn} border-field-line text-ink hover:border-navy`;

/**
 * 옆 창·전체 페이지 머리의 목록 아이콘(늘 맨 앞, shrink-0 — 제목이 길어도 줄거나 숨지 않음).
 * href(다른 목록 주소로 이동)나 onClick(닫기 등, 옆 창은 ✕와 같은 동작)으로 목록으로 돌아갑니다.
 */
export function ListIconButton(props: { label: string; href?: string; onClick?: MouseEventHandler<HTMLButtonElement> }) {
  const title = `목록으로 — ${props.label}`;
  if (props.href)
    return (
      <Link href={props.href} aria-label={title} title={title} className={cls}>
        <List size={16} aria-hidden />
      </Link>
    );
  return (
    <button type="button" onClick={props.onClick} aria-label={title} title={title} className={cls}>
      <List size={16} aria-hidden />
    </button>
  );
}

const backCls = "-ml-1 flex size-9 shrink-0 items-center justify-center rounded-md text-ink no-underline hover:bg-row-hover hover:text-navy";

/**
 * 휴대폰 폭(md 미만) 상세 머리 맨 앞의 ‹(목록으로 — 오른쪽 아이콘 묶음을 그리지 않는 보기 중심 머리).
 * 휴대폰 폭에서만 그림(서버·첫 하이드레이션·넓은 폭은 아무것도 안 그려 데스크톱 DOM이 그대로). href 또는 onClick은 ListIconButton과 같음
 */
export function PhoneBackButton(props: { label: string; href?: string; onClick?: MouseEventHandler<HTMLButtonElement> }) {
  const phone = useMedia(PHONE_QUERY);
  if (!phone) return null;
  const title = `목록으로 — ${props.label}`;
  if (props.href)
    return (
      <Link href={props.href} aria-label={title} title={title} className={backCls}>
        <ChevronLeft size={20} aria-hidden />
      </Link>
    );
  return (
    <button type="button" onClick={props.onClick} aria-label={title} title={title} className={backCls}>
      <ChevronLeft size={20} aria-hidden />
    </button>
  );
}
