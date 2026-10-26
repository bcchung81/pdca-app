// 경평 초안 「구성 패턴」 카탈로그(순수 데이터, 2026-10-12 사용자 요구 「같은 양식 찍어내기 — 이야기 틀·개별 수정안이 요청에 따라 다양한 프레임워크로」 ②).
// 이야기 틀(무엇을 앞세울지 — frameworks.ts)과 따로 「몇 단으로·어떤 블록 순서·배치로 놓을지」를 담당자가 고르는 갈래입니다. 고르면 구성안 요청에 그 단 구성·권장 블록이 들어가고
// AI는 그 짜임을 뼈대로 재료를 넣습니다(lib/reports/framework-pick.ts framePrompt). 근거 아님 — 사실·숫자는 카드 근거만.
// 원천(둘 다 기관 자료 — 앱은 실행 중에 원본을 읽지 않고 여기 옮긴 데이터만 씀):
//  - 도식 Pool 정의서(2024.11, 2단~5단) 판정표 — resources/harness/report-harness/diagram-pool.md(사본). 판정표 줄마다 하나(조건이 같은 3단-3·4·11·12는 한 줄),
//    정의서의 표 원형은 그림이라 단 구성·선택 조건 글과 「활용」 표 머리(2단-1 「구분 | 추진내용 | 추진실적」, 5단-1 「추진배경·추진사항·추진실적·우수사례·추진성과」)로 블록을 정함
//  - 표준보고서 컨설팅 자료 「보고서 템플릿 구조 활용」(2024.11, data/templates/표준보고서/report-template-structure-2411.pdf — git 밖) 「02 보고서 구조에 따른 전개양식」 유형별 견본·예시 쪽
//    (쪽 제목 기준 — 2-1·2-2형·3-2형 쪽 오른쪽 상자의 유형 이름은 쪽 제목과 엇갈려 적혀 있음)
// 앱 블록(블록 사전 report-draft/blocks.md)·배치(layout.ts — 라벨 사다리·전폭·단 띠·가로 반씩)로 그릴 수 있는 것만 넣고, 못 그리는 것은 PATTERN_EXCLUDED에 이유와 함께 둡니다.
// 마무리(추진성과)는 블록이 아님: 주요사업은 구성안의 추진성과 모양(resultShape), 경영관리는 절 끝 라벨 「추진성과」 블록(닫기 관례) — close가 그 모양.

import type { BlockKind } from "./blocks.ts";
import type { BlockLayout, BlockSpan } from "./layout.ts";

/** 추진성과 모양(composition.ts RESULT_SHAPES와 같은 값 — 순환 import를 피해 글로 둠) */
export type PatternClose = "bullets" | "cards" | "chart";

export interface PatternStage {
  /** 도입·전개·전개1·마무리 등 */
  name: string;
  /** 이 단이 맡는 것(정의서·표준보고서 글) */
  role: string;
}

export interface PatternBlock {
  /** 왼쪽 라벨(빈 글 = 전폭) */
  label: string;
  kind: BlockKind;
  variant?: string;
  cells: number;
  layout?: BlockLayout;
  span?: BlockSpan;
}

export interface FrameworkPattern {
  /** pool-3-2 · std-1-5 */
  id: string;
  /** 화면·요청 이름 */
  name: string;
  source: "pool" | "std";
  /** 근거(도식 Pool 판정표 줄 / 표준보고서 쪽) */
  ref: string;
  /** 도식 Pool 판정표 첫 칸 글 그대로(판정표 대조 시험용 — std는 없음) */
  row?: string;
  /** 언제 고르나 */
  when: string;
  stages: PatternStage[];
  /** 권장 블록(도입·전개 — 마무리는 close) */
  blocks: PatternBlock[];
  close: PatternClose;
  /** 표준보고서 유형의 분량(쪽) */
  pages?: number;
  /** 정의서가 「가급적 지양」으로 적은 패턴 */
  avoid?: boolean;
}

const INTRO: PatternStage = { name: "도입", role: "배경·목적·전년도 환류" };
const DEVELOP: PatternStage = { name: "전개", role: "실행내용·해결방안·실적" };
const CLOSE: PatternStage = { name: "마무리", role: "결과·성과·기대효과" };
const POOL_REF = "도식 Pool 정의서(2024.11) 판정표";
const STD_REF = "표준보고서 컨설팅 「보고서 템플릿 구조 활용」(2024.11)";

export const FRAMEWORK_PATTERNS: FrameworkPattern[] = [
  // ── 도식 Pool 정의서 판정표(diagram-pool.md)
  {
    id: "pool-2",
    name: "2단 — 전개 → 마무리",
    source: "pool",
    ref: `${POOL_REF} 「2단(2단-1~4)」 · 2단-1 활용 표 「구분 | 추진내용 | 추진실적」`,
    row: "2단 (2단-1~4)",
    when: "배경·목적·원인·문제점 등 도입 재료가 부실해 3단을 못 쓸 때 — 가급적 지양",
    stages: [
      { name: "전개", role: "추진내용" },
      { name: "마무리", role: "추진실적" },
    ],
    blocks: [{ label: "추진내용", kind: "table", variant: "result", cells: 3 }],
    close: "bullets",
    avoid: true,
  },
  {
    id: "pool-3-1",
    name: "3단-1 — 프로세스 전개 → 결과 하나",
    source: "pool",
    ref: `${POOL_REF} 「3단-1」`,
    row: "3단-1",
    when: "전개가 프로세스·전개형으로 진행되어 하나의 결과를 도출할 때",
    stages: [INTRO, { name: "전개", role: "순서가 있는 실행 단계" }, { name: "마무리", role: "하나의 결과" }],
    blocks: [
      { label: "추진배경", kind: "bullets", cells: 2 },
      { label: "추진내용", kind: "steps", variant: "row", cells: 4 },
      { label: "추진실적", kind: "stats", cells: 2 },
    ],
    close: "bullets",
  },
  {
    id: "pool-3-2",
    name: "3단-2 — 배경 세 갈래 + 같은 수준 실행",
    source: "pool",
    ref: `${POOL_REF} 「3단-2」`,
    row: "3단-2",
    when: "추진배경이 3가지로 구분되고 추진내용의 수준이 같을 때",
    stages: [{ name: "도입", role: "배경 세 갈래" }, { name: "전개", role: "같은 수준의 실행 갈래" }, CLOSE],
    blocks: [
      { label: "추진배경", kind: "cards", variant: "plus", cells: 3 },
      { label: "추진내용", kind: "cards", variant: "plain", cells: 3 },
    ],
    close: "cards",
  },
  {
    id: "pool-3-3",
    name: "3단-3·4·11·12 — 원인 여럿 → 성과 하나",
    source: "pool",
    ref: `${POOL_REF} 「3단-3 / 3단-4 / 3단-11 / 3단-12」`,
    row: "3단-3 / 3단-4 / 3단-11 / 3단-12",
    when: "현황·문제점의 원인은 여러 가지인데 성과는 한 가지로 제시할 수 있을 때",
    stages: [{ name: "도입", role: "현황·문제점의 원인 여럿" }, DEVELOP, { name: "마무리", role: "한 가지 성과" }],
    blocks: [
      { label: "현황 및 문제점", kind: "cards", variant: "plus", cells: 3 },
      { label: "추진내용", kind: "steps", variant: "row", cells: 3 },
    ],
    close: "bullets",
  },
  {
    id: "pool-3-5",
    name: "3단-5 — 순차 배경 → 공통 성과",
    source: "pool",
    ref: `${POOL_REF} 「3단-5」`,
    row: "3단-5",
    when: "추진배경이 순차 프로세스로 표현되거나, 주요 성과가 전개 전체에 공통으로 제시될 때",
    stages: [{ name: "도입", role: "순서가 있는 배경(경과)" }, DEVELOP, { name: "마무리", role: "전개 전체에 공통인 성과" }],
    blocks: [
      { label: "추진배경", kind: "cards", variant: "arrow", cells: 3 },
      { label: "추진내용", kind: "table", cells: 3 },
    ],
    close: "bullets",
  },
  {
    id: "pool-3-7",
    name: "3단-7 — 도입 강조 + 내용↔실적 1:1",
    source: "pool",
    ref: `${POOL_REF} 「3단-7」`,
    row: "3단-7",
    when: "도입부(목적·원인·문제점)를 강조하고 추진내용과 추진실적이 1:1로 맞을 때",
    stages: [{ name: "도입", role: "목적·원인·문제점 강조" }, { name: "전개", role: "추진내용마다 그 실적" }, CLOSE],
    blocks: [
      { label: "추진배경", kind: "bullets", cells: 2 },
      { label: "", kind: "banner", cells: 1 },
      { label: "추진내용", kind: "table", variant: "result", cells: 3 },
    ],
    close: "bullets",
  },
  {
    id: "pool-3-8",
    name: "3단-8 — 배경 나열(정책·현황·니즈)",
    source: "pool",
    ref: `${POOL_REF} 「3단-8」`,
    row: "3단-8",
    when: "추진배경을 정부정책·경제현황·국민니즈 등 나열식으로 쓸 때",
    stages: [{ name: "도입", role: "정부정책·현황·국민니즈 나열" }, DEVELOP, CLOSE],
    blocks: [
      { label: "추진배경", kind: "cards", variant: "plain", cells: 3 },
      { label: "추진내용", kind: "steps", variant: "row", cells: 3 },
    ],
    close: "bullets",
  },
  {
    id: "pool-3-9",
    name: "3단-9 — 사실 많은 전개",
    source: "pool",
    ref: `${POOL_REF} 「3단-9」`,
    row: "3단-9",
    when: "추진내용이 사실 위주로 분량이 많을 때",
    stages: [INTRO, { name: "전개", role: "사실 위주의 많은 추진내용(큰 갈래 안 작은 갈래)" }, CLOSE],
    blocks: [
      { label: "추진배경", kind: "bullets", cells: 1 },
      { label: "추진내용", kind: "table", variant: "ladder", cells: 4 },
    ],
    close: "bullets",
  },
  {
    id: "pool-3-10",
    name: "3단-10 — 사실 많은 전개 → 결과 하나 강조",
    source: "pool",
    ref: `${POOL_REF} 「3단-10」`,
    row: "3단-10",
    when: "추진내용이 사실 위주로 많고 실적·성과를 한 가지 결과로 모아 강조할 때",
    stages: [INTRO, { name: "전개", role: "사실 위주의 많은 추진내용" }, { name: "마무리", role: "한 가지 결과(강조)" }],
    blocks: [
      { label: "추진배경", kind: "bullets", cells: 1 },
      { label: "추진내용", kind: "table", variant: "ladder", cells: 3 },
      { label: "추진실적", kind: "stats", cells: 2 },
    ],
    close: "bullets",
  },
  {
    id: "pool-4-1",
    name: "4단-1 — 전개 중 우수사례 강조",
    source: "pool",
    ref: `${POOL_REF} 「4단-1」`,
    row: "4단-1",
    when: "전개(추진내용) 중 우수사례 등 강조가 필요할 때(우수사례 원문 근거가 있을 때만)",
    stages: [{ name: "배경", role: "추진배경" }, { name: "전개", role: "추진내용" }, { name: "강조", role: "우수사례" }, { name: "실적", role: "추진실적" }],
    blocks: [
      { label: "추진배경", kind: "bullets", cells: 2 },
      { label: "추진내용", kind: "steps", variant: "row", cells: 3 },
      { label: "", kind: "case", cells: 2 },
      { label: "추진실적", kind: "stats", cells: 2 },
    ],
    close: "bullets",
  },
  {
    id: "pool-5-1",
    name: "5단-1 — 지적 개선 반영 실적 + 우수사례",
    source: "pool",
    ref: `${POOL_REF} 「5단-1」 · 활용 표 「추진배경 · 추진사항 · 추진실적 · 우수사례 · 추진성과」`,
    row: "5단-1",
    when: "추진실적·우수사례 중 전년도 지적사항 개선 반영을 보여줄 때",
    stages: [
      { name: "배경", role: "추진배경" },
      { name: "내용", role: "추진사항" },
      { name: "실적", role: "추진실적(지적 개선 전후)" },
      { name: "강조", role: "우수사례" },
      { name: "성과", role: "추진성과" },
    ],
    blocks: [
      { label: "추진배경", kind: "bullets", cells: 1 },
      { label: "추진사항", kind: "steps", variant: "row", cells: 3 },
      { label: "추진실적", kind: "compare", variant: "table", cells: 2 },
      { label: "우수사례", kind: "case", cells: 1 },
    ],
    close: "bullets",
  },
  // ── 표준보고서 「02 보고서 구조에 따른 전개양식」(견본 쪽 · 예시 쪽)
  {
    id: "std-1-1",
    name: "표준 3단 1-1형 — 전개 하나(1쪽)",
    source: "std",
    ref: `${STD_REF} p.3·4`,
    when: "도입 → 전개 → 마무리가 한 흐름이고 전개(실행)가 하나일 때(2024 주요사업 14과제가 쓴 기본형)",
    stages: [INTRO, DEVELOP, CLOSE],
    blocks: [
      { label: "추진배경", kind: "bullets", cells: 2 },
      { label: "전년도 환류", kind: "table", cells: 3 },
      { label: "추진내용", kind: "cards", variant: "plain", cells: 3 },
      { label: "추진실적", kind: "steps", variant: "row", cells: 4 },
      { label: "추진실적", kind: "stats", cells: 2 },
    ],
    close: "bullets",
    pages: 1,
  },
  {
    id: "std-1-2",
    name: "표준 3단 1-2형 — 전개 둘(1쪽)",
    source: "std",
    ref: `${STD_REF} p.5·6`,
    when: "전개가 둘(가.·나. 중제목)로 나뉘고 전개마다 실행 → 결과로 닫힐 때",
    stages: [INTRO, { name: "전개1", role: "구분 · 추진노력 · 추진결과" }, { name: "전개2", role: "내용 흐름 → 추진결과" }, CLOSE],
    blocks: [
      { label: "추진배경", kind: "bullets", cells: 2 },
      { label: "전년도 환류", kind: "cards", variant: "arrow", cells: 2 },
      { label: "", kind: "subhead", cells: 1 },
      { label: "추진노력", kind: "table", variant: "result", cells: 3 },
      { label: "", kind: "subhead", cells: 1 },
      { label: "추진내용", kind: "cards", variant: "arrow", cells: 3 },
    ],
    close: "bullets",
    pages: 1,
  },
  {
    id: "std-1-3",
    name: "표준 3단 1-3형 — 전개 셋(1쪽)",
    source: "std",
    ref: `${STD_REF} p.7·8`,
    when: "독립된 전개 셋(① ② ③ 중제목)이 같은 성과로 모일 때",
    stages: [INTRO, { name: "전개1", role: "구분 · 추진노력 · 추진결과" }, { name: "전개2", role: "갈래별 내용" }, { name: "전개3", role: "갈래별 내용 → 성과" }, CLOSE],
    blocks: [
      { label: "추진배경", kind: "bullets", cells: 1 },
      { label: "전년도 환류", kind: "cards", variant: "plus", cells: 3 },
      { label: "", kind: "subhead", cells: 1 },
      { label: "추진노력", kind: "table", variant: "result", cells: 3 },
      { label: "", kind: "subhead", cells: 1 },
      { label: "추진내용", kind: "cards", variant: "plain", cells: 2 },
      { label: "", kind: "subhead", cells: 1 },
      { label: "추진내용", kind: "cards", variant: "plain", cells: 3 },
    ],
    close: "bullets",
    pages: 1,
  },
  {
    id: "std-1-5",
    name: "표준 3단 1-5형 — 세로전개(0.5쪽)",
    source: "std",
    ref: `${STD_REF} p.11·12`,
    when: "0.5쪽 — 번호 단계(① ② ③)를 세로로 쌓고 오른쪽에 그 결과 상자를 둘 때",
    stages: [INTRO, { name: "전개", role: "번호 단계 세로 + 오른쪽 결과" }, CLOSE],
    blocks: [
      { label: "추진배경", kind: "bullets", cells: 1 },
      { label: "전년도 환류", kind: "cards", variant: "arrow", cells: 3 },
      { label: "추진내용", kind: "table", variant: "result", cells: 3 },
    ],
    close: "bullets",
    pages: 0.5,
  },
  {
    id: "std-1-6",
    name: "표준 3단 1-6형 — 가로전개(0.5쪽)",
    source: "std",
    ref: `${STD_REF} p.13·14`,
    when: "0.5쪽 — 소제목 셋을 단계 화살표 머리로 가로로 펼치고 마지막 열에 실적을 둘 때",
    stages: [INTRO, { name: "전개", role: "소제목 ▶ 소제목 ▶ 실적(가로)" }, CLOSE],
    blocks: [
      { label: "추진배경", kind: "bullets", cells: 1 },
      { label: "전년도 환류", kind: "cards", variant: "arrow", cells: 3 },
      { label: "추진내용", kind: "table", variant: "chevron", cells: 2, layout: "full" },
    ],
    close: "bullets",
    pages: 0.5,
  },
  {
    id: "std-2-1",
    name: "표준 4단 2-1형 — 벤치마킹 → 전략·실행 강조(1쪽)",
    source: "std",
    ref: `${STD_REF} p.15·16`,
    when: "전개를 「벤치마킹·전년도 지적」과 「전략·기획 → 실행·실적」 둘로 나누고 실적·해결방안을 강조할 때",
    stages: [INTRO, { name: "전개1", role: "벤치마킹·전년도 지적사항" }, { name: "전개2", role: "전략·기획 → 실행·실적·해결방안(강조)" }, CLOSE],
    blocks: [
      { label: "추진배경", kind: "bullets", cells: 1 },
      { label: "전년도 환류", kind: "cards", variant: "arrow", cells: 4 },
      { label: "벤치마킹", kind: "cards", variant: "arrow", cells: 2 },
      { label: "추진내용", kind: "steps", variant: "row", cells: 4 },
      { label: "추진실적", kind: "stats", cells: 3 },
    ],
    close: "cards",
    pages: 1,
  },
  {
    id: "std-2-2",
    name: "표준 4단 2-2형 — 지적사항 강조 + 소제목 둘(1쪽)",
    source: "std",
    ref: `${STD_REF} p.17·18`,
    when: "전개1에서 벤치마킹·전년도 지적사항을 강조하고, 전개2를 소제목 둘로 나란히 보일 때(단 띠로 큰 단을 나눔)",
    stages: [INTRO, { name: "전개1", role: "벤치마킹·전년도 지적사항(강조)" }, { name: "전개2", role: "소제목 둘 — 실행내용·실적" }, CLOSE],
    blocks: [
      { label: "추진배경", kind: "bullets", cells: 1, layout: "stage" },
      { label: "추진배경", kind: "cards", variant: "plain", cells: 4, layout: "stage" },
      { label: "전개 ① 벤치마킹", kind: "cards", variant: "plain", cells: 2, layout: "stage" },
      { label: "전개 ① 벤치마킹", kind: "cards", variant: "arrow", cells: 3, layout: "stage" },
      { label: "전개 ② 추진내용", kind: "cards", variant: "plain", cells: 2, layout: "stage" },
    ],
    close: "bullets",
    pages: 1,
  },
  {
    id: "std-3-1",
    name: "표준 5단 3-1형 — 지적 강조 → 전략·계획 → 실행(1쪽)",
    source: "std",
    ref: `${STD_REF} p.19·20`,
    when: "전년도 지적·문제(①~④)를 먼저 강조하고 → 지적 반영 전략·계획 → 구분별 추진노력·실적으로 펼칠 때",
    stages: [INTRO, { name: "전개1", role: "벤치마킹·전년도 지적사항(강조)" }, { name: "전개2", role: "전략·계획(지적사항 반영)" }, { name: "전개3", role: "실행·실적·해결방안" }, CLOSE],
    blocks: [
      { label: "추진배경", kind: "bullets", cells: 2 },
      { label: "", kind: "steps", variant: "zigzag", cells: 4 },
      { label: "추진방향", kind: "cards", variant: "arrow", cells: 3 },
      { label: "추진내용", kind: "table", variant: "result", cells: 4 },
    ],
    close: "bullets",
    pages: 1,
  },
  {
    id: "std-3-2",
    name: "표준 5단 3-2형 — 환류 → 기존·개선 → 구분표 → 실적(1쪽)",
    source: "std",
    ref: `${STD_REF} p.21·22`,
    when: "전년도 환류를 앞세우고 기존 → 개선 비교 뒤 구분별 주요내용 표와 추진실적으로 닫을 때",
    stages: [INTRO, { name: "전개1", role: "벤치마킹·전년도 지적사항" }, { name: "전개2", role: "전략·기획 → 실행(강조)" }, { name: "전개3", role: "결과·성과" }, CLOSE],
    blocks: [
      { label: "추진배경", kind: "bullets", cells: 1 },
      { label: "전년도 환류", kind: "cards", variant: "arrow", cells: 3 },
      { label: "", kind: "compare", variant: "panels", cells: 2 },
      { label: "추진내용", kind: "table", cells: 3 },
      { label: "추진실적", kind: "bullets", cells: 2 },
    ],
    close: "bullets",
    pages: 1,
  },
];

/** 넣지 않은 패턴과 이유(보고·시험 — 판정표 줄은 이것과 FRAMEWORK_PATTERNS를 합쳐 빠짐없음) */
export const PATTERN_EXCLUDED: Array<{ id: string; name: string; row?: string; why: string }> = [
  { id: "pool-3-6", name: "도식 Pool 3단-6", row: "3단-6", why: "배경·내용을 인포그래픽으로 추가 설명하는 패턴 — 앱은 인포그래픽을 그리지 않고 그림 자리표시만 둠(사람이 넣음), 패턴의 핵심 요소를 블록으로 그릴 수 없음" },
  { id: "pool-4-2", name: "도식 Pool 4단-2·4단-3", row: "4단-2 / 4단-3", why: "정의서에 선택 조건이 없고 예시 표(그림)만 있어 단 구성·블록을 글로 정할 수 없음(판정표도 「형태로 판단」)" },
  { id: "std-1-4", name: "표준 3단 1-4형(2쪽)", why: "도입 0.5쪽·전개 1쪽·마무리 0.5쪽을 쪽 단위로 나누고 중제목 > 소제목 두 층 제목을 씀 — 구성안의 제목 블록은 한 층(소제목)이고 소항목·절 하나에 2쪽 짜임을 담지 않음" },
];

export const patternOf = (id: string): FrameworkPattern | null => FRAMEWORK_PATTERNS.find((p) => p.id === id) ?? null;

/** 출처 짧은 이름(화면 칩) */
export const patternSource = (p: Pick<FrameworkPattern, "source" | "ref">) => (p.source === "pool" ? "도식 Pool 정의서" : `표준보고서 ${/p\.[\d·]+/.exec(p.ref)?.[0] ?? ""}`.trim());
