// 경영관리 「편람 항목표」(순수, 2026-11-19 사용자 결정 D1 안 2 — 설계 .team/H3-design.md):
// 평가내용 번호 = '26 편람(11.13 수정) 지표 안 번호(2025 보고서와 같은 셈 — 비계량·가점 성분의 세부평가내용을 편람 순서로 이어 셈, 계량 성분은 보고서 본문 밖).
// 2025 보고서 조각(rpt25-mg-NN)은 읽을 때 이 표로 '26 번호로 옮김(to26) — 번호가 실제로 밀리는 지표는 상생(MG-7) 하나(옛 2 → 3, 옛 3 → 4, ② 신설).
// 번호·종류·추천 카드·2025 대응은 이 코드 표(짧은 이름만 — 원문 없음), 제목·착안사항은 편람 조각(plan-2607 handbook26/MG-N/k* + 수정본 hb26r-2611 같은 자리 — 수정본이 같은 번호를 가지면 그 글)에서 읽음.
// 뺀 항목(D7): 재무 ④⑤(수립 대상·재무위험기관만), 보수 비계량 1/2 직무급(점검 결과 반영) — 2025 보고서 표지에도 없음.

import type { LooseJson } from "../loose-json.ts";

/** 종류: 같음 · 수정(11.13 수정본이 문구를 바꿈) · 신설26('26 편람 최초 — 2025 보고서에 없음) · 신설2611(11.13 수정본 신설) */
export type MgItemKind = "같음" | "수정" | "신설26" | "신설2611";

/** 항목표 한 줄(코드 표) */
export interface MgItemPlan {
  /** '26 지표 안 번호 */
  no: number;
  /** 짧은 이름(편람 글을 못 읽을 때의 제목·화면 줄) */
  short: string;
  kind: MgItemKind;
  /** 2025 보고서 평가내용 번호(2025에 없으면 없음) */
  from?: number;
  /** 편람 조각 열쇠 끝(`…/handbook26/<지표>/<comp>`) */
  comp: string;
  /** 그 조각 세부평가내용의 동그라미 번호 */
  at: number;
  /** 최초 편람 조각(revision 없음)의 동그라미 번호 — `at`(11.13 수정본 기준)과 다를 때만(상생: 수정본에서 번호가 밀림) */
  atOrig?: number;
  /** 동그라미 항목 아래 「-」 순서(혁신가점 ③ — 1부터). 없으면 동그라미 항목 자체 */
  dash?: number;
  /** 신설 항목의 2025 참고 절(2025 번호 「평가내용.대주제.표지」 — 짜임 참고일 뿐 근거 아님) */
  ref25?: string;
}

const same = (no: number, short: string, comp: string, at = no, from = no): MgItemPlan => ({ no, short, kind: "같음", from, comp, at });

/** 14지표 항목표('26 편람 11.13 수정 기준). 2025 평가내용 39개가 from으로 하나씩만 대응(mg-items.test.ts 불변식) */
export const MG_ITEM_PLAN: Readonly<Record<string, readonly MgItemPlan[]>> = {
  "MG-1": [same(1, "비전·경영전략", "k1"), same(2, "경영혁신", "k1")],
  "MG-2": [same(1, "윤리경영 표준모델", "k2"), same(2, "이해충돌 방지", "k2"), same(3, "인권존중", "k2")],
  "MG-3": [
    { no: 1, short: "청년 등 신규채용·일자리 창출", kind: "수정", from: 1, comp: "k2", at: 1 },
    same(2, "민간 일자리 창출", "k2"),
    same(3, "사회형평적 인력 채용", "k2"),
    same(4, "여성 대표성 제고", "k2"),
    { no: 5, short: "비정규직 차별해소·처우개선", kind: "신설26", comp: "k2", at: 5, ref25: "1.2.다" },
    { no: 6, short: "공정채용", kind: "신설2611", comp: "k2", at: 6, ref25: "1.2.나" },
  ],
  // 두 성분(산업재해 k2 · 재난 k3)을 이어 셈(편람은 성분마다 ① — 2025 보고서 표기를 따름)
  "MG-4": [
    { no: 1, short: "산업재해 예방·근로환경 개선", kind: "수정", from: 1, comp: "k2", at: 1 },
    { no: 2, short: "재난관리시스템", kind: "수정", from: 2, comp: "k3", at: 1 },
  ],
  "MG-5": [same(1, "친환경·탄소중립", "k2")],
  "MG-6": [
    same(1, "동반 해외진출·수주 지원", "k1"),
    same(2, "데이터 개방·협업", "k1"),
    same(3, "중소기업 기술마켓", "k1"),
    same(4, "미활용 특허 공유·이전", "k1"),
    { no: 5, short: "연기금 벤처투자", kind: "신설26", comp: "k1", at: 5 },
    { no: 6, short: "청년 창업 지원", kind: "신설2611", comp: "k1", at: 6 },
  ],
  "MG-7": [
    same(1, "중소기업·소상공인 상생·공정", "k2"),
    { no: 2, short: "지역업체 발주·지역기업 육성", kind: "신설2611", comp: "k2", at: 2, ref25: "2.4.나" },
    { no: 3, short: "기부·봉사·지역인재 양성", kind: "수정", from: 2, comp: "k2", at: 3, atOrig: 2 },
    { ...same(4, "시설·장비 개방", "k2", 4, 3), atOrig: 3 },
  ],
  "MG-8": [same(1, "재무구조 안정성·건전성", "k1"), same(2, "예산편성·집행", "k1"), same(3, "재무성과 수준·개선", "k1")],
  "MG-9": [same(1, "조직·인력 운용", "k1"), same(2, "성과평가시스템", "k1"), same(3, "역량·직무 전문성", "k1"), same(4, "임금피크제", "k1"), same(5, "일·가정 양립", "k2", 1)],
  "MG-10": [same(1, "노사 협력체계 적법 운영", "k1"), same(2, "노사 소통·관계 관리", "k1"), same(3, "근로조건 향상", "k1")],
  "MG-11": [same(1, "규정 준수", "k2"), same(2, "인건비·복리후생 적정", "k2"), same(3, "통상임금·보수체계", "k2")],
  "MG-12": [same(1, "안전한 일터 조성", "k1")],
  "MG-13": [same(1, "AI 활용 혁신", "k1", 2)],
  "MG-14": [
    { ...same(1, "정부정책 수행·홍보", "k1", 3), dash: 1 },
    { ...same(2, "신속투자집행", "k1", 3), dash: 2 },
    { no: 3, short: "청년 등 신규채용 확대", kind: "수정", from: 3, comp: "k1", at: 3, dash: 3 },
    { ...same(4, "국민체감도 향상", "k1", 3), dash: 4 },
    { no: 5, short: "기능개혁 추진방안 이행", kind: "신설2611", comp: "k1", at: 3, dash: 5 },
  ],
};

/**
 * 카드 ↔ '26 평가내용 추천 기본값(구성안의 추천 값 — 사람이 구성안·목차에서 고름). 2025 대응(분석 §5)에서 바뀐 것(2026-11-19 사용자 결정):
 * 3-1 → 1·3·5·6(D10 — 공정채용 ⑥·비정규직 ⑤ 신설), 4-3(정보보안) → 2 재난관리(D8 — 2025 보고서는 사이버 재난을 평가내용2에 씀), 6-1 → 1·6(청년 창업 신설), 7-4 → 3·7-5 → 4(상생 번호 이동).
 * 혁신가점 12·13은 평가내용이 하나라 키 없음(그 지표의 평가내용 모두)
 */
export const MG_CARD_EVALS: Record<string, number[]> = {
  "1-1": [1],
  "1-2": [2],
  "2-1": [1],
  "2-2": [2],
  "2-3": [3],
  "3-1": [1, 3, 5, 6],
  "3-2": [2],
  "3-3": [4],
  "3-4": [4],
  "4-1": [1],
  "4-2": [1],
  "4-3": [2],
  "5-1": [1],
  "5-2": [1],
  "5-3": [1],
  "6-1": [1, 6],
  "6-2": [2],
  "6-3": [3],
  "6-4": [4],
  "7-1": [1],
  "7-2": [1],
  "7-3": [1],
  "7-4": [3],
  "7-5": [4],
  "8-1": [1],
  "8-2": [2],
  "8-3": [3],
  "9-1": [1],
  "9-2": [2],
  "9-3": [3, 4],
  "9-4": [5],
  "10-1": [2],
  "10-2": [1, 2],
  "10-3": [3],
  "11-1": [3],
  "11-2": [1],
  "11-3": [2],
  "11-4": [2],
  "14-1": [1],
  "14-2": [3],
};

/** 담당 카드가 정해지지 않은 항목의 후보 카드(D4·D5 — 추천 기본값에 넣지 않고 목차·항목표에 「후보」로만 보임). 창업 ⑤ 연기금(D6)은 후보 없음 */
export const MG_ITEM_CANDIDATES: Readonly<Record<string, Readonly<Record<number, readonly string[]>>>> = {
  "MG-7": { 2: ["7-3"] },
  "MG-14": { 5: ["14-1", "1-1"] },
};

/** 2025 보고서 평가내용 번호 → '26 번호(항목표에 없는 지표·번호는 그대로) */
export function to26(unit: string, n: number): number {
  return MG_ITEM_PLAN[unit]?.find((x) => x.from === n)?.no ?? n;
}

/** '26 번호 → 2025 보고서 평가내용 번호(2025에 없으면 null, 항목표에 없는 지표는 그대로) */
export function from26(unit: string, no: number): number | null {
  const plan = MG_ITEM_PLAN[unit];
  if (!plan) return no;
  return plan.find((x) => x.no === no)?.from ?? null;
}

// ---------------------------------------------------------------------------
// 편람 조각 글 읽기

/** 편람 조각(필요한 열만 — plan-2607 handbook26/MG-N/k* · hb26r-2611 같은 자리) */
export interface MgHandbookRow {
  chunk_key: string;
  text: string;
  meta?: LooseJson;
}

const oneLine = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
/** 줄바꿈으로 끊긴 한 문장을 이음(가운뎃점 뒤·여는 괄호 앞은 붙임) */
const joinWrapped = (lines: string[]) => lines.reduce((acc, l) => (!acc ? l : /[·･]$/.test(acc) || /^\(/.test(l) ? `${acc}${l}` : `${acc} ${l}`), "");

const circledNo = (ch: string) => {
  const c = ch.codePointAt(0) ?? 0;
  return c >= 0x2460 && c <= 0x2473 ? c - 0x245f : c - 0x277f;
};

/** 동그라미 항목 하나: 머리 글 + 아래 줄(「-」·「*」 — 순서대로, 「※」 줄은 뺌) */
interface HbItem {
  no: number;
  head: string;
  marks: Array<{ kind: "-" | "*"; text: string }>;
}

/** 조각 글의 「세부평가내용:」 칸 → 동그라미 항목들(「⋮」 = 수정본이 줄인 자리 — 건너뜀) */
export function handbookItems(text: string): HbItem[] {
  const at = text.search(/(?:^|\n)세부평가내용:/);
  if (at < 0) return [];
  const body = text.slice(at).replace(/^\n?세부평가내용:\s*/, "");
  const out: Array<{ no: number; head: string[]; marks: Array<{ kind: "-" | "*" | "※"; lines: string[] }> }> = [];
  for (const raw of body.split("\n")) {
    const l = raw.trim();
    if (!l) continue;
    if (/^(?:지표정의|적용대상\(배점\)):/.test(l)) break;
    const m = /^([①-⑳➀-➉])\s*(.*)$/.exec(l);
    if (m) {
      out.push({ no: circledNo(m[1]), head: [m[2]], marks: [] });
      continue;
    }
    const cur = out.at(-1);
    if (!cur) continue;
    if (/^⋮/.test(l)) {
      cur.marks.push({ kind: "※", lines: [] });
      continue;
    }
    const k = /^([-*※])\s*(.*)$/.exec(l);
    // 「※」 단서 바로 아래 「*」 줄은 그 단서의 각주(중대재해 정의 등) — 단서와 함께 뺌(다음 「-」 항목부터 다시 받음)
    const inNote = cur.marks.at(-1)?.kind === "※";
    if (k && k[1] === "*" && inNote) cur.marks.at(-1)!.lines.push(k[2]);
    else if (k) cur.marks.push({ kind: k[1] as "-" | "*" | "※", lines: [k[2]] });
    else if (cur.marks.length) cur.marks[cur.marks.length - 1].lines.push(l);
    else cur.head.push(l);
  }
  return out.map((x) => ({
    no: x.no,
    head: oneLine(joinWrapped(x.head)),
    marks: x.marks.filter((k): k is { kind: "-" | "*"; lines: string[] } => k.kind !== "※").map((k) => ({ kind: k.kind, text: oneLine(joinWrapped(k.lines)) })).filter((k) => k.text),
  }));
}

/** 착안사항 줄 수·글자 상한(요청 길이를 묶음 — 착안사항은 짜임 판단용 요약이라 원문 전부가 아님) */
const POINTS_MAX = 6;
const POINT_CHARS = 200;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** 항목표 한 줄의 편람 글: 제목(머리)·착안사항. 혁신가점 ③은 「-」 순서의 머리와 그 아래 「*」 줄 */
function itemText(p: MgItemPlan, items: HbItem[], at = p.at): { head: string; points: string[] } | null {
  const it = items.find((x) => x.no === at);
  if (!it) return null;
  if (p.dash === undefined) return { head: it.head, points: it.marks.map((k) => k.text) };
  const starts = it.marks.map((k, i) => (k.kind === "-" ? i : -1)).filter((i) => i >= 0);
  const s = starts[p.dash - 1];
  if (s === undefined) return null;
  const end = starts[p.dash] ?? it.marks.length;
  return { head: it.marks[s].text, points: it.marks.slice(s + 1, end).filter((k) => k.kind === "*").map((k) => k.text) };
}

// ---------------------------------------------------------------------------
// 항목표 만들기

/** 2025 참고 절(신설 항목 — '26 번호로 옮긴 열쇠와 이름) */
export interface MgItemRef {
  /** '26 번호 절 열쇠(평가내용.대주제.표지) */
  key: string;
  /** 「평가내용 1 · 대주제 2 · 나. 제목」(2025 절 제목) */
  label: string;
}

export interface MgItem {
  no: number;
  /** 같음이면 2025 제목(기존 초안과 같은 글), 수정·신설이면 편람 문구(못 읽으면 짧은 이름) */
  title: string;
  short: string;
  kind: MgItemKind;
  /** 착안사항 줄(편람 「*」·「-」 줄 — 앞 POINTS_MAX개) */
  points: string[];
  /** 추천 카드(MG_CARD_EVALS — 과제번호) */
  cards: string[];
  /** 후보 카드(담당 미정 — MG_ITEM_CANDIDATES) */
  candidates: string[];
  /** 2025 보고서 평가내용 번호(없으면 null) */
  from2025: number | null;
  ref25: MgItemRef | null;
  /** 다른 카드 구성안이 이 항목에 둔 절 수(과제번호마다) */
  taken: Array<{ taskNo: string; parts: number }>;
}

/** mgItems가 쓰는 2025 골격(평가내용 번호는 '26으로 옮긴 것 — mg-outline.ts toMgPriorSection) */
interface PriorLite {
  evalNo: number;
  evalNo2025?: number;
  evalTitle: string;
  themeNo: number;
  mark: string;
  title: string;
}

/** mgItems가 쓰는 형제 구성안(mg-outline.ts MgSibling) */
interface SiblingLite {
  taskNo: string;
  parts: Array<{ evalNo: number }>;
}

/** 같은 지표 카드의 과제번호가 그 지표의 것인지(MG-7 → 7-…) */
const unitTasks = (unit: string) => {
  const n = /^MG-(\d+)$/.exec(unit)?.[1];
  return (t: string) => Boolean(n) && t.split("-")[0] === n;
};

/**
 * 지표 하나의 항목표(번호 순): 코드 표(MG_ITEM_PLAN) + 편람 조각 글(같은 자리의 수정본이 그 번호를 가지면 수정본 — meta.revision) + 2025 골격(같음 항목의 제목·신설 항목 참고 절) + 형제 구성안(다른 카드가 둔 절 수).
 * 편람 글을 못 읽은 수정·신설 항목은 짧은 이름을 제목으로 쓰고 경고. 항목표에 없는 지표는 빈 목록
 */
export function mgItems(unit: string, handbook: readonly MgHandbookRow[], opts: { prior?: readonly PriorLite[]; siblings?: readonly SiblingLite[] } = {}): { items: MgItem[]; warnings: string[] } {
  const plan = MG_ITEM_PLAN[unit];
  if (!plan) return { items: [], warnings: [] };
  const prior = opts.prior ?? [];
  const mine = unitTasks(unit);
  const warnings: string[] = [];
  const parsed = new Map<string, HbItem[]>();
  const rowsOf = (comp: string) => {
    const tail = `/handbook26/${unit}/${comp}`;
    const rows = handbook.filter((r) => r.chunk_key.endsWith(tail));
    // 수정본(meta.revision) 먼저 — 그 번호가 없으면(「⋮」로 줄인 자리) 최초 조각
    return [...rows.filter((r) => typeof r.meta?.revision === "string"), ...rows.filter((r) => typeof r.meta?.revision !== "string")];
  };
  const textOf = (p: MgItemPlan) => {
    for (const r of rowsOf(p.comp)) {
      const revised = typeof r.meta?.revision === "string";
      // 11.13 신설 항목은 최초 편람에 없음 · 최초 조각은 그 조각의 번호(atOrig)로 찾음
      if (!revised && p.kind === "신설2611") continue;
      if (!parsed.has(r.chunk_key)) parsed.set(r.chunk_key, handbookItems(r.text));
      const t = itemText(p, parsed.get(r.chunk_key)!, revised ? p.at : (p.atOrig ?? p.at));
      if (t?.head) return t;
    }
    return null;
  };
  const items = plan.map((p): MgItem => {
    const t = textOf(p);
    const t2025 = p.from ? prior.find((s) => (s.evalNo2025 ?? s.evalNo) === p.from)?.evalTitle : undefined;
    const title = p.kind === "같음" && t2025 ? t2025 : (t?.head ?? t2025 ?? p.short);
    if (!t && p.kind !== "같음") warnings.push(`편람 항목표: ${unit} 평가내용 ${p.no}(${p.short})의 편람 글을 읽지 못해 짧은 이름을 제목으로 씁니다.`);
    let ref25: MgItemRef | null = null;
    if (p.ref25) {
      const [e, th, mk] = p.ref25.split(".");
      const s = prior.find((x) => (x.evalNo2025 ?? x.evalNo) === Number(e) && x.themeNo === Number(th) && x.mark === (mk === "0" ? "" : mk));
      if (s) ref25 = { key: `${s.evalNo}.${s.themeNo}.${s.mark || "0"}`, label: `평가내용 ${s.evalNo} · 대주제 ${s.themeNo}${s.mark ? ` · ${s.mark}. ${s.title}` : ""}` };
    }
    const taken = (opts.siblings ?? []).map((sb) => ({ taskNo: sb.taskNo, parts: sb.parts.filter((x) => x.evalNo === p.no).length })).filter((x) => x.parts > 0);
    return {
      no: p.no,
      title: oneLine(title),
      short: p.short,
      kind: p.kind,
      points: (t?.points ?? []).slice(0, POINTS_MAX).map((x) => clip(x, POINT_CHARS)),
      cards: Object.entries(MG_CARD_EVALS).filter(([task, nos]) => mine(task) && nos.includes(p.no)).map(([task]) => task),
      candidates: [...(MG_ITEM_CANDIDATES[unit]?.[p.no] ?? [])],
      from2025: p.from ?? null,
      ref25,
      taken,
    };
  });
  return { items, warnings };
}

/** 종류 표지(요청·화면): 수정·신설만 — 같음은 빈 글 */
export function mgItemTag(kind: MgItemKind): string {
  return kind === "수정" ? "수정" : kind === "신설26" ? "신설('26 편람)" : kind === "신설2611" ? "신설(11.13 수정)" : "";
}

/** 신설 항목인가(2025 보고서에 없음) */
export const isNewItem = (it: Pick<MgItem, "kind">) => it.kind === "신설26" || it.kind === "신설2611";
