// KCA 표준보고서 양식 값 — 출처: resources/harness/report-harness/format-profile.kca.md(§1·§2·§6) · hwpx-recipe.md §2(R008).
// kordoc markdownToHwpx의 공문서(보고서) 옵션으로 넘기고, kordoc이 따르지 않는 크기는 postprocess.ts가 되돌립니다.

/** 계층별 글자 크기(pt) — format-profile §2, postprocess_hwpx.FORM_SIZES_PT와 같은 값 */
export const FORM_SIZES_PT = { dae: 15, yo: 15, dash: 15, arrow: 15, star: 13, cham: 13 } as const;
/** 제목 박스 24pt('26.9.24 사용자 확정, 양식 명시값 20pt에서 올림) */
export const TITLE_SIZE_PT = 24;
/** 발신 줄 12pt(R018) */
export const SENDER_SIZE_PT = 12;
/** 「특히 강조」(==…==) 노란 음영 + 볼드(R040, 260331 실무본 실측 인코딩) */
export const HIGHLIGHT_SHADE = "#FFFF00";

/**
 * kordoc 공문서 옵션(R008 — 필수 전달). 여백은 양식(위 10 · 아래 15 · 좌우 20mm, 머리말 15 · 꼬리말 10mm)에서
 * 머리말 배너 주입(R030)을 옮기지 않았으므로 머리말·꼬리말 몫을 위·아래 여백에 더해 본문 시작 위치를 맞춥니다.
 */
export const KCA_GONGMUN = {
  preset: "보고서",
  bodyPt: 15,
  lineSpacing: 160,
  bullet2: "ㅇ",
  bodyTitleBox: true,
  margins: { top: 25, bottom: 25, left: 20, right: 20 },
  fonts: { heading: "HY헤드라인M", body: "휴먼명조", ref: "맑은고딕", table: "맑은 고딕" },
  sizes: { dae: FORM_SIZES_PT.dae, cham: FORM_SIZES_PT.cham, table: 12, bodyTitle: TITLE_SIZE_PT },
  // levels 생략 금지('26.9.8 실측): 생략하면 ㅇ 문단 전체가 볼드 — depth 1 bold:false로 괄호 리드(R016)만 볼드
  levels: {
    0: { font: "HY헤드라인M", pt: FORM_SIZES_PT.dae, bold: true },
    1: { font: "휴먼명조", pt: FORM_SIZES_PT.yo, bold: false },
    2: { font: "휴먼명조", pt: FORM_SIZES_PT.dash, bold: false },
  },
} as const;

/**
 * 부호 칸 폭(em) — kordoc이 손대지 않는 부호 문단(표 칸의 「∙ … / ∙ …」 등)에 후처리가 주는 내어쓰기(postprocess.ts hangParagraphs).
 * kordoc 본문 부호 문단과 같은 셈(부호 폭 + 0.5em — ㅇ 15pt intent −2250 = 1.5em): 전각 부호 1.5em,
 * 반각 부호(NARROW_MARKS)는 1.2em(글꼴에 따라 반각·전각 어느 쪽이어도 부호 뒤 탭이 0보다 큰 폭을 갖게)
 */
export const MARK_CELL_EM = { wide: 1.5, narrow: 1.2 } as const;
/** 반각으로 그려질 수 있는 부호 */
export const NARROW_MARKS = "-–·∙•*";
