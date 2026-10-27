// 월간 점검표(inspections.result) — 성과관리팀 종합점검 지침(14 주요사업·13 경영관리)의 「AI 점검 결과」 양식. 순수 함수.
// 양식(biz14): □ AI 점검 총평(추진현황·개선방향·★사례제안) → □ 우수사례 벤치마킹 7대 축 → □ 평가위원 질의 패턴 분석 적용 → □ 정합성 점검.
// 양식(mgmt13): 위와 같고 정합성 표가 다르며(경영관리 카드 양식), 끝에 □ 자가진단 체크리스트 대조(5번째 블록 — 판정·집계에 안 넣음)가 붙습니다.
// 표의 구분·항목·정의는 지침 <출력구조> 문구 그대로 둡니다(양식 고정, 절대원칙 11). harness 테스트가 지침 사본과 글자까지 대조합니다.
// 판단은 충족·미흡만 세고, 기준 미확인·해당 없음은 어떤 숫자에도 넣지 않습니다(지침 <지식파일_그라운딩>).


import { BIZ_TRACK, MGMT_TRACK } from "../tracks/index.ts";

export const FORM_ID = BIZ_TRACK.inspectionForm;
export const MGMT_FORM_ID = MGMT_TRACK.inspectionForm;
/** 양식 id(biz14·mgmt13) — 저장된 점검표의 `form` */
export type FormId = string;

export const JUDGMENTS = ["충족", "미흡", "기준 미확인", "해당 없음"] as const;
export type Judgment = (typeof JUDGMENTS)[number];

export type TableKey = "axes" | "patterns" | "coherence";
/** 점검표 순서(판정은 정합성 → 7대축 → 질의패턴 → 총평 순으로 함) */
export const TABLE_KEYS: TableKey[] = ["axes", "patterns", "coherence"];

export interface FormRow {
  no: number;
  name: string;
  definition: string;
}

export interface FormTable {
  key: TableKey;
  /** □ 제목 */
  title: string;
  /** 속성·집계에 쓰는 짧은 이름(점검결과 DB 속성 「7대축 충족」 등) */
  short: string;
  /** 표 둘째 열 머리 */
  itemHeader: string;
  rows: FormRow[];
}

export const FORM_TABLES: Record<TableKey, FormTable> = {
  axes: {
    key: "axes",
    title: "우수사례 벤치마킹 7대 축",
    short: "7대축",
    itemHeader: "벤치마킹 축",
    rows: [
      { no: 1, name: "국민 출발점", definition: "기관 편의가 아닌 국민/기업의 수요와 불만에서 출발했는가?" },
      { no: 2, name: "달성률 3종 세트", definition: "계량지표를 [목표-실적-달성률+원인]으로 묶었는가?" },
      { no: 3, name: "장애요인 주도적 전환", definition: "외부 악재(리스크)를 대응 성과로 전환했는가?" },
      { no: 4, name: "OutCome 연결", definition: "실적이 국민의 체감 변화로 명확히 연결되는가?" },
      { no: 5, name: "추진과제 환류", definition: "지적사항 결과를 다음 계획에 유기적으로 반영했는가?" },
      { no: 6, name: "AI·디지털 전환", definition: "업무 방식에 AI디지털을 혁신적으로 도입했는가?" },
      { no: 7, name: "외부채널·협업", definition: "독단이 아닌 민·관 다자협력 거버넌스를 구축했는가?" },
    ],
  },
  patterns: {
    key: "patterns",
    title: "평가위원 질의 패턴 분석 적용",
    short: "질의패턴",
    itemHeader: "질의 패턴",
    rows: [
      { no: 1, name: "사전 설계·체계성", definition: "Plan이 있었나? 환경분석은? 기관전략·국정과제 연계성은?" },
      { no: 2, name: "국민 체감 환산", definition: "기관 자체 효율 말고 국민·기업이 체감한 효과는?" },
      { no: 3, name: "성과확산·지속성", definition: "일회성 한번 성공으로 끝? 전국 확대 또는 지속 계획은?" },
      { no: 4, name: "전년 지적 1:1 개선", definition: "작년 그 지적, 올해 어떻게 조치했나?" },
      { no: 5, name: "계량 수치의 함정", definition: "분모가 줄어들어 좋아보이는 착시 아닌가?" },
      { no: 6, name: "신규지표 정당성", definition: "왜 폐지하고 신설했나, 달성이 어려우니 바꾼건가?" },
      { no: 7, name: "실적 100% 포화", definition: "항상 만점인데 계량지표로서 한계 아닌가?" },
      { no: 8, name: "대표성 괴리", definition: "이 지표가 사업 과제를 대표하나?" },
    ],
  },
  coherence: {
    key: "coherence",
    title: "정합성 점검",
    short: "정합성",
    itemHeader: "점검 항목",
    rows: [
      {
        no: 1,
        name: "계량지표 연계·완결성",
        definition: "지표 구분 4종(중장기 경영목표/기관장 경영계약/주요사업 성과지표 Pool/대표 계량지표) 중 무엇과 연계되는지 체크됐고, 4열(‘25년 실적, ’26년 목표)이 단위와 함께 채워졌나?",
      },
      { no: 2, name: "전략 연계성", definition: "국정과제(정부정책) 번호·ESG(환경/사회/지배구조)·AI활용(AX협의체)이 기재됐나?" },
      { no: 3, name: "환류↔Plan 인과", definition: "경영평가 지적사항·‘25년 자체평가가 Plan 조치·개선방향과 연계성이 있나?" },
      { no: 4, name: "추진시기 표기", definition: "[Do]추진내용에 시기가 표기돼 진도 점검이 가능한가?" },
      { no: 5, name: "과제 성격·식별정보 정합성", definition: "고도화/신규, 단기/중장기 체크에 맞게 작성됐고, 대상사업·과제번호·예산(협약/자체)·투입인력이 기재됐나?" },
    ],
  },
};

/** 경영관리 양식(mgmt13, 지침 13): 7대축·질의패턴은 같고 정합성은 항목 1·2·3 이름과 다섯 행의 정의가 경영관리 카드 양식에 맞게 다름(4·5 항목 이름은 같음) */
export const MGMT_FORM_TABLES: Record<TableKey, FormTable> = {
  axes: FORM_TABLES.axes,
  patterns: FORM_TABLES.patterns,
  coherence: {
    ...FORM_TABLES.coherence,
    rows: [
      { no: 1, name: "계량지표 3요소", definition: "계량 성과지표에 지표명(단위)·'25년 실적·'26년 목표 3요소가 단위와 함께 채워졌나?" },
      { no: 2, name: "지적↔개선방안 대응", definition: "'25년 지적사항 각 항목에 '26년 개선방안이 1:1로 채워졌나?" },
      { no: 3, name: "환류↔개선방안 인과", definition: "'25년 자체평가 결과가 '26년 개선방안과 논리적으로 이어지나?" },
      { no: 4, name: "추진시기 표기", definition: "추진내용 소제목에 시기가 표기돼 진도 점검이 가능한가?" },
      { no: 5, name: "과제 성격·식별정보 정합성", definition: "고도화/신규, 단기/중장기 체크에 맞게 작성됐고, 과제번호(지표)·부서(팀)·관리자/작성자가 기재됐나?" },
    ],
  },
};

/** 점검표 양식 id에 맞는 표 정의(모르는 양식이면 주요사업) */
export const formTablesOf = (form?: FormId | null): Record<TableKey, FormTable> => (form === MGMT_FORM_ID ? MGMT_FORM_TABLES : FORM_TABLES);

/** □ AI 점검 총평 표의 행(구분 열 문구 그대로) */
export const OVERVIEW_ROWS = [
  { key: "status", label: "추진현황" },
  { key: "direction", label: "개선방향" },
  { key: "case", label: "★ 사례제안" },
] as const;
export type OverviewKey = (typeof OVERVIEW_ROWS)[number]["key"];

/** 총평 표 아래 주석 한 줄(양식 그대로) */
export const CASE_FOOTNOTE = "※ 산업진흥군(16개 기관) 평가보고서(붙임2) 참고, 해당 사항이 있을 때만 제안";
export const MGMT_CASE_FOOTNOTE = "※ 산업진흥군(16개 기관) 경영관리 평가보고서(붙임2) 참고, 해당 사항이 있을 때만 제안";
export const caseFootnote = (form?: FormId | null): string => (form === MGMT_FORM_ID ? MGMT_CASE_FOOTNOTE : CASE_FOOTNOTE);
/** 붙임2(유관기관 평가보고서 정리)가 없을 때 사례제안(지침 <지식파일_그라운딩> [지식파일 누락]) */
export const CASE_NO_SOURCE = "기준 미확인 — 붙임2 미확보";
export const NOTICE_NO_PEER = "지식파일 미확보: 붙임2";


/** ★핵심 3항목(집중보완 판정): 7대축 4 OutCome 연결 · 질의패턴 5 계량 수치의 함정 · 질의패턴 3 성과확산·지속성 */
export const STAR_ITEMS: ReadonlyArray<{ table: TableKey; no: number }> = [
  { table: "axes", no: 4 },
  { table: "patterns", no: 5 },
  { table: "patterns", no: 3 },
];

/** 점검월이 오지 않았으면(사전점검) 해당 없음으로 두는 항목(절대원칙 8): 7대축 ②④ · 질의패턴 ⑤ */
export const PRE_MONTH_ITEMS: ReadonlyArray<{ table: TableKey; no: number }> = [
  { table: "axes", no: 2 },
  { table: "axes", no: 4 },
  { table: "patterns", no: 5 },
];
export const PRE_MONTH_NOTE = "점검월 미도래(사전점검)";

export interface Evidence {
  /** 근거 지식파일명+위치(예: 관리계획 '25 평가보고서 · 주요사업1 · 성과 ⑦) */
  source: string;
  /** 「원문 인용」 — 원문 그대로 한 문장 이내 */
  quote: string;
  /** 지식 조각 키(앱이 원문과 대조). 사람이 적은 출처면 null */
  key: string | null;
  /** 원문 확인: true 확인 · false 다름 · null 대조 안 함 */
  verified: boolean | null;
}

export interface RowResult {
  judgment: Judgment | null;
  /** 질의패턴 미흡: 예상 질의 1문장 */
  question: string;
  /** 미흡: 보완(어느 칸에 무엇을) */
  fix: string;
  /** 미흡: 근거(지식파일명+위치, 원문) */
  evidence: Evidence[];
  /** 미흡: 카드 근거('칸 이름' — 현재 상태) */
  card: string;
  /** 기준 미확인: 필요 자료 / 해당 없음: 사유 / 충족인데 일부 요소만 기준 미확인: 그 메모 */
  note: string;
  /** 경영관리 양식: 내부관리형 보정을 적용한 행(7대축 1·4·질의패턴 2 중 판정한 것) — 보완방안 칸 맨 앞에 「[내부관리형 보정]」(절대원칙 9) */
  internal?: true;
  /** 경영관리 양식의 미흡 행에만: 주요사업 연계 후보 1~2건(지침 13 [붙임4 사용 규칙] ① — 붙임4 대신 원장 주요사업 카드, lib/inspections/biz-links.ts). 판정·집계에 안 넣음 */
  links?: BizLink[];
}

/** 주요사업 연계 후보 하나 — 과제명·원장 시점은 AI가 아니라 코드가 원장에서 채움(지어낸 과제 차단) */
export interface BizLink {
  /** 「주요사업N N-가」 */
  id: string;
  /** 원장 카드의 과제명 */
  title: string;
  /** 실적 요지(AI) */
  gist: string;
  /** 원장 시점(mgCardAsOf — 판 + 그 뒤 원장 수정) */
  asOf: string;
}

/** 행당 연계 후보 상한(지침: 1~2건) */
export const LINKS_PER_ROW = 2;
export const BIZ_TASK_RE = /^주요사업\d \d{1,2}-[가-힣]$/;

/** 「미흡 시 보완방안」 칸 끝에 붙는 한 줄(지침 13 [붙임4 사용 규칙] ①의 문구 — 붙임4 대신 원장 시점) */
export function linkText(l: BizLink): string {
  return `▸ 연계 후보: ${l.id} 「${l.title}」 — ${l.gist} [원장 ${l.asOf}], 담당부서 협의 후 경영관리 관점으로 재서술 검토`;
}

/** 자가진단 체크리스트 대조(경영관리 양식 5번째 블록)의 결과 — 예/부분/아니오, 붙임1에 KCA가 평가 대상이 아니라고 적힌 항목만 해당 없음 */
export const CHECKLIST_RESULTS = ["예", "부분", "아니오", "해당 없음"] as const;
export type ChecklistResult = (typeof CHECKLIST_RESULTS)[number];

export interface ChecklistRow {
  /** 구분: 지적은 「지적 N」, 착안사항은 「세부평가내용 번호-구분 번호」(예 ①-4) — 코드가 체크리스트 조각에서 붙임 */
  label: string;
  /** 점검사항 요지(체크리스트 문장을 한 줄로 줄인 것, 「」 인용 아님) */
  point: string;
  result: ChecklistResult | null;
  /** 반영과제: 답하는 카드의 과제번호, 없으면 「—」 */
  task: string;
  /** 비고: 예는 근거 카드 내용 한 줄, 부분·아니오는 「보완: 어느 칸에 무엇」, 해당 없음은 근거 쪽 */
  note: string;
}

export interface ChecklistBlock {
  /** 체크리스트 소분류 이름(표 위 한 줄에 씀. 예 「전략기획」) */
  sub: string;
  rows: ChecklistRow[];
  /** 같은 소분류의 항목 중 이 과제가 맡지 않아 다른 과제 점검표에 싣는 항목 수 */
  others: number;
}

export const CHECKLIST_TITLE = "자가진단 체크리스트 대조";
export const CHECKLIST_HEADERS = ["구분", "점검사항 요지", "결과", "반영과제", "비고"] as const;

export interface InspectionResult {
  form: FormId;
  overview: Record<OverviewKey, string>;
  axes: RowResult[];
  patterns: RowResult[];
  coherence: RowResult[];
  /** 경영관리 양식(mgmt13)에만 있음 — 7대축·질의패턴·정합성 판정·충족 수·미흡·보완 건수·집중보완 어디에도 안 넣음 */
  checklist?: ChecklistBlock;
  /** 운영 알림 — 성과관리팀만 봄(점검표 본문에는 넣지 않음, 지침 <Notion_조작> 결과 메시지) */
  notices: string[];
  /** AI 초안이면 모델·시각·근거 조각 수 */
  ai: { model: string; at: string; sources: number } | null;
}

export type InspectionStatus = "draft" | "sent" | "acknowledged";
export const STATUS_LABEL: Record<InspectionStatus | "none", string> = { none: "미작성", draft: "초안", sent: "보냄", acknowledged: "확인함" };

/** 점검결과 DB의 상태(지침 <Notion_조작> 3단계 3) */
export type JudgeStatus = "점검완료" | "보완요청" | "재점검필요";

export const emptyRow = (): RowResult => ({ judgment: null, question: "", fix: "", evidence: [], card: "", note: "" });

export const emptyChecklist = (): ChecklistBlock => ({ sub: "", rows: [], others: 0 });

/**
 * 점검표 쓰기 규칙(2026-10-10 개선 계획 P1-2): 초안(또는 새 점검표)은 저장·보내기, 보낸 점검표는 보내기 취소만, 부서가 확인한 점검표는 아무것도.
 * 예전에는 보낸 점검표를 「저장」하면 상태가 조용히 초안으로 돌아가 부서 화면에서 사라졌음(화면은 잠가 두지만 서버가 막지 않았음). 막으면 안내 문구, 되면 null
 */
export function inspectionWriteBlock(status: string | null, intent: "save" | "send" | "unsend"): string | null {
  if (status === "acknowledged") return "부서가 확인한 점검표는 고칠 수 없습니다.";
  if (status === "sent" && intent !== "unsend") return "부서에 보낸 점검표는 보내기를 취소한 뒤 고칠 수 있습니다.";
  return null;
}

export function emptyResult(form: FormId = FORM_ID): InspectionResult {
  const tables = formTablesOf(form);
  return {
    form,
    overview: { status: "", direction: "", case: "" },
    axes: tables.axes.rows.map(emptyRow),
    patterns: tables.patterns.rows.map(emptyRow),
    coherence: tables.coherence.rows.map(emptyRow),
    ...(form === MGMT_FORM_ID ? { checklist: emptyChecklist() } : {}),
    notices: [],
    ai: null,
  };
}

/** 점검표 칸 글자 한도 — 서버 정리(cleanRow·readEvidence·cleanChecklist·readResult)와 편집 화면 maxLength가 같은 값을 씀 */
export const INSPECTION_TEXT_MAX = {
  overview: 2000,
  question: 500,
  fix: 2000,
  card: 1000,
  note: 1000,
  evidenceSource: 300,
  evidenceQuote: 600,
  checklistPoint: 400,
  checklistTask: 40,
  checklistNote: 600,
} as const;
const TEXT_MAX = INSPECTION_TEXT_MAX;

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim().slice(0, max) : "");

/** 저장된 점검표 jsonb의 칸들(검증 전 — 모든 값이 믿을 수 없는 값이라 unknown) */
type Raw<K extends string> = { [P in K]?: unknown };
type RawEvidence = Raw<"source" | "quote" | "key" | "verified"> | null | undefined;
type RawRow = Raw<"judgment" | "question" | "fix" | "evidence" | "card" | "note" | "internal" | "links"> | null | undefined;
type RawChecklistRow = Raw<"label" | "point" | "result" | "task" | "note"> | null | undefined;
type RawChecklist = Raw<"sub" | "rows" | "others"> | null | undefined;
type RawLink = Raw<"id" | "title" | "gist" | "asOf"> | null | undefined;
interface RawResult {
  form?: unknown;
  overview?: Raw<"status" | "direction" | "case"> | null;
  axes?: unknown;
  patterns?: unknown;
  coherence?: unknown;
  checklist?: unknown;
  notices?: unknown;
  ai?: Raw<"model" | "at" | "sources"> | null;
}

function readEvidence(raw: unknown): Evidence[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawEvidence[])
    .map((e) => ({
      source: str(e?.source, TEXT_MAX.evidenceSource),
      quote: str(e?.quote, TEXT_MAX.evidenceQuote).replace(/^「|」$/g, ""),
      key: typeof e?.key === "string" && e.key.trim() ? e.key.trim().slice(0, 200) : null,
      verified: typeof e?.verified === "boolean" ? e.verified : null,
    }))
    .filter((e) => e.source || e.quote)
    .slice(0, 4);
}

const oneLineText = (s: string) => s.replace(/\s*\n\s*/g, " ");

/** 저장된 연계 후보 읽기: 「주요사업N N-가」 번호만, 같은 번호는 한 번, 행당 2건(옛 점검표는 links가 없어 빈 목록) */
function readLinks(raw: unknown): BizLink[] {
  if (!Array.isArray(raw)) return [];
  const out: BizLink[] = [];
  for (const l of raw as RawLink[]) {
    const id = str(l?.id, 40);
    if (!BIZ_TASK_RE.test(id) || out.some((x) => x.id === id)) continue;
    out.push({ id, title: str(l?.title, 200), gist: oneLineText(str(l?.gist, 400)), asOf: str(l?.asOf, 80) });
    if (out.length >= LINKS_PER_ROW) break;
  }
  return out;
}

/** 판단에 따라 칸을 정리: 충족은 메모만, 미흡은 보완·근거·카드(질의패턴은 예상 질의도)·연계 후보, 기준 미확인·해당 없음은 사유만 */
export function cleanRow(table: TableKey, input: unknown): RowResult {
  const raw = input as RawRow;
  const judgment = JUDGMENTS.includes(raw?.judgment as Judgment) ? (raw?.judgment as Judgment) : null;
  const row: RowResult = {
    judgment,
    question: str(raw?.question, TEXT_MAX.question),
    fix: str(raw?.fix, TEXT_MAX.fix),
    evidence: readEvidence(raw?.evidence),
    card: str(raw?.card, TEXT_MAX.card),
    note: str(raw?.note, TEXT_MAX.note),
  };
  const internal = raw?.internal === true && (judgment === "충족" || judgment === "미흡") ? ({ internal: true } as const) : {};
  const links = readLinks(raw?.links);
  if (judgment === "미흡") return { ...row, question: table === "patterns" ? row.question : "", note: "", ...internal, ...(links.length ? { links } : {}) };
  if (judgment === null) return row;
  return { ...emptyRow(), judgment, note: row.note, ...internal };
}

/** 내부관리형 보정(절대원칙 9)을 적용하는 행: 7대축 1 국민 출발점·4 OutCome 연결, 질의패턴 2 국민 체감 환산 */
export const INTERNAL_ITEMS: ReadonlyArray<{ table: TableKey; no: number }> = [
  { table: "axes", no: 1 },
  { table: "axes", no: 4 },
  { table: "patterns", no: 2 },
];
export const INTERNAL_TAG = "[내부관리형 보정]";

const checklistText = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s*\n\s*/g, " ").trim().slice(0, max) : "");

/** 체크리스트 대조 블록 정리: 행은 120개까지, 결과는 예·부분·아니오·해당 없음만 */
export function cleanChecklist(input: unknown): ChecklistBlock {
  const raw = input as RawChecklist;
  const rows: ChecklistRow[] = Array.isArray(raw?.rows)
    ? (raw.rows as RawChecklistRow[])
        .map((r): ChecklistRow => ({
          label: checklistText(r?.label, 40),
          point: checklistText(r?.point, TEXT_MAX.checklistPoint),
          result: CHECKLIST_RESULTS.includes(r?.result as ChecklistResult) ? (r?.result as ChecklistResult) : null,
          task: checklistText(r?.task, TEXT_MAX.checklistTask),
          note: checklistText(r?.note, TEXT_MAX.checklistNote),
        }))
        .filter((r) => r.label || r.point)
        .slice(0, 120)
    : [];
  return { sub: checklistText(raw?.sub, 80), rows, others: Number.isFinite(Number(raw?.others)) ? Math.max(0, Math.min(500, Math.trunc(Number(raw?.others)))) : 0 };
}

/** 저장된 결과를 양식에 맞춰 읽기(주요사업 biz14·경영관리 mgmt13). 다른 양식(옛 자가진단 12문항 등)은 빈 점검표로 */
export function readResult(input: unknown): InspectionResult {
  const raw = input as RawResult | null | undefined;
  const form = raw?.form === MGMT_FORM_ID ? MGMT_FORM_ID : FORM_ID;
  const base = emptyResult(form);
  if (!raw || typeof raw !== "object" || (raw.form !== FORM_ID && raw.form !== MGMT_FORM_ID)) return emptyResult();
  const tables = formTablesOf(form);
  const rows = (table: TableKey) => tables[table].rows.map((_, i) => cleanRow(table, Array.isArray(raw[table]) ? (raw[table] as unknown[])[i] : null));
  return {
    form,
    overview: { status: str(raw.overview?.status, TEXT_MAX.overview), direction: str(raw.overview?.direction, TEXT_MAX.overview), case: str(raw.overview?.case, TEXT_MAX.overview) },
    axes: rows("axes"),
    patterns: rows("patterns"),
    coherence: rows("coherence"),
    ...(base.checklist ? { checklist: cleanChecklist(raw.checklist) } : {}),
    notices: Array.isArray(raw.notices) ? (raw.notices as unknown[]).map((n: unknown) => str(n, 300)).filter(Boolean).slice(0, 20) : [],
    ai:
      raw.ai && typeof raw.ai === "object" && typeof raw.ai.model === "string"
        ? { model: raw.ai.model.slice(0, 120), at: String(raw.ai.at ?? "").slice(0, 40), sources: Number(raw.ai.sources) || 0 }
        : null,
  };
}

/** 새 점검표: 붙임2(사례 조각)가 공통 지식에 없으면 사례제안을 미리 「기준 미확인 — 붙임2 미확보」로 */
export function newResult(peerReady: boolean, form: FormId = FORM_ID): InspectionResult {
  const r = emptyResult(form);
  if (!peerReady) r.overview.case = CASE_NO_SOURCE;
  return r;
}

/** 저장 전 정리(양식 밖 값은 버림). 양식은 보낸 값이 아니라 호출한 쪽이 카드 트랙으로 정함 */
export function cleanResult(input: unknown, form: FormId = FORM_ID): InspectionResult {
  return readResult({ ...(input && typeof input === "object" ? input : {}), form });
}

/** 「7대축 4 OutCome 연결」 */
export function rowLabel(table: TableKey, no: number, form?: FormId | null): string {
  const t = formTablesOf(form)[table];
  const row = t.rows.find((r) => r.no === no);
  return `${t.short} ${no} ${row?.name ?? ""}`.trim();
}

export interface TableTally {
  /** 충족 행 수(점검결과 DB 「7대축 충족」 등) */
  met: number;
  total: number;
  /** 미흡 행의 항목명(점검결과 DB 「7대축 미흡」 multi_select) */
  weak: string[];
  unknown: number;
  na: number;
  blank: number;
}

export interface Tally {
  tables: Record<TableKey, TableTally>;
  /** 보완 건수 = 미흡 행 수 합 */
  needs: number;
  /** 판정 가능한(기준 미확인·해당 없음 제외) ★ 항목 수와 그중 미흡 */
  stars: { judged: number; weak: string[] };
  /** 집중보완: 판정 가능한 ★ 중 2개 이상 미흡 */
  focus: boolean;
  /** ★ 항목을 모두 판단했는데 판정 가능한 ★가 1개 이하일 때 운영 알림 사유 */
  focusNote: string | null;
}

export function tally(res: Pick<InspectionResult, TableKey> & { form?: FormId }): Tally {
  const tables = {} as Record<TableKey, TableTally>;
  const defs = formTablesOf(res.form);
  for (const key of TABLE_KEYS) {
    const rows = res[key] ?? [];
    const t: TableTally = { met: 0, total: defs[key].rows.length, weak: [], unknown: 0, na: 0, blank: 0 };
    defs[key].rows.forEach((f, i) => {
      const j = rows[i]?.judgment ?? null;
      if (j === "충족") t.met += 1;
      else if (j === "미흡") t.weak.push(f.name);
      else if (j === "기준 미확인") t.unknown += 1;
      else if (j === "해당 없음") t.na += 1;
      else t.blank += 1;
    });
    tables[key] = t;
  }
  const judged: string[] = [];
  const weak: string[] = [];
  for (const s of STAR_ITEMS) {
    const j = res[s.table]?.[s.no - 1]?.judgment;
    if (j === "충족" || j === "미흡") judged.push(rowLabel(s.table, s.no, res.form));
    if (j === "미흡") weak.push(rowLabel(s.table, s.no, res.form));
  }
  const unjudged = STAR_ITEMS.filter((s) => {
    const j = res[s.table]?.[s.no - 1]?.judgment;
    return j !== "충족" && j !== "미흡";
  }).map((s) => `${rowLabel(s.table, s.no, res.form)}(${res[s.table]?.[s.no - 1]?.judgment ?? "미판정"})`);
  return {
    tables,
    needs: TABLE_KEYS.reduce((n, k) => n + tables[k].weak.length, 0),
    stars: { judged: judged.length, weak },
    focus: weak.length >= 2,
    // ★ 항목을 아직 판단하지 않았으면(작성 중) 알림을 내지 않음
    focusNote: judged.length <= 1 && STAR_ITEMS.every((s) => res[s.table]?.[s.no - 1]?.judgment) ? `판정 가능한 ★가 ${judged.length}개라 집중보완 아님 — ${unjudged.join(", ")}` : null,
  };
}

/** 미흡 행 수(목록 표시) */
export function needsCount(res: Pick<InspectionResult, TableKey> | null | undefined): number {
  if (!res) return 0;
  return TABLE_KEYS.reduce((n, k) => n + (res[k] ?? []).filter((r) => r?.judgment === "미흡").length, 0);
}

/** 개선방향 줄(논지 1개 = 1줄, 줄머리 ★) */
export function directionLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** 보내기 전·재점검 판단에 걸리는 곳(첫째가 가장 급함) */
export function problems(res: InspectionResult): string[] {
  const out: string[] = [];
  const t = tally(res);
  const blank = TABLE_KEYS.reduce((n, k) => n + t.tables[k].blank, 0);
  if (blank) out.push(`판단하지 않은 항목이 ${blank}개 있습니다.`);
  for (const key of TABLE_KEYS) {
    res[key].forEach((r, i) => {
      const label = rowLabel(key, i + 1, res.form);
      if (r.judgment === "미흡") {
        if (key === "patterns" && !r.question) out.push(`${label}: 미흡이면 예상 질의를 적어 주세요.`);
        if (!r.fix) out.push(`${label}: 미흡이면 보완을 적어 주세요.`);
        if (!r.evidence.some((e) => e.quote)) out.push(`${label}: 미흡이면 근거 원문(「」)을 적어 주세요(원문이 없으면 기준 미확인).`);
        if (!r.card) out.push(`${label}: 미흡이면 카드 근거를 적어 주세요.`);
      } else if ((r.judgment === "기준 미확인" || r.judgment === "해당 없음") && !r.note) {
        out.push(`${label}: ${r.judgment} 사유를 적어 주세요.`);
      }
    });
  }
  if (!res.overview.status) out.push("총평 추진현황을 적어 주세요.");
  if (t.needs > 0 && !res.overview.direction) out.push("총평 개선방향을 적어 주세요.");
  return out;
}

/** 체크리스트 대조에서 결과를 정하지 않은 행 수(경영관리 양식) — 판정·집계에는 안 넣고 보내기 전 확인에만 씀 */
export function checklistBlank(res: Pick<InspectionResult, "checklist">): number {
  return (res.checklist?.rows ?? []).filter((r) => !r.result).length;
}

/** 보내기 전 확인: 막히는 문제들(첫째가 가장 급함) — 판정 문제(problems) + 체크리스트 대조 미정 */
export function sendProblems(res: InspectionResult): string[] {
  const blank = checklistBlank(res);
  return [...problems(res), ...(blank ? [`자가진단 체크리스트 대조에서 결과를 정하지 않은 항목이 ${blank}개 있습니다.`] : [])];
}

/** 보내기 전 확인: 막히는 첫 문제 */
export function readyToSend(res: InspectionResult): string | null {
  return sendProblems(res)[0] ?? null;
}

/** 원문과 다른(대조했는데 못 찾은) 인용 수 */
export function unverifiedCount(res: Pick<InspectionResult, TableKey>): number {
  return TABLE_KEYS.reduce((n, k) => n + (res[k] ?? []).reduce((m, r) => m + (r?.judgment === "미흡" ? r.evidence.filter((e) => e.verified === false).length : 0), 0), 0);
}

/** 점검결과 DB 상태: 판단이 덜 됐거나 미흡 근거가 모자라면 재점검필요, 미흡이 있으면 보완요청, 없으면 점검완료 */
export function judgeStatus(res: InspectionResult): JudgeStatus {
  const p = problems(res).filter((x) => !x.startsWith("총평"));
  if (p.length || unverifiedCount(res) > 0) return "재점검필요";
  return needsCount(res) > 0 ? "보완요청" : "점검완료";
}

/** 근거 한 줄: 「붙임1 ○○ 「원문」」 형식(지침 [미흡 시 보완방안 칸 작성법]) */
export function evidenceText(e: Evidence): string {
  return [e.source, e.quote ? `「${e.quote}」` : ""].filter(Boolean).join(" ");
}

/** 「미흡 시 보완방안」 칸 글(지침 형식, <br> 대신 줄바꿈) */
export function remedyText(table: TableKey, r: RowResult): string {
  switch (r.judgment) {
    case "충족":
      return `${r.note ? `— (${r.note})` : "—"}${r.internal ? ` ${INTERNAL_TAG}` : ""}`;
    case "미흡": {
      const lines: string[] = r.internal ? [INTERNAL_TAG] : [];
      if (table === "patterns" && r.question) lines.push(`▸ 예상 질의: ${r.question}`);
      if (r.fix) lines.push(`▸ 보완: ${r.fix}`);
      if (r.evidence.length) lines.push(`▸ 근거: ${r.evidence.map(evidenceText).join(" + ")}`);
      if (r.card) lines.push(`▸ 카드: ${r.card}`);
      for (const l of r.links ?? []) lines.push(linkText(l));
      return lines.join("\n");
    }
    case "기준 미확인":
      return r.note.startsWith("기준 미확인") ? r.note : `기준 미확인 — 지식파일에 판정 기준 없음(필요 자료: ${r.note || "—"})`;
    case "해당 없음":
      return r.note.startsWith("해당 없음") ? r.note : `해당 없음 — ${r.note || "—"}`;
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// 점검 결과 보기 양식(성과관리팀 「과제관리카드 AI 컨설팅 결과(노션) 화면 예시」 = 지침 14 <출력구조>)

export const CONSULT_TITLE = "과제관리카드 AI 컨설팅 결과";
export const CONSULT_ISSUER = "경영기획본부 성과관리팀";
/** 표 열 폭(지침 <출력구조> colgroup 40/140/220/70/430 = 900) */
export const FORM_COL_WIDTHS = [40, 140, 220, 70, 430] as const;

/** 머리 날짜 줄: < '26. 9. 16.(수), 경영기획본부 성과관리팀 > (서울 시각) */
export function consultDateLine(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "2-digit", month: "numeric", day: "numeric", weekday: "short" }).formatToParts(d).map((p) => [p.type, p.value]));
  return `< ’${parts.year}. ${parts.month}. ${parts.day}.(${parts.weekday}), ${CONSULT_ISSUER} >`;
}

/** 총평 줄(예시 양식): ○ (추진현황) · ○ (개선방향 — ★ 줄마다) · ★ (사례제안) */
export function overviewLines(res: InspectionResult): Array<{ mark: "○" | "★"; label: string; lines: string[] }> {
  const text = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean);
  return [
    { mark: "○", label: "추진현황", lines: text(res.overview.status) },
    { mark: "○", label: "개선방향", lines: directionLines(res.overview.direction) },
    { mark: "★", label: "사례제안", lines: text(res.overview.case) },
  ];
}

/** 표 한 줄: 구분·항목·정의(양식 문구 그대로) + 판단·미흡 시 보완방안(이 과제의 결과) */
export interface FormRowView {
  no: number;
  name: string;
  definition: string;
  judgment: Judgment | "";
  remedy: string;
}
export function formRows(res: InspectionResult, table: TableKey): FormRowView[] {
  return formTablesOf(res.form)[table].rows.map((f, i) => {
    const r = res[table][i];
    return { no: f.no, name: f.name, definition: f.definition, judgment: r?.judgment ?? "", remedy: r ? remedyText(table, r) : "" };
  });
}

/** 체크리스트 대조 결과 건수(항목 수·예·부분·아니오·해당 없음·미정) — 판정·집계(충족 수·미흡·보완 건수·집중보완)와 별개 */
export function checklistCounts(block: ChecklistBlock | undefined | null): { total: number; yes: number; partial: number; no: number; na: number; blank: number } {
  const rows = block?.rows ?? [];
  const n = (r: ChecklistResult) => rows.filter((x) => x.result === r).length;
  return { total: rows.length, yes: n("예"), partial: n("부분"), no: n("아니오"), na: n("해당 없음"), blank: rows.filter((x) => !x.result).length };
}

/** 구분 라벨들을 한 줄 담당 범위로: 같은 라벨은 한 번만, 입력 순서대로 「 · 」로 이음 */
export function checklistScope(block: ChecklistBlock | undefined | null): string {
  return [...new Set((block?.rows ?? []).map((r) => r.label).filter(Boolean))].join(" · ");
}

/** 표 위 한 줄(지침 <출력구조>): 체크리스트 위치 · 담당 범위 · 항목 수와 결과 건수 · 계획 포함 기준 · 나머지 항목 안내 */
export function checklistIntro(block: ChecklistBlock | undefined | null): string {
  const c = checklistCounts(block);
  const scope = checklistScope(block);
  const counts = `예 ${c.yes} · 부분 ${c.partial} · 아니오 ${c.no}${c.na ? ` · 해당 없음 ${c.na}` : ""}`;
  const tail = `카드에 계획이 있으면 실적이 없어도 '예'로 판단${block?.others ? ` / 나머지 ${block.others}개 항목은 같은 지표의 다른 과제 점검표 참조` : ""}`;
  return `붙임1 '26 자가진단 체크리스트${block?.sub ? ` (${block.sub})` : ""}${scope ? ` 중 ${scope}` : ""} — ${c.total}개 항목: ${counts} (${tail})`;
}

/** 점검월(YYYY-MM)이 기준 달보다 뒤면 사전점검 */
export function isPreMonth(period: string, current: string): boolean {
  return period > current;
}

/** 사전점검이면 7대축 2·4, 질의패턴 5를 해당 없음으로(절대원칙 8). 그 밖은 그대로 */
export function applyPreMonth(res: InspectionResult): InspectionResult {
  const next = { ...res, axes: [...res.axes], patterns: [...res.patterns], coherence: [...res.coherence] };
  for (const s of PRE_MONTH_ITEMS) next[s.table][s.no - 1] = { ...emptyRow(), judgment: "해당 없음", note: PRE_MONTH_NOTE };
  return next;
}

// ---------------------------------------------------------------------------
// 최종 점검현황 — 지침 14 「AI 컨설팅」 = 점검월이 가장 늦은 점검표 1건. 이 앱에서는 부서에 보낸·확인한 것만 최종(초안은 최종이 아님)

/** 목록용 판정 요약: 점검표를 저장할 때 result.summary로 함께 둠(목록이 점검표 전체를 읽지 않게 — 파생 값) */
export interface InspectionSummary {
  verdict: JudgeStatus;
  needs: number;
}

export function inspectionSummary(res: InspectionResult): InspectionSummary {
  return { verdict: judgeStatus(res), needs: needsCount(res) };
}

const VERDICTS: readonly JudgeStatus[] = ["점검완료", "보완요청", "재점검필요"];
export const isVerdict = (v: unknown): v is JudgeStatus => VERDICTS.includes(v as JudgeStatus);

/** 한 과제의 점검들 → 최종(보낸·확인한 것 중 점검월이 가장 늦은 1건)과 그보다 늦은 초안(최종이 없으면 가장 늦은 초안) */
export function finalInspection<T extends { period: string; status: string }>(rows: readonly T[]): { final: T | null; draft: T | null } {
  const late = (a: T | null, b: T) => (!a || b.period > a.period ? b : a);
  let final: T | null = null;
  let draft: T | null = null;
  for (const r of rows) {
    if (r.status === "sent" || r.status === "acknowledged") final = late(final, r);
    else if (r.status === "draft") draft = late(draft, r);
  }
  if (draft && final && draft.period <= final.period) draft = null;
  return { final, draft };
}

/** 목록 「AI 컨설팅」 칸 */
export interface FinalInspectionView {
  period: string;
  status: InspectionStatus;
  verdict: JudgeStatus | null;
  /** 점검월이 기준 달보다 뒤(사전점검) */
  pre: boolean;
  /** 최종보다 늦은 초안의 점검월(최종이 없으면 초안만) — 성과관리팀에게만 보임(부서는 RLS로 초안이 안 옴) */
  draftPeriod: string | null;
  /** 칸 글: 「9월 보완요청 · 확인」, 사전점검 「10월 사전 점검완료 · 보냄」, 초안만이면 「9월 초안」 */
  text: string;
  /** 풀어 쓴 글(칸 title·CSV) */
  title: string;
}

const month = (p: string) => `${Number(p.slice(5))}월`;
const fullMonth = (p: string) => `${p.slice(0, 4)}년 ${Number(p.slice(5))}월`;

export function finalInspectionView(
  final: { period: string; status: string; verdict?: JudgeStatus | null } | null,
  draft: { period: string } | null,
  current: string,
): FinalInspectionView | null {
  if (!final && !draft) return null;
  const draftNote = draft ? `${fullMonth(draft.period)} 점검 초안 작성 중(부서에 보내기 전)` : "";
  if (!final) {
    const p = draft!.period;
    return { period: p, status: "draft", verdict: null, pre: isPreMonth(p, current), draftPeriod: p, text: `${month(p)} 초안`, title: draftNote };
  }
  const status = final.status as InspectionStatus;
  const pre = isPreMonth(final.period, current);
  const verdict = final.verdict ?? null;
  const short = status === "acknowledged" ? "확인" : "보냄";
  const text = `${month(final.period)}${pre ? " 사전" : ""}${verdict ? ` ${verdict}` : ""} · ${short}`;
  const title = [`최종 점검: ${fullMonth(final.period)}${pre ? "(사전점검)" : ""}${verdict ? ` · ${verdict}` : ""} · ${status === "acknowledged" ? "부서 확인함" : "부서에 보냄(확인 전)"}`, draftNote].filter(Boolean).join(" / ");
  return { period: final.period, status, verdict, pre, draftPeriod: draft?.period ?? null, text, title };
}
