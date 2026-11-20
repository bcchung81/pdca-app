// 판(版)·원문·용도 표지(순수). 조각 글은 고치지 않고 요청 때 위치(where) 꼬리표로 붙입니다 — DB 변경 없음.
// 판 기준(사용자 결정 2026-11-19 D1·D2): 11.13 수정본(`hb26r-2611`, 「2026년도 경영평가편람 수정 신구대비표」) > 관리계획 7월판 개선(안)(`plan-2607` Ⅱ 참고2) > '26 편람 최초('26.1.29).
// 수정본은 바뀐 칸만 새 조각으로 올리고(parsers/handbook-rev.ts — meta.supersedes·revision) 옛 편람 조각은 원문 그대로 두어, 바뀐 옛 조각에 「11.13 수정본 기준」 표지를 붙입니다.
// 7월판 개선(안)을 적은 관리계획 조각은 「수정본에서 다르게 확정됨」 표지와 함께만 보입니다(2026-10-07 「7월판이 최종본」 결정은 수정본과 다른 곳에서 효력 없음).
// '25 자료에 나오는 지표 중 '26 편람에서 이름이 바뀌었거나 교체·폐지된 것은 그렇게 알리고, 수정본에서 나뉜 지표는 그 사실을 덧붙입니다(지표 사전 METRICS_2025의 relation·revision2611).

import { METRICS_2025 } from "./dictionaries.ts";
import { CONSULT_UNIT_TYPE, REPORT_METHOD_USAGE } from "./usage.ts";

/** 수정본 조각 key(편람 조각과 같은 꼴) */
const REV = "hb26r-2611/handbook26";

/** 11.13 수정본으로 바뀐 '26 편람(최초) 조각 → 수정본에서의 모습. 값은 hb26r-2611.pdf(신구대비표) 「수정」 쪽 그대로 */
export const HANDBOOK_REVISIONS: Record<string, string> = {
  "plan-2607/handbook26/BZ-2": `11.13 수정본 기준: 배점 18점 그대로, 지표 5개 — 인명구조 및 재난 관리 강화 성과(8점)가 (1) 인명안전 무선국 검사 성과 4점·(2) 사전 처리 노력 2점(신설)·(3) 현장 개선 노력 2점(신설)으로 나뉘고, (4) 근로자 무사고 달성 노력 3점(주요사업2 그대로)·(5) 성과관리의 적정성 7점(바뀐 부분은 ${REV}/BZ-2 조각)`,
  "plan-2607/handbook26/BZ-2/m1": `11.13 수정본 기준: 이 복합지표(4점:4점)는 개별지표 3개 — 인명안전 무선국 검사 성과 4점·사전 처리 노력 2점·현장 개선 노력 2점으로 나뉨(바뀐 부분은 ${REV}/BZ-2/m1·m2·m3 조각)`,
  "plan-2607/handbook26/BZ-2/m2": `11.13 수정본 기준: 주요사업2 그대로, 번호만 (2) → (4)(가중치 3점 그대로) — 7월판 개선(안)의 주요사업1 이동은 수정본에서 다르게 확정됨(바뀐 부분은 ${REV}/BZ-2 조각)`,
  "plan-2607/handbook26/BZ-3": `11.13 수정본 기준: 배점 16점 그대로, 지표 4개 — 기금 재정 효율화 성과(5점)가 (1) 기금 분담금 재원 조성 성과 3점·(2) 기금운용평가 결과 2점(신설)으로 나뉘고(공공자금관리기금 차입금리 대비 기금 운용수익 성과는 없어짐), (3) 국내 방송콘텐츠 OTT 방영 성과 4점·(4) 성과관리의 적정성 7점(바뀐 부분은 ${REV}/BZ-3 조각)`,
  "plan-2607/handbook26/BZ-3/m1": `11.13 수정본 기준: 지표 2개 — 기금 분담금 재원 조성 성과 3점·기금운용평가 결과 2점(신설)으로 나뉘고, 공공자금관리기금 차입금리 대비 기금 운용수익 성과는 없어짐(바뀐 부분은 ${REV}/BZ-3/m1·m2 조각)`,
  "plan-2607/handbook26/MG-3/k1": `11.13 수정본 기준: 계량 ②의 「용역근로자 보호지침 준수」가 「공공부문 도급 노동자 보호지침 준수」로 바뀜(바뀐 부분은 ${REV}/MG-3/k1 조각)`,
  "plan-2607/handbook26/MG-3/k2": `11.13 수정본 기준: ①이 「청년 등의 신규채용을 포함한 일자리 창출」로 바뀌고 유관기업·대학 협력 등을 통한 취업 지원이 더해짐, 공정채용 착안사항은 ①에서 빠져 ⑥(신설)으로 옮김 — ③~⑤는 이 조각 그대로(바뀐 부분은 ${REV}/MG-3/k2 조각)`,
  "plan-2607/handbook26/MG-4/k1": `11.13 수정본 기준: 0점 부여 사유가 「재해 발생 과정에서 안전법령을 위반한 경우」에서 「재해 발생에 기관의 포괄적 관리 책임이 있는 경우」로 바뀌고 ** 각주가 삭제됨(바뀐 부분은 ${REV}/MG-4/k1 조각)`,
  "plan-2607/handbook26/MG-4/k2": `11.13 수정본 기준: 시설관리 노동자 휴게시설 개선 권고안('26.7.)의 이행 여부 반영이 더해지고, 0점 부여 사유가 「재해 발생에 기관의 포괄적 관리 책임이 있는 경우」로 바뀌며 ** 각주가 삭제됨(바뀐 부분은 ${REV}/MG-4/k2 조각)`,
  "plan-2607/handbook26/MG-4/k3": `11.13 수정본 기준: 0점 부여 사유가 「재해 발생에 기관의 포괄적 관리 책임이 있는 경우」로 바뀌고 ** 각주가 삭제됨(바뀐 부분은 ${REV}/MG-4/k3 조각)`,
  "plan-2607/handbook26/MG-6/k1": `11.13 수정본 기준: ⑥ 청년 창업 지원(창업공간·장비 개방, 기술이전·판로 지원 등) 신설 — ②~⑤는 이 조각 그대로(바뀐 부분은 ${REV}/MG-6/k1 조각)`,
  "plan-2607/handbook26/MG-7/k2": `11.13 수정본 기준: 배점 각주(준정부기관은 총 배점 중 0.75점을 ②③항으로 평가) 신설, ② 지역업체 발주·구매·지역기업 육성 신설, ③은 기부·봉사·지역인재 양성으로 재편(옛 ②), ④ 시설·장비 개방(옛 ③), ②③항은 소재지·사업 지역 범위 등 여건을 고려해 평가(바뀐 부분은 ${REV}/MG-7/k2 조각)`,
  "plan-2607/handbook26/MG-14/k1": `11.13 수정본 기준: 청년인턴 프로그램에 유관기업·대학 협력 등을 통한 취업지원 프로그램 운영이 더해지고 「공공기관 기능개혁 추진방안 이행」 신설(바뀐 부분은 ${REV}/MG-14/k1 조각)`,
};

/** 7월판 개선(안)·편람 최초 구성을 적은 관리계획 서술 조각 — 수정본에서 다르게 확정된 곳 */
export const PLAN_REVISION_NOTES: Record<string, string> = {
  "plan-2607/narr/II/ref2/s1": `7월판 개선(안) — 11.13 수정본에서 다르게 확정됨(필수개선 지표 지정 사실만 이 조각 그대로), ${REV}/BZ-2·BZ-3 조각 참고`,
  "plan-2607/narr/II/ref2/s2": `7월판 개선(안) — 11.13 수정본에서 다르게 확정됨: 주요사업1 20점 그대로·주요사업2 18점·근로자 무사고 달성 노력은 주요사업2 그대로·인명안전 무선국 지표 3개(4점:2점:2점)·기금 지표 2개(3점:2점, 차입금리 대비 운용수익 없어짐), ${REV}/BZ-2·BZ-3 조각 참고`,
  "plan-2607/narr/II/2/s1": `이 조각의 주요사업 계량지표 수정 일정(지표 분리·주요사업1 이동·지표 신설)은 7월판 개선(안) — 11.13 수정본에서 다르게 확정됨, ${REV}/BZ-2·BZ-3 조각 참고`,
  "plan-2607/narr/II/ref1/s1": `편람 최초('26.1) 총괄표 — 주요사업2·3 계량지표 구성은 11.13 수정본에서 바뀜, ${REV}/BZ-2·BZ-3 조각 참고`,
};

/** 체크리스트 조각 key 접두(sd 하나가 /g1·/g2…로 나뉨)·전체 key — 체크리스트는 '26 편람 최초 번호·문구라 수정본과 다른 항목에 알림(경영관리만 — 주요사업 체크리스트는 표지 없음) */
const CK_BASE = "plan-2607/checklist/";
const CK_HEAD = "11.13 수정본 기준: 이 자가진단 항목('26 편람 최초 번호·문구로 적힘)은";
export const CHECKLIST_REVISIONS: Record<string, string> = {
  [`${CK_BASE}MG-3/s1/sd1/g1`]: `${CK_HEAD} 수정본의 세부평가내용 ①이 「청년 등의 신규채용을 포함한 일자리 창출」로 바뀌고 유관기업·대학 협력 등을 통한 취업 지원이 더해짐(바뀐 부분은 ${REV}/MG-3/k2 조각)`,
  [`${CK_BASE}MG-3/s1/sd1/g2`]: `${CK_HEAD} 수정본에서 ①이 아니라 ⑥ 공정채용(신설)의 착안사항으로 옮겨짐(바뀐 부분은 ${REV}/MG-3/k2 조각)`,
  [`${CK_BASE}MG-3/s1/sd1/g3`]: `${CK_HEAD} 수정본에서 ①이 아니라 ⑥ 공정채용(신설)의 착안사항(고졸자·무기계약직·별도직군·여성 차별해소·처우개선)으로 옮겨짐(바뀐 부분은 ${REV}/MG-3/k2 조각)`,
  [`${CK_BASE}MG-4/s2/sd2/g2`]: `${CK_HEAD} 수정본 재난관리(MG-4 k3)의 0점 부여 사유가 「안전법령 위반」이 아니라 「재해 발생에 기관의 포괄적 관리 책임이 있는 경우」로 바뀌었고 ** 각주가 삭제됨(바뀐 부분은 ${REV}/MG-4/k3 조각)`,
  [`${CK_BASE}MG-7/s5/sd2/`]: `${CK_HEAD} 수정본의 세부평가내용 ③ 「기부·봉사활동 등 지역사회 참여, 지역인재 양성」(최초 편람 ②)에 해당 — 수정본 ②는 신설 「지역업체 발주·구매, 지역기업 육성·투자」로 체크리스트에 없음(바뀐 부분은 ${REV}/MG-7/k2 조각)`,
  [`${CK_BASE}MG-7/s5/sd2/g3`]: `${CK_HEAD} 수정본 ③(최초 편람 ②)에 해당하되, 지역생산품 우선 구매 부분은 수정본 ② 「지역업체 발주·구매, 지역기업 육성·투자」(신설)에 걸침 — ②의 지역업체 발주 비중·지역기업 육성·투자는 이 체크리스트에 없음(바뀐 부분은 ${REV}/MG-7/k2 조각)`,
  [`${CK_BASE}MG-7/s5/sd3/`]: `${CK_HEAD} 수정본의 세부평가내용 ④ 「시설·장비 개방」(최초 편람 ③)에 해당, 문구는 그대로이고 번호만 바뀜(바뀐 부분은 ${REV}/MG-7/k2 조각)`,
  [`${CK_BASE}MG-14/s3/sd3/g1`]: `${CK_HEAD} 수정본의 혁신가점 ③ 청년 등 신규채용 확대 중 청년인턴 항목에 유관기업·대학 협력 등을 통한 취업지원 프로그램 운영이 더해짐(바뀐 부분은 ${REV}/MG-14/k1 조각)`,
};

/** 체크리스트 표지 — 전체 key가 앞서고, 없으면 `…/` 접두로 찾음(MG 체크리스트만 해당 — 주요사업 key는 접두가 맞지 않아 늘 null) */
function checklistNote(key: string): string | null {
  if (!key.startsWith(CK_BASE)) return null;
  const hit = CHECKLIST_REVISIONS[key];
  if (hit) return hit;
  const at = Object.keys(CHECKLIST_REVISIONS).find((p) => p.endsWith("/") && key.startsWith(p));
  return at ? CHECKLIST_REVISIONS[at] : null;
}

/** 수정본 조각(meta.revision) — 바뀐 칸만 적힌 조각이라 나머지는 옛 편람 조각이 유효함을 알림 */
function revisedChunkNote(meta: Record<string, unknown> | null | undefined): string | null {
  if (typeof meta?.revision !== "string") return null;
  const of = Array.isArray(meta.supersedes) ? meta.supersedes.filter((x): x is string => typeof x === "string") : [];
  const added = meta.new_metric === true ? "수정본에서 새로 생긴 지표 · " : "";
  return `${added}'26 편람 11.13 수정본(신구대비표 「수정」 쪽) — 이 판이 유효. 바뀐 칸만 옮겨 「⋮」로 줄인 항목과 여기 없는 항목은 ${of.join("·") || "'26 편람"} 조각('26 편람 최초) 그대로`;
}

/**
 * 원문 자체의 오기·표기 차이·옮겨 적지 못한 곳(2026-10-07 데이터 결함 점검). 조각 글은 원문 그대로 두므로 인용 대조는 그대로이고,
 * 모델은 이 꼬리표로 「원문이 이렇게 적혀 있음」을 알고 읽는다 — 원문을 고쳐 적거나 어느 쪽이 맞다고 단정하지 않는다.
 */
export const SOURCE_ERRATA: Record<string, string> = {
  "att3-2604/s4/R01": "원문 오기: 본문의 「2025년 주요사업2에 관련된 예산요구서」는 주요사업2 절(att3-2604/s5/R01)의 문구를 옮겨 적은 것으로 보임 — 이 조각은 주요사업1 절(대상사업1 전파품질 향상)의 답변",
  "plan-2607/narr/I/3/s2": "같은 실적(자격검정 및 취득교육 고객만족도)을 평가위원 의견·중간보고서 지적은 85.376으로 적음 — 이 조각은 85.37로 적은 표기 차이(원문 그대로)",
  "plan-2607/eval25/BZ-2/e4/p02": "같은 실적(자격검정 및 취득교육 고객만족도)을 관리계획 서술 Ⅰ-3은 85.37로 적음 — 이 조각은 85.376으로 적은 표기 차이(원문 그대로)",
  "mid25-biz/BZ-2/13": "같은 실적(자격검정 및 취득교육 고객만족도)을 관리계획 서술 Ⅰ-3은 85.37로 적음 — 이 조각은 85.376으로 적은 표기 차이(원문 그대로)",
  "att3-2604/s6/Q14": "원문의 측정 산식 수식 기호가 글로 옮겨지지 않아(글리프 소실) 산식 모양이 빠져 있음 — 산식은 원문 PDF에서 확인해야 하며 수식 기호를 짐작해 적지 말 것",
};

const RELATION_NOTE: Record<string, (name2026: string | null) => string | null> = {
  "명칭 변경": (n) => (n ? `'25 지표 — '26 편람에서 「${n}」로 명칭 변경` : null),
  교체: (n) => (n ? `'25 지표 — '26 편람에서 「${n}」로 교체` : null),
  폐지: () => "'25 지표 — '26 편람에서 폐지",
};

interface NoteInput {
  chunk_key: string;
  unit_type?: string;
  meta?: Record<string, unknown> | null;
}

/** 판·'25 지표 이름 변화 표지(「※」 없는 글) */
function versionNote(c: NoteInput): string | null {
  const fixed = HANDBOOK_REVISIONS[c.chunk_key] ?? PLAN_REVISION_NOTES[c.chunk_key] ?? checklistNote(c.chunk_key) ?? revisedChunkNote(c.meta);
  if (fixed) return fixed;
  // '25 자료(실사·지적 등)만: '26 편람 조각은 이미 '26 이름이라 대상이 아님
  if (c.unit_type === "handbook_indicator" || c.chunk_key.includes("/handbook26/")) return null;
  const rel = c.meta?.metric_relation;
  const name2026 = typeof c.meta?.metric_2026 === "string" ? c.meta.metric_2026 : null;
  const note = typeof rel === "string" ? (RELATION_NOTE[rel]?.(name2026) ?? null) : null;
  // 수정본에서 나뉜 지표는 그 사실을 덧붙임(이름 변경만 알리면 지표가 하나로 남은 것처럼 읽힘)
  const split = METRICS_2025.find((m) => m.name2025 === c.meta?.metric_2025)?.revision2611;
  return note && split ? `${note} — ${split}` : note;
}

/** 원문이 같은 글을 두 번 적은 조각(적재 때 meta.duplicate_of에 앞 조각 key를 기록) */
function duplicateNote(c: NoteInput): string | null {
  const of = c.meta?.duplicate_of;
  return typeof of === "string" && of ? `원문이 같은 글을 ${of} 조각에도 적음 — 한 건으로 볼 것` : null;
}

/** 경평 초안 작성 방법론 자료(meta.usage) — 경평 초안 요청에서만 보임(layerOf). 사실·숫자·사례의 근거가 아니라고 조각마다 알림 */
export const METHOD_NOTE = "작성 방법론 자료 — 보고서를 어떻게 쓰고 무엇을 앞세울지의 참고이며 사실·숫자·사례의 근거가 아님";
function methodNote(c: NoteInput): string | null {
  return c.meta?.usage === REPORT_METHOD_USAGE ? METHOD_NOTE : null;
}

/** 지적 시정조치 계획(unit_type corrective_action) — 조치계획 칸은 기관이 하겠다고 약속한 것이라 이행 실적이 아님. 지적사항 칸은 평가 결과 그대로 */
export const PLAN_NOTE = "시정조치 계획 — 조치계획은 기관이 하겠다고 약속한 것이며 이행 실적·사실·숫자의 근거가 아님(「~할 계획」으로만 쓸 것)";
function planNote(c: NoteInput): string | null {
  return c.unit_type === "corrective_action" ? PLAN_NOTE : null;
}

/** 외부 컨설팅 의견(unit_type consult_comment, 2026-11-19 A3) — 카드 보완 관점이지 사실·숫자 근거가 아님. 2026-11-20부터 그 카드 요청에만 들어감(bundle.ts consult) */
export const CONSULT_NOTE = "외부 컨설팅 의견(이 카드) — 카드 보완 관점이며 사실·숫자의 근거가 아님(의견 속 수치는 컨설턴트가 본 카드 값이므로 근거로 인용하지 않음)";
function consultNote(c: NoteInput): string | null {
  return c.unit_type === CONSULT_UNIT_TYPE ? CONSULT_NOTE : null;
}

/** where 꼬리표(「※ …」, 여럿이면 「 · 」로 이음) — 붙일 것이 없으면 null */
export function revisionNote(c: NoteInput): string | null {
  const notes = [methodNote(c), planNote(c), consultNote(c), SOURCE_ERRATA[c.chunk_key], duplicateNote(c), versionNote(c)].filter(Boolean);
  return notes.length ? notes.map((n) => `※ ${n}`).join(" · ") : null;
}

/** 근거 자료의 위치 글 = 조각 머리말 + 판 표지 */
export function whereWithNote(c: NoteInput & { context_prefix?: string | null }): string | undefined {
  return [c.context_prefix, revisionNote(c)].filter(Boolean).join(" · ") || undefined;
}
