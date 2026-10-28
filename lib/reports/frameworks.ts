// 경평 초안 「짜임 사전」(순수): 2025 최종본·주요사업 프레임워크 분석에서 뽑은 이야기 틀 12종 + 섞음(resources/prompts/report-draft/stories.md)과
// 도식(블록 모양) 30가지(표 모양 4종은 2026-10-12, 진단 ▶ 처방 짝은 2026-10-13)(블록 사전 report-draft/blocks.md · 도식 카탈로그 docs/analysis/diagram-catalog-2025.html — 전략체계도·PDCA 순환은 2026-10-09)를
// 담당자가 구성안에서 골라 쓰게 한 데이터(2026-09-28 사용자 결정 「분석한 프레임워크 중 선택 · AI 추천 도식을 골라 수정」).
// 쓰는 곳: 구성안 화면의 틀 갤러리·블록 도식 고르기(견본 그림은 서버가 lib/reports/section-html.ts로 그림), 서버의 편집 검증(칸 범위·근거 조건).
// 틀의 블록 순서는 stories.md 줄과 같은 순서여야 합니다(테스트가 대조).
// 2026-10-28: 주요사업 틀에서 핵심 수치 띠(stats)를 뺌 — 2025 최종본·도식Pool에 따로 떨어진 수치 띠가 없음(BIZ_RETIRED_SHAPES). 수치는 단계 결과 줄·추진성과에

import { BLOCK_KINDS, type BlockKind, STORIES, type Story, VARIANTS } from "./blocks.ts";
import { orgNames } from "./diagram-hints.ts";

// ---------------------------------------------------------------------------
// 이야기 틀

export interface FrameworkBlock {
  kind: BlockKind;
  variant?: string;
  /** 사다리 행 라벨(견본 그림용 — 없으면 전폭) */
  label?: string;
}

export interface Framework {
  story: Story;
  /** 틀 번호(①~⑫, 섞음은 빈 글) */
  no: string;
  /** 어울리는 과제 한 줄 */
  fit: string;
  /** 블록 순서 예시(stories.md와 같은 순서) — 섞음은 빈 목록(AI가 정함) */
  blocks: FrameworkBlock[];
  /** 2025 최종본 예시 소항목 */
  example: string;
}

export const FRAMEWORKS: Framework[] = [
  {
    story: "단계 전개형",
    no: "①",
    fit: "기술·시스템을 연구→개발→확산해 온 과제",
    blocks: [{ kind: "quotes" }, { kind: "timeline", variant: "chevron", label: "추진방향" }, { kind: "steps", variant: "row", label: "추진내용" }, { kind: "compare", variant: "panels" }, { kind: "case" }],
    example: "2025 1-1 가. AI 안테나 판독",
  },
  {
    story: "한계 극복·다자협업형",
    no: "②",
    fit: "여러 기관의 한계를 함께 푼 과제",
    blocks: [{ kind: "cards", variant: "plain", label: "현황" }, { kind: "banner" }, { kind: "hub", label: "Step 1" }, { kind: "steps", variant: "row", label: "Step 2" }, { kind: "compare", variant: "panels", label: "Step 3" }, { kind: "cards", variant: "plain", label: "Step 4" }],
    example: "2025 1-2 나. 엘리베이터 통신",
  },
  {
    story: "이슈→해결책형",
    no: "③",
    fit: "정책·주파수·제도·이해관계 조정",
    blocks: [{ kind: "bullets", label: "중요성" }, { kind: "timeline", variant: "chevron", label: "로드맵" }, { kind: "subhead" }, { kind: "cards", variant: "vs", label: "핵심이슈" }, { kind: "cards", variant: "plain", label: "해결책 마련" }],
    example: "2025 2-2 가. 6G 주파수",
  },
  {
    story: "현장 목소리형",
    no: "④",
    fit: "국민 불안·민원 해소",
    blocks: [{ kind: "banner" }, { kind: "voices", label: "국민 의견수렴" }, { kind: "compare", variant: "table", label: "추진노력" }, { kind: "cards", variant: "plain", label: "추진실적" }, { kind: "chart", label: "추진실적" }],
    example: "2025 대상사업1 1-1 가. 데이터센터 전자파",
  },
  {
    story: "원스톱 통합형",
    no: "⑤",
    fit: "여러 창구·절차를 하나로 묶은 서비스",
    blocks: [{ kind: "cards", variant: "plus", label: "현황" }, { kind: "hub", label: "업무협약" }, { kind: "steps", variant: "row", label: "추진내용" }, { kind: "compare", variant: "table", label: "추진실적" }],
    example: "2025 1-1 나. 전자파 안심진단",
  },
  {
    story: "왜-어떻게형",
    no: "⑥",
    fit: "교육·안전 캠페인·장비 활용",
    blocks: [{ kind: "define" }, { kind: "timeline", variant: "chevron", label: "추진경과" }, { kind: "steps", variant: "zigzag", label: "추진내용" }, { kind: "chart", label: "추진내용" }],
    example: "2025 1-2 가. 조난발신 연습기",
  },
  {
    story: "가치 축 분할형",
    no: "⑦",
    fit: "한 과제가 공공성·서비스질·효율성 등 여러 가치를 냄",
    blocks: [{ kind: "cards", variant: "plain", label: "현황" }, { kind: "define" }, { kind: "hub", label: "협업" }, { kind: "band" }, { kind: "compare", variant: "table", label: "공공성" }, { kind: "chart", label: "공공성" }],
    example: "2025 1-2 나. 선박침몰",
  },
  {
    story: "연혁·연도 사다리형",
    no: "⑧",
    fit: "제도·자격·인프라를 해마다 쌓아 온 과제",
    blocks: [{ kind: "timeline", variant: "dots" }, { kind: "cards", variant: "plain", label: "’24년" }, { kind: "cards", variant: "plain", label: "’25년" }, { kind: "cards", variant: "plain", label: "’26년" }],
    example: "2025 2-1 가. 정보보호 자격",
  },
  // ⑨~⑪은 주요사업 프레임워크(첨부5·framework-biz1·biz2, 실행과제 틀 36개)에서 8종에 안 잡히는 반복 짜임(2026-10-10 — 분석 docs/analysis/2025-주요사업-경영실적보고서-분석.md §H)
  {
    story: "기존→개선형",
    no: "⑨",
    fit: "기존 방식·제도의 한계를 고쳐 바꾼 과제 — 한계 → 개선 노력 → 달라진 결과",
    blocks: [{ kind: "cards", variant: "arrow", label: "개선 경과" }, { kind: "compare", variant: "panels", label: "기존→개선" }, { kind: "steps", variant: "row", label: "추진내용" }],
    example: "2025 2-1 나. 국가자격 품질 제고",
  },
  {
    story: "구분표 중심형",
    no: "⑩",
    fit: "갈래가 여럿인 실행을 「구분 | 추진노력 | 추진결과」 표 하나로 보이는 과제",
    blocks: [{ kind: "banner" }, { kind: "table", label: "추진내용" }],
    example: "2025 2-2 나. AI·RPA 자산운용",
  },
  {
    story: "현황분석→대응형",
    no: "⑪",
    fit: "현장·데이터를 분석해 문제를 찾고 맞춤 대응한 과제",
    blocks: [{ kind: "cards", variant: "plus", label: "현황분석" }, { kind: "table", label: "분석결과" }, { kind: "steps", variant: "row", label: "추진내용" }],
    example: "2025 1-4 가. 마을방송 무전기 전파분석",
  },
  // ⑫는 2025 산업진흥군 타기관 보고서 짜임 분석(가3 — 2026-10-13)에서 뽑음. KCA 2025 예시는 없어 타기관 소항목을 적음
  {
    story: "AX 전환형",
    no: "⑫",
    fit: "AI·자동화로 업무 절차를 바꾼 과제 — 기존 절차 → 전환 → 사람·AI 역할 분담 → 단축 성과",
    blocks: [{ kind: "cards", variant: "arrow", label: "전환 배경" }, { kind: "compare", variant: "panels", label: "기존→AI 전환" }, { kind: "table", label: "역할 분담" }, { kind: "steps", variant: "row", label: "확산" }],
    example: "타기관 2025 — 한국지능정보사회진흥원 지능화 확산(B+)·KEIT R&D시스템(B0)",
  },
  // 섞음을 고르면 AI가 주 틀 하나 + 보조 틀 하나를 고름(2026-10-09 — 구성안 답에는 섞음이 없음, report-outline/request.md story.mix)
  { story: "섞음", no: "", fit: "두 틀을 함께 — AI가 뼈대 틀 하나와 한 행만 빌려 올 보조 틀 하나를 고름", blocks: [], example: "" },
];

export const frameworkOf = (story: string) => FRAMEWORKS.find((f) => f.story === story) ?? null;

/** 화면·요청에 적는 틀 이름: 보조 틀이 있으면 「주 + 보조」(2026-10-09 — 섞음 대신) */
export const storyLabel = (story: string, subStory?: string) => (story && subStory ? `${story} + ${subStory}` : story);

// ---------------------------------------------------------------------------
// 도식(블록 모양)

/** 도식 무리: 기본 도식(내용 모양에 맞춤) · 이 과제만의 요소(근거가 있어야 씀 — diagram-hints OWN_KINDS) · 글·띠 */
export type ShapeGroup = "base" | "own" | "text";
export const SHAPE_GROUP_LABEL: Record<ShapeGroup, string> = { base: "기본 도식", own: "이 과제만의 요소 — 근거 재료가 있어야 씀", text: "글·띠" };

export interface ShapeInfo {
  /** kind:variant(모양이 없는 종류는 kind만 — composition-sheet shapeCode와 같음) */
  code: string;
  kind: BlockKind;
  variant: string;
  /** 쉬운 이름 */
  name: string;
  group: ShapeGroup;
  /** 쓰임 한 줄 */
  use: string;
}

export const SHAPES: ShapeInfo[] = [
  { code: "compare:table", kind: "compare", variant: "table", name: "전후 비교 표", group: "base", use: "구분 | 기존 | 개선 — 무엇이 달라졌나" },
  { code: "compare:panels", kind: "compare", variant: "panels", name: "전후 비교(As-Is/To-Be)", group: "base", use: "기존 ➀➁ → 개선 ➊➋ 두 패널" },
  { code: "compare:diag", kind: "compare", variant: "diag", name: "진단 ▶ 처방 짝", group: "base", use: "현황·문제 ➀➁ ▶ 추진방향 ➊➋ — 문제마다 방향 한 짝(소항목을 여는 자리)" },
  { code: "steps:row", kind: "steps", variant: "row", name: "단계 흐름", group: "base", use: "순서가 있는 실행 3~5단계" },
  { code: "steps:zigzag", kind: "steps", variant: "zigzag", name: "ㄹ자 단계", group: "base", use: "의견 → 한계 → 방향 → 해결 4단계" },
  { code: "cards:plus", kind: "cards", variant: "plus", name: "칸 도식(✚)", group: "base", use: "함께 봐야 할 요소 3칸(현황·문제 셋)" },
  { code: "cards:arrow", kind: "cards", variant: "arrow", name: "칸 도식(▶)", group: "base", use: "이어지는 요소 3칸" },
  { code: "cards:plain", kind: "cards", variant: "plain", name: "칸 도식", group: "base", use: "나란한 요소 2~4칸" },
  { code: "cards:vs", kind: "cards", variant: "vs", name: "대비 2칸(VS)", group: "base", use: "두 입장·두 방식 맞세우기" },
  { code: "timeline:chevron", kind: "timeline", variant: "chevron", name: "연도 흐름", group: "base", use: "’24 → ’25 → ’26 단계(마지막이 올해)" },
  { code: "timeline:dots", kind: "timeline", variant: "dots", name: "연혁 점", group: "base", use: "해마다 쌓은 연혁·누적 수치" },
  { code: "stats", kind: "stats", variant: "", name: "핵심 수치 띠", group: "base", use: "추진성과 상자 — 칸마다 「성과 문장(시점 수치)」 굵은 불릿 2~4줄(2026-10-28 2025 추진성과 행 모양)" },
  { code: "table", kind: "table", variant: "", name: "수치 표", group: "base", use: "행·열 머리가 모두 있는 수치" },
  // 표 모양 4종(2026-10-12 — 2025 경영관리 보고서 빈출, 분석 docs/analysis/2025-경영관리-경영실적보고서-분석.md 「블록 어휘 수준」)
  { code: "table:result", kind: "table", variant: "result", name: "추진실적 열 표", group: "base", use: "추진내용 행 옆 어두운 「추진실적」 칸(큰 수치 1~2 + 한 줄)" },
  { code: "table:bars", kind: "table", variant: "bars", name: "막대 든 수치 표", group: "base", use: "값 옆 가로 막대(’25 → ’26 — 같은 행·같은 단위끼리, 길이는 앱이 셈)" },
  { code: "table:chevron", kind: "table", variant: "chevron", name: "쉐브론 머리 표", group: "base", use: "열 머리가 단계 화살표(현황 ▶ 개선방향 ▶ 적용 결과)" },
  { code: "table:ladder", kind: "table", variant: "ladder", name: "2단 라벨 표", group: "base", use: "큰 라벨(① 관리) 안 하위 라벨(①-1·①-2) + 내용" },
  { code: "qa", kind: "qa", variant: "", name: "묻고 답하기", group: "base", use: "「왜·어떻게 …?」 질문과 답 1~3쌍" },
  { code: "strategy", kind: "strategy", variant: "", name: "전략체계도", group: "base", use: "목표 띠 → 전략 열 2~4 → 과제·지표(층 이름은 자유)" },
  { code: "pdca", kind: "pdca", variant: "", name: "PDCA 순환", group: "base", use: "계획 → 실행 → 점검 → 환류 4칸 + 환류 띠(단계 이름은 자유)" },
  { code: "quotes", kind: "quotes", variant: "", name: "인용 상자", group: "own", use: "정부·CEO·현장 원문 인용 1~2개" },
  { code: "voices", kind: "voices", variant: "", name: "현장 목소리", group: "own", use: "시민·기업의 말 말풍선" },
  { code: "define", kind: "define", variant: "", name: "용어 정의", group: "own", use: "「…란?」 설명 + 칩 흐름" },
  { code: "case", kind: "case", variant: "", name: "우수사례", group: "own", use: "수상·선정·보도·공모전" },
  { code: "hub", kind: "hub", variant: "", name: "협업 구조", group: "own", use: "주관 기관 + 참여 기관과 역할" },
  { code: "chart", kind: "chart", variant: "", name: "막대", group: "own", use: "같은 지표의 시점별 수치(앞 행 오른쪽)" },
  { code: "bullets", kind: "bullets", variant: "", name: "불릿", group: "text", use: "도식으로 안 되는 배경 1~3줄" },
  { code: "banner", kind: "banner", variant: "", name: "메시지 띠", group: "text", use: "핵심 메시지 한 줄" },
  { code: "band", kind: "band", variant: "", name: "가치 띠", group: "text", use: "▶ 가치 축 ◀ 절 나눔" },
  { code: "subhead", kind: "subhead", variant: "", name: "소제목", group: "text", use: "① [국내] … 갈래 나눔" },
];

/** 모양 코드(kind:variant — 모양이 없으면 그 종류의 첫째 모양) */
export function shapeCode(kind: string, variant: string): string {
  const v = variant || VARIANTS[kind as BlockKind]?.[0] || "";
  return v ? `${kind}:${v}` : kind;
}

/** 모양 쉬운 이름(코드명 → 화면 글) */
export const SHAPE_NAMES: Record<string, string> = Object.fromEntries(SHAPES.map((s) => [s.code, s.name]));

/** 모양 쉬운 이름(모르는 코드면 코드 그대로) */
export function shapeName(kind: string, variant: string): string {
  const code = shapeCode(kind, variant);
  return SHAPE_NAMES[code] ?? SHAPE_NAMES[kind] ?? code;
}

export const shapeOf = (code: string) => SHAPES.find((s) => s.code === code) ?? null;

/**
 * 주요사업 새 구성안·초안에서 고르지 않는 모양(2026-10-28 사용자 결정): 핵심 수치 띠(stats) — 2025 주요사업 최종본(119·120·153·155·185쪽)과
 * 도식Pool 어디에도 따로 떨어진 큰 수치 상자 띠가 없고, 수치는 단계 칸 결과 줄·추진성과 3칸·추진성과 막대·칸 끝 결과 줄·표 열에 녹여 씀.
 * 경영관리는 절을 닫는 「추진성과」 행이라 그대로 씀. 이미 저장된 초안의 띠는 렌더러·한글 변환·판면 어림이 예전처럼 그림(데이터 이전 없음)
 */
export const BIZ_RETIRED_SHAPES: readonly string[] = ["stats"];
export const BIZ_RETIRED_WHY = "주요사업 초안은 따로 떨어진 수치 띠를 쓰지 않습니다(2025 최종본에 없음) — 수치는 단계 칸 결과 줄·표 결과 열·추진성과에 씁니다";

/** 전폭으로 그리는 종류(라벨이 있어도 사다리 행이 아님 — 렌더러 section-html의 FULL_KINDS와 같음) */
export const FULL_WIDTH_KINDS: readonly BlockKind[] = ["band", "banner", "quotes", "subhead", "case"];

/** 라벨 후보(2025 공통 라벨 — 추진배경 15·추진방향 8·주요이슈 5 + 라벨 사다리 6종) */
export const LABEL_SUGGESTIONS = ["추진배경", "현황 및 문제점", "추진방향", "추진내용", "추진노력", "추진실적", "주요이슈"] as const;

// ---------------------------------------------------------------------------
// 칸 수 범위

/** 사람이 고를 수 있는 칸 수(칸 도식은 칸, 전후 비교·수치 표는 행, 불릿·우수사례는 줄, 막대는 막대 수, 협업은 가운데 + 기관) — 렌더러·canonicalBlock이 그리는 범위 */
const CELL_RANGE: Record<BlockKind, readonly [number, number]> = {
  bullets: [1, 6],
  cards: [2, 5],
  compare: [1, 4],
  steps: [2, 5],
  timeline: [2, 5],
  hub: [3, 6],
  voices: [1, 3],
  define: [1, 1],
  band: [1, 1],
  banner: [1, 1],
  quotes: [1, 2],
  case: [1, 4],
  chart: [2, 4],
  subhead: [1, 1],
  stats: [2, 4],
  qa: [1, 3],
  table: [2, 6],
  strategy: [2, 4],
  pdca: [4, 4],
};

export function cellRange(kind: BlockKind, variant = ""): { min: number; max: number } {
  if (kind === "cards" && variant === "vs") return { min: 2, max: 2 };
  // 표 모양: 추진실적 열 표·쉐브론 머리 표는 1~4행(렌더러·blocks.ts cleanBlocks와 같은 범위), 2단 라벨 표는 2~6행
  if (kind === "table" && (variant === "result" || variant === "chevron")) return { min: 1, max: 4 };
  if (kind === "steps" && variant === "zigzag") return { min: 4, max: 4 };
  const [min, max] = CELL_RANGE[kind] ?? [1, 1];
  return { min, max };
}

/** 범위 안으로 */
export function clampCells(kind: BlockKind, variant: string, n: number): number {
  const { min, max } = cellRange(kind, variant);
  return Math.max(min, Math.min(max, Math.round(Number(n) || min)));
}

/** 새로 넣거나 모양을 바꿀 때의 보통 칸 수 */
export function defaultCells(kind: BlockKind, variant = ""): number {
  const typical: Partial<Record<BlockKind, number>> = { bullets: 2, cards: 3, compare: 2, steps: 3, timeline: 3, hub: 3, voices: 2, quotes: 1, case: 2, chart: 2, stats: 3, qa: 2, table: 3, strategy: 3, pdca: 4 };
  if (kind === "table" && (variant === "result" || variant === "chevron")) return 2;
  if (kind === "table" && variant === "ladder") return 4;
  return clampCells(kind, variant, typical[kind] ?? 1);
}

// ---------------------------------------------------------------------------
// 근거 조건(이 과제만의 요소 — 근거 재료가 없으면 고를 수 없음, 2026-09-28 사용자 결정)

/** 근거로 셈하는 재료(구성안 Material과 같은 모양의 일부) */
export interface EvidenceMaterial {
  kind: string;
  text: string;
  when: string;
  quote: string;
  found: boolean;
}
export interface EvidenceSource {
  materials: EvidenceMaterial[];
  /**
   * AI가 이 구성안에서 추천한 모양(블록마다 처음 모양·대안, 사람이 고치지 않은 블록의 모양) — AI는 근거 전체를 보고 골랐으므로 그 종류는 고를 수 있음.
   * 처음 모양(ai)을 남기기 전에 만든 구성안은 사람이 고치지 않은 블록의 kind가 곧 AI 모양
   */
  blocks: Array<{ kind?: string; by?: string; ai?: { kind: string }; alts?: Array<{ kind: string }> }>;
}

export interface Availability {
  ok: boolean;
  /** 고를 수 있으면 근거 요약, 없으면 이유 */
  why: string;
}

/** 이 과제만의 요소 종류마다 필요한 재료 */
const NEEDS: Partial<Record<BlockKind, { test: (m: EvidenceMaterial[]) => number; min: number; have: string; lack: string }>> = {
  quotes: { test: (ms) => ms.filter((m) => m.kind === "quote").length, min: 1, have: "원문 인용 재료", lack: "원문 인용 재료(정부·CEO·현장·평가위원 말)가 없음" },
  voices: { test: (ms) => ms.filter((m) => m.kind === "quote").length, min: 1, have: "인용 재료", lack: "현장의 말(원문 인용) 재료가 없음" },
  case: { test: (ms) => ms.filter((m) => m.kind === "case").length, min: 1, have: "사례 재료", lack: "수상·선정·보도 사례 재료가 없음" },
  define: { test: (ms) => ms.filter((m) => m.kind === "fact" || m.kind === "quote").length, min: 1, have: "설명 원문 재료", lack: "용어·개념을 설명하는 원문 재료가 없음" },
  chart: { test: (ms) => ms.filter((m) => m.kind === "figure" && m.when.trim()).length, min: 2, have: "시점 있는 수치 재료", lack: "시점이 있는 같은 지표 수치 재료가 2개 미만" },
  hub: { test: (ms) => orgNames(ms.map((m) => `${m.text} ${m.quote}`).join("\n")).length, min: 2, have: "기관", lack: "재료에 협업 기관 이름이 2곳 미만" },
};

/**
 * 모양 종류마다 고를 수 있는지(결정론): 기본 도식·글·띠는 늘 됨. 이 과제만의 요소는 원문을 찾은 재료(found)가 조건을 채우거나,
 * AI가 이 구성안에서 그 종류를 추천(처음 모양·대안)했으면 됨. 집필 검증이 근거 없는 인용·사례·정의를 지워 블록이 사라지므로 미리 막음
 */
export function shapeAvailability(src: EvidenceSource): Record<BlockKind, Availability> {
  const found = src.materials.filter((m) => m.kind !== "need" && m.found);
  const aiKinds = new Set(src.blocks.flatMap((b) => [b.ai?.kind, b.by === "human" ? undefined : b.kind, ...(b.alts ?? []).map((a) => a.kind)]).filter(Boolean) as string[]);
  const out = {} as Record<BlockKind, Availability>;
  for (const kind of BLOCK_KINDS) {
    const need = NEEDS[kind];
    if (!need) {
      out[kind] = { ok: true, why: "" };
      continue;
    }
    const n = need.test(found);
    if (n >= need.min) out[kind] = { ok: true, why: `${need.have} ${n}${kind === "hub" ? "곳" : "개"}` };
    else if (aiKinds.has(kind)) out[kind] = { ok: true, why: "AI가 근거를 보고 추천" };
    else out[kind] = { ok: false, why: `${need.lack} — 근거 자료(첨부)를 더한 뒤 구성안을 다시 만들면 재료로 뽑힙니다` };
  }
  return out;
}

/** 이 과제 근거로 틀이 얼마나 서는지: 틀의 이 과제만의 요소 중 고를 수 있는 것 수 */
export function frameworkReadiness(fw: Framework, avail: Record<BlockKind, Availability>): { ready: number; total: number; missing: string[] } {
  const own = [...new Set(fw.blocks.map((b) => b.kind).filter((k) => NEEDS[k]))];
  const missing = own.filter((k) => !avail[k]?.ok).map((k) => shapeName(k, ""));
  return { ready: own.length - missing.length, total: own.length, missing };
}

/** 틀 이름 목록(STORIES와 같은 순서 — 테스트 대조용) */
export const FRAMEWORK_STORIES = FRAMEWORKS.map((f) => f.story);
export const isStory = (s: string): s is Story => (STORIES as readonly string[]).includes(s);

/** 이름 비교 열쇠: 가운뎃점 변형(･ㆍ・‧∙•)·화살표 표기(-> ⇒ ➔)·띄어쓰기·감싼 따옴표·앞 번호(①~⑳)를 걷음 */
const nameKey = (s: string) =>
  s
    .normalize("NFC")
    .trim()
    .replace(/^[「『"'“‘(（]+|[」』"'”’)）]+$/g, "")
    .replace(/^[①-⑳]\s*/, "")
    .replace(/[·‧∙⋅・･ㆍᆞ•]/g, "·")
    .replace(/\s*(?:-+>|=+>|⇒|➔|➜|⟶|→)\s*/g, "→")
    .replace(/\s+/g, "");

/**
 * AI 답의 이야기 틀 이름 → 목록의 정식 이름(2026-10-12 — 구성안 답 스키마의 틀 칸을 enum 대신 문자열로 받고 여기서 맞춤:
 * enum이면 가운뎃점 변형·띄어쓰기 하나로 구조화 출력 파싱이 통째로 실패함 — 같은 날 집필 story 버그와 같은 원인). 「주 + 보조」로 적었으면 앞 이름. 모르면 빈 글
 */
export function matchName<T extends string>(raw: unknown, names: readonly T[]): T | "" {
  const s = typeof raw === "string" ? raw : "";
  if (!s.trim()) return "";
  for (const piece of [s, s.split("+")[0]]) {
    const k = nameKey(piece);
    const hit = names.find((n) => nameKey(n) === k);
    if (hit) return hit;
  }
  return "";
}
