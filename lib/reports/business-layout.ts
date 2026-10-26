// 경평 초안 사업 단위 조판(결정론, 순수 — 입출력 없음). 주요사업(평가단위) 하나의 평가내용2 과제별 초안을 목차·쪽 배정(report_outline)
// 순서대로 쪽(판면 170×255mm)에 쌓고, 사업 전체를 검사합니다(쪽 수 vs 15±1쪽 예산, 소항목 사이 같은 문장·같은 짜임, 초안 없음·다시 만들기 권장).
//
// 쪽 나눔 규칙 = 2025년도 경영실적보고서 최종본(주요사업) 평가내용2 실측(주요사업1~3, 인쇄 119~133·146~160·173~188쪽 —
// resources/knowledge/2025년도 경영실적보고서 최종★(주요사업).pdf를 pdftotext -bbox-layout으로 읽어 쪽마다 대상사업 상자·실행과제 띠·소항목 제목의 세로 위치를 셈):
//  ① 대상사업이 바뀌면 새 쪽 — 6곳 모두(119·127·146·154·173·182쪽)
//  ② 실행과제가 바뀌면 새 쪽 — 대상사업 안 둘째 실행과제부터 18곳 모두 쪽 맨 위(121·124·126·129·132·133·149·152·153·156·158·160·175·178·180·184·186·188쪽).
//     앞 쪽은 모두 판면 끝까지 참(쪽 높이 858pt 중 마지막 글 줄 아래 끝 787~793pt) — 실행과제마다 쪽을 꽉 채워 씀
//  ③ 같은 실행과제 안 소항목은 이어 씀: 한 쪽에 소항목 둘(120·125·126·132·147·148·152·153·157·160·175·183·186·187쪽)·셋(188쪽).
//     소항목 사이(앞 추진성과 마지막 글 줄 ~ 다음 제목 글) 3.3~6.3mm, 15곳 중 9곳이 5.3~5.6mm
//  ④ 두 쪽에 걸친 소항목은 없음 — 62개 모두 한 쪽 안(평가내용2의 쪽은 모두 소항목 제목·실행과제 띠·대상사업 상자로 시작)
// 그래서: 대상사업·실행과제가 바뀌면 새 쪽, 소항목은 남은 자리에 들어가면 이어서·안 들어가면 다음 쪽, 한 쪽보다 큰 소항목만 새 쪽에서 시작해 여러 쪽에 걸침.
// 2025 본에 있고 여기서 셈하지 않는 것(한계): 사업 첫 쪽 「평가내용 2」 질문 상자(약 10mm), 대상사업 첫 쪽의 개요 표(사업 대표성·전략수립·실행계획 —
// 6곳 중 4곳, 58~70mm), 실행과제 띠 아래 개요 도식(24곳 중 8곳, 39~88mm) — 과제별 초안에 없는 요소라 자리도 잡지 않습니다.
//
// 경영관리(지표 하나, 2026-10-10 — layoutBusiness의 opts.mg): 2025 지표별 보고서 14개를 세면 평가내용이 바뀌는 곳 25곳 중 24곳이 새 쪽(예외 보수·복리후생 1곳),
// 같은 평가내용 안 대주제가 바뀌는 곳 79곳은 새 쪽 40·같은 쪽 39라 규칙 없음 → 「평가내용이 바뀌면 새 쪽, 대주제·절·과제는 이어 쓰고 안 들어가면 다음 쪽」.
// 과제(카드)가 조판 단위라 카드 하나가 평가내용 둘에 걸치면 카드 안에서는 쪽을 나누지 않음(한계). 앞 카드 마지막 절과 같은 평가내용이면 평가내용 상자를,
// 같은 대주제면 대주제 띠도 다시 그리지 않음(mgCont — section-html mgBody). 높이는 블록 어림(주요사업과 같은 렌더러·같은 보정) + 절 머리 합,
// 쪽 수는 그 지표 본문 예산(작성분량 − 본문 아닌 내용 장, 카드가 맡은 평가내용만 — lib/reports/mg-page-plan.ts)과 ±1쪽으로 견줌.
//
// 경영관리 카드 밖 부분 끼움(R5d, 2026-10-16 — opts.mg.outside): 2025 지표별 보고서 11개 모두 ① 지적사항 조치실적과 전년 대비 주요 추진실적이 새 쪽에서 같은 쪽에 이어 쓰이고(앞)
// ② 본문(세부평가내용별)은 새 쪽에서 시작하며 ③ 성과분석 및 환류는 본문 뒤 새 쪽(뒤)이고 ④ 표지·간지는 쪽 번호가 없음 → 앞 장들은 연속으로 쌓고(장이 쪽 끝에서 이어질 수 있음, 한 쪽 넘으면 다음 쪽까지)
// 본문은 앞 쪽 수 뒤 새 쪽에서 시작(LaidPage.no가 지표 안 쪽 번호), 뒤 장은 본문 뒤 새 쪽. 표지는 쪽 수에 안 셈. 높이는 unit-parts-layout.ts가 어림(표 칸 폭·글자 수) — 어림 + 경고만.
// 본문은 지금처럼 본문 예산과, 지표 전체(앞 + 본문 + 뒤)는 작성분량 ±1쪽과, 카드 밖 부분은 2025 쪽과 견줌(넘치면 경고만 — 본문 예산은 자동으로 줄이지 않음, 2026-10-12 결정).

import { blockSignature } from "./blocks.ts";
import { FIT_BAND, HEAD_PART_MM, type HeadMode, LINE_MM, PAGE_MM, chipTitle, fitReport, headCut, lineCount, plainText, titleMm } from "./fit.ts";
import { bigramSet, groundedSentences, textSimilarity } from "./ground.ts";
import { PAGE_BUDGET, budgetState } from "./outline.ts";
import { evalNoOf } from "./mg-page-plan.ts";
import type { ReportSectionSpec } from "./section.ts";

// 머리 모드·머리 조각 높이는 판면 규칙 한 곳(lib/reports/fit.ts)에 둠 — 과제별 초안도 목차 순서의 머리 모드로 판면을 맞춤(사용자 결정 2026-09-27)
export { HEAD_PART_MM, type HeadMode, headCut } from "./fit.ts";

/**
 * 같은 쪽의 소항목 사이 띄움(mm, 화면에서만). 어림 높이(fit.ts frameHeight·fitReport)에는 추진성과 상자 아래 여백 1.6mm + 끝 1.3mm가 이미 들어 있어
 * 조판 셈에는 더하지 않고, 그 자리를 그림에서 소항목 사이로 씀(2025 실측: 앞 추진성과 마지막 글 줄 ~ 다음 제목 글 5.5mm 안팎 — 상자 안 여백·제목 줄 위 여백 포함)
 */
export const SUB_GAP_MM = 3;

/** 쪽에 조금 넘쳐도(판면 어림 오차 안) 그 쪽에 두고 「넘침」으로 표시하는 한도 — 과제별 초안의 채움 목표 윗선(FIT_BAND.over 102%)과 같은 비율 */
export const PAGE_TOLERANCE_MM = PAGE_MM.height * (FIT_BAND.over - 1);

/** 같은 문장 기준: 두 문장의 닮은 정도(textSimilarity — 글자 두 개 묶음 겹침 ÷ 짧은 쪽 묶음 수)가 이 값 이상이면 같은 문장으로 봄(거의 그대로 옮긴 문장) */
export const SAME_TEXT_MIN = 0.8;
/** 같은 문장 찾기에서 짧은 문장은 뺌(글자 두 개 묶음이 이보다 적으면 — 「추진배경」 같은 라벨·「’25년 100국」 같은 수치 줄이 다른 문장에 들어 있어 1이 되는 것을 막음) */
export const SAME_TEXT_MIN_BIGRAMS = 8;
/** 같은 문장 목록 상한 */
export const SAME_TEXT_MAX = 20;

/** 조판할 소항목 하나(목차 행 + 초안) */
export interface BusinessItem {
  cardId: string;
  uid: string;
  taskNo: string;
  title: string;
  /** 목차의 대상사업·실행과제(report_outline.section·subsection) */
  section: string;
  subsection: string | null;
  sort: number;
  /** 배정 쪽수(0.5쪽 단위) */
  pages: number;
  included: boolean;
  /** 과제별 초안(없으면 null — readSection으로 읽은 것) */
  spec: ReportSectionSpec | null;
  unknownNumbers?: string[];
  /** 초안을 만들 때의 원장 개정 번호(card_report_drafts.source_rev)와 지금 원장 개정 번호(cards.data_rev) — 다르면 다시 만들기 권장 */
  sourceRev: number | null;
  dataRev: number | null;
}

/** 높이 출처: fit = 초안에 남은 판면 어림(spec.fit.total), estimate = 지금 다시 어림(fitReport — 블록 목록 v3), assigned = 초안이 없거나 옛 초안(v1·v2, 어림 없음)이라 배정 쪽수 × 255mm */
export type HeightSource = "fit" | "estimate" | "assigned";

export interface LaidSection {
  cardId: string;
  uid: string;
  taskNo: string;
  title: string;
  section: string;
  subsection: string | null;
  head: HeadMode;
  /** 배정 쪽수 */
  pages: number;
  /** 조판에 쓴 높이(mm, 머리를 뺀 값) */
  height: number;
  /** 머리를 모두 넣은 높이(과제별 초안 화면의 어림과 같은 기준) */
  fullHeight: number;
  source: HeightSource;
  drafted: boolean;
  stale: boolean;
  /** 대상사업 머리 지도(layoutBusiness opts.map — 주요사업, 머리 모드 all이고 초안이 있는 소항목만): 그 대상사업의 실행과제 줄. height·fullHeight에 상자 높이가 들어 있음 */
  map?: BizMapRow[];
  /** 경영관리: 앞 과제의 마지막 절과 같은 평가내용·대주제라 평가내용 상자·대주제 띠를 다시 그리지 않음(주요사업은 없음 — head로 정함) */
  mgCont?: { eval: boolean; theme: boolean };
  /** 배정(쪽수 × 255mm)과 견줌 — 조판 높이 기준, FIT_BAND(95~102%) 밖이면 over·under. 높이를 모르면(assigned) null */
  fit: "over" | "under" | "ok" | null;
  /** 조판 높이 − 배정 높이(mm) */
  delta: number;
  startPage: number;
  endPage: number;
}

/** 쪽 안 소항목 조각 */
export interface PagePiece {
  /** sections 순번 */
  index: number;
  cardId: string;
  taskNo: string;
  head: HeadMode;
  /** 쪽 안 위치(mm, 판면 위에서) */
  top: number;
  /** 이 쪽에서 쓰는 높이(mm) */
  height: number;
  /** 소항목 전체 높이(mm) */
  total: number;
  /** 소항목 안에서 이 조각이 시작하는 곳(mm) — 여러 쪽에 걸칠 때 */
  offset: number;
  /** 앞 쪽에서 이어짐 */
  cont: boolean;
  /** 다음 쪽으로 이어짐 */
  more: boolean;
  /** 넘침: 이 소항목이 배정보다 큼(fit = over) */
  over: boolean;
}

export interface LaidPage {
  /** 사업 안 쪽 번호(1부터) */
  no: number;
  pieces: PagePiece[];
  /** 쓴 높이(mm) */
  used: number;
  /** 판면을 넘친 만큼(mm, 한도 PAGE_TOLERANCE_MM 안에서만 생김) */
  over: number;
  /** 채움(쓴 높이 ÷ 255mm) */
  fill: number;
}

/** 경영관리 카드 밖 장 하나(높이 mm는 unit-parts-layout.ts가 어림 — 장 제목 포함) */
export interface MgOutsideChapter {
  key: string;
  title: string;
  mm: number;
}

/** 경영관리 카드 밖 부분 조판 입력: 앞(지적사항 조치실적 + 전년 대비) 장들·뒤(성과분석 및 환류) 장들·비교 기준 */
export interface MgOutside {
  front: MgOutsideChapter[];
  back: MgOutsideChapter[];
  /** 2025 카드 밖 부분 쪽(지적사항 조치실적·전년 대비·성과분석 및 환류 — 지표관리 방향은 뺌). 모르면 넘침 경고를 안 냄 */
  pages2025?: number;
  /** 지표 전체 쪽 기준(작성분량 − 지표관리 방향). 모르면 전체 비교를 안 냄 */
  wholeTarget?: number;
  /** 비어 있는 AI·사람 칸 수(채우면 높이가 늘어남 — 경고) */
  emptyCells?: number;
}

/** 조판된 카드 밖 장 묶음(앞 또는 뒤): 쪽 번호는 지표 안 쪽 번호(LaidPage.no와 같은 번호) */
export interface LaidOutside {
  firstPage: number;
  pages: number;
  mm: number;
  chapters: Array<MgOutsideChapter & { startPage: number; endPage: number }>;
}

export interface OutsideLayout {
  front: LaidOutside;
  back: LaidOutside;
  /** 앞 + 뒤 쪽 수(표지는 안 셈) */
  pages: number;
  pages2025: number | null;
  /** 2025보다 더 긴 쪽 수(0이면 넘치지 않음) */
  overflow: number;
  /** 지표 전체 쪽(앞 + 본문 + 뒤) */
  whole: number;
  wholeTarget: number | null;
  wholeState: "under" | "ok" | "over" | null;
  /** 어림·넘침 경고(판정이 아니라 신호) */
  warnings: string[];
}

export interface SameSentence {
  a: { cardId: string; taskNo: string; text: string };
  b: { cardId: string; taskNo: string; text: string };
  score: number;
}

export interface BusinessChecks {
  /** 서로 다른 소항목의 같은 문장(닮은 정도 높은 순, SAME_TEXT_MAX개까지) */
  sameSentences: SameSentence[];
  /** 같은 문장 쌍 전체 수(상한 전) */
  sameSentenceCount: number;
  /** 같은 짜임(블록 서명이 같은 소항목 묶음 — 블록 목록 v3 초안만) */
  sameLayouts: Array<{ signature: string; taskNos: string[] }>;
  /** 이야기 틀별 소항목(많은 순) */
  stories: Array<{ story: string; taskNos: string[] }>;
  /** 초안 없는 과제 */
  missing: Array<{ cardId: string; uid: string; taskNo: string; title: string; pages: number }>;
  /** 다시 만들기 권장(초안 뒤 원장이 바뀜) */
  stale: Array<{ cardId: string; uid: string; taskNo: string; title: string }>;
  /** 초안은 있으나 판면 어림이 없어 배정 쪽수로 셈(옛 초안 v1·v2) */
  unestimated: Array<{ cardId: string; uid: string; taskNo: string; title: string }>;
}

export interface BusinessLayout {
  /** 조판에 넣은 소항목(목차 순서 — sections·pieces.index와 같은 순번) */
  items: BusinessItem[];
  sections: LaidSection[];
  pages: LaidPage[];
  summary: {
    /** 배정 쪽수 합(넣은 과제만) */
    assigned: number;
    /** 조판 쪽 수 */
    laid: number;
    /** 쪽 수 예산 — 주요사업 15±1, 경영관리는 2025 그 지표 본문 쪽 ±1(참고) */
    budget: { target: number; tolerance: number };
    /** 조판 쪽 수의 예산 상태 */
    state: ReturnType<typeof budgetState>;
    assignedState: ReturnType<typeof budgetState>;
    drafted: number;
    total: number;
    /** 뺀 과제(목차에서 넣지 않음) 수 */
    excluded: number;
    /** 쪽마다 남은 빈 자리 합(mm) */
    blank: number;
  };
  checks: BusinessChecks;
  /** 쪽 채움 경고(판정이 아니라 신호, 두 트랙 공통 — pageWarnings). 없으면 빈 배열 */
  warnings: string[];
  /** 경영관리 카드 밖 부분을 끼웠을 때만(opts.mg.outside에 장이 있을 때) */
  outside?: OutsideLayout;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const key = (s: string | null) => (s ?? "").trim();
const stale = (it: BusinessItem) => Boolean(it.spec && it.sourceRev !== null && it.dataRev !== null && it.sourceRev !== it.dataRev);

/** 초안 높이(머리 모두 넣은 값): 초안에 남은 어림 → 블록 목록(v3)이면 지금 어림 → 없으면 null */
export function specHeight(spec: ReportSectionSpec | null): { mm: number; source: Exclude<HeightSource, "assigned"> } | null {
  if (!spec) return null;
  if (spec.fit && Number.isFinite(spec.fit.total) && spec.fit.total > 0) return { mm: spec.fit.total, source: "fit" };
  if (spec.version === 3 && spec.blocks?.length) return { mm: fitReport(spec).total, source: "estimate" };
  return null;
}

/** 머리 모드: 앞 소항목과 대상사업이 다르면 all, 대상사업이 같고 실행과제가 다르면 task, 둘 다 같으면 sub */
export function headModes(items: Array<Pick<BusinessItem, "section" | "subsection">>): HeadMode[] {
  return items.map((it, i) => {
    const prev = items[i - 1];
    if (!prev || key(prev.section) !== key(it.section)) return "all";
    return key(prev.subsection) !== key(it.subsection) ? "task" : "sub";
  });
}

/** 경영관리 과제의 첫·끝 절 평가내용·대주제(초안이 없으면 목차 1단 「평가내용 N.」 — 대주제는 모름) */
function mgEnds(it: BusinessItem): { first: { ev: number | null; th: number | null }; last: { ev: number | null; th: number | null } } {
  const parts = it.spec?.mg?.parts ?? [];
  if (!parts.length) {
    const ev = evalNoOf(it.section);
    return { first: { ev, th: null }, last: { ev, th: null } };
  }
  const a = parts[0];
  const z = parts[parts.length - 1];
  return { first: { ev: a.evalNo, th: a.themeNo }, last: { ev: z.evalNo, th: z.themeNo } };
}

/**
 * 경영관리: 조판 순서(orderItems)의 과제마다 앞 과제의 마지막 절과 같은 평가내용(eval)·대주제(theme)로 이어지는가. 렌더러(section-html mgBody)·지표 한 파일 원고(section-md mgLines)가
 * 같은 규칙으로 머리를 되풀이하지 않게 한 곳에서 셈 — 평가내용이 바뀌면 새 쪽(layoutBusiness)
 */
export function mgContinuations(items: BusinessItem[]): Array<{ eval: boolean; theme: boolean }> {
  return items.map((it, i) => {
    if (i === 0) return { eval: false, theme: false };
    const prev = mgEnds(items[i - 1]).last;
    const cur = mgEnds(it).first;
    const sameEval = prev.ev !== null && prev.ev === cur.ev;
    return { eval: sameEval, theme: sameEval && prev.th !== null && prev.th === cur.th };
  });
}

/**
 * 경영관리 초안 높이(머리 모두 넣은 값, mm): 블록·추진성과 어림(fitReport)에서 주요사업식 머리(대상사업 상자·실행과제 띠·소항목 제목 1개)를 빼고
 * 절 머리를 더함 — 평가내용이 바뀔 때 평가내용 상자(.k-biz와 같은 6.9mm), 대주제가 바뀔 때 대주제 띠(.k-task 7.2mm), 절 표지마다 절 제목 줄(.k-sub)
 */
export function mgSpecHeight(spec: ReportSectionSpec): number {
  const r = fitReport(spec);
  const base = HEAD_PART_MM.biz + HEAD_PART_MM.task + titleMm(chipTitle(spec.sub.title, spec.sub.chip), spec.sub.markers);
  let ev = -1;
  let th = "";
  let heads = 0;
  for (const p of spec.mg?.parts ?? []) {
    if (p.evalNo !== ev) {
      ev = p.evalNo;
      th = "";
      heads += HEAD_PART_MM.biz;
    }
    if (`${p.evalNo}.${p.themeNo}` !== th) {
      th = `${p.evalNo}.${p.themeNo}`;
      heads += HEAD_PART_MM.task;
    }
    if (p.mark) heads += titleMm(chipTitle(p.title, p.chip), []);
  }
  return Math.max(0, r.total - base + heads);
}

/** 대상사업 머리 지도의 실행과제 한 줄: 실행과제 번호(N-M)·이름, 그 실행과제 소항목들의 「표지. 제목」(조판 순서) */
export interface BizMapRow {
  no: string;
  name: string;
  subs: string[];
}

/**
 * 대상사업 머리 지도 상자 규격(mm·pt — business-html BUSINESS_CSS .bz-map과 같은 값, CSS를 바꾸면 함께 바꿈).
 * 테두리 1px, 안 여백 위아래 1.5mm·좌우 3mm, 아래 띄움 1.3mm(.k-biz 아래 여백 5px과 같은 꼴), 머리 「추진개요」 돋움 10.6pt/1.4,
 * 줄 돋움 10pt/1.45(자간 --k-ls-dotum — fit.ts 돋움 폭 0.745em 기준), 줄 앞 불릿 들여쓰기 0.95em(.k-frame li)
 */
export const BIZ_MAP_MM = { border: 25.4 / 96, padY: 1.5, padX: 3, gap: 1.3, headPt: 10.6, headLh: 1.4, pt: 10, lh: 1.45, indentEm: 0.95 } as const;
/** 머리 지도 머리 글(KCA 2025 대상사업 개요 상자 자리) */
export const BIZ_MAP_TITLE = "추진개요";

const PT_MM = 25.4 / 72;

/** 실행과제 한 줄 글(높이 어림과 그림이 같은 글을 씀): 「1-1 실행과제 이름 가. 제목 · 나. 제목」 */
export const bizMapLine = (r: BizMapRow) => [r.no, r.name, r.subs.join(" · ")].filter((x) => x.trim()).join(" ");

/** 머리 지도 줄 글 폭(mm): 판면 170mm − 테두리·좌우 안 여백 − 불릿 들여쓰기 */
export const bizMapWidth = () => PAGE_MM.width - 2 * BIZ_MAP_MM.border - 2 * BIZ_MAP_MM.padX - BIZ_MAP_MM.indentEm * BIZ_MAP_MM.pt * PT_MM;

/** 머리 지도 상자 높이(mm, 아래 띄움 포함): 테두리 + 안 여백 + 머리 한 줄 + 줄마다 줄바꿈 수(fit.ts lineCount 돋움 폭) × 줄 높이. 줄이 없으면 0 */
export function bizMapMm(rows: BizMapRow[]): number {
  if (!rows.length) return 0;
  const w = bizMapWidth();
  const lines = rows.reduce((n, r) => n + Math.max(1, lineCount(bizMapLine(r), w, BIZ_MAP_MM.pt, true)), 0);
  return 2 * BIZ_MAP_MM.border + 2 * BIZ_MAP_MM.padY + BIZ_MAP_MM.headPt * BIZ_MAP_MM.headLh * PT_MM + lines * BIZ_MAP_MM.pt * BIZ_MAP_MM.lh * PT_MM + BIZ_MAP_MM.gap;
}

/** 목차 실행과제 「1-1. 이름」 → 번호·이름(번호 꼴이 아니면 이름만) */
function splitTask(sub: string): { no: string; name: string } {
  const m = /^(\d+-\d+)\.?\s+(.+)$/.exec(sub.trim());
  return m ? { no: m[1], name: m[2].trim() } : { no: "", name: sub.trim() };
}

/**
 * 대상사업 머리 지도 줄(결정론): items[start]부터 다음 대상사업 첫 소항목(heads all) 앞까지를 실행과제(목차 subsection)로 묶음 — 조판 순서, 중복 없이.
 * 번호·이름은 초안(spec.task)이 있으면 그것, 없으면 목차 실행과제 글. 소항목은 초안의 「표지. 제목」(sub.mark·sub.title), 초안이 없으면 항목 이름
 */
export function bizMapRows(items: BusinessItem[], heads: HeadMode[], start: number): BizMapRow[] {
  const rows: BizMapRow[] = [];
  const at = new Map<string, BizMapRow>();
  for (let i = start; i < items.length && (i === start || heads[i] !== "all"); i++) {
    const it = items[i];
    const k = key(it.subsection);
    let row = at.get(k);
    if (!row) {
      const t = it.spec?.task ? { no: it.spec.task.no, name: it.spec.task.title } : splitTask(it.subsection ?? "");
      row = { no: t.no.trim(), name: plainText(t.name).trim(), subs: [] };
      at.set(k, row);
      rows.push(row);
    } else if (!row.no && it.spec?.task) {
      row.no = it.spec.task.no.trim();
      row.name = plainText(it.spec.task.title).trim();
    }
    const sub = it.spec ? `${it.spec.sub.mark}. ${plainText(it.spec.sub.title).trim()}` : it.title.trim();
    if (sub && !row.subs.includes(sub)) row.subs.push(sub);
  }
  return rows;
}

/** 넣은 과제를 목차 순서로(sort → 과제번호) */
export function orderItems(items: BusinessItem[]): BusinessItem[] {
  return items.filter((it) => it.included).sort((a, b) => a.sort - b.sort || a.taskNo.localeCompare(b.taskNo, "ko"));
}

/**
 * 사업 단위 조판 + 검사. opts.mg = 경영관리 지표(평가내용이 바뀌면 새 쪽·머리 되풀이 생략·절 머리 높이·2025 본문 쪽 예산 — 위 머리말), 없으면 주요사업.
 * opts.mg.outside(장이 하나라도 있을 때) = 카드 밖 부분을 앞·뒤에 끼움(쪽 번호 LaidPage.no가 앞 쪽 수만큼 밀리고 layout.outside에 앞·뒤·경고) — 없으면 출력은 예전과 같음.
 * opts.map = 대상사업 머리 지도(주요사업만 — 경영관리면 무시): 대상사업 첫 소항목(머리 all, 초안 있음)에 실행과제 목록 상자 높이를 더함
 */
export function layoutBusiness(all: BusinessItem[], opts: { mg?: { budget: number; outside?: MgOutside }; map?: boolean } = {}): BusinessLayout {
  const items = orderItems(all);
  const mg = opts.mg;
  // 경영관리 머리: 앞 과제 마지막 절과 같은 평가내용이면 평가내용 상자 생략(task), 같은 대주제면 대주제 띠도 생략(sub) — 평가내용이 바뀌면 all(새 쪽)
  const conts = mg ? mgContinuations(items) : items.map(() => ({ eval: false, theme: false }));
  const heads: HeadMode[] = mg ? conts.map((c) => (c.theme ? "sub" : c.eval ? "task" : "all")) : headModes(items);
  const H = PAGE_MM.height;
  const outside = mg?.outside && (mg.outside.front.length || mg.outside.back.length) ? mg.outside : null;
  const front = outside ? stackOutside(outside.front, 1) : null;
  const sections: LaidSection[] = items.map((it, i) => {
    const head = heads[i];
    const h = mg ? (it.spec?.mg ? { mm: mgSpecHeight(it.spec), source: "estimate" as const } : specHeight(it.spec)) : specHeight(it.spec);
    const assigned = it.pages * H;
    // 초안이 자기 머리 모드(spec.head — 없으면 all)로 판면을 맞췄으므로 조판의 머리 모드와의 차이만 뺌. 경영관리는 생략한 평가내용 상자·대주제 띠만큼
    const cut = mg ? (conts[i].eval ? HEAD_PART_MM.biz : 0) + (conts[i].theme ? HEAD_PART_MM.task : 0) : headCut(head) - headCut(it.spec?.head ?? "all");
    // 대상사업 머리 지도: 초안·높이 어림이 있는 대상사업 첫 소항목에만(초안 없는 자리는 빈 칸만, 어림 없는 옛 초안은 배정 높이로 셈하므로 더할 곳이 없음)
    const map = !mg && opts.map && head === "all" && it.spec && h ? bizMapRows(items, heads, i) : null;
    const extra = map ? bizMapMm(map) : 0;
    const height = h ? Math.max(0, h.mm - cut) + extra : assigned;
    const fit = !h ? null : height > assigned * FIT_BAND.over ? "over" : height < assigned * FIT_BAND.under ? "under" : "ok";
    return {
      cardId: it.cardId,
      uid: it.uid,
      taskNo: it.taskNo,
      title: it.title,
      section: it.section,
      subsection: it.subsection,
      head,
      ...(mg ? { mgCont: conts[i] } : {}),
      ...(map ? { map } : {}),
      pages: it.pages,
      height: round1(height),
      fullHeight: round1(h ? h.mm + extra : assigned),
      source: h ? h.source : "assigned",
      drafted: Boolean(it.spec),
      stale: stale(it),
      fit,
      delta: round1(height - assigned),
      startPage: 0,
      endPage: 0,
    };
  });

  const pages: LaidPage[] = [];
  let cur: LaidPage | null = null;
  const newPage = (): LaidPage => {
    const p: LaidPage = { no: (front?.pages ?? 0) + pages.length + 1, pieces: [], used: 0, over: 0, fill: 0 };
    pages.push(p);
    cur = p;
    return p;
  };
  sections.forEach((s, index) => {
    let page: LaidPage = cur ?? newPage();
    const busy = page.pieces.length > 0;
    const single = s.height <= H + PAGE_TOLERANCE_MM;
    // ①② 대상사업·실행과제 경계는 새 쪽(경영관리는 평가내용 경계만), ③ 이어 쓰되 안 들어가면 다음 쪽, ④ 한 쪽보다 큰 소항목은 새 쪽에서 시작
    const boundary = mg ? s.head === "all" : s.head !== "sub";
    if (busy && (boundary || !single || page.used + s.height > H + PAGE_TOLERANCE_MM)) page = newPage();
    let top = page.used;
    let rest = s.height;
    let offset = 0;
    s.startPage = page.no;
    for (;;) {
      // 한 쪽에 드는 소항목(한도 안 넘침 포함)은 통째로, 큰 소항목은 판면 끝에서 끊어 다음 쪽으로
      const room = single ? rest : Math.max(0, H - top);
      const h = Math.min(rest, room);
      const more = rest - h > 0.05;
      page.pieces.push({ index, cardId: s.cardId, taskNo: s.taskNo, head: s.head, top: round1(top), height: round1(h), total: s.height, offset: round1(offset), cont: offset > 0, more, over: s.fit === "over" });
      page.used = top + h;
      rest -= h;
      offset += h;
      if (!more) break;
      page = newPage();
      top = 0;
    }
    s.endPage = page.no;
  });
  for (const p of pages) {
    p.used = round1(p.used);
    p.over = round1(Math.max(0, p.used - H));
    p.fill = Math.round((p.used / H) * 100) / 100;
  }

  const assigned = items.reduce((n, it) => n + it.pages, 0);
  const budget = mg ? { target: mg.budget, tolerance: 1 } : PAGE_BUDGET;
  const state = (n: number) => (mg ? (n < budget.target - budget.tolerance ? "under" : n > budget.target + budget.tolerance ? "over" : "ok") : budgetState(n));
  return {
    items,
    sections,
    pages,
    summary: {
      assigned,
      laid: pages.length,
      budget,
      state: state(pages.length),
      assignedState: state(assigned),
      drafted: items.filter((it) => it.spec).length,
      total: items.length,
      excluded: all.length - items.length,
      blank: round1(pages.reduce((n, p) => n + Math.max(0, H - p.used), 0)),
    },
    checks: businessChecks(items),
    warnings: pageWarnings(pages, sections, !mg),
    ...(outside && front ? { outside: outsideLayout(outside, front, pages.length, items.length > 0) } : {}),
  };
}

/**
 * 넘쳐 흐른 거의 빈 쪽의 채움 문턱(25%). 배정은 0.5쪽 단위이고 2025 실행과제·평가내용 끝 쪽도 꽉 차 있어(위 ② 실측) 새 쪽 앞 쪽이 25~60%인 것은
 * 배정 쪽수 문제(목차·쪽 배정 화면 몫)라 경고하지 않음. 25% 미만은 앞 소항목이 판면을 몇 줄 넘겨 쪽이 하나 늘어난 모양(2026-10-17 운영 실측:
 * MG-6 6쪽 6%·8쪽 14%, MG-11 4쪽 9%)이라 그 소항목을 조금 줄이면 한 쪽이 줄어듦
 */
export const SPILL_FILL_MAX = 0.25;

/**
 * 쪽 채움 경고(결정론, 자동으로 줄이지 않음): 쪽이 ① 앞 쪽에서 이어진 소항목의 넘친 부분 하나뿐이고(cont — 한 쪽보다 큰 소항목은 새 쪽에서 시작해 판면 끝에서 끊김)
 * ② 채움이 SPILL_FILL_MAX 미만이며 ③ 바로 뒤가 강제 새 쪽(대상사업·실행과제, 경영관리는 평가내용 경계)이거나 본문 마지막 쪽일 때만.
 * 뒤가 강제 새 쪽이 아니면(안 들어가 밀린 것) 넘친 부분을 줄여도 뒤 소항목은 그대로 새 쪽이라 쪽이 안 줄고, 다른 소항목이 함께 있으면 그만큼 줄여도 그 쪽이 안 비어 경고하지 않음.
 * Y = 그 쪽에 놓인 높이(소항목 높이 − 판면 255mm), Z = Y ÷ 본문 줄 높이(LINE_MM, 판면 어림과 같은 상수). 넘침이 102%(PAGE_TOLERANCE_MM) 안이면 애초에 안 나뉘므로 실제 필요한 줄임은 Y보다 조금 적음
 */
export function pageWarnings(pages: LaidPage[], sections: LaidSection[], biz: boolean): string[] {
  const out: string[] = [];
  pages.forEach((p, k) => {
    const only = p.pieces.length === 1 ? p.pieces[0] : null;
    if (!only?.cont || p.used / PAGE_MM.height >= SPILL_FILL_MAX) return;
    const next = pages[k + 1]?.pieces[0];
    if (next) {
      const head = sections[next.index].head;
      if (next.cont || !(biz ? head !== "sub" : head === "all")) return;
    }
    const s = sections[only.index];
    const y = round1(only.height);
    const z = Math.max(1, Math.round(only.height / LINE_MM));
    const name = [s.taskNo, plainText(s.title).trim()].filter(Boolean).join(" ");
    out.push(`${p.no}쪽이 ${Math.round((p.used / PAGE_MM.height) * 100)}%만 참 — 「${name}」이 앞 쪽을 약 ${y}mm(약 ${z}줄) 넘쳐 쪽이 하나 늘어남. 그만큼 줄이면 한 쪽이 줄어듦`);
  });
  return out;
}

/**
 * 카드 밖 장은 표 칸 줄 수 어림이 2025 실측보다 크게 나와(2026-10-16 MG-8 2025 보고서 PDF 대조: 앞 장 어림 266mm ↔ 실측 253mm, 뒤 장 280mm ↔ 약 257mm — 모두 한 쪽이었음.
 * 화면 미리보기 글자 나눔은 낱말 단위(keep-all)지만 한글 문서 표는 글자 단위로 줄을 넘겨 줄이 덜 남) 판면의 110%까지를 한 쪽으로 봄 — 어림 + 경고만이라 쓰는 보정
 */
export const OUTSIDE_FILL_MAX = 1.1;

/** 카드 밖 장들을 연속으로 쌓아 쪽에 배정(장은 앞 장 끝에서 이어 쓰고, 합이 한 쪽(판면 × OUTSIDE_FILL_MAX)을 넘으면 다음 쪽까지). firstPage = 이 묶음의 첫 쪽 번호 */
export function stackOutside(chapters: MgOutsideChapter[], firstPage: number): LaidOutside {
  const room = PAGE_MM.height * OUTSIDE_FILL_MAX;
  const mm = chapters.reduce((n, c) => n + c.mm, 0);
  const pages = mm <= 0 ? 0 : Math.ceil(mm / room - 1e-9);
  let y = 0;
  const laid = chapters.map((c) => {
    const at = (v: number) => firstPage + Math.min(Math.max(0, pages - 1), Math.max(0, Math.floor(v / room + 1e-9)));
    const out = { ...c, mm: round1(c.mm), startPage: at(y), endPage: at(y + Math.max(0, c.mm - 0.01)) };
    y += c.mm;
    return out;
  });
  return { firstPage, pages, mm: round1(mm), chapters: laid };
}

/** 뒤 장 배치 + 쪽 비교(2025 카드 밖 쪽·지표 전체 작성분량 ±1쪽)와 경고 */
function outsideLayout(o: MgOutside, front: LaidOutside, bodyPages: number, hasBody: boolean): OutsideLayout {
  const back = stackOutside(o.back, front.pages + bodyPages + 1);
  const pages = front.pages + back.pages;
  const whole = pages + bodyPages;
  const pages2025 = o.pages2025 !== undefined && o.pages2025 > 0 ? o.pages2025 : null;
  const overflow = pages2025 === null ? 0 : Math.max(0, pages - pages2025);
  const target = o.wholeTarget !== undefined && o.wholeTarget > 0 ? o.wholeTarget : null;
  const wholeState = target === null || !hasBody ? null : whole < target - 1 ? "under" : whole > target + 1 ? "over" : "ok";
  const warnings: string[] = [];
  if (overflow > 0) warnings.push(`카드 밖 부분 ${overflow}쪽 넘침 — 어림 ${pages}쪽(앞 ${front.pages} + 뒤 ${back.pages})이 2025 ${pages2025}쪽보다 김(본문 예산은 그대로, 자동으로 줄이지 않음)`);
  if (wholeState && wholeState !== "ok") warnings.push(`지표 전체 ${whole}쪽이 작성분량 ${target}쪽(±1쪽)보다 ${wholeState === "over" ? "많음" : "적음"}`);
  if (o.emptyCells) warnings.push(`비어 있는 칸 ${o.emptyCells}개 — 채우면 카드 밖 부분 높이가 늘어남(지금은 빈 칸 높이로 어림)`);
  return { front, back, pages, pages2025, overflow, whole, wholeTarget: target, wholeState, warnings };
}

/** 소항목의 문장(같은 문장 찾기용): 블록 목록(v3)은 groundedSentences(인용·말풍선·막대 수치 줄 뺌) + 추진성과, 옛 초안(v1·v2)은 사다리 행 불릿도 */
export function sectionSentences(spec: ReportSectionSpec): string[] {
  const base = groundedSentences(spec);
  if (spec.version === 3) return base;
  return [...spec.rows.flatMap((r) => r.bullets).filter((s) => plainText(s).trim()), ...base];
}

const clip = (s: string, n = 40) => {
  const t = plainText(s).replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

/** 사업 전체 검사: 같은 문장·같은 짜임·이야기 틀·초안 없음·다시 만들기 권장 */
export function businessChecks(items: BusinessItem[]): BusinessChecks {
  // ① 같은 문장 — 문장마다 글자 두 개 묶음을 한 번만 만들고 겹침을 세어 후보를 고른 뒤, 점수는 textSimilarity(규칙 한 곳)로 확인
  const sents: Array<{ item: number; text: string; set: Set<string> }> = [];
  items.forEach((it, i) => {
    if (!it.spec) return;
    const seen = new Set<string>();
    for (const text of sectionSentences(it.spec)) {
      const set = bigramSet(plainText(text));
      if (set.size < SAME_TEXT_MIN_BIGRAMS || seen.has(text)) continue;
      seen.add(text);
      sents.push({ item: i, text, set });
    }
  });
  const pairs: SameSentence[] = [];
  for (let x = 0; x < sents.length; x++) {
    for (let y = x + 1; y < sents.length; y++) {
      const a = sents[x];
      const b = sents[y];
      if (a.item === b.item) continue;
      const small = a.set.size <= b.set.size ? a.set : b.set;
      const big = small === a.set ? b.set : a.set;
      let hit = 0;
      for (const g of small) if (big.has(g)) hit += 1;
      if (hit / small.size < SAME_TEXT_MIN - 0.001) continue;
      const score = textSimilarity(a.text, b.text);
      if (score < SAME_TEXT_MIN) continue;
      pairs.push({ a: { cardId: items[a.item].cardId, taskNo: items[a.item].taskNo, text: clip(a.text) }, b: { cardId: items[b.item].cardId, taskNo: items[b.item].taskNo, text: clip(b.text) }, score });
    }
  }
  pairs.sort((p, q) => q.score - p.score);

  // ② 같은 짜임(블록 서명) · 이야기 틀
  const bySig = new Map<string, string[]>();
  const byStory = new Map<string, string[]>();
  for (const it of items) {
    if (!it.spec) continue;
    if (it.spec.version === 3 && it.spec.blocks?.length) {
      const sig = blockSignature(it.spec.blocks);
      bySig.set(sig, [...(bySig.get(sig) ?? []), it.taskNo]);
    }
    const story = (it.spec.story ?? "").trim();
    if (story) byStory.set(story, [...(byStory.get(story) ?? []), it.taskNo]);
  }

  // ③ 초안 없음·다시 만들기 권장·어림 없음
  const brief = (it: BusinessItem) => ({ cardId: it.cardId, uid: it.uid, taskNo: it.taskNo, title: it.title });
  return {
    sameSentences: pairs.slice(0, SAME_TEXT_MAX),
    sameSentenceCount: pairs.length,
    sameLayouts: [...bySig.entries()].filter(([, v]) => v.length > 1).map(([signature, taskNos]) => ({ signature, taskNos })),
    stories: [...byStory.entries()].map(([story, taskNos]) => ({ story, taskNos })).sort((a, b) => b.taskNos.length - a.taskNos.length || a.story.localeCompare(b.story, "ko")),
    missing: items.filter((it) => !it.spec).map((it) => ({ ...brief(it), pages: it.pages })),
    stale: items.filter(stale).map(brief),
    unestimated: items.filter((it) => it.spec && !specHeight(it.spec)).map(brief),
  };
}

/** 쪽 묶음(화면): 소항목이 다음 쪽으로 이어지는 쪽끼리 한 장으로 — 걸친 소항목을 끊지 않고 한 번에 그리고 쪽 경계를 선으로 표시 */
export function sheetsOf(pages: LaidPage[]): LaidPage[][] {
  const sheets: LaidPage[][] = [];
  for (const p of pages) {
    const last = sheets.at(-1);
    if (last && last.at(-1)!.pieces.some((x) => x.more)) last.push(p);
    else sheets.push([p]);
  }
  return sheets;
}
