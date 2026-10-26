"use client";

import { List } from "lucide-react";
import Link from "next/link";
import type { MouseEventHandler } from "react";
import { T } from "../ui/kit";

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
