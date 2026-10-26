// 경평 초안 「자료 요청」(재료 요청서, 순수) — 구성안 재료표에서 「자료 필요」(kind = need: 근거에 없어 AI가 못 채우고 담당자가 채울 것)를
// 카드별로 뽑아 부서별 요청 목록으로 묶음. 2026-10-17 품질 향상 B2: 이 목록이 과제별 초안 화면 안에만 있어 부서가 한 번에 못 받았음.
// 원문 못 찾음(found = false)인 재료는 AI가 근거에 있다고 낸 값이라 요청이 아니므로 안 넣음. 사람이 구성안에서 뺀 블록·제외된 과제도 따지지 않음.

import { type Composition, readComposition } from "./composition.ts";
import { mgPartLabel } from "./mg-outline.ts";

/** 과제당 보여 줄 요청 수 상한(넘으면 「외 N건」) */
export const REQUEST_CARD_MAX = 8;
/** 요청 한 줄·쓰일 곳 글자 상한 */
export const REQUEST_TEXT_CHARS = 90;
const WHERE_CHARS = 24;

export interface MaterialRequest {
  /** 무엇이 필요한지 한 줄(재료표 「자료 필요」 글) */
  text: string;
  /** 쓰일 곳 — 주요사업은 블록 라벨(없으면 목적), 경영관리는 절. 어느 블록도 안 쓰면 빈 글 */
  where: string;
}

export interface CardRequests {
  uid: string;
  taskNo: string;
  title: string;
  unitId: string;
  /** 중복을 뺀 전체 요청 수 */
  total: number;
  /** 상한까지 보여 줄 요청 */
  items: MaterialRequest[];
  /** 상한을 넘어 못 보여 준 수 (= total − items.length) */
  more: number;
}

export interface DeptRequests {
  teamId: number;
  teamName: string;
  /** 부서 전체 요청 수(과제별 total의 합) */
  total: number;
  cards: CardRequests[];
}

/** 요청 목록 입력: 구성안 원자료(card_report_drafts.outline)와 제출 조건 재료가 가진 만큼만 */
export interface RequestCard {
  unitId: string;
  teamId: number;
  uid: string;
  taskNo: string;
  title: string;
  /** 목차에서 뺀 과제는 요청에서 빠짐 */
  included: boolean;
  outline: unknown;
}

const squash = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const keyOf = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** 재료 번호를 쓰는 블록들의 쓰일 곳(최대 2곳 + 「외」) */
function whereOf(c: Composition, id: string): string {
  const seen: string[] = [];
  for (const b of c.blocks) {
    if (!b.materials.includes(id)) continue;
    const part = c.mg && b.at ? c.mg.parts.find((p) => p.key === b.at) : undefined;
    const w = part ? mgPartLabel(part) : b.label || b.purpose;
    const t = squash(w, WHERE_CHARS);
    if (t && !seen.includes(t)) seen.push(t);
  }
  return seen.length > 2 ? `${seen.slice(0, 2).join(" · ")} 외` : seen.join(" · ");
}

/** 구성안 한 장의 「자료 필요」 — 같은 문구는 한 번(쓰일 곳은 합침). 구성안이 없거나 형식이 다르면 빈 목록 */
export function needRequestsOf(outline: unknown): MaterialRequest[] {
  const c = readComposition(outline as never);
  if (!c) return [];
  const byKey = new Map<string, MaterialRequest>();
  for (const m of c.materials) {
    if (m.kind !== "need") continue;
    const text = squash(m.text, REQUEST_TEXT_CHARS);
    if (!text) continue;
    const where = whereOf(c, m.id);
    const hit = byKey.get(keyOf(text));
    if (!hit) byKey.set(keyOf(text), { text, where });
    else if (where && !hit.where.includes(where)) hit.where = hit.where ? `${hit.where} · ${where}` : where;
  }
  return [...byKey.values()];
}

/** 부서별 요청 목록: 요청이 있는 과제만, 부서는 요청 많은 순(같으면 이름순), 과제는 입력 순서 */
export function buildMaterialRequests(cards: RequestCard[], teams: Array<{ id: number; name: string }>, max = REQUEST_CARD_MAX): DeptRequests[] {
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const byTeam = new Map<number, CardRequests[]>();
  for (const c of cards) {
    if (!c.included) continue;
    const all = needRequestsOf(c.outline);
    if (!all.length) continue;
    const items = all.slice(0, max);
    const row: CardRequests = { uid: c.uid, taskNo: c.taskNo, title: c.title, unitId: c.unitId, total: all.length, items, more: all.length - items.length };
    byTeam.set(c.teamId, [...(byTeam.get(c.teamId) ?? []), row]);
  }
  return [...byTeam].map(([teamId, cs]) => ({ teamId, teamName: teamName.get(teamId) ?? String(teamId), total: cs.reduce((n, c) => n + c.total, 0), cards: cs })).sort((a, b) => b.total - a.total || a.teamName.localeCompare(b.teamName, "ko"));
}

/** 부서 요청을 메일·메신저에 붙일 글로 */
export function requestsText(d: DeptRequests, year?: number): string {
  const lines = [`[${d.teamName}] ${year ? `${year}년도 ` : ""}경평 초안 자료 요청 — ${d.cards.length}개 과제 ${d.total}건`, ""];
  for (const c of d.cards) {
    lines.push(`■ ${c.taskNo} ${c.title}`);
    for (const r of c.items) lines.push(`- ${r.text}${r.where ? ` (쓰일 곳: ${r.where})` : ""}`);
    if (c.more) lines.push(`- 외 ${c.more}건 (과제별 초안 화면에서 확인)`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
