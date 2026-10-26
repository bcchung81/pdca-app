// 공통 지식 적재 — 조각(chunk)과 문서 등록 정보의 형태.
// 필드 이름은 나중에 Supabase `knowledge_documents` / `knowledge_chunks` 열 이름으로 그대로 씁니다.

export type Track = "주요사업" | "경영관리" | "가점";

/** BZ-1~3: 주요사업1~3, BZ-4: 계량지표 구성의 적합성 및 목표의 도전성(공통지표) */
export type BusinessId = "BZ-1" | "BZ-2" | "BZ-3" | "BZ-4";

/** 평가단위 id(`eval_units.id`) 전체 — 주요사업(BZ-…)에 더해 경영관리 카드 묶음·지표(`MG-…`)와 가점(`GA-…`)을 받는다. 주요사업 전용 사전·파서는 BusinessId를 그대로 씀(전용 파서·사전은 문서가 트랙에 고정이라 넓히지 않음) */
export type UnitId = BusinessId | `MG-${string}` | `GA-${string}`;

export type UnitType =
  | "finding_row" // 중간보고서 지적사항 1행
  | "evaluator_comment" // 최종 평가보고서 평가위원 문단 1개
  | "checklist_group" // 자가진단 점검표 '구분' 묶음
  | "handbook_indicator" // 편람 지표·사업 정의
  | "qa_pair" // 실사 질문 + 답변
  | "qa_part" // 긴 답변을 나눈 부분(질문 반복)
  | "request_evidence" // 실사 요청자료 + 설명
  | "evidence_image" // 증빙 그림 쪽(제목·쪽만)
  | "task_list_row" // 과제관리카드 목록 1행(검색 제외, 대응표 전용)
  | "peer_case" // 붙임2 유관기관 평가보고서 정리 1행(★사례제안 원천, 관리 화면에서 올림)
  | "pool_indicator" // '25 주요사업 성과지표 Pool 지표 1개(정의·목표·산식·Pool 점수)
  | "goal_indicator" // '26~'30 중장기 목표지표 — 전략과제 1개 묶음
  | "ceo_indicator" // '24~'26 기관장 성과지표 — 성과목표 1개 묶음
  | "ax_task" // 2026 AX협의체 검토 과제·공모 아이디어 1건
  | "report_section" // 2025 경영실적보고서 평가내용2 소항목(가.·나.) 1개 — 경평 초안의 과거 실적·작성 방식 근거
  | "report_chapter" // 2025 경영실적보고서(경영관리) 절이 아닌 장 단위 조각(표지·지표관리 방향·지적사항 조치실적·전년 대비 주요 추진실적·성과분석 및 환류·가.보다 앞선 대주제 글)
  | "plan_section" // 관리계획 서술 Ⅰ('25 결과)·Ⅱ('26 변화·대응방향)의 □ 소제목 묶음
  | "core_item" // 핵심공통항목 KCA 작성본(경영관리, 지침 13 정합성 1의 수치 대조용) — 값은 `O / 4`처럼 복합 문자열 그대로(meta.role = "cross_check")
  | "corrective_action" // 2025 경영실적평가 지적사항 시정조치 계획 1행 — 지적사항 + 조치계획 쌍(기관이 약속한 계획이지 이행 실적이 아님)
  | "generic_section"; // 범용 조각기(5단계)가 제목·쪽 경계로 나눈 일반 문서 구간 — 꼬리표 최소(화면에서 올린 문서)

/** 주요사업 평가내용(계획·집행·성과·환류)과 공통지표 평가항목 */
export type EvalItem = "계획" | "집행" | "성과" | "환류" | "지표 적합성" | "목표 도전성";

export type Measure = "계량" | "비계량" | "가점";

export interface KnowledgeChunk {
  /** 안정 키. 다시 적재해도 같은 조각이면 같은 키 */
  chunk_key: string;
  doc_id: string;
  unit_type: UnitType;
  /** 문서 안 순서(0부터) */
  seq: number;
  track: Track;
  business: UnitId | null;
  eval_item: EvalItem | null;
  measure: Measure | null;
  q_type: string[];
  /** 사람이 읽는 짧은 제목(search_result title) */
  title: string;
  /** 조각 앞에 붙이는 결정적 머리말(문서·지표·평가내용·질문) */
  context_prefix: string;
  /** 인용 단위. search_result content의 text 블록 하나씩 */
  blocks: string[];
  /** 화면 표시·인용용 본문(blocks를 빈 줄로 이은 것) */
  text: string;
  /** 색인용 글자(정규화 + 표 선형화 + 머리말) */
  search_text: string;
  /** false면 검색 대상이 아님(예: 과제 목록) */
  searchable: boolean;
  pdf_page_start: number | null;
  pdf_page_end: number | null;
  printed_page: number | null;
  report_page_2025: number | null;
  dept_resp: string[];
  dept_coop: string[];
  /** 문서별 추가 정보(지적 번호, 계량지표, 등급 등) */
  meta: Record<string, unknown>;
}

export type CheckLevel = "error" | "warn";

export interface Check {
  name: string;
  level: CheckLevel;
  ok: boolean;
  expected?: unknown;
  actual?: unknown;
  note?: string;
}

export interface ParseResult {
  chunks: KnowledgeChunk[];
  checks: Check[];
  /** 파서가 뽑은 부가 자료(예: 과제 목록, 등급) */
  extras?: Record<string, unknown>;
}

export interface KnowledgeDocumentSpec {
  doc_id: string;
  title: string;
  /** resources/knowledge/ 아래 원본 파일 이름(`<doc_id>.<확장자>`) */
  file_name: string;
  /** resources/knowledge/_parsed/ 아래 kordoc 산출물 이름(확장자 제외, doc_id와 같음) */
  parsed_name: string;
  /** 기관이 준 원래 파일 이름 — 새 판이 오면 이 이름의 파일을 file_name으로 바꿔 둠 */
  original_name?: string;
  edition: string;
  published: string;
  issuer: string;
  basis_year: number;
  tracks: Track[];
  /** 이번 적재 범위 설명 */
  scope: string;
  status: "ingest" | "deferred";
  supersedes?: string | null;
}
