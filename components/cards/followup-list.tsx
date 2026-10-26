"use client";

import type { ReactNode } from "react";
import type { VerifiedFollowup, VerifiedFollowupItem } from "../../lib/ai/followup.ts";

/** 판단 배지 — 기존 토큰만(새 색 없음): 반영됨 = 인용 확인 배지색, 일부 반영·미반영 = 경고색(미반영은 진하게), 확인 불가 = 회색 */
const BADGE: Record<VerifiedFollowupItem["judgment"], string> = {
  반영됨: "bg-thead text-link",
  "일부 반영": "bg-warn-bg text-warn",
  미반영: "bg-warn text-white",
  "확인 불가": "bg-thead text-muted-2",
};

/** 원문 확인/다름 배지(ai-assist의 인용 배지와 같은 모양) — null이면 그리지 않음 */
function Check({ ok }: { ok: boolean | null }) {
  if (ok === null) return null;
  return <span className={`shrink-0 rounded-chip px-1 text-xs ${ok ? "bg-thead text-link" : "bg-warn-bg text-warn"}`}>{ok ? "원문 확인" : "원문과 다름"}</span>;
}

function Line({ k, children }: { k: string; children: ReactNode }) {
  return (
    <p className="flex min-w-0 gap-1.5 text-ui leading-[1.6] break-keep">
      <span className="w-[64px] shrink-0 font-semibold text-muted-2">{k}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </p>
  );
}

/** 보완 점검 결과: 요약 수치 한 줄 → 항목 카드 목록(반영됨은 접힘) → 고정 문구. 옆 패널이 좁아 표 대신 카드 목록 */
export function FollowupList({ f }: { f: VerifiedFollowup }) {
  const c = f.counts;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-ui font-semibold text-ink">
        {f.period} 점검({f.statusLabel}) · 반영됨 {c["반영됨"]} · 일부 반영 {c["일부 반영"]} · 미반영 {c["미반영"]} · 확인 불가 {c["확인 불가"]}
        {f.focus && <span className="ml-1.5 font-normal text-warn">집중보완 과제</span>}
      </p>
      {f.items.map((it) => (
        <details key={it.id} open={it.judgment !== "반영됨"} className="group rounded-lg border border-line">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-ui marker:hidden">
            <span className={`shrink-0 rounded-chip px-1.5 text-xs font-semibold ${BADGE[it.judgment]}`}>{it.judgment}</span>
            <span className="min-w-0 flex-1 truncate font-semibold text-ink" title={it.label}>
              {it.star && <span className="mr-0.5 text-warn">★</span>}
              {it.label}
            </span>
            {it.missing && <span className="shrink-0 rounded-chip bg-warn-bg px-1 text-xs text-warn">AI 답에서 빠짐</span>}
            <span aria-hidden="true" className="shrink-0 text-muted group-open:hidden">▾</span>
            <span aria-hidden="true" className="hidden shrink-0 text-muted group-open:inline">▴</span>
          </summary>
          <div className="flex flex-col gap-1 border-t border-line px-3 py-2">
            {it.requested && <Line k="요구">{it.requested}</Line>}
            {it.cardQuote && (
              <Line k="현재 카드">
                <Check ok={it.cardQuoteOk} /> 「{it.cardQuote}」
              </Line>
            )}
            {it.inspectionQuote && (
              <Line k="점검표">
                <Check ok={it.inspectionQuoteOk} /> 「{it.inspectionQuote}」
              </Line>
            )}
            {it.remaining && <Line k="남은 할 일">{it.remaining}</Line>}
          </div>
        </details>
      ))}
      <p className="text-xs leading-[1.5] break-keep text-muted">{f.notice}</p>
    </div>
  );
}
