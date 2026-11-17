"use client";

import { useEffect } from "react";
import { clearTabStore } from "../../lib/ai/assist-thread.ts";

/** 로그인 화면에 오면(로그아웃 뒤·세션이 끝난 뒤) 이 탭에 남은 앞사람의 카드 AI 대화·검토 메모를 지움 — 열쇠가 카드 uid뿐이라(2026-11-17 웹 취약점 점검 N4) */
export function ClearTabStore() {
  useEffect(() => {
    try {
      clearTabStore(sessionStorage);
    } catch {
      // 저장 공간을 못 쓰는 브라우저면 남은 기록도 없음
    }
  }, []);
  return null;
}
