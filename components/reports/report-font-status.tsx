"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Tag } from "../ui/kit";
import { reportFontsReady } from "./report-font-probe";

/** 이 PC에서 진짜 글꼴이 그려지는 갈래(<html data-kfont>와 같은 값). null = 아직 재는 중 */
function useFontMarks(): string[] | null {
  const [marks, setMarks] = useState<string[] | null>(null);
  useEffect(() => {
    let live = true;
    void reportFontsReady().then((s) => {
      if (live) setMarks(s.split(/\s+/).filter(Boolean));
    });
    return () => {
      live = false;
    };
  }, []);
  return marks;
}

const ROWS = [
  { key: "body", name: "KoPub바탕", use: "본문" },
  { key: "dotum", name: "KoPub돋움", use: "굵은 글·제목 일부" },
  { key: "label", name: "맑은 고딕", use: "표 머리·라벨" },
  { key: "head", name: "HY헤드라인M", use: "제목" },
] as const;

/** 도움말 「이 PC 상태」: 글꼴 갈래마다 있음/없음 */
export function ReportFontStatus() {
  const marks = useFontMarks();
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-2 text-ui text-ink">
      {ROWS.map((r) => (
        <li key={r.key} className="flex items-center gap-2">
          <span>
            {r.name} <span className="text-xs text-muted">({r.use})</span>
          </span>
          {marks === null ? <Tag>확인 중</Tag> : marks.includes(r.key) ? <Tag tone="navy">있음</Tag> : <Tag tone="warn">없음</Tag>}
        </li>
      ))}
    </ul>
  );
}

/** 과제별 초안 도구줄: KoPub(바탕·돋움)가 없을 때만 한 칩 — 있으면 아무것도 그리지 않음 */
export function ReportFontNotice() {
  const marks = useFontMarks();
  if (marks === null || (marks.includes("body") && marks.includes("dotum"))) return null;
  return (
    <Link href="/help#report-fonts" className="shrink-0 no-underline" title="이 PC에 KoPub 글꼴이 없어 대체 글꼴로 보입니다 — 한글 파일과 줄바꿈이 다를 수 있습니다. 눌러서 글꼴 안내 보기">
      <Tag tone="warn">KoPub 글꼴 없음 — 대체 글꼴로 보임 · 글꼴 안내</Tag>
    </Link>
  );
}
