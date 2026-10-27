// 경영관리 지표 단위 보고서의 카드 밖 부분(R5a 결정론 코어, 순수 — 입출력 없음, 재료는 인자로). 설계 docs/plan/경영관리-R5-지표단위-설계.md §3.1·§3.2(2026-10-16 승인).
// 부분: 표지(cover) · 지적사항 조치실적(findings) · 전년 대비 주요 추진실적(prior) · 성과분석 및 환류(outcome). 지표관리 방향(MG-1)은 Q1 결정으로 넣지 않음.
// 칸마다 채우는 쪽을 타입에서 갈라 둠(행·부분마다 code · ai · human 묶음):
//  - code  = 재료(카드 원장·초안·2025 보고서 조각·편람·부서 실적 입력)에서 매번 같게 채우는 칸 — 「재료로 다시 채우기」가 덮음
//  - ai    = R5c가 채우는 문장 칸 — 이 코어는 늘 빈 값
//  - human = 사람이 정하는 칸 — 코어는 출발값·기본값만 넣고 다시 채우기에서 덮지 않음(’25까지 출발값·계량 행 고르기·극성·구분 줄임·담당자 표)
// 달성률·비고 쪽은 저장하지 않고 그릴 때 계산(kpiRate·findingRemark — 사람이 극성을 바꾸거나 조판이 바뀌면 다시 셈).

import { compareTaskNo } from "../cards/view.ts";
import { LINK_RULES } from "../knowledge/link.ts";
import { compactKey } from "../knowledge/normalize.ts";
import { revisionNote } from "../knowledge/revision-note.ts";
import { containment, round } from "../knowledge/similarity.ts";
import { MGMT_TRACK, type UnitPartKey } from "../tracks/index.ts";
import { MGMT_INDICATORS } from "../tracks/mgmt-units.ts";
import { needsIn } from "./actuals.ts";
import { realFindingLines } from "./findings.ts";
import { mgFindingParts } from "./mg-draft.ts";
import { evalsFor } from "./mg-outline.ts";
import { evalNoOf } from "./mg-page-plan.ts";
import { kpiKeyedRows } from "./model.ts";
import type { ReportSectionSpec } from "./section.ts";
import type { LooseJson } from "../loose-json.ts";

type Json = LooseJson;

// ---------------------------------------------------------------------------
// 글자 상수(설계 §6-3 — 2026 서식 자료가 없어 2025 보고서 표기를 따름. 서식이 바뀌면 여기만 고침). HTML·마크다운이 같은 값을 씀

const ROMAN = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ"];
const yy = (y: number) => String(y % 100).padStart(2, "0");

/**
 * 장 제목·열 이름(연도는 보고서 연도 year 기준 — 2026 보고서면 ’25 지적·’26 실적). 로마 숫자는 지표관리 방향이 앞에 있는 MG-1만 한 칸 밀림
 * (2025 실측 — 지표관리 방향은 Q1 결정으로 한글에서 사람이 쓰므로 번호 자리만 둠). Ⅲ(세부평가내용별)은 과제별 초안 자리
 */
export function unitPartsLabels(year: number, unit: string) {
  const shift = unit === "MG-1" ? 1 : 0;
  const no = (i: number) => ROMAN[i + shift];
  const prev = yy(year - 1);
  const cur = yy(year);
  const next = yy(year + 1);
  return {
    cover: { method: "평가방법", weight: "가중치", definition: "지표정의", criteria: "세부평가내용", contacts: ["직위", "성명", "연락처", "E-mail"] },
    findings: { title: `${no(0)}. ${year - 1}년도 경영실적평가 지적사항 조치실적`, cols: ["지적/권고 사항", "조치 및 개선실적", "비고"] },
    prior: { title: `${no(1)}. 전년 대비 주요 추진실적`, cols: [`’${prev}년도까지의 주요실적`, `’${cur}년도 주요실적`, "개선효과"], evalLabel: (n: number) => `평가내용${n}` },
    detail: { title: `${no(2)}. 세부평가내용별 ${year}년도 추진실적 및 성과` },
    outcome: {
      title: `${no(3)}. 성과분석 및 환류`,
      theme1: "주요 성과분석",
      theme2: "향후 개선계획",
      kpiTitle: "가. 계량 성과지표",
      qualTitle: "나. 비계량 성과지표",
      // 계량 표 2단 머리: 구분 · ’25년 실적 · ’26년(목표·실적·달성률) · 성과 분석
      kpiCols: { name: "구분", prev: `’${prev}년 실적`, year: `’${cur}년`, target: "목표", actual: "실적", rate: "달성률", analysis: "성과 분석" },
      qualCols: ["구분", `’${cur}년 실적`, "성과 분석"],
      planCols: ["구분", `’${cur}년 자체평가`, `’${next}년 개선방안`],
    },
  };
}

// ---------------------------------------------------------------------------
// 부분 spec 타입

/** 극성: up = 높을수록 좋음(실적 ÷ 목표), down = 낮을수록 좋음(목표 ÷ 실적) */
export type Polarity = "up" | "down";

/** 표지 구성요소 하나(편람 지표 조각 하나 — 비계량·가점만, 계량 구성요소는 보고서를 쓰지 않아 뺌) */
export interface CoverComponent {
  chunkKey: string;
  /** 편람 조각 제목 끝(「비계량 (2/4)」 등) */
  label: string;
  kind: "비계량" | "가점";
  method: string;
  /** 가중치(점) — 준정부기관 기준(meta.weight_quasi_gov). 못 읽으면 null */
  weight: number | null;
  weightBasis: string;
  definition: string;
  criteria: string[];
  /** 판 표지(7월판 개선(안)이 다를 때 — revision-note.ts). 없으면 빈 글 */
  note: string;
}

export interface ContactRow {
  role: string;
  name: string;
  phone: string;
  email: string;
}

export interface CoverPart {
  part: "cover";
  code: { indicator: string; components: CoverComponent[] };
  /** 담당자 표 — 개인정보라 적재에서 뺐으므로 사람이 씀(빈 틀) */
  human: { contacts: ContactRow[] };
}

/** '25 평가위원 지적 원문 하나(plan-2607 evaluator_comment 조각의 meta.findings) */
export interface OriginalFinding {
  chunkKey: string;
  no: number;
  /** 소분류(meta.sub_label — 지표가 둘로 나뉜 곳) */
  label: string;
  text: string;
}

export interface FindingRow {
  /**
   * 카드 id#지적 글 열쇠(findingRowId — 원장에서 행을 더하거나 빼도 같은 지적은 같은 id). 2026-10-17 전 저장분은 「카드 id#행 순번」 —
   * 다시 채우기(unit-parts-edit.ts)가 같은 카드·같은 지적 글로 짝지어 새 id로 옮김
   */
  id: string;
  code: {
    cardId: string;
    taskNo: string;
    rowIndex: number;
    /** 칸 글 = 카드 「지적 및 개선방안」 지적 줄(Q9) */
    finding: string[];
    /** 같은 행의 카드 개선방안 줄(AI 칸의 재료) */
    plan: string[];
    /** 글자 겹침으로 짝지은 원문(제안 — 사람이 확정). 겹침이 짝 문턱 아래면 null */
    source: (OriginalFinding & { score: number }) | null;
    /** 칸 글이 짝 원문과 많이 다름(겹침 < 자동 짝 문턱) — 화면 「원문 다름」 */
    differs: boolean;
  };
  ai: { actions: string[] };
}

export interface FindingsPart {
  part: "findings";
  /** 어느 카드 지적 행과도 짝지어지지 않은 원문(「미반영 지적」 — 행은 사람이 더함) */
  code: { unmatched: OriginalFinding[] };
  rows: FindingRow[];
}

export interface CardRef {
  id: string;
  taskNo: string;
}

export interface PriorRow {
  id: string;
  code: { evalNo: number; title: string; cards: CardRef[] };
  /** ’25까지 = 2025 같은 표의 「’25」 칸 글(출발값 — 사람이 줄이거나 ’24까지 연혁을 더함, AI가 지난해 글을 다시 쓰지 않게. 두 칸을 합치면 전년 대비 표가 2025 쪽을 넘어 2026-10-16 사용자 결정으로 한 칸) */
  human: { upTo: string[] };
  ai: { now: string[]; effect: string[] };
}

export interface PriorPart {
  part: "prior";
  rows: PriorRow[];
}

export interface KpiRow {
  /** kpiKeyedRows 열쇠(카드 id#지표 이름) — 부서 실적 입력과 같은 키 */
  id: string;
  code: {
    cardId: string;
    taskNo: string;
    index: number;
    name: string;
    unit: string;
    /** ’25 실적(카드 prev) */
    prev: string;
    /** ’26 목표(카드 target) */
    target: string;
    /** ’26 실적(그 지표 부서 보고서 inputs.kpi). 없으면 빈 글 */
    actual: string;
    /** 이름이 같은 2025 계량 표 행 이름. 없으면 null */
    match2025: string | null;
    /** 그 2025 행의 셈 방향(inferPolarity). 못 정하면 null */
    polarity2025: Polarity | null;
  };
  /** checked = 표에 넣을 행(Q5 — 2025 표와 이름이 같은 행을 미리 체크), polarity = 이 행의 셈 방향(기본: 2025 셈 방향, 없으면 up) */
  human: { checked: boolean; polarity: Polarity };
  ai: { analysis: string[] };
}

export interface EvalRow {
  id: string;
  code: { evalNo: number; title: string };
  /** 구분 칸 = 평가내용 제목을 줄인 글(evalShort — 출발값, 사람이 더 줄임) */
  human: { label: string };
}

export interface QualRow extends EvalRow {
  ai: { result: string[]; analysis: string[] };
}

export interface PlanRow extends EvalRow {
  ai: { self: string[]; plan: string[] };
}

export interface OutcomePart {
  part: "outcome";
  kpi: KpiRow[];
  qual: QualRow[];
  plan: PlanRow[];
}

export type UnitPart = CoverPart | FindingsPart | PriorPart | OutcomePart;

/** 재료 판(design §3.2 「다시 만들기 권장」) — 카드 원장 판·과제별 초안 저장 시각·실적 입력 해시 */
export interface UnitPartsSource {
  cards: Record<string, number>;
  drafts: Record<string, string>;
  inputs: string;
}

export interface UnitPartsMg {
  unit: string;
  indicator: string;
  year: number;
  cover: CoverPart | null;
  findings: FindingsPart | null;
  prior: PriorPart | null;
  outcome: OutcomePart | null;
  source: UnitPartsSource;
}

// ---------------------------------------------------------------------------
// 재료

/** 카드 행(cards — id·과제번호·과제명·상태·원장 판·원장 JSON) */
export interface UnitCard {
  id: string;
  taskNo: string;
  title: string;
  status: string;
  dataRev?: number | null;
  data: Json;
}

/** 공통 지식 조각(필요한 열만) */
export interface UnitChunk {
  chunk_key: string;
  title?: string;
  text: string;
  unit_type?: string;
  meta: Json;
}

export interface MgUnitMaterials {
  /** 평가단위(MG-N) */
  unit: string;
  /** 보고서 연도(2026) */
  year: number;
  /** 그 지표의 카드(보관 카드 포함해도 됨 — 활성만 씀) */
  cards: UnitCard[];
  /** 과제별 초안(card_report_drafts — 카드마다 그 연도 하나). spec이 없으면 초안 없음 */
  drafts: Array<{ cardId: string; updatedAt: string; spec: ReportSectionSpec | null }>;
  /** 그 지표 2025 보고서 조각(rpt25-mg-NN — 모든 장) */
  report2025: UnitChunk[];
  /** 그 지표 '25 평가위원 의견 조각(plan-2607 evaluator_comment) */
  evaluator: UnitChunk[];
  /** 그 지표 '26 편람 지표 조각(plan-2607 handbook_indicator) */
  handbook: UnitChunk[];
  /** 목차·쪽 배정(report_outline)의 그 지표 행. 없으면 MG_CARD_EVALS 대응 */
  outline?: Array<{ card_id: string; section: string; subsection: string | null; included?: boolean | null; /** 목차 순서(R5c AI 요청의 과제별 초안 순서) */ sort?: number | null }>;
  /** 그 지표 모든 부서 보고서의 계량 실적 입력(reports.inputs.kpi — 보고서마다 하나) */
  kpiInputs: Array<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// 공용 작은 도구

const oneLine = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

/** 이 지표에 있는 부분(장 순서): 지표 1~11은 넷 다, 혁신가점 12~14는 표지만(2025 보고서에 카드 밖 장이 없음 — 설계 §2.1) */
export function mgUnitPartKeys(unit: string): UnitPartKey[] {
  const n = Number(/^MG-(\d+)$/.exec(unit)?.[1] ?? 0);
  if (!n) return [];
  return MGMT_TRACK.unitParts.filter((k) => n <= 11 || k === "cover");
}

/** 활성 카드만, 과제번호 순 */
const activeCards = (cards: UnitCard[]) => cards.filter((c) => c.status === "active").sort((a, b) => compareTaskNo(a.taskNo, b.taskNo));

/**
 * 2025 표 조각 글 → 행 칸들. 조각 글은 표 한 줄 = 한 문단(빈 줄로 나뉨)·칸은 「 | 」·칸 안 줄바꿈은 「 / 」(파서 lib/knowledge/parsers/report25-mg.ts tableLines).
 * 첫 문단(머리)은 뺌
 */
export function table2025Rows(text: string): string[][] {
  return String(text ?? "")
    .split(/\n\s*\n/)
    .slice(1)
    .map((p) => p.split(" | ").map((c) => c.trim()))
    .filter((r) => r.some(Boolean));
}

/**
 * 2025 표 칸 → 불릿: 「∙」로 시작하는 조각이 새 불릿, 「-」는 하위 줄(앞 「- 」를 살려 따로), 나머지는 앞 불릿의 이어진 줄(「 / 」 = PDF 줄바꿈).
 * 「〃」(위와 같음)만 있는 칸은 빈 목록
 */
export function cellBullets(cell: string): string[] {
  const c = cell.trim();
  if (!c || /^〃$/.test(c)) return [];
  const out: string[] = [];
  for (const raw of c.split(" / ")) {
    const s = raw.trim();
    if (!s) continue;
    if (/^[∙•·]\s*/.test(s)) out.push(s.replace(/^[∙•·]\s*/, ""));
    else if (/^-\s+/.test(s) || !out.length) out.push(s);
    else out[out.length - 1] = `${out[out.length - 1]} ${s}`;
  }
  return out.map(oneLine).filter(Boolean);
}

/** 2025 「전년 대비」 평가내용 표 → ’25까지 출발값(둘째 칸 「’25년도 주요실적」만 — 행이 여럿이면 차례로. 첫째 칸 「’24년도까지」는 넣지 않음, 2026-10-16 사용자 결정) */
export function prior2025UpTo(text: string): string[] {
  return table2025Rows(text).flatMap((r) => cellBullets(r[1] ?? ""));
}

/** 2025 계량 표 한 행 */
export interface Kpi2025Row {
  name: string;
  prev: string;
  target: string;
  actual: string;
  rate: string;
}

/** 2025 「성과분석 및 환류 — 가. 계량 성과지표」 조각 → 행(2단 머리 「〃 | 〃 | 목표 …」·각주 「* …」·「- ※ …」 줄은 뺌). 이름 칸의 줄바꿈(「 / 」)은 공백으로 */
export function kpi2025Rows(text: string): Kpi2025Row[] {
  return table2025Rows(text)
    .filter((r) => r.length >= 5 && r[0] !== "〃" && !/^[*※-]/.test(r[0]))
    .map((r) => ({ name: oneLine(r[0].replace(/\s\/\s/g, " ")), prev: r[1], target: r[2], actual: r[3], rate: r[4] }));
}

/** 2025 「지적사항 조치실적」 조각 → 지적 칸 글(행마다 — 「∙」로 시작하는 칸만, 위와 같음(〃) 행은 뺌) */
export function findings2025Rows(text: string): string[][] {
  return table2025Rows(text)
    .filter((r) => /^[∙•]/.test(r[0] ?? ""))
    .map((r) => cellBullets(r[0]));
}

/** 계량 지표 이름 비교 열쇠: 괄호 표기(「(하향지표)」·「(%)」)·끝 「신규」·「*」를 걷고 글자·숫자만(compactKey) */
export function kpiNameKey(name: string): string {
  return compactKey(String(name ?? "").replace(/\([^)]*\)/g, " ").replace(/\*/g, " ").replace(/\s신규\s*$/, " "));
}

/**
 * 값 → 수 하나. 괄호 덧붙임(「8.4(본원기준)」)은 걷고, 범위(「30%~35%」)·등급(「3등급」 — 크기 비교가 아님)·수가 둘 이상(「11 / 14」)·수가 없음(「-」·「우수」)은 null
 */
export function readNumber(v: string): number | null {
  const s = String(v ?? "").replace(/\([^)]*\)/g, " ");
  if (/[~∼～〜]/.test(s) || /등급/.test(s)) return null;
  const nums = s.match(/-?\d[\d,]*(?:\.\d+)?/g) ?? [];
  if (nums.length !== 1) return null;
  const n = Number(nums[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** 달성률 셈 허용 오차(%p): 2025 표의 달성률은 소수 첫째 자리 반올림이고 표의 목표·실적도 반올림한 값이라 0.05보다 넉넉히 */
const RATE_TOL = 0.15;

/**
 * 2025 계량 표 한 행의 셈 방향: 실적 ÷ 목표와 목표 ÷ 실적 중 표의 달성률과 맞는 쪽(설계 §3.2 「기본은 2025 같은 이름 행의 셈 방향」).
 * 근거: 2025 지표별 보고서 11개 계량 표 — 「부채비율 31.6 → 31.7 = 99.7%」(목표 ÷ 실적, MG-8)·「윤리위험지수(하향지표) 13.5 → 13.32 = 101.4%」(MG-2)·
 * 「이상소견자 135 → 128건 = 105.5%」(MG-4)처럼 낮을수록 좋은 지표는 목표 ÷ 실적, 나머지는 실적 ÷ 목표로 셈.
 * 둘 다 맞거나(목표 = 실적) 둘 다 안 맞거나 숫자로 못 읽으면(등급·「-」·0) null — 사람이 정함
 */
export function inferPolarity(r: Pick<Kpi2025Row, "target" | "actual" | "rate">): Polarity | null {
  const t = readNumber(r.target);
  const a = readNumber(r.actual);
  const rate = readNumber(r.rate);
  if (t === null || a === null || rate === null || !t || !a) return null;
  const up = Math.abs((a / t) * 100 - rate) <= RATE_TOL;
  const down = Math.abs((t / a) * 100 - rate) <= RATE_TOL;
  return up === down ? null : up ? "up" : "down";
}

/** 달성률(그릴 때 계산 — 저장하지 않음): 숫자로 셀 수 있으면 「99.7%」, 아니면 【확인: 까닭】 */
export function kpiRate(row: Pick<KpiRow, "code" | "human">): { value: number | null; text: string } {
  const { target, actual } = row.code;
  if (!actual.trim()) return { value: null, text: "【확인: 실적 미입력】" };
  if (/[~∼～〜]/.test(target)) return { value: null, text: "【확인: 범위 목표 — 달성 여부를 적음】" };
  const t = readNumber(target);
  const a = readNumber(actual);
  if (t === null || a === null) return { value: null, text: "【확인: 숫자로 못 읽는 값】" };
  const [num, den] = row.human.polarity === "down" ? [t, a] : [a, t];
  if (!den) return { value: null, text: "【확인: 0으로 나눌 수 없음】" };
  const v = Math.round((num / den) * 1000) / 10;
  return { value: v, text: `${v.toFixed(1)}%` };
}

/** 평가내용 제목 줄임(비계량·향후 개선계획 「구분」 출발값): 끝의 「…을 위한 (기관의) 노력과 성과」·괄호 덧붙임을 걷음 */
export function evalShort(title: string): string {
  const s = oneLine(String(title ?? "").replace(/\s*\([^)]*\)/g, ""))
    .replace(/\s*(?:[을를]\s*)?위한\s*(?:기관의\s*)?노력\s*(?:과|및)\s*성과$/, "")
    .replace(/\s*(?:기관의\s*)?노력\s*(?:과|및)\s*성과$/, "");
  return oneLine(s) || oneLine(title);
}

// ---------------------------------------------------------------------------
// 표지

/** 비계량·가점 표지의 평가방법 — 편람 조각에 평가방법 칸이 없어 상수로 둠. 근거: 2025 지표별 보고서 표지 14개가 모두 「9등급 평가」, 편람 주요사업 조각 「비계량, 평가방식 9등급평가」 */
const COVER_METHOD = "9등급 평가";

/** 편람 글의 「머리: …」 칸(다음 머리 또는 빈 줄 전까지) */
function handbookField(text: string, head: string): string {
  const m = new RegExp(`(?:^|\\n)${head}:\\s*([\\s\\S]*?)(?=\\n\\s*\\n|\\n(?:지표정의|적용대상\\(배점\\)|세부평가내용):|$)`).exec(text);
  return m ? m[1].trim() : "";
}

/** 줄바꿈으로 끊긴 한 문장을 이음(가운뎃점 뒤·여는 괄호 앞은 붙임) */
const joinWrapped = (lines: string[]) => lines.reduce((acc, l) => (!acc ? l : /[·･]$/.test(acc) || /^\(/.test(l) ? `${acc}${l}` : `${acc} ${l}`), "");

/** 세부평가내용 → 항목 본문(①·② … 머리 문장만 — 「-」·「*」·「※」로 시작하는 덧붙임 줄은 2025 표지처럼 뺌) */
export function handbookCriteria(text: string): string[] {
  const out: string[][] = [];
  let main = false;
  for (const raw of handbookField(text, "세부평가내용").split("\n")) {
    const l = raw.trim();
    if (!l) continue;
    const m = /^([①-⑳➀-➉])\s*(.*)$/.exec(l);
    if (m) {
      out.push([m[2]]);
      main = true;
    } else if (/^[-*※]/.test(l)) main = false;
    else if (main && out.length) out[out.length - 1].push(l);
  }
  return out.map((x) => oneLine(joinWrapped(x))).filter(Boolean);
}

export function buildCoverPart(m: Pick<MgUnitMaterials, "unit" | "handbook">): { part: CoverPart; warnings: string[] } {
  const indicator = MGMT_INDICATORS.find((x) => x.id === m.unit)?.name ?? m.unit;
  const components: CoverComponent[] = [];
  for (const c of m.handbook.filter((x) => (x.unit_type ?? "handbook_indicator") === "handbook_indicator")) {
    const kind = /·\s*(계량|비계량|가점)/.exec(c.title ?? "")?.[1];
    if (kind !== "비계량" && kind !== "가점") continue;
    const w = Number(c.meta?.weight_quasi_gov);
    components.push({
      chunkKey: c.chunk_key,
      label: oneLine(String(c.title ?? "").split("·").slice(2).join("·")),
      kind,
      method: COVER_METHOD,
      weight: Number.isFinite(w) && w > 0 ? w : null,
      weightBasis: String(c.meta?.weight_basis ?? ""),
      definition: oneLine(joinWrapped(handbookField(c.text, "지표정의").replace(/^•\s*/, "").split("\n").map((l) => l.trim()))),
      criteria: handbookCriteria(c.text),
      note: revisionNote({ chunk_key: c.chunk_key, unit_type: c.unit_type ?? "handbook_indicator", meta: c.meta }) ?? "",
    });
  }
  return {
    part: { part: "cover", code: { indicator, components }, human: { contacts: [] } },
    warnings: components.length ? [] : [`표지: 편람 지표 조각(비계량·가점)이 없음 — 표지를 채우지 못함`],
  };
}

// ---------------------------------------------------------------------------
// 지적사항 조치실적

/** 평가위원 의견 조각 → 지적 원문(조각 순서·번호 순) */
export function originalFindings(evaluator: UnitChunk[]): OriginalFinding[] {
  return evaluator.flatMap((c) =>
    (Array.isArray(c.meta?.findings) ? c.meta.findings : [])
      .map((f: Json) => ({ chunkKey: c.chunk_key, no: Number(f?.no) || 0, label: String(c.meta?.sub_label ?? c.meta?.indicator_label ?? ""), text: oneLine(f?.text) }))
      .filter((f: OriginalFinding) => f.text),
  );
}

/**
 * 지적 행 id = 「카드 id#t지적 글 열쇠」(글자·숫자만 남긴 글(compactKey)의 fnv8 — 행 번호가 아니라 글이라 원장에서 행을 끼우거나 빼도 같은 지적의 AI·사람 칸이 따라감).
 * 한 카드에 같은 글의 지적이 또 있으면 뒤에 「-2」·「-3」(seen — 카드마다 새로)
 */
export function findingRowId(cardId: string, finding: string[], seen: Map<string, number>): string {
  const base = `${cardId}#t${fnv8(compactKey(finding.join(" ")))}`;
  const n = (seen.get(base) ?? 0) + 1;
  seen.set(base, n);
  return n === 1 ? base : `${base}-${n}`;
}

/**
 * 지적 행 모으기와 원문 짝(설계 §3.2·Q9): 활성 카드의 「지적 및 개선방안」 행(과제번호 순)을 행으로, 지적 줄 글자 3자 묶음이 원문에 든 비율(포함도)로 짝을 지음.
 * 짝짓는 함수·문턱은 카드 지적 ↔ 평가위원 지적 원문 연결(lib/knowledge/link.ts — containment·LINK_RULES)과 같음:
 * 겹침이 짝 문턱(LINK_RULES.candidate 0.25) 이상인 원문 중 가장 큰 것이 짝, 자동 짝 문턱(autoWithoutTeam 0.5) 아래면 「원문 다름」.
 * 글자 두 자 묶음 닮음(ground.ts textSimilarity)은 짧은 카드 글에서 상관없는 원문도 0.4~0.5로 높게 나와(실측 11-1 「구성원 대상 충분한 설명」 ↔ 유급휴일 지적 0.46) 쓰지 않음.
 * 원문이 어느 카드 행과도 짝 문턱 이상으로 겹치지 않으면 미반영 지적
 */
export function buildFindingsPart(m: Pick<MgUnitMaterials, "cards" | "evaluator">): { part: FindingsPart; warnings: string[] } {
  const originals = originalFindings(m.evaluator);
  const rows: FindingRow[] = [];
  for (const c of activeCards(m.cards)) {
    const list: Json[] = Array.isArray(c.data?.findings?.rows) ? c.data.findings.rows : [];
    const seen = new Map<string, number>();
    list.forEach((r, i) => {
      const finding = realFindingLines(r?.finding);
      if (!finding.length) return;
      const text = finding.join(" ");
      let best: (OriginalFinding & { score: number }) | null = null;
      for (const o of originals) {
        const score = round(containment(text, o.text, 3));
        if (score >= LINK_RULES.candidate && (!best || score > best.score)) best = { ...o, score };
      }
      rows.push({
        id: findingRowId(c.id, finding, seen),
        code: { cardId: c.id, taskNo: c.taskNo, rowIndex: i, finding, plan: realFindingLines(r?.plan), source: best, differs: !!best && best.score < LINK_RULES.autoWithoutTeam },
        ai: { actions: [] },
      });
    });
  }
  const texts = rows.map((r) => r.code.finding.join(" "));
  const unmatched = originals.filter((o) => !texts.some((t) => containment(t, o.text, 3) >= LINK_RULES.candidate));
  const part: FindingsPart = { part: "findings", code: { unmatched }, rows };
  return { part, warnings: findingsWarnings(part) };
}

const circled = (n: number) => (n >= 1 && n <= 20 ? String.fromCodePoint(0x2460 + n - 1) : String(n));

function findingsWarnings(p: FindingsPart): string[] {
  const out = p.code.unmatched.map((o) => `미반영 지적: ${o.label ? `(${o.label}) ` : ""}지적 ${circled(o.no)} — 지표 안 어느 카드의 「지적 및 개선방안」에도 없음`);
  for (const r of p.rows) {
    const where = `${r.code.taskNo} 지적 ${r.code.rowIndex + 1}행`;
    if (!r.code.source) out.push(`원문 짝 없음: ${where} — '25 평가위원 지적과 겹치는 원문이 없음(전년 이전 지적일 수 있음)`);
    else if (r.code.differs) out.push(`원문 다름: ${where} ↔ ${r.code.source.label ? `(${r.code.source.label}) ` : ""}지적 ${circled(r.code.source.no)}(겹침 ${r.code.source.score}) — 칸 글을 원문과 대조`);
  }
  return out;
}

/**
 * 비고 쪽 계산용: 카드 지적 행 하나가 놓인 지적개선 절(그 행만 남긴 카드로 mgFindingParts — 행마다 같은 규칙). 초안이 없으면 빈 목록.
 * finding(저장된 행의 지적 글)을 주면 지금 원장에서 그 글의 행을 찾아 씀 — 저장 뒤 원장에서 행을 끼우거나 빼도 번호가 밀린 다른 행을 집지 않게(못 찾으면 rowIndex)
 */
export function findingRowParts(spec: ReportSectionSpec | null, card: Json, rowIndex: number, finding?: string[]): string[] {
  const rows: Json[] = Array.isArray(card?.findings?.rows) ? card.findings.rows : [];
  const key = finding ? compactKey(finding.join(" ")) : "";
  const at = key ? rows.findIndex((r) => compactKey(realFindingLines(r?.finding).join(" ")) === key) : -1;
  const row = rows[at >= 0 ? at : rowIndex];
  if (!spec || !row) return [];
  return mgFindingParts(spec, { ...card, findings: { ...card.findings, rows: [row] } });
}

/**
 * 비고 「p.N」(Q7 — 저장하지 않고 그릴 때 계산): 지표 시작 쪽(책 전체 인쇄 쪽, 성과관리팀 입력) + 그 절이 지표 안에서 놓인 쪽(1부터) − 1.
 * 여러 쪽이면 이어진 쪽은 「p.62~65」, 떨어진 쪽은 「p.5, 6」(2025 표기). 쪽을 모르면 빈 글
 */
export function findingRemark(start: number, partKeys: string[], pageInUnit: (partKey: string) => number | null): string {
  const pages = [...new Set(partKeys.map(pageInUnit).filter((p): p is number => p !== null && p > 0).map((p) => start + p - 1))].sort((a, b) => a - b);
  if (!pages.length || !(start > 0)) return "";
  const runs: number[][] = [];
  for (const p of pages) {
    const last = runs.at(-1);
    if (last && p === last.at(-1)! + 1) last.push(p);
    else runs.push([p]);
  }
  if (runs.length === 1 && runs[0].length > 2) return `p.${runs[0][0]}~${runs[0].at(-1)}`;
  return `p.${pages.join(", ")}`;
}

// ---------------------------------------------------------------------------
// 전년 대비 주요 추진실적

/** 2025 골격의 평가내용(세부평가내용별 장 — detail·detail_theme 조각의 eval_no·eval_title) 번호 순 */
export function skeletonEvals(report2025: UnitChunk[]): Array<{ no: number; title: string }> {
  const by = new Map<number, string>();
  for (const c of report2025) {
    const ch = c.meta?.chapter;
    const no = Number(c.meta?.eval_no);
    if ((ch === "detail" || ch === "detail_theme") && no > 0 && !by.get(no)) by.set(no, oneLine(c.meta?.eval_title));
  }
  return [...by].sort((a, b) => a[0] - b[0]).map(([no, title]) => ({ no, title }));
}

/**
 * 카드 → 평가내용: 목차(report_outline) 행이 있으면 그 값(1단 「평가내용 N.」, 2단 「평가내용 1·3에 걸침」 — mg-page-plan.ts buildMgOutline이 적는 글, 목차에서 뺀 과제는 없음),
 * 없으면 추천 기본값(evalsFor — MG_CARD_EVALS ∩ 2025 평가내용, 없으면 모두)
 */
export function cardEvals(card: { id: string; taskNo: string }, evalNos: number[], outline?: MgUnitMaterials["outline"]): number[] {
  const row = outline?.find((r) => r.card_id === card.id);
  if (!row) return evalsFor(card.taskNo, evalNos);
  if (row.included === false) return [];
  const span = /^평가내용\s*([\d·,\s]+)에 걸침/.exec(row.subsection ?? "");
  if (span) return span[1].split(/[·,\s]+/).map(Number).filter((n) => n > 0);
  const n = evalNoOf(row.section);
  return n ? [n] : [];
}

export function buildPriorPart(m: Pick<MgUnitMaterials, "cards" | "report2025" | "outline">): { part: PriorPart; warnings: string[] } {
  const evals = skeletonEvals(m.report2025);
  const nos = evals.map((e) => e.no);
  const cards = activeCards(m.cards).map((c) => ({ id: c.id, taskNo: c.taskNo, evals: cardEvals(c, nos, m.outline) }));
  const priorText = new Map<number, string>();
  for (const c of m.report2025) if (c.meta?.chapter === "prior" && Number(c.meta?.eval_no) > 0) priorText.set(Number(c.meta.eval_no), c.text);
  const rows: PriorRow[] = evals.map((e) => ({
    id: `prior/${e.no}`,
    code: { evalNo: e.no, title: e.title, cards: cards.filter((c) => c.evals.includes(e.no)).map((c) => ({ id: c.id, taskNo: c.taskNo })) },
    human: { upTo: priorText.has(e.no) ? prior2025UpTo(priorText.get(e.no)!) : [] },
    ai: { now: [], effect: [] },
  }));
  const warnings = [
    ...(evals.length ? [] : ["전년 대비: 2025 보고서 골격(세부평가내용별 장)이 없어 평가내용 행을 만들지 못함"]),
    ...rows.filter((r) => !r.code.cards.length).map((r) => `전년 대비: 평가내용${r.code.evalNo} — 대응 카드 없음(올해 칸을 채울 과제별 초안이 없음)`),
  ];
  return { part: { part: "prior", rows }, warnings };
}

// ---------------------------------------------------------------------------
// 성과분석 및 환류

/** 부서 보고서 실적 입력 합치기: 같은 키는 처음 빈 값이 아닌 것. 부서마다 값이 다르면 경고 */
export function mergeKpiInputs(list: Array<Record<string, string>>): { inputs: Record<string, string>; conflicts: string[] } {
  const inputs: Record<string, string> = {};
  const conflicts = new Set<string>();
  for (const one of list) {
    for (const [k, raw] of Object.entries(one ?? {})) {
      const v = oneLine(raw);
      if (!v) continue;
      if (inputs[k] === undefined) inputs[k] = v;
      else if (inputs[k] !== v) conflicts.add(k);
    }
  }
  return { inputs, conflicts: [...conflicts] };
}

export function buildOutcomePart(m: Pick<MgUnitMaterials, "cards" | "report2025" | "kpiInputs">): { part: OutcomePart; warnings: string[] } {
  const { inputs, conflicts } = mergeKpiInputs(m.kpiInputs);
  const table2025 = m.report2025.find((c) => c.meta?.chapter === "outcome" && c.meta?.mark === "가");
  const rows2025 = table2025 ? kpi2025Rows(table2025.text) : [];
  const by2025 = new Map(rows2025.map((r) => [kpiNameKey(r.name), r]));
  const kpi: KpiRow[] = activeCards(m.cards).flatMap((c) =>
    kpiKeyedRows(c.id, c.data?.kpi?.rows).map((k) => {
      const hit = by2025.get(kpiNameKey(k.name)) ?? null;
      const polarity2025 = hit ? inferPolarity(hit) : null;
      return {
        id: k.key,
        code: { cardId: c.id, taskNo: c.taskNo, index: k.i, name: k.name, unit: k.unit, prev: k.prev, target: k.target, actual: inputs[k.key] ?? "", match2025: hit?.name ?? null, polarity2025 },
        human: { checked: !!hit, polarity: polarity2025 ?? "up" },
        ai: { analysis: [] },
      };
    }),
  );
  const evals = skeletonEvals(m.report2025);
  const qual: QualRow[] = evals.map((e) => ({ id: `qual/${e.no}`, code: { evalNo: e.no, title: e.title }, human: { label: evalShort(e.title) }, ai: { result: [], analysis: [] } }));
  const plan: PlanRow[] = evals.map((e) => ({ id: `plan/${e.no}`, code: { evalNo: e.no, title: e.title }, human: { label: evalShort(e.title) }, ai: { self: [], plan: [] } }));
  const part: OutcomePart = { part: "outcome", kpi, qual, plan };
  const byKey = new Map(kpi.map((k) => [k.id, k]));
  return { part, warnings: [...conflicts.map((k) => `계량 실적: ${byKey.get(k)?.code.taskNo ?? k} 「${byKey.get(k)?.code.name ?? k}」 — 부서 보고서마다 입력값이 다름(처음 값을 씀)`), ...outcomeWarnings(part)] };
}

/** 계량 표 경고(체크한 행만 — 사람이 행·극성을 바꾸면 다시 셈): 실적 미입력·【확인】 달성률 */
export function outcomeWarnings(p: OutcomePart): string[] {
  const on = p.kpi.filter((k) => k.human.checked);
  const missing = on.filter((k) => !k.code.actual.trim());
  const checks = on.filter((k) => k.code.actual.trim() && kpiRate(k).value === null);
  return [
    ...(p.kpi.length && !on.length ? ["계량 표: 고른 행이 없음 — 2025 표와 이름이 같은 카드 계량 행이 없어 미리 체크하지 못함(행을 골라 주세요)"] : []),
    ...(missing.length ? [`계량 표: 실적 미입력 ${missing.length}행(${missing.map((k) => `${k.code.taskNo} ${k.code.name}`).join(" · ")}) — 부서 경평 초안 「계량 실적」 입력이 필요`] : []),
    ...checks.map((k) => `계량 표: ${k.code.taskNo} 「${k.code.name}」 달성률 ${kpiRate(k).text}`),
  ];
}

// ---------------------------------------------------------------------------
// 재료 판·한꺼번에 만들기

/** 짧은 해시(FNV-1a 32비트, 16진 8자) — 실적 입력 판 비교용(보안 용도 아님, 브라우저에서도 같은 값) */
function fnv8(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** 재료 판: 활성 카드의 원장 판(data_rev)·과제별 초안 저장 시각·그 카드들 계량 행의 실적 입력 해시 */
export function unitPartsSource(m: Pick<MgUnitMaterials, "cards" | "drafts" | "kpiInputs">): UnitPartsSource {
  const cards = activeCards(m.cards);
  const { inputs } = mergeKpiInputs(m.kpiInputs);
  const keys = cards.flatMap((c) => kpiKeyedRows(c.id, c.data?.kpi?.rows).map((k) => k.key)).sort();
  const ids = new Set(cards.map((c) => c.id));
  return {
    cards: Object.fromEntries(cards.map((c) => [c.id, Number(c.dataRev ?? 0)])),
    drafts: Object.fromEntries(m.drafts.filter((d) => d.spec && ids.has(d.cardId)).map((d) => [d.cardId, d.updatedAt])),
    inputs: fnv8(JSON.stringify(keys.map((k) => [k, inputs[k] ?? ""]))),
  };
}

/** 「재료가 바뀜」 판정: 저장할 때의 재료 판과 지금 재료 판의 다른 점(없으면 빈 목록) */
export function sourceChanges(saved: UnitPartsSource, now: UnitPartsSource): string[] {
  const out: string[] = [];
  const task = (id: string) => id.split("/").pop() ?? id;
  for (const id of Object.keys(now.cards)) {
    if (!(id in saved.cards)) out.push(`카드 ${task(id)}가 새로 들어옴`);
    else if (saved.cards[id] !== now.cards[id]) out.push(`카드 ${task(id)} 원장이 바뀜`);
  }
  for (const id of Object.keys(saved.cards)) if (!(id in now.cards)) out.push(`카드 ${task(id)}가 빠짐(보관 등)`);
  for (const id of Object.keys(now.drafts)) {
    if (!(id in saved.drafts)) out.push(`${task(id)} 과제별 초안이 새로 생김`);
    else if (saved.drafts[id] !== now.drafts[id]) out.push(`${task(id)} 과제별 초안이 바뀜`);
  }
  for (const id of Object.keys(saved.drafts)) if (!(id in now.drafts)) out.push(`${task(id)} 과제별 초안이 없어짐`);
  if (saved.inputs !== now.inputs) out.push("계량 실적 입력이 바뀜");
  return out;
}

/** 부분 하나에 매이지 않는 지표 경고: 과제별 초안이 없는 활성 카드(표지만 있는 혁신가점 지표는 없음) */
export function unitWarnings(m: Pick<MgUnitMaterials, "unit" | "cards" | "drafts">): string[] {
  if (!mgUnitPartKeys(m.unit).some((k) => k !== "cover")) return [];
  const has = new Set(m.drafts.filter((d) => d.spec).map((d) => d.cardId));
  const none = activeCards(m.cards).filter((c) => !has.has(c.id));
  return none.length ? [`초안 없음: ${none.map((c) => c.taskNo).join(" · ")} — 전년 대비·성과분석 문장의 재료가 카드 원장 칸뿐`] : [];
}

/** 재료 → 이 지표의 카드 밖 부분(지표에 없는 부분은 null)과 경고 목록(부분 순서대로 + 초안 없는 카드) */
export function buildUnitPartsMg(m: MgUnitMaterials): { parts: UnitPartsMg; warnings: string[] } {
  const keys = mgUnitPartKeys(m.unit);
  const warnings: string[] = [];
  const take = <T>(r: { part: T; warnings: string[] }): T => {
    warnings.push(...r.warnings);
    return r.part;
  };
  const cover = keys.includes("cover") ? take(buildCoverPart(m)) : null;
  const findings = keys.includes("findings") ? take(buildFindingsPart(m)) : null;
  const prior = keys.includes("prior") ? take(buildPriorPart(m)) : null;
  const outcome = keys.includes("outcome") ? take(buildOutcomePart(m)) : null;
  warnings.push(...unitWarnings(m));
  return {
    parts: { unit: m.unit, indicator: MGMT_INDICATORS.find((x) => x.id === m.unit)?.name ?? m.unit, year: m.year, cover, findings, prior, outcome, source: unitPartsSource(m) },
    warnings,
  };
}

/** 부분들에 남은 【확인: …】 자리표시 수(AI·사람 칸 글 + 달성률 — 지표 완성 점검용) */
export function unitPartsNeeds(p: UnitPartsMg): number {
  const texts = [
    ...(p.findings?.rows.flatMap((r) => r.ai.actions) ?? []),
    ...(p.prior?.rows.flatMap((r) => [...r.human.upTo, ...r.ai.now, ...r.ai.effect]) ?? []),
    ...(p.outcome?.kpi.filter((k) => k.human.checked).flatMap((k) => [kpiRate(k).text, ...k.ai.analysis]) ?? []),
    ...(p.outcome?.qual.flatMap((r) => [...r.ai.result, ...r.ai.analysis]) ?? []),
    ...(p.outcome?.plan.flatMap((r) => [...r.ai.self, ...r.ai.plan]) ?? []),
  ];
  return texts.reduce((n, t) => n + needsIn(t).length, 0);
}
