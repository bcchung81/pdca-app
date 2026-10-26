// AI 요청을 기다리는 동안의 진행 줄(components/workspace/ai-progress.tsx)의 글과 셈(순수) — 과제원장 「AI 작성지원」·경평 초안 「AI 초안」이 함께 씀.
// 서버가 단계를 알려 주지 않으므로 단계·진행률은 지어내지 않습니다: 경과 시간과 「보통 걸리는 시간」만 보이고, 넘기면 「조금 더 걸리고 있습니다」.
// 「넣은 근거」는 서버 액션이 실제로 넣는 자료만 적습니다 — 과제원장은 app/(app)/cards/actions.ts(runCardAssist·runCardChat의 loadCardBundle — 규칙 범위 전부,
// 선별 방식이 적용되는 기능은 getCardSelectPreview가 미리 알려 준 고른 수로 「공통 규칙 문서 + 고른 자료 + 제목 목록」),
// 경평 초안은 app/(app)/reports/cards/draft-prepare.ts(prepareDraft — 고른 근거, 구성안대로 집필은 구성안에 저장된 근거, 선별 방식이면 getReportSelectPreview가 알려 준 고른 수). 자료 범위가 바뀌면 여기도 함께 고칩니다.
import { CHAT_LIMITS } from "./chat.ts";
import { WRITER_MODES, type WriterMode } from "./writer.ts";

/** 근거 하나(짧은 이름) + 펼쳤을 때 설명 */
export interface ProgressSource {
  label: string;
  detail: string;
}

/** 보통 걸리는 시간(초) */
export interface ProgressExpect {
  min: number;
  max: number;
}

export interface ProgressSpec {
  /** 「개선 제안 쓰는 중」 */
  title: string;
  expect: ProgressExpect;
  sources: ProgressSource[];
}

/** 경과 시간 m:ss */
export function fmtElapsed(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const secLabel = (s: number) => (s % 60 === 0 ? `${s / 60}분` : s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${s % 60}초`);

/** 「보통 30초~2분」 · 「보통 1~3분」(둘 다 분이면 앞의 「분」을 뺌) */
export function expectLabel(e: ProgressExpect): string {
  if (e.min % 60 === 0 && e.max % 60 === 0) return `보통 ${e.min / 60}~${e.max / 60}분`;
  return `보통 ${secLabel(e.min)}~${secLabel(e.max)}`;
}

/** 보통 걸리는 시간을 넘겼는지 */
export const overdue = (sec: number, e: ProgressExpect) => sec > e.max;

// ---------------------------------------------------------------------------
// 과제원장 「AI 작성지원」

/** 요청 종류·질문 모두 「보통 30초~2분」(예전 표시 그대로) */
export const ASSIST_EXPECT: ProgressExpect = { min: 30, max: 120 };
/** 월간 점검 AI 초안 한 건 — 2026-10 실측 출력 5.0~5.9만 토큰(로컬 CLI 약 6~7분, effort xhigh) */
export const INSPECT_EXPECT: ProgressExpect = { min: 300, max: 480 };
/** 보완 점검(미흡 행마다 답) — 실측 CLI 4행 117초 · 20행 248초 */
export const FOLLOWUP_EXPECT: ProgressExpect = { min: 60, max: 240 };

/**
 * 카드 AI 작성지원 한 요청의 진행 줄.
 * files = 이 요청에 고른 카드 전용 자료 이름, history = 이 요청 전에 받은 답 수(질문만 — 서버는 최근 CHAT_LIMITS.turns 글, 곧 그 절반 차례까지 받음)
 */
/** 규칙 범위(lib/knowledge/bundle.ts) 전부를 가리키는 공통 문구 — 요청 종류와 상관없이 늘 같음 */
const KNOWLEDGE_SCOPE_DETAIL = "규칙 범위 전부 — 기관 공통(관리계획 서술·점검표·편람·중장기·기관장 지표·AX·붙임2 B+·B0) · 공통지표·사업 미지정 실사 · 이 사업의 지적·실사·Pool·편람·2025 보고서 절 (이 과제와 글이 닮은 순 앞 30건은 목록으로 함께 알림)";

/** 선별 방식이 실제로 적용된 요청의 공통 지식(lib/knowledge/select.ts applySelection) — picked = 이 과제에 고른 사례류 원문 수(과제 연결 포함) */
const selectedScopeDetail = (picked: number) =>
  `선별 방식 — 공통 규칙 문서(트랙 공통·이 사업의 조항·기준을 정리한 글) + 이 과제에 고른 자료 ${picked}건(지적·실사·2025 보고서 절·사례 원문, 과제 연결 포함) + 나머지 지적·실사·보고서 절·사례는 제목 목록 · 그 밖의 범위(실적 근거 등)는 원문 그대로`;

/** selected = 이 요청에 선별 방식이 실제로 적용될 때 고른 원문 수(서버 getCardSelectPreview — 없으면 통째로 넣기) */
export function assistProgress(mode: WriterMode | "chat", o: { files: string[]; history?: number; selected?: number }): ProgressSpec {
  const sources: ProgressSource[] = [{ label: "카드", detail: "편집기에 지금 보이는 카드(부서 담당자는 이달 작성본)" }];
  if (o.files.length) sources.push({ label: `첨부 ${o.files.length}건`, detail: o.files.join(" · ") });
  sources.push({ label: "공통 지식", detail: o.selected === undefined ? KNOWLEDGE_SCOPE_DETAIL : selectedScopeDetail(o.selected) });
  if (mode === "followup") sources.push({ label: "최종 점검표", detail: "부서에 보낸·확인한 점검 중 점검월이 가장 늦은 1건의 미흡 항목(없으면 AI 없이 안내)" });
  if (mode === "chat") {
    const turns = Math.min(o.history ?? 0, CHAT_LIMITS.turns / 2);
    sources.push({ label: "최종 점검표", detail: "부서에 보낸·확인한 점검 중 점검월이 가장 늦은 1건(없으면 없음)" });
    if (turns > 0) sources.push({ label: `앞 대화 ${turns}차례`, detail: `이 탭의 앞 요청·답 — 최근 ${CHAT_LIMITS.turns / 2}차례·${(CHAT_LIMITS.history / 10_000).toLocaleString("ko-KR")}만 자까지` });
    return { title: "질문에 답하는 중", expect: ASSIST_EXPECT, sources };
  }
  return { title: `${WRITER_MODES[mode].short} 쓰는 중`, expect: mode === "followup" ? FOLLOWUP_EXPECT : ASSIST_EXPECT, sources };
}

// ---------------------------------------------------------------------------
// 경평 초안 「AI 초안」

/**
 * outline = 구성안 만들기 · story = 고른 짜임(틀·구성 패턴·예시 절)으로 구성안 다시 짜기 · again = 메모 반영해 구성안 다시 만들기
 * plan = 구성안대로 집필(승인하고 집필) · draft = 구성안 없이 바로 만들기 · alts = 다른 짜임 여러 안(구성안 N번을 동시에 — 저장 안 함, 2026-10-12)
 */
export type DraftRunKind = "outline" | "story" | "again" | "plan" | "draft" | "alts";

/** 구성안을 만드는 요청(끝나면 구성안 머리로 옮김) */
export const OUTLINE_RUNS = new Set<DraftRunKind>(["outline", "story", "again"]);

// 보통 걸리는 시간(2026-10-10 로컬 CLI 실측, 경평 effort high — B4 사용자 결정 뒤): 주요사업 구성안 69~175초(같은 9장 라운드 Z), 구성안대로 집필(고치기 포함) 45~121초,
// 바로 만들기 196초(1차 102 + 고치기 57 + 판면만 한 번 더 38), 경영관리 구성안 108·150초·집필 89·99초. 예전 xhigh 때는 구성안 226~535초·바로 만들기 632~787초였음
const DRAFT_EXPECT: Record<DraftRunKind, ProgressExpect> = {
  outline: { min: 60, max: 240 },
  story: { min: 60, max: 240 },
  again: { min: 60, max: 240 },
  plan: { min: 60, max: 180 },
  draft: { min: 120, max: 300 },
  // 여러 안은 동시에 불러 가장 늦은 안을 기다림 — 구성안 한 번의 범위 위쪽을 조금 넓힘(실측 전 어림)
  alts: { min: 60, max: 300 },
};
const DRAFT_EXPECT_MG: Partial<Record<DraftRunKind, ProgressExpect>> = {
  outline: { min: 60, max: 240 },
  story: { min: 60, max: 240 },
  again: { min: 60, max: 240 },
  plan: { min: 60, max: 180 },
};

/** 경평 초안 요청의 보통 걸리는 시간(진행 줄·단추 글이 함께 씀) */
export const draftExpect = (kind: DraftRunKind, mg = false): ProgressExpect => (mg ? DRAFT_EXPECT_MG[kind] : undefined) ?? DRAFT_EXPECT[kind];
/** 단추·안내 글의 시간(「5~8분」 — 「보통」 없이) */
export const rangeText = (e: ProgressExpect) => expectLabel(e).replace(/^보통 /, "");
const DRAFT_TITLE: Record<DraftRunKind, string> = {
  outline: "구성안 만드는 중",
  story: "고른 짜임으로 구성안 짜는 중",
  again: "구성안 다시 만드는 중",
  plan: "구성안대로 초안 쓰는 중",
  draft: "초안 쓰는 중",
  alts: "여러 안을 동시에 짜는 중",
};

/** 경평 초안 진행 줄의 공통 지식 — selected가 없으면 예전 「공통 지식 전체」 그대로, 있으면 선별 방식 문구. 방법론은 선별 대상이 아니라(chunk-role method) 둘 다 원문 그대로 */
function reportKnowledge(selected: number | undefined, tail = ""): ProgressSource {
  const method = "경평 초안 작성 방법론(특강·강의 — 글 쓰는 방식의 참고)";
  return selected === undefined
    ? { label: "공통 지식 전체", detail: `${KNOWLEDGE_SCOPE_DETAIL} · ${method}${tail}` }
    : { label: "공통 지식", detail: `${selectedScopeDetail(selected)} · ${method}${tail}` };
}

/**
 * 경평 초안 과제별 초안 한 요청의 진행 줄.
 * 근거(서버 prepareDraft): 원장 카드·올해 계량 실적(늘) + 첨부(카드 전용 자료·보고서 추가자료 이름) + 전년 보고서 같은 과제 절(이름) + 평가 기준·평가위원 관점 수(공통 지식에서 자동).
 * plan·story·again은 구성안에 저장된 근거로 씁니다(부르는 쪽이 그 근거를 넘김 — 근거 기록이 없는 옛 구성안이면 첨부 없이 전년 절은 자동).
 */
export function draftProgress(
  kind: DraftRunKind,
  o: {
    files: string[];
    prior: string[];
    lens: number;
    inspection?: string | null;
    mg?: boolean;
    /** 고른 구성 패턴·2025 예시 절 이름(구성안 요청) */
    frame?: { pattern?: string; example?: string };
    /** 여러 안 수(alts) */
    alts?: number;
    /** 선별 방식이 실제로 적용될 때 고른 원문 수(서버 getReportSelectPreview — 없으면 통째로 넣기) */
    selected?: number;
  },
): ProgressSpec {
  const sources: ProgressSource[] = [
    { label: "카드", detail: "확정 과제관리카드(원장)" },
    { label: "올해 실적", detail: "부서가 넣은 올해 계량 실적(없으면 카드의 예상 칸)" },
  ];
  if (o.files.length) sources.push({ label: `첨부 ${o.files.length}건`, detail: o.files.join(" · ") });
  if (o.prior.length) sources.push({ label: `전년 절 ${o.prior.length}`, detail: `2025 경영실적보고서 같은 과제 절 — ${o.prior.join(" · ")}` });
  if (o.lens) sources.push({ label: `평가 근거 ${o.lens}`, detail: "편람·평가 특징·지적·실사 질의응답 등 평가 기준·평가위원 관점(공통 지식에서 자동)" });
  // 원장 → 종합점검 → 경평 구성안(2026-10-09): 구성안을 만드는 요청만 최종 점검표의 미흡 행을 넣음(lib/reports/inspection-input.ts)
  if (o.inspection && (OUTLINE_RUNS.has(kind) || kind === "alts")) sources.push({ label: "월간 점검 보완 요청", detail: `최종 점검표의 미흡 항목 — ${o.inspection}(논점을 정하는 참고, 근거 아님)` });
  // 담당자가 고른 짜임(2026-10-12 — lib/reports/framework-pick.ts framePrompt): 뼈대 참고일 뿐 근거 아님
  if (o.frame?.pattern) sources.push({ label: "구성 패턴", detail: `${o.frame.pattern} — 단 구성·블록 순서·배치의 뼈대(근거 아님)` });
  if (o.frame?.example) sources.push({ label: "2025 예시 절", detail: `${o.frame.example} — 짜임만 본뜸(사실·숫자 근거 아님, 숫자 대조에 안 씀)` });
  if (kind === "alts" && o.alts) sources.push({ label: `${o.alts}안`, detail: `안마다 구성안 한 번(같은 근거·같은 요청 글)을 동시에 부름 — 저장하지 않고, 고른 안만 구성안으로 저장` });
  sources.push(reportKnowledge(o.selected, " — 평가 근거·전년 절은 그중 이 과제에 맞게 고른 것"));
  return { title: DRAFT_TITLE[kind], expect: draftExpect(kind, o.mg), sources };
}

// ---------------------------------------------------------------------------
// 경평 초안 「다른 모양으로」(블록 하나의 같은 내용을 다른 모양 2~3안 — app/(app)/reports/cards/edit-actions.ts previewBlockShapes, 2026-10-12)

/** 보통 걸리는 시간 — 블록 고치기(한 블록, 보통 30~60초)의 안 2~3개 몫. 실측 전 어림(실제 호출은 사용자 승인 뒤 연기 시험으로 맞춤) */
export const BLOCK_SHAPES_EXPECT: ProgressExpect = { min: 40, max: 150 };

/** 「다른 모양으로」 진행 줄 — 근거는 서버가 실제로 넣는 것(블록 고치기와 같음: 초안을 만들 때 고른 근거 그대로, 그 뒤 지운 첨부는 빠짐) */
export function blockShapesProgress(o: { blockNo: number; want: string | null; /** draftProgress와 같음 */ selected?: number }): ProgressSpec {
  return {
    title: o.want ? `${o.blockNo}번 블록을 「${o.want}」 모양으로 쓰는 중` : `${o.blockNo}번 블록을 다른 모양으로 쓰는 중`,
    expect: BLOCK_SHAPES_EXPECT,
    sources: [
      { label: "이 블록", detail: "지금 블록(JSON)·앞뒤 블록 이름·판면 어림·바꿀 수 있는 모양과 모양마다 한 줄 글자 수(코드가 셈)" },
      { label: "카드", detail: "확정 과제관리카드(원장)" },
      { label: "초안 근거", detail: "초안을 만들 때 고른 첨부·전년 보고서 절·실사 답변·올해 계량 실적 입력(그 뒤 지운 첨부는 빠짐)" },
      reportKnowledge(o.selected),
    ],
  };
}

// ---------------------------------------------------------------------------
// 경평 초안 지표 단위 부분 「AI로 문장 채우기」(경영관리 카드 밖 표 — app/(app)/reports/business/[unit]/parts/actions.ts fillUnitPartsAi, R5c 2026-10-16)

/** 보통 걸리는 시간 — 지표당 1회(로컬 CLI, effort high). 2026-10-16 실측 MG-8(카드 3·초안 1, 요청 약 4.4만 자) 59초·출력 0.9만 토큰 — 초안이 다 있으면 요청이 늘어 위쪽을 넉넉히(docs/design/report-draft.md 「R5c」) */
export const UNIT_AI_EXPECT: ProgressExpect = { min: 60, max: 240 };

/**
 * 「AI로 문장 채우기」 진행 줄 — 근거는 서버가 실제로 넣는 것(lib/reports/unit-parts-ai.ts unitAiPrompt): 카드 원장·과제별 초안·계량 실적 입력·'25 평가위원 지적·
 * 시정조치 계획·2025 같은 장·핵심공통항목·편람. 카드 전용 자료·보고서 추가자료 원문은 넣지 않음(금기 4)
 */
export function unitAiProgress(o: { parts: string[]; overwrite: boolean; cards: number }): ProgressSpec {
  return {
    title: `${o.parts.join("·")} 문장 ${o.overwrite ? "다시 쓰는" : "채우는"} 중`,
    expect: UNIT_AI_EXPECT,
    sources: [
      { label: `카드 ${o.cards}장`, detail: "이 지표 활성 과제관리카드 원장(작성본 아님)" },
      { label: "과제별 초안", detail: "이 지표 카드들의 경평 과제별 초안 본문(목차 순 — 카드 전용 자료·보고서 추가자료 원문은 넣지 않음)" },
      { label: "계량 실적", detail: "이 지표 모든 부서 보고서에 넣은 올해 계량 실적" },
      { label: "평가 근거", detail: "'25 평가위원 지적 원문·지적 시정조치 계획(약속 — 실적 아님)·’26 편람 이 지표" },
      { label: "2025 보고서", detail: "이 지표 2025 보고서의 같은 장(표지·지적·전년 대비·성과분석)과 핵심공통항목('25)" },
    ],
  };
}
