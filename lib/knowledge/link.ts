// 조각 ↔ 카드 연결 초안. 결정적 규칙만 씁니다(Claude 판정·사람 확정은 다음 단계).
//  1) 카드 '경영평가 지적사항' ↔ 지적(최종 평가보고서 번호 지적, 중간보고서 행): 글자 3-gram 포함도 + 팀 일치
//  2) 중간보고서 행 ↔ 최종 평가보고서 번호 지적(이력 대응)
//  3) '26 과제 목록(7월) ↔ 카드(9월): 제목 2-gram Dice + 번호·본부 일치
// 근거: docs/analysis/공통지식-5종-분석.md §5-3, §5-4

import { businessByCardGroup } from "./dictionaries.ts";
import { compactKey, normalizeText } from "./normalize.ts";
import { containment, dice, round } from "./similarity.ts";
import type { KnowledgeChunk, UnitId } from "./types.ts";

export const LINK_RULES = {
  /** 카드 지적 문장의 3-gram 가운데 지적 원문에 있는 비율 */
  autoWithTeam: 0.4,
  autoWithoutTeam: 0.5,
  candidate: 0.25,
  midToFinal: 0.45,
  topN: 3,
};

export interface CardLite {
  id: string;
  group: string;
  taskNo: string;
  title: string;
  department: string;
  team: string;
  findings: string[];
}

export function toCardLite(card: Record<string, unknown>): CardLite {
  const act = (card.act ?? {}) as { findings?: unknown };
  return {
    id: String(card.id),
    group: String(card.group),
    taskNo: String(card.taskNo),
    title: String(card.title),
    department: String(card.department ?? ""),
    team: String(card.team ?? ""),
    findings: Array.isArray(act.findings) ? act.findings.map(String) : [],
  };
}

const NO_FINDING = /(경영평가\s*)?지적\s*사항\s*(없음|해당\s*없음)|^해당\s*없음$|^없음$|^-$/;

/** 카드 지적사항 칸의 글머리 항목. "지적사항 없음" 문구는 버립니다(0.38 오탐 사례) */
export function cardFindingItems(card: CardLite): string[] {
  return card.findings
    .flatMap((f) => f.split(/\n(?=\s*[∙·•\-※])/))
    .map((f) => normalizeText(f.replace(/^\s*[∙·•\-※]\s*/, "")))
    .filter((f) => f.length >= 8 && !NO_FINDING.test(f));
}

interface FindingTarget {
  chunk_key: string;
  doc_id: string;
  business: UnitId | null;
  related_business: UnitId | null;
  finding_no: number | null;
  text: string;
  depts: string[];
}

export function findingTargets(chunks: KnowledgeChunk[]): FindingTarget[] {
  const out: FindingTarget[] = [];
  for (const c of chunks) {
    if (c.unit_type === "finding_row" && !c.meta.duplicate_of) {
      out.push({
        chunk_key: c.chunk_key,
        doc_id: c.doc_id,
        business: c.business,
        related_business: (c.meta.related_business as UnitId | null) ?? null,
        finding_no: (c.meta.finding_no as number) ?? null,
        text: c.blocks.join(" "),
        depts: [...c.dept_resp, ...c.dept_coop],
      });
    } else if (c.unit_type === "evaluator_comment") {
      for (const f of (c.meta.findings as Array<{ no: number; text: string }>) ?? []) {
        out.push({
          chunk_key: c.chunk_key,
          doc_id: c.doc_id,
          business: c.business,
          related_business: (c.meta.related_business as UnitId | null) ?? null,
          finding_no: f.no,
          text: f.text,
          depts: [],
        });
      }
    }
  }
  return out;
}

export interface FindingLink {
  card_id: string;
  card_title: string;
  card_team: string;
  finding_index: number;
  card_finding: string;
  chunk_key: string;
  doc_id: string;
  finding_no: number | null;
  target_text: string;
  target_depts: string[];
  score: number;
  team_match: boolean | null;
  rank: number;
  status: "auto" | "candidate";
  /** 자동 판정 근거 */
  basis: "점수" | "점수+팀" | "중간·최종 일치" | "";
}

const targetId = (t: { chunk_key: string; doc_id: string; finding_no: number | null }) => (t.doc_id === "mid25-biz" ? t.chunk_key : `${t.chunk_key}#${t.finding_no}`);

/**
 * 카드 지적사항 → 지적 원문. 같은 사업(공통지표는 관련 사업이 같은 것)만 비교합니다.
 * 자동: ① 점수 ≥ 0.5, ② 점수 ≥ 0.4이고 책임·협업 부서에 카드 팀이 있음,
 *       ③ 점수 ≥ 0.4이고 중간보고서 행과 그 행에 대응하는 최종 지적이 함께 상위에 오름(두 판이 같은 지적을 가리킴).
 * midToFinal: 중간보고서 조각 키 → "최종 조각 키#번호"
 */
export function linkCardFindings(cards: CardLite[], targets: FindingTarget[], midToFinal: Map<string, string> = new Map()): { links: FindingLink[]; unlinked: Array<{ card_id: string; card_finding: string; best: number }> } {
  const links: FindingLink[] = [];
  const unlinked: Array<{ card_id: string; card_finding: string; best: number }> = [];
  for (const card of cards) {
    const biz = businessByCardGroup(card.group);
    const pool = targets.filter((t) => t.business === biz || (t.business === "BZ-4" && t.related_business === biz));
    cardFindingItems(card).forEach((item, idx) => {
      const scored = pool
        .map((t) => {
          const score = containment(item, t.text, 3);
          const team_match = t.depts.length ? t.depts.some((d) => compactKey(d) === compactKey(card.team)) : null;
          return { t, score, team_match };
        })
        .filter((s) => s.score >= LINK_RULES.candidate)
        .sort((a, b) => b.score - a.score)
        .slice(0, LINK_RULES.topN);
      if (scored.length === 0) {
        const best = Math.max(0, ...pool.map((t) => containment(item, t.text, 3)));
        unlinked.push({ card_id: card.id, card_finding: item, best: round(best) });
        return;
      }
      const strong = scored.filter((s) => s.score >= LINK_RULES.autoWithTeam).map((s) => targetId(s.t));
      const agreed = new Set<string>();
      for (const id of strong) {
        const final = midToFinal.get(id);
        if (final && strong.includes(final)) {
          agreed.add(id);
          agreed.add(final);
        }
      }
      scored.forEach((s, rank) => {
        const basis: FindingLink["basis"] =
          s.score >= LINK_RULES.autoWithoutTeam ? "점수" : s.team_match === true && s.score >= LINK_RULES.autoWithTeam ? "점수+팀" : agreed.has(targetId(s.t)) ? "중간·최종 일치" : "";
        const auto = basis !== "";
        links.push({
          card_id: card.id,
          card_title: card.title,
          card_team: card.team,
          finding_index: idx,
          card_finding: item,
          chunk_key: s.t.chunk_key,
          doc_id: s.t.doc_id,
          finding_no: s.t.finding_no,
          target_text: s.t.text,
          target_depts: s.t.depts,
          score: round(s.score),
          team_match: s.team_match,
          rank: rank + 1,
          status: auto ? "auto" : "candidate",
          basis,
        });
      });
    });
  }
  return { links, unlinked };
}

export interface MidFinalPair {
  mid_key: string;
  mid_no: number;
  business: UnitId;
  final_key: string | null;
  final_no: number | null;
  score: number;
  mid_text: string;
  final_text: string;
}

/** 중간보고서 행마다 가장 비슷한 최종 평가보고서 번호 지적 */
export function mapMidToFinal(chunks: KnowledgeChunk[]): MidFinalPair[] {
  const targets = findingTargets(chunks);
  const finals = targets.filter((t) => t.doc_id !== "mid25-biz");
  return chunks
    .filter((c) => c.unit_type === "finding_row")
    .map((c) => {
      const text = c.blocks.join(" ");
      const pool = finals.filter((f) => f.business === c.business);
      let best: FindingTarget | null = null;
      let bestScore = 0;
      for (const f of pool) {
        const s = Math.max(containment(text, f.text, 3), containment(f.text, text, 3));
        if (s > bestScore) {
          best = f;
          bestScore = s;
        }
      }
      const ok = best && bestScore >= LINK_RULES.midToFinal;
      return {
        mid_key: c.chunk_key,
        mid_no: c.meta.finding_no as number,
        business: c.business!,
        final_key: ok ? best!.chunk_key : null,
        final_no: ok ? best!.finding_no : null,
        score: round(bestScore),
        mid_text: text,
        final_text: ok ? best!.text : "",
      };
    });
}

export interface TaskLite {
  business: UnitId;
  group: string;
  task_no: string;
  title: string;
  dept: string;
  exec_task: string;
  target_business: string;
  labels: string[];
}

export interface TaskMapRow {
  card_id: string;
  card_title: string;
  card_department: string;
  card_team: string;
  best_task_no: string;
  best_task_title: string;
  best_task_dept: string;
  title_similarity: number;
  same_no: boolean;
  same_dept: boolean;
  score: number;
  second_task: string;
  second_score: number;
  status: "같음" | "후보" | "약한 후보" | "대응 없음";
}

export const TASK_MAP_RULES = { same: 0.8, candidate: 0.4, weak: 0.2 };

/** '26 과제 목록(7월) ↔ 카드(9월) 대응표 초안. 확정은 성과관리팀과 부서가 합니다 */
export function mapTasksToCards(cards: CardLite[], tasks: TaskLite[]): { rows: TaskMapRow[]; orphanTasks: TaskLite[] } {
  const used = new Set<string>();
  const rows = cards.map((card) => {
    const biz = businessByCardGroup(card.group);
    const scored = tasks
      .filter((t) => t.business === biz)
      .map((t) => {
        const sim = dice(card.title, t.title, 2);
        const same_no = t.task_no === card.taskNo;
        const same_dept = compactKey(t.dept) === compactKey(card.department);
        return { t, sim, same_no, same_dept, score: 0.7 * sim + 0.15 * Number(same_no) + 0.15 * Number(same_dept) };
      })
      .sort((a, b) => b.score - a.score);
    const [best, second] = scored;
    // 번호는 7월→9월 사이에 바뀌기도 하므로 제목 유사도로만 등급을 나눕니다(번호·본부 일치는 열로 보여 줌).
    const sim = best?.sim ?? 0;
    const status: TaskMapRow["status"] = sim >= TASK_MAP_RULES.same ? "같음" : sim >= TASK_MAP_RULES.candidate ? "후보" : sim >= TASK_MAP_RULES.weak ? "약한 후보" : "대응 없음";
    if (best && status !== "대응 없음") used.add(`${best.t.business}/${best.t.task_no}`);
    return {
      card_id: card.id,
      card_title: card.title,
      card_department: card.department,
      card_team: card.team,
      best_task_no: best?.t.task_no ?? "",
      best_task_title: best?.t.title ?? "",
      best_task_dept: best?.t.dept ?? "",
      title_similarity: round(best?.sim ?? 0),
      same_no: best?.same_no ?? false,
      same_dept: best?.same_dept ?? false,
      score: round(best?.score ?? 0),
      second_task: second ? `${second.t.task_no}. ${second.t.title}` : "",
      second_score: round(second?.score ?? 0),
      status,
    };
  });
  const orphanTasks = tasks.filter((t) => !used.has(`${t.business}/${t.task_no}`));
  return { rows, orphanTasks };
}
