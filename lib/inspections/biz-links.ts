// 경영관리 월간 점검의 주요사업 연계 후보 고르기(지침 13 [붙임4 사용 규칙]) — 순수 함수.
// 2026-10-12 사용자 결정: 붙임4(주요사업 과제관리카드 파일)는 이 앱에 없으므로 원장의 주요사업 카드(cards.data, 보관 제외)를 붙임4 자리로 씁니다.
// 카드 전용 자료·부서 작성본·검색 결과는 넣지 않습니다(금기 4). 읽기는 호출하는 쪽(서버 액션 — 로그인 사용자 권한, 연기 시험 — 서비스 키)이 합니다.
// 고르는 순서: (a) 경영관리 카드 글이 인용한 주요사업 과제번호(인용 대조용) → (b) 지침 13의 [경영관리 지표 ↔ 주요사업 연계 색인] 번호 → (c) 글자 겹침 상위 3장.
// 같은 카드는 한 번, 본문을 주는 카드는 BIZ_LINK_MAX장까지 — 넘친 (a)·(b)는 「번호 · 과제명」 목록으로만, 넘친 (c)는 버림.

import { inspectionCardText } from "../ai/inspect.ts";
import { cardOutline } from "../ai/writer.ts";
import { resolveMgmtUnit } from "../knowledge/dictionaries-mg.ts";
import { rankSimilar } from "../reports/prior.ts";
import type { LooseJson } from "../loose-json.ts";

type Json = LooseJson;

/** 본문(원장 발췌)을 주는 주요사업 카드 상한 */
export const BIZ_LINK_MAX = 10;
/** (c) 글자 겹침으로 더하는 카드 수 */
export const BIZ_SIMILAR_TOP = 3;

/** 고른 이유: a 경영관리 카드가 인용 · b 지침 연계 색인 · c 글자 겹침 */
export type LinkReason = "a" | "b" | "c";
export const LINK_REASON_LABEL: Record<LinkReason, string> = { a: "이 카드가 인용", b: "지침 연계 색인", c: "글자 겹침" };

/** 원장의 주요사업 카드 한 장(호출하는 쪽이 읽어 넘김) */
export interface BizLedgerCard {
  /** 「주요사업N N-가」 */
  id: string;
  title: string;
  /** 부서(팀) */
  dept: string;
  /** 원장 시점(mgCardAsOf) */
  asOf: string;
  data: Json;
}

export interface BizLinkCandidate {
  id: string;
  title: string;
  dept: string;
  asOf: string;
  reasons: LinkReason[];
  /** 원장 발췌 글(주요사업 월간 점검과 같은 카드 풀이 — inspectionCardText) */
  text: string;
}

export interface BizLinkPack {
  /** 경영관리 카드의 과제번호(운영 알림 「경영관리 ○○」) */
  task: string;
  /** 본문을 주는 카드(최대 BIZ_LINK_MAX) */
  cards: BizLinkCandidate[];
  /** 상한을 넘은 (a)·(b) — 번호·과제명만 */
  more: Array<{ id: string; title: string; reasons: LinkReason[] }>;
  /** 이 지표에 연계 색인 행이 있는가(없으면 지침 「억지로 연결하지 않는다」) */
  indexed: boolean;
  /** 경영관리 카드가 인용했지만 원장에 없는 과제번호(인용 대조 — 운영 알림) */
  unknownCited: string[];
}

/** 카드 JSON → 「주요사업N N-가」(묶음 id가 주요사업N이 아니면 null) */
export function bizTaskId(data: Json): string | null {
  const g = String(data?.group ?? "");
  const no = String(data?.taskNo ?? "").trim();
  return /^주요사업\d$/.test(g) && /^\d{1,2}-[가-힣]$/.test(no) ? `${g} ${no}` : null;
}

// 번호 끝 글자 뒤에는 한글이 오지 않거나 조사 한 글자만(「5-나와」는 잡고 「2-가능성」은 안 잡음)
const NO_RE = /주요사업\s*(\d)|(\d{1,2})\s*-\s*([가-힣])(?=(?:와|과|의|에|은|는|을|를|로|도)?(?![가-힣]))/g;
/** 번호 사이에 끼어도 같은 「주요사업N」 접두가 이어지는 글: 괄호 설명을 뺀 뒤 구분 기호·띄어쓰기·이음말만 */
const JOINER_RE = /^[\s·,、/]*(?:(?:및|과|와)[\s·,、/]*)?$/;

/**
 * 글에 적힌 주요사업 과제번호(「주요사업N N-가」, 앞 접두가 이어지는 「주요사업1 1-라·9-나」 표기 포함) — 나온 순서, 같은 번호는 한 번.
 * 접두는 번호 사이가 구분 기호·괄호 설명뿐일 때만 이어지고, 다른 글이 끼면 끊김(경영관리 카드의 「1-가」 같은 다른 번호를 잘못 잡지 않게)
 */
export function bizTaskIdsIn(text: string): string[] {
  const out: string[] = [];
  let prefix: string | null = null;
  let last = 0;
  for (const m of text.matchAll(NO_RE)) {
    const gap = text.slice(last, m.index).replace(/\([^()]*\)/g, "");
    last = m.index + m[0].length;
    if (m[1]) {
      prefix = m[1];
      continue;
    }
    if (prefix && !JOINER_RE.test(gap)) prefix = null;
    if (!prefix) continue;
    const id = `주요사업${prefix} ${m[2]}-${m[3]}`;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** 지침 13 연계 색인의 한 행 */
export interface LinkIndexRow {
  /** 색인 첫 칸 글 그대로(예 「가점 AI 활용 혁신」) */
  name: string;
  /** 평가단위 MG-N — 카드가 없는 평가 항목(국민소통)은 null */
  unit: string | null;
  /** 지표 사전이 아는 이름인가(모르면 추측하지 않음 — 시험이 실패시킴) */
  known: boolean;
  /** 「먼저 볼 주요사업 과제」 칸의 번호(나온 순서) */
  ids: string[];
}

/**
 * 지침 13 [경영관리 지표 ↔ 주요사업 연계 색인] 표를 읽음. 지표 이름은 「가점 」 접두를 떼고 지표 사전(resolveMgmtUnit)으로 풂.
 * 번호가 없는 칸 글(「총괄표 【지역과제】 표시 과제 전체」·「모든 카드의 '전략 연계성' 국정과제 번호」)은 원장에 그 표시가 없어 건너뜀
 */
export function parseLinkIndex(guide: string): LinkIndexRow[] {
  const start = guide.indexOf("[경영관리 지표 ↔ 주요사업 연계 색인");
  if (start < 0) return [];
  const rows: LinkIndexRow[] = [];
  for (const line of guide.slice(start).split("\n").slice(1)) {
    if (!line.startsWith("|")) {
      if (rows.length || line.trim()) break;
      continue;
    }
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells[0] === "경영관리 지표" || cells.length < 2) continue;
    const name = cells[0];
    const r = resolveMgmtUnit(name.replace(/^가점\s+/, ""));
    rows.push({ name, unit: r.unit, known: r.known, ids: bizTaskIdsIn(cells[1]) });
  }
  return rows;
}

/** 카드 풀이 글에서 칸 경로(「do.lines.3 | 」)를 뗀 글 — 글자 겹침 계산용 */
const plainOutline = (card: Json) =>
  cardOutline(card)
    .split("\n")
    .map((l) => l.replace(/^[^|]*\|\s/, ""))
    .join("\n");

/** 경영관리 카드 한 장의 연계 후보 카드들(지표 unitId의 색인 행 + 카드 인용 + 글자 겹침) */
export function pickBizLinks(mgCard: Json, ledger: BizLedgerCard[], index: LinkIndexRow[], unitId: string): BizLinkPack {
  const byId = new Map(ledger.map((c) => [c.id, c]));
  const cited = bizTaskIdsIn(cardOutline(mgCard));
  const row = index.find((r) => r.unit === unitId);
  const order: Array<{ id: string; reasons: LinkReason[] }> = [];
  const add = (id: string, why: LinkReason) => {
    if (!byId.has(id)) return;
    const hit = order.find((o) => o.id === id);
    if (hit) {
      if (!hit.reasons.includes(why)) hit.reasons.push(why);
    } else order.push({ id, reasons: [why] });
  };
  for (const id of cited) add(id, "a");
  for (const id of row?.ids ?? []) add(id, "b");
  // (c) 글자 겹침: 경영관리 카드의 칸 글 전체(제목은 3배) ↔ 주요사업 카드 풀이 글 — 같은 bigram TF-IDF 코사인(lib/reports/prior.ts rankSimilar).
  // rankSimilar의 카드 벡터는 주요사업 칸만 읽으므로 경영관리 카드는 제목 + 칸 글 전체를 한 칸에 넣어 넘김
  const query = { title: mgCard?.title ?? "", outcome: { quantitative: [plainOutline(mgCard)] } };
  const ranked = rankSimilar(
    query,
    ledger.map((c) => ({ key: c.id, head: c.title, text: plainOutline(c.data) })),
  ).filter((x) => x.score > 0);
  for (const x of ranked.slice(0, BIZ_SIMILAR_TOP)) add(x.key, "c");
  const full = (o: { id: string; reasons: LinkReason[] }): BizLinkCandidate => {
    const c = byId.get(o.id)!;
    // 원장 발췌 글은 주요사업 월간 점검이 카드를 푸는 글 그대로(칸별 글 + 붙임 AX 연계과제)
    return { id: c.id, title: c.title, dept: c.dept, asOf: c.asOf, reasons: o.reasons, text: inspectionCardText(c.data) };
  };
  return {
    task: String(mgCard?.taskNo ?? ""),
    cards: order.slice(0, BIZ_LINK_MAX).map(full),
    more: order
      .slice(BIZ_LINK_MAX)
      .filter((o) => o.reasons.some((r) => r !== "c"))
      .map((o) => ({ id: o.id, title: byId.get(o.id)!.title, reasons: o.reasons })),
    indexed: Boolean(row?.ids.length),
    unknownCited: cited.filter((id) => !byId.has(id)),
  };
}
