// 주요사업 카드 파일의 묶음 표지(순수). 묶음 하나짜리 파일은 첫머리에 묶음 제목 표 하나뿐이지만, 여러 묶음을 합친 파일(합본)은
// 묶음 제목 표를 앞에 모아 두고 카드 묶음마다 머리 줄(「[주요사업N]」)을 붙이기도 함 — 카드마다 자기 앞의 가장 가까운 표지로 묶음을 정함.
// 카드 JSON(lib/cards/hwp/parse.ts — kordoc 마크다운)과 원본 배치(layout.ts — 한글 모델)가 같은 규칙을 씀.

/** 묶음 제목 표 첫 칸 「(주요사업N) …」의 N */
export function groupTitleNo(text: string): number | null {
  const m = /^\(\s*주요사업\s*(\d+)\s*\)/.exec(text.trim());
  return m ? Number(m[1]) : null;
}

/** 묶음 머리 줄(그 글만 있는 문단) 「[주요사업N]」의 N */
export function groupHeadingNo(text: string): number | null {
  const m = /^\[\s*주요사업\s*(\d+)\s*\]$/.exec(text.trim());
  return m ? Number(m[1]) : null;
}
