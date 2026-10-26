// 경평 초안 「분할 축」 사전과 「갈래 칩」 정리(순수 — 2026-10-13, 계획 docs/plan/타기관-짜임-적용-계획.md §2.1).
// 타기관 2025 보고서는 소항목(가·나·다)을 나누는 축(대상 집단·성숙 단계·재난 주기 등)을 과제마다 고르고 그 축의 값을 제목 앞 칩([성숙 시장])으로 보임
// (분석 docs/analysis/2025-산업진흥군-타기관-짜임-분석.md §3 나1~나11·§6 마1). 이야기 틀은 블록 순서만 정하므로 축은 따로 둠.
// 단위: 주요사업은 같은 실행과제 형제 카드끼리 축 하나(칩은 그 카드 소항목 제목 앞), 경영관리는 카드에 축 하나(칩은 절마다).
// AI 답은 선택 문자열로 받고(enum 금지 — 구조화 출력 파싱 실패 교훈), 축 이름은 이 사전으로 맞추고 칩은 표준 값이거나 근거 글에 있는 낱말만 남김.

import { type PromptSet, fillFrom } from "../prompts/template.ts";
import { matchName } from "./frameworks.ts";
import { sourceKey } from "./section.ts";

/** 축을 쓰는 트랙: both = 두 트랙, biz = 주요사업만, mg = 경영관리만 */
export type AxisTrack = "both" | "biz" | "mg";

export interface SplitAxis {
  /** 사전 이름(AI 답·화면·저장 값) */
  name: string;
  /** 같은 축으로 맞출 다른 이름(분석 표 이름 등) */
  aliases: string[];
  /** 한 줄 정의 — 가·나·다가 되는 것 */
  def: string;
  track: AxisTrack;
  /** 표준 값(분석에 근거한 것만 — 없으면 칩은 근거 글에 있는 낱말만) */
  values: string[];
  /** 근거 조건 한 줄(언제 쓸 수 있는지) */
  evidence: string;
}

/** 축 11종(분석 §3 나1~나11 순서) */
export const SPLIT_AXES: readonly SplitAxis[] = [
  { name: "대상 집단", aliases: ["대상 집단·등급", "대상 등급", "대상 유형"], def: "지원 대상의 갈래·등급(시장 등급·기업 규모·지역·대상 유형)마다 소항목 하나", track: "both", values: [], evidence: "집단별 실적이 근거에 있을 때" },
  { name: "성숙 단계", aliases: ["성숙·성장 단계", "성장 단계"], def: "대상(기술·기업·서비스)이 크는 단계 — 태동 → 성장 → 성숙", track: "both", values: ["태동", "성장", "성숙", "태동기", "성장기", "성숙기"], evidence: "단계별 실적이 근거에 있을 때" },
  { name: "고객 여정", aliases: [], def: "국민·고객이 거치는 단계(인지 → 신청 → 처리 → 사후)마다 — 기관이 하는 일의 단계가 아님", track: "both", values: [], evidence: "단계별 개선이 근거에 있을 때(VOC가 있으면 더 좋음)" },
  { name: "가치사슬", aliases: [], def: "생산 → 분석 → 개방·활용처럼 이어지는 사슬의 고리마다(시간 순서가 아님)", track: "biz", values: [], evidence: "고리마다 활동이 근거에 있을 때" },
  { name: "전략 이름 묶음", aliases: ["전략 이름", "전략명"], def: "계획·카드에 기관이 이름 붙인 전략(예: 공세·수성·확산)마다", track: "both", values: [], evidence: "전략 이름이 계획·카드에 적혀 있을 때만 — 이름을 지어내지 않음" },
  { name: "공간·주체 렌즈", aliases: ["공간 렌즈", "주체 렌즈"], def: "보는 자리(시설·이용자·기관, 면·점·선)마다", track: "both", values: [], evidence: "렌즈별 활동이 근거에 있을 때" },
  { name: "순환 고리", aliases: ["순환 고리의 칸", "선순환 고리"], def: "사업 생태계의 순환 고리(양성 → 고용 → 성장 → 수요) 칸마다", track: "biz", values: [], evidence: "고리 각 칸의 실적이 근거에 있을 때" },
  { name: "관리 단계", aliases: ["관리 단계(PDCA)", "PDCA"], def: "계획 → 실행 → 점검 → 환류 순서로 절을 둠(블록 하나가 아니라 절의 순서)", track: "mg", values: ["계획", "실행", "점검", "환류", "Plan", "Do", "Check", "Act"], evidence: "단계별 기록이 근거에 있을 때" },
  { name: "재난 주기", aliases: [], def: "예방 → 대비 → 대응 → 복구 국면마다", track: "both", values: ["예방", "대비", "대응", "복구"], evidence: "국면별 활동이 근거에 있을 때" },
  { name: "가치 축", aliases: ["가치 축을 대주제로"], def: "성장성·안정성·효율성(또는 공공성·효율성) 같은 가치 축마다", track: "mg", values: ["성장성", "안정성", "효율성", "공공성"], evidence: "축별 실적이 근거에 있을 때" },
  { name: "분야 × 단계", aliases: ["분야×단계 행렬", "분야 × 단계 행렬"], def: "하위 분야마다 같은 절차를 적용한 과제 — 분야가 소항목", track: "both", values: [], evidence: "분야별 결과 수치가 근거에 있을 때" },
];

/** 근거 글에 반드시 있어야 하는 축(표준 값 없음·지어내기 금지) */
const STRICT_AXES = new Set(["전략 이름 묶음"]);

/** 칩 글자 한도 */
export const CHIP_MAX = 12;

/** 이 트랙에서 쓰는 축 */
export const axesFor = (track: "biz" | "mg"): SplitAxis[] => SPLIT_AXES.filter((a) => a.track === "both" || a.track === track);

/** 곱하기 표기(x·X·✕) 맞춤 — 「분야 x 단계」 */
const timesKey = (s: string) => s.replace(/\s*[xX✕✖]\s*/g, " × ");

/** AI 답·화면의 축 이름 → 사전 이름(이 트랙에서 쓰지 않거나 모르면 빈 글). frameworks.ts matchName(가운뎃점 변형·띄어쓰기·괄호)을 그대로 씀 */
export function matchAxis(raw: unknown, track: "biz" | "mg"): string {
  if (typeof raw !== "string" || !raw.trim()) return "";
  const axes = axesFor(track);
  const names = axes.flatMap((a) => [a.name, ...a.aliases]);
  const hit = matchName(raw, names) || matchName(timesKey(raw), names);
  return hit ? (axes.find((a) => a.name === hit || a.aliases.includes(hit))?.name ?? "") : "";
}

/** 칩 앞뒤의 괄호·따옴표(대괄호 등)를 걷고 띄어쓰기를 하나로 */
const stripChip = (raw: unknown) =>
  String(raw ?? "")
    .normalize("NFC")
    .replace(/[[\]【】「」『』〔〕〈〉《》<>()（）"'“”‘’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * 칩 정리(결정론): 괄호·따옴표를 걷고 12자 이내, 축의 표준 값이거나 근거 글(hayKey — section.ts sourceKey로 걷은 글)에 있는 낱말일 때만 통과.
 * 칩 전체가 근거에 있거나, 가운뎃점·빗금으로 나눈 조각마다 표준 값 또는 근거에 있으면 됨(근거 대조는 2자 이상만). 「전략 이름 묶음」은 표준 값이 없어 근거에 있어야만 함.
 * keep = 이미 저장된 칩(앞서 검증됨 — 사람 편집에서 그대로 두면 근거 글 없이도 남김). 통과 못 하면 칩을 버리고 경고 글
 */
export function cleanChip(raw: unknown, axis: string, hayKey: string, keep = ""): { chip: string; warning: string } {
  const s = stripChip(raw);
  if (!s) return { chip: "", warning: "" };
  const ax = SPLIT_AXES.find((a) => a.name === axis);
  if (!ax) return { chip: "", warning: `갈래: 갈래 축이 없어 칩 [${s}]을(를) 뺐습니다.` };
  if ([...s].length > CHIP_MAX) return { chip: "", warning: `갈래: 칩 [${s}]이 ${CHIP_MAX}자를 넘어 뺐습니다.` };
  if (keep && s === keep) return { chip: s, warning: "" };
  const inHay = (x: string) => {
    const k = sourceKey(x);
    return k.length >= 2 && hayKey.includes(k);
  };
  const std = (x: string) => ax.values.some((v) => sourceKey(v) === sourceKey(x));
  const pieces = s.split(/\s*[·ㆍ・･∙/,]\s*/).filter(Boolean);
  if (inHay(s) || pieces.every((x) => std(x) || inHay(x))) return { chip: s, warning: "" };
  return {
    chip: "",
    warning: STRICT_AXES.has(ax.name) ? `갈래: 칩 [${s}] — 「${ax.name}」 칩은 계획·카드에 적힌 전략 이름만 씁니다(근거에서 찾지 못해 뺐습니다).` : `갈래: 칩 [${s}]이 「${ax.name}」의 표준 값도 아니고 근거 글에도 없어 뺐습니다.`,
  };
}

/**
 * 축·칩 한 쌍 정리(주요사업 구성안 — AI 답·사람 편집 공용): 축은 사전 이름으로(모르면 버림 — 축 없이 칩만 쓸 수 없음), 칩은 cleanChip.
 * 축이 없으면 split 없음(구성안에 필드를 두지 않음). keep = 저장된 칩(같은 축일 때만 넘김)
 */
export function cleanSplit(axisRaw: unknown, chipRaw: unknown, track: "biz" | "mg", hayKey: string, keep = ""): { split?: { axis: string; chip: string }; warnings: string[] } {
  const axis = matchAxis(axisRaw, track);
  const warnings: string[] = [];
  if (!axis) {
    const name = stripChip(axisRaw);
    if (name) warnings.push(`갈래: 「${name}」은(는) 이 트랙의 갈래 축 사전에 없어 뺐습니다.`);
    if (stripChip(chipRaw)) warnings.push(`갈래: 갈래 축이 없어 칩 [${stripChip(chipRaw)}]을(를) 뺐습니다.`);
    return { warnings };
  }
  const c = cleanChip(chipRaw, axis, hayKey, keep);
  if (c.warning) warnings.push(c.warning);
  return { split: { axis, chip: c.chip }, warnings };
}

// ---------------------------------------------------------------------------
// 요청 글

/** 축 사전 글(요청 split.axis·split.values 절 — 트랙별) */
export function splitAxesText(p: PromptSet, track: "biz" | "mg"): string {
  return axesFor(track)
    .map((a) => fillFrom(p, "request", "split.axis", { name: a.name, def: a.def, values: a.values.length ? fillFrom(p, "request", "split.values", { values: a.values.join("·") }) : "", evidence: a.evidence }))
    .join("\n");
}

/** 구성안 요청 「갈래 축」 머리(사전 + 쓰는 법 — split.head) */
export const splitHeadPrompt = (p: PromptSet, track: "biz" | "mg") => fillFrom(p, "request", "split.head", { axes: splitAxesText(p, track) });

/** 같은 실행과제 형제 카드의 소항목(주요사업 — 형제 축 공유) */
export interface SplitSibling {
  /** 소항목 표지(가·나·다) */
  mark: string;
  title: string;
  /** 형제 구성안의 축(없으면 빈 글) */
  axis: string;
  /** 형제 구성안(또는 초안)의 칩(없으면 빈 글) */
  chip: string;
}

/** 형제들이 쓴 축(처음 나온 것 — 사전 이름) */
export const siblingAxis = (siblings: SplitSibling[]): string => siblings.find((s) => s.axis)?.axis ?? "";

/**
 * 구성안 요청 「같은 실행과제의 다른 소항목」(주요사업 split.sibling·split.none·split.siblingItem): 형제가 축을 이미 쓰면 같은 축으로 값만 고르게,
 * 아무도 안 썼으면 이 소항목이 정한 축을 형제가 따른다고 알림. 형제가 없으면 빈 글
 */
export function splitSiblingsPrompt(p: PromptSet, task: string, siblings: SplitSibling[]): string {
  if (!siblings.length) return "";
  const items = siblings.map((s) => fillFrom(p, "request", "split.siblingItem", { mark: s.mark || "—", title: s.title || "—", chip: s.axis ? `「${s.axis}」 [${s.chip || "칩 없음"}]` : "축 없음" })).join("\n");
  const axis = siblingAxis(siblings);
  return axis ? fillFrom(p, "request", "split.sibling", { task, axis, items }) : fillFrom(p, "request", "split.none", { task, items });
}

/** 형제와 다른 축·같은 칩 경고(주요사업 — 경고만, 막지 않음) */
export function splitSiblingIssues(split: { axis: string; chip: string } | undefined, siblings: SplitSibling[]): string[] {
  if (!split?.axis) return [];
  const out: string[] = [];
  const other = siblings.filter((s) => s.axis && s.axis !== split.axis);
  if (other.length) out.push(`갈래: 갈래 축 「${split.axis}」이 같은 실행과제 형제(${other.map((s) => `${s.mark}. 「${s.axis}」`).join(" · ")})와 다릅니다 — 한 실행과제의 소항목은 같은 축으로 나눕니다.`);
  const same = split.chip ? siblings.filter((s) => s.axis === split.axis && s.chip === split.chip) : [];
  if (same.length) out.push(`갈래: 칩 [${split.chip}]이 같은 실행과제 형제(${same.map((s) => s.mark).join("·")})와 같습니다 — 소항목마다 다른 값을 맡습니다.`);
  return out;
}
