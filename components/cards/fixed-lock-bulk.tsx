"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { T } from "../ui/kit";
import { setFixedLock } from "../../app/(app)/cards/actions";

/** 과제 원장: 고정 영역 일괄 확정(6월 셋업) — 머리띠에서 고른 트랙의 과제만. 두 번 눌러 확인 */
export function FixedLockBulk({
  locked,
  total,
  exportHref,
  label,
}: {
  locked: number;
  total: number;
  exportHref?: string;
  /** 트랙의 고정 영역 이름(주요사업 Act·Plan·계량지표, 경영관리 전년도 환류·지적 및 개선방안·계량지표 — lib/cards/fixed.ts) */
  label: string;
}) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const rest = total - locked;
  const exportLink = exportHref && (
    <a
      href={exportHref}
      download
      className="flex h-9 shrink-0 items-center rounded-md border border-field-line bg-paper px-3 text-xs font-semibold whitespace-nowrap text-ink no-underline hover:border-navy"
    >
      목록 내려받기(CSV)
    </a>
  );
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <div className="flex min-w-0 grow flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-paper px-4 py-2 text-ui">
        <span className="font-semibold text-navy">고정 영역 확정</span>
        <span className="font-mono text-xs text-muted-2">
          {locked}/{total}
        </span>
        <span
          className="h-1.5 w-28 overflow-hidden rounded-full bg-row-line"
          aria-hidden="true"
        >
          <span
            className="block h-full bg-[var(--accent)]"
            style={{ width: `${total ? (locked / total) * 100 : 0}%` }}
          />
        </span>
        <span className="min-w-0 truncate text-xs text-muted-2" title={`${label} — 확정하면 부서 작성본에서 잠김`}>
          {label} — 확정하면 부서 작성본에서 잠김
        </span>
        {msg && (
          <span role="status" className="text-xs text-muted-2">
            {msg}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {rest > 0 &&
            (ask ? (
              <>
                <span className="text-xs text-warn">
                  미확정 {rest}개를 모두 확정할까요?
                </span>
                <button
                  type="button"
                  onClick={() => setAsk(false)}
                  className="h-7 rounded-md border border-field-line bg-paper px-2.5 text-xs font-semibold text-ink"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await setFixedLock([], true);
                      setMsg(r.message ?? null);
                      setAsk(false);
                      router.refresh();
                    })
                  }
                  className={T.btnPrimarySm}
                >
                  모두 확정
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setAsk(true)}
                className="h-7 rounded-md border border-navy bg-paper px-2.5 text-xs font-semibold text-navy"
              >
                미확정 {rest}개 확정
              </button>
            ))}
        </span>
      </div>
      {exportLink}
    </div>
  );
}
