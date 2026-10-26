// 공통 지식 덩이를 모델에 보내는 글로 만들 때 같은 글을 덜 반복하는 정리(순수). 조각 글·key·title은 그대로 두고 모델이 읽는 봉투만 줄입니다 —
// 인용 대조(`verifyResult`)는 줄이기 전 조각 글(refs)로 하므로 줄인 조각을 인용해도 그대로 확인됩니다. 같은 입력이면 늘 같은 글이라 캐시 공유도 유지됩니다.
//  ① 위치(where) 약칭 — 한 덩이 안에서 4번 이상 되풀이되는 긴 앞부분(문서 이름·공통지표 이름 등)을 §표시로 줄이고 덩이 머리에 뜻을 한 번 적음
//  ② 그림 껍데기 조각 — 본문이 「그림 자료, 원문 PDF N쪽」 한 줄뿐인 증빙 그림 조각은 key·title과 쪽만 남김
//  ③ 중복 조각 — 지적 행·요청 자료 조각의 본문이 다른 조각(평가위원 의견·실사 질의응답) 안에 80% 이상 그대로 있으면 그 조각을 가리키는 한 줄만 남김

import { type KnowledgeRef, escapeXml } from "../ai/writer.ts";
import { flattenHtmlTables } from "./rich-text.ts";

const SEP = " · ";
/** 약칭을 만들 조건: 이만큼 되풀이되고 이만큼 긴 위치 조각 */
const ALIAS_MIN_COUNT = 4;
const ALIAS_MIN_CHARS = 12;
/** 중복 판정: 25자 조각 중 80% 이상이 더 긴 조각 안에 있고, 본문이 150자 이상(짧은 글은 우연히 겹침) */
const SHINGLE = 25;
const DUP_FRACTION = 0.8;
const DUP_MIN_CHARS = 150;
/** 중복을 가리킬 수 있는 (조각 유형 → 그 글을 담는 유형). 담는 유형은 가리키는 유형이 아니라 연쇄가 생기지 않음 */
const DUP_CONTAINERS: Record<string, string[]> = { finding_row: ["evaluator_comment"], request_evidence: ["qa_pair", "qa_part"] };

const norm = (s: string) => s.replace(/\s+/g, "");
const plain = (r: KnowledgeRef) => flattenHtmlTables(r.text);

/** 본문이 「… (그림 자료, 원문 PDF N쪽)」 한 줄뿐인 증빙 그림 조각이면 쪽 번호(문자), 아니면 null */
export function stubPage(r: KnowledgeRef): string | null {
  if (r.unitType !== "evidence_image") return null;
  const t = plain(r).trim();
  if (t.includes("\n")) return null;
  const m = /\(그림 자료, 원문 PDF (\d+)쪽\)$/.exec(t);
  return m ? m[1] : null;
}

/** 중복 조각 key → 그 글을 담은 조각 key. pool 안에서만 찾음(덩이가 달라져도 같은 글이 나오게 부르는 쪽이 pool을 정함) */
export function duplicateMap(pool: KnowledgeRef[]): Map<string, string> {
  const out = new Map<string, string>();
  const normed = new Map(pool.map((r) => [r.key, norm(plain(r))]));
  for (const r of pool) {
    const types = DUP_CONTAINERS[r.unitType];
    if (!types) continue;
    const n = normed.get(r.key) ?? "";
    if (n.length < DUP_MIN_CHARS) continue;
    const shingles: string[] = [];
    for (let i = 0; i < n.length - SHINGLE + 1; i += SHINGLE) shingles.push(n.slice(i, i + SHINGLE));
    if (!shingles.length) continue;
    for (const d of pool) {
      if (d.key === r.key || !types.includes(d.unitType)) continue;
      const nd = normed.get(d.key) ?? "";
      if (nd.length < n.length || !nd.includes(shingles[0])) continue;
      if (shingles.filter((s) => nd.includes(s)).length / shingles.length >= DUP_FRACTION) {
        out.set(r.key, d.key);
        break;
      }
    }
  }
  return out;
}

/** 위치 조각 약칭표: 4번 이상 되풀이되는 12자 이상의 조각을 빈도·길이 순으로 §{tag}번호에 묶음 */
function whereAliases(refs: KnowledgeRef[], tag: string): Map<string, string> {
  const count = new Map<string, number>();
  for (const r of refs) for (const seg of new Set((r.where ?? "").split(SEP).map((x) => x.trim()).filter(Boolean))) count.set(seg, (count.get(seg) ?? 0) + 1);
  const picked = [...count.entries()]
    .filter(([seg, n]) => n >= ALIAS_MIN_COUNT && seg.length >= ALIAS_MIN_CHARS && !seg.startsWith("※")) // 판 표지(※ …)는 약칭표 뒤로 숨기지 않고 그 자리에 둠
    .sort((a, b) => b[1] * (b[0].length - 3) - a[1] * (a[0].length - 3) || a[0].localeCompare(b[0]));
  return new Map(picked.map(([seg], i) => [seg, `§${tag}${i + 1}`]));
}

/**
 * 한 덩이 안의 조각들을 모델이 읽는 글로. tag = 덩이 표지(약칭이 덩이마다 겹치지 않게), pool = 중복 조각이 가리킬 수 있는 조각들(같은 덩이와 그보다 앞 덩이만 —
 * 뒤 덩이 조각을 가리키면 사업마다 앞 덩이 글이 달라져 캐시 공유가 깨짐)
 */
export function sharedBlock(refs: KnowledgeRef[], opts: { tag: string; pool: KnowledgeRef[] }): string {
  if (!refs.length) return "(제공된 근거 자료 없음)";
  const dup = duplicateMap(opts.pool);
  const stub = new Set(refs.filter((r) => stubPage(r) !== null).map((r) => r.key));
  const full = refs.filter((r) => !stub.has(r.key) && !dup.has(r.key));
  const alias = whereAliases(full, opts.tag);
  const head = (r: KnowledgeRef) => `<source key="${escapeXml(r.key)}" title="${escapeXml(r.title)}"`;
  const body = refs.map((r) => {
    const page = stubPage(r);
    if (page !== null) return `${head(r)} note="그림 자료 — 본문 글 없음, 원문 PDF ${page}쪽"/>`;
    const into = dup.get(r.key);
    if (into) return `${head(r)} note="본문 전체가 key=${escapeXml(into)} 조각 안에 그대로 있어 생략"/>`;
    const where = r.where
      ? r.where
          .split(SEP)
          .map((x) => alias.get(x.trim()) ?? x)
          .join(SEP)
      : "";
    return `${head(r)}${where ? ` where="${escapeXml(where)}"` : ""}>\n${escapeXml(plain(r))}\n</source>`;
  });
  const legend = alias.size ? `<위치 약칭 — 아래 where 속 「§…」는 이 표의 뜻을 줄인 것입니다>\n${[...alias.entries()].map(([seg, a]) => `${a} = ${escapeXml(seg)}`).join("\n")}\n</위치 약칭>\n` : "";
  return legend + body.join("\n");
}
