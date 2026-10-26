"use client";

import { useState } from "react";
import { T } from "../ui/kit";

/** 글을 클립보드에 복사하는 단추(브라우저 대화상자 없음 — 복사하면 단추 글이 잠깐 「복사함」으로 바뀜). 읽기 전용 화면에서도 씀 */
export function CopyTextButton({ text, label, title }: { text: string; label: string; title?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      // 브라우저 권한이 없으면 복사 표시를 하지 않음
    }
  };
  return (
    <button type="button" onClick={copy} className={T.btn} title={title}>
      {done ? "복사함" : label}
    </button>
  );
}
