// 과제관리카드 「한글(화면 그대로)」(2026-10-28)의 숨은 사본 재료 — 입출력 없는 순수 함수.
// 숨은 사본(/cards/<uid>/hwpx-copy)은 카드 화면과 같은 원본 배치 그리기(renderLayoutCard)를 편집 칸·잠금·검토 표지 없이 그리고,
// 맨 위에 원본 문서의 묶음 제목 표(layout.lead)를 둠 — 한글 내려받기(layout-hwpx.ts)처럼 다시 올리면 묶음(주요사업N)을 알아보게.
// 본문 틀은 쪽 본문 폭(용지 − 좌우 여백)으로 두어 범용 변환기(lib/reports/dom-hwpx)의 틀 폭 검사·쪽 정의와 맞춤(블록은 틀 왼쪽 = 왼쪽 여백에서 시작).
// 표지 이름·사본 안 준비 함수(브라우저 묶음에 들어가는 가벼운 것)는 hwpx-copy-marks.ts

import type { PageMm } from "../reports/dom-hwpx/convert.ts";
import type { CardLayout } from "../hwp/layout.ts";
import type { LooseJson } from "../loose-json.ts";
import { pageOf } from "./layout-hwpx.ts";
import { CARD_COPY_FRAME_ATTR } from "./hwpx-copy-marks.ts";
import { renderLayoutCard } from "./layout-render.ts";

const HU_PER_MM = 7200 / 25.4;
const mm = (hu: number) => Math.round((hu / HU_PER_MM) * 1000) / 1000;

/** 카드 원본 배치의 쪽 정의(mm) — 한쪽 제본(맞쪽이 아니면 왼쪽·오른쪽 여백 그대로) */
export function cardPageMm(layout: CardLayout): PageMm {
  const p = pageOf(layout);
  const w = p.landscape ? p.height : p.width;
  const h = p.landscape ? p.width : p.height;
  return { width: mm(w), height: mm(h), inside: mm(p.left), outside: mm(p.right), top: mm(p.top), bottom: mm(p.bottom), header: mm(p.header), footer: mm(p.footer), gutter: mm(p.gutter), gutterType: p.gutterType ?? "LEFT_ONLY" };
}

/** 쪽 본문 폭(mm) = 용지 − 좌우 여백(변환기 bodyMmOf와 같은 셈) */
export function cardBodyWidthMm(layout: CardLayout): number {
  const p = cardPageMm(layout);
  return Math.round((p.width - p.inside - p.outside) * 1000) / 1000;
}

/** 숨은 사본의 본문(본문 틀 + 묶음 제목 표 + 카드). 배치에 잇기 표시가 없거나 맞출 수 없으면 null */
export function cardCopyBody(card: LooseJson, layout: CardLayout, imageUrl: (key: string) => string | null): string | null {
  const html = renderLayoutCard(card, layout, { lead: true, imageUrl });
  if (html === null) return null;
  return `<div ${CARD_COPY_FRAME_ATTR}="" style="width:${cardBodyWidthMm(layout)}mm">${html}</div>`;
}

/**
 * 한글로 내려받을 카드 JSON과 판(입출력 없음 — 원본 배치 내려받기 GET·화면 그대로 사본·변환 라우트가 같은 기준):
 * 부서 담당자이고 그 팀 카드면 열린 작성본(없으면 원장), 그 밖(성과관리팀·관리자 — 부서 화면 보기 포함)은 원장.
 * 판은 원장 `c:<updated_at>` 또는 작성본 `v<번호>:<updated_at>` — 사본을 뜬 뒤 바뀌었는지 변환 라우트가 대조(409)
 */
export function hwpxBasis(
  me: { role: string; teamId: number | null },
  card: { teamId: number | null; data: LooseJson; updatedAt: string },
  open: { id: number; data: LooseJson; updatedAt: string | null; createdAt: string } | null,
): { data: LooseJson; version: string } {
  if (me.role === "dept_user" && me.teamId !== null && me.teamId === card.teamId && open) return { data: open.data, version: `v${open.id}:${open.updatedAt ?? open.createdAt}` };
  return { data: card.data, version: `c:${card.updatedAt}` };
}
