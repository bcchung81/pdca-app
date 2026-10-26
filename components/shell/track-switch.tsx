"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { TRACK_COOKIE, type TrackId } from "../../lib/tracks/index.ts";

const ORDER: TrackId[] = ["경영관리", "주요사업"];

/** 고른 트랙을 쿠키에 1년 기억 */
function rememberTrack(t: TrackId) {
  document.cookie = `${TRACK_COOKIE}=${encodeURIComponent(t)}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * 머리띠 로고 옆 트랙 전환(경영관리 | 주요사업). 고른 값은 쿠키에 1년 기억 — 서버 화면이 읽어 목록·집계를 거르고(lib/tracks/current.ts),
 * 경영관리가 아직 지원하지 않는 화면은 「준비 중」을 보임. 화면 선택 세그먼트(GroupSeg, 네이비 사각)와 헷갈리지 않게 둥근 알약·청록 강조.
 */
export function TrackSwitch({ track }: { track: TrackId }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const pick = (t: TrackId) => {
    if (t === track) return;
    rememberTrack(t);
    start(() => router.refresh());
  };
  return (
    <div role="group" aria-label="트랙" aria-busy={pending} className={`flex shrink-0 gap-0.5 rounded-full border border-line-strong bg-paper p-0.5 ${pending ? "opacity-60" : ""}`}>
      {ORDER.map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={t === track}
          onClick={() => pick(t)}
          className={`h-6 cursor-pointer rounded-full px-3 text-xs font-semibold whitespace-nowrap ${t === track ? "bg-link text-white" : "text-muted-2 hover:bg-desk"}`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
