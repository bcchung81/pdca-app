// 앱 밖 기준 문서를 고정 사본으로 들여오는 목록. 원본 경로는 각 저장소(폴더) 기준입니다.
// 앱은 실행 중에 원본 폴더를 읽지 않습니다 — `pnpm harness:sync`로 사본을 갱신하고 테스트가 해시를 대조합니다.

export interface HarnessSource {
  id: string;
  /** 사본 폴더 */
  dir: string;
  /** 원본 폴더 환경변수와 기본값(저장소 옆) */
  env: string;
  defaultPath: string;
  /** git 저장소면 커밋을 기록하고, 커밋 안 된 변경이 있으면 멈춤 */
  git: boolean;
  repository?: string;
  files: Array<{ src: string; dest: string; use: string }>;
}

export const HARNESS_SOURCES: HarnessSource[] = [
  {
    id: "report-harness",
    dir: "resources/harness/report-harness",
    env: "REPORT_HARNESS_DIR",
    defaultPath: "../report-harness",
    git: true,
    repository: "https://github.com/bcchung81/report-harness",
    files: [
      { src: "webapp/kca-report-hwpx/references/rules.md", dest: "rules.md", use: "집필·변환 규칙 [draft][export] — 카드 개선·보고서 초안 프롬프트, 초안 점검" },
      { src: "skills/report-pipeline/references/style-guide.md", dest: "style-guide.md", use: "문체(개조식·쉬운 말·두괄식) — AI 작성지원 프롬프트" },
      { src: "skills/report-pipeline/references/md-profile.md", dest: "md-profile.md", use: "초안 마크다운 표기(계층 기호·표 병합 표기) — 초안 형식·HWPX 변환 입력" },
      { src: "skills/report-pipeline/references/table-pool.md", dest: "table-pool.md", use: "표 유형 — 보고서 표 선택" },
      { src: "skills/report-pipeline/references/diagram-pool.md", dest: "diagram-pool.md", use: "도식 유형 — 도식 카탈로그(HTML·HWPX)" },
      { src: "skills/report-pipeline/references/factcheck.md", dest: "factcheck.md", use: "팩트체크 절차 — 초안 수치·인용 검증" },
      { src: "skills/report-pipeline/references/hwpx-recipe.md", dest: "hwpx-recipe.md", use: "HWPX 변환 절차(kordoc generate_document) — lib/hwpx가 옮긴 입력 문법(R010·R012·R016)·KCA 생성 인자(R008)·후처리 규칙의 기준" },
      { src: "skills/report-pipeline/references/format-profile.kca.md", dest: "format-profile.kca.md", use: "KCA 표준보고서 양식 값(글꼴·크기·간격·여백) — lib/hwpx/kca-profile.ts 상수의 출처" },
      { src: "skills/report-pipeline/references/report-craft.md", dest: "report-craft.md", use: "보고서 설계·점검(제목·핵심 메시지·근거 구조·흔한 실수) — 경평 초안 프롬프트와 점검" },
      { src: "webapp/kca-report-hwpx/SKILL.md", dest: "kca-report-hwpx.SKILL.md", use: "웹앱판 보고서 스킬(초안 → HWPX 절차·게이트) — 경평 초안 작성 흐름 참고" },
      { src: "LICENSE", dest: "LICENSE", use: "MIT 고지" },
    ],
  },
  {
    id: "pdca",
    dir: "resources/harness/pdca",
    env: "PDCA_DIR",
    defaultPath: "../pdca",
    git: false,
    files: [
      {
        src: "2_웹앱프로젝트/A_작성지원_경영관리/08-작성지원-지침-경영관리.md",
        dest: "08-assist-guide-mg.md",
        use: "담당자 작성지원 지침(경영관리) — 경영관리 트랙 확장용 사본, 아직 앱이 읽지 않음",
      },
      {
        src: "2_웹앱프로젝트/B_작성지원_주요사업/09-작성지원-지침-주요사업.md",
        dest: "09-assist-guide-biz.md",
        use: "담당자 작성지원 지침(주요사업) — 카드 본문 AI 리뷰·작성지원·개선방향의 기준",
      },
      {
        src: "2_웹앱프로젝트/C_종합점검_경영관리/13-종합점검-지침-경영관리.md",
        dest: "13-inspection-guide-mg.md",
        use: "성과관리팀 종합점검 지침(경영관리) — 경영관리 트랙 확장용 사본, 아직 앱이 읽지 않음",
      },
      {
        src: "2_웹앱프로젝트/D_종합점검_주요사업/14-종합점검-지침-주요사업.md",
        dest: "14-inspection-guide-biz.md",
        use: "성과관리팀 종합점검 지침(주요사업) — 월간 점검표(총평·벤치마킹 7대 축·질의 패턴 8·정합성 5)와 AI 점검 초안의 기준",
      },
    ],
  },
];

/** 예전 이름(report-harness 전용) — 사본 폴더와 파일 목록 */
export const HARNESS_DIR = HARNESS_SOURCES[0].dir;
export const HARNESS_FILES = HARNESS_SOURCES[0].files;
