// 경영관리 경평 초안 「PDCA 뼈대」(순수, 2026-10-30) — 카드 칸을 PDCA 단계별 줄 묶음으로 나눠 구성안·집필 요청에 붙이고(mgPdcaPrompt), 구성안이 단계를 빠뜨리면 알림(pdcaIssues).
// 경영관리 카드 양식에는 Plan·Check 칸이 없어(지침 08) 카드 평문만 주면 보고서가 「결과만 나열」로 기울었음 — 단계 ↔ 칸 대응은 코드에 못박지 않고 트랙 스펙 데이터(lib/tracks TrackSpec.pdca)에서 받음.
// 과제·지표·표본 카드로 가르는 분기 없음. 라벨은 카드 자기 머리(headers — 연도가 든 원본 글)를 쓰고 연도를 코드에 넣지 않음. 요청 글 문구는 resources/prompts/report-draft-mg/request.md pdca.*.

import { type PdcaSpec, type PdcaStage, PDCA_STAGES, MGMT_TRACK } from "../tracks/index.ts";
import { type PromptSet, fillFrom } from "../prompts/template.ts";
import type { Composition } from "./composition.ts";
import { isNoFindingLine } from "./findings.ts";
import type { LooseJson } from "../loose-json.ts";
import { CLOSE_LABEL } from "./mg-outcomes.ts";

type Json = LooseJson;

/** 뼈대 줄 하나 — 라벨(카드 머리 글) + 줄 글 */
export interface PdcaItem {
  label: string;
  text: string;
}

/** 단계별 줄 묶음(A는 카드 칸이 없어 보통 빈 묶음) */
export type PdcaSkeleton = Record<PdcaStage, PdcaItem[]>;

/** request.md에 있어야 하는 절(mg-draft.ts MG_REQUEST_SECTIONS에 더함) */
export const PDCA_REQUEST_SECTIONS = ["pdca.head", ...PDCA_STAGES.map((s) => `pdca.stage.${s}` as const), "pdca.item", "pdca.empty"] as const;

const get = (card: Json, path: string): Json => path.split(".").reduce((x: Json, k) => (x == null ? undefined : x[k]), card);

/** 빈 줄·기호만 있는 줄 */
const blank = (s: string) => !s.replace(/[\s∙•·\-－–—○◦▪□■◆※*]/g, "");

/** 카드 줄 하나(문자열 · {table:{rows}} · 그림) → 글 줄들: 표는 행마다 칸 글을 「 | 」로 이은 한 줄, 그림은 뺌 */
function lineTexts(line: Json): string[] {
  if (typeof line === "string") return blank(line) ? [] : [line.trim()];
  if (line && typeof line === "object" && "table" in line) {
    const rows: Json[] = Array.isArray(line.table?.rows) ? line.table.rows : [];
    return rows.map((row: Json) => (Array.isArray(row) ? row : []).map((cell: Json) => (Array.isArray(cell?.lines) ? cell.lines : []).flatMap(lineTexts).join(" ")).filter(Boolean).join(" | ")).filter((t) => !blank(t));
  }
  return [];
}

const textsOf = (raw: unknown): string[] => (Array.isArray(raw) ? raw : []).flatMap(lineTexts);

/** 라벨: 카드 머리 칸 글, 비었으면 fallback */
const labelOf = (card: Json, l: { path?: string; fallback: string } | undefined) => String((l?.path ? get(card, l.path) : "") ?? "").trim() || (l?.fallback ?? "");

/**
 * 카드 → 단계별 줄 묶음(결정론): 대응표(spec.sources) 순서대로 칸을 읽고, checkSplit 칸의 줄 중 Check 낱말(spec.checkWords)이 든 줄은 그 단계에서 빼 C 끝에 붙임.
 * pairs는 행마다 왼쪽 → 오른쪽을 한 줄로(realFindings면 「지적 없음」 줄을 빼고 다 빠진 행은 버림), kpi는 「이름(단위) · 전년 실적 머리 값 · 목표 머리 값」, monthly는 라벨에 기간을 붙임
 */
export function pdcaSkeleton(card: Json, spec: PdcaSpec): PdcaSkeleton {
  const out: PdcaSkeleton = { P: [], D: [], C: [], A: [] };
  const moved: PdcaItem[] = [];
  const isCheck = (t: string) => spec.checkWords.some((w) => t.includes(w));
  for (const src of spec.sources) {
    const put = (label: string, text: string) => (src.checkSplit && isCheck(text) ? moved : out[src.stage]).push({ label, text });
    const raw = get(card, src.path);
    const rows: Json[] = Array.isArray(raw) ? raw : [];
    if (src.shape === "pairs") {
      const [lk, rk] = src.pair ?? ["", ""];
      const label = `${labelOf(card, src.labels[0])} → ${labelOf(card, src.labels[1])}`;
      for (const r of rows) {
        const left = textsOf(r?.[lk]).filter((t) => !(src.realFindings && isNoFindingLine(t)));
        if (src.realFindings && !left.length) continue;
        const text = [left.join(" "), textsOf(r?.[rk]).join(" ")].filter(Boolean).join(" → ");
        if (text) put(label, text);
      }
    } else if (src.shape === "kpi") {
      const [head, prev, target] = src.labels.map((l) => labelOf(card, l));
      for (const k of rows) {
        const name = String(k?.name ?? "").trim();
        if (!name) continue;
        const unit = String(k?.unit ?? "").trim();
        put(head, `${name}${unit ? `(${unit})` : ""} · ${prev} ${String(k?.prev ?? "").trim() || "—"} · ${target} ${String(k?.target ?? "").trim() || "—"}`);
      }
    } else if (src.shape === "monthly") {
      const label = labelOf(card, src.labels[0]);
      for (const m of rows) {
        const period = String(m?.period ?? "").trim();
        for (const t of textsOf(m?.items)) put(period ? `${label} · ${period}` : label, t);
      }
    } else {
      const label = labelOf(card, src.labels[0]);
      for (const t of textsOf(raw)) put(label, t);
    }
  }
  out.C.push(...moved);
  return out;
}

/** 경영관리 카드의 뼈대(경영관리 트랙 대응표 — lib/tracks MGMT_TRACK.pdca) */
export const mgPdcaSkeleton = (card: Json): PdcaSkeleton => pdcaSkeleton(card, MGMT_TRACK.pdca);

/** 요청 글 「PDCA 뼈대」 블록(report-draft-mg/request.md pdca.* — 구성안·집필 공용 자료 블록, 카드 글 바로 뒤). 모든 단계가 비면 빈 글 */
export function mgPdcaPrompt(p: PromptSet, sk: PdcaSkeleton): string {
  if (PDCA_STAGES.every((s) => !sk[s].length)) return "";
  const r = (key: string, vars: Record<string, string | number> = {}) => fillFrom(p, "request", key, vars);
  const lines = [r("pdca.head")];
  for (const s of PDCA_STAGES) {
    lines.push(r(`pdca.stage.${s}`, { count: sk[s].length }));
    if (sk[s].length) lines.push(...sk[s].map((x) => r("pdca.item", { label: x.label, text: x.text })));
    else lines.push(r("pdca.empty"));
  }
  return lines.join("\n");
}

/** 구성안 블록 stage 정리(AI 답): P·D·C·A 한 글자만(대소문자·앞뒤 빈칸 무시), 나머지는 빈 글(필드를 지움) */
export function cleanStage(raw: unknown): PdcaStage | "" {
  const s = String(raw ?? "").trim().toUpperCase();
  return (PDCA_STAGES as readonly string[]).includes(s) ? (s as PdcaStage) : "";
}

/** 절 이름(mark + title — mg-outline.ts mgPartLabel과 같은 모양, 순환 import를 피해 여기서 만듦) */
const partName = (p: { mark?: string; title?: string; key: string }) => p.mark ? `${p.mark}. ${p.title}` : p.title || p.key;

/**
 * 구성안 점검 「PDCA」(참고): 과제(카드) 하나 = 한 사이클. stage가 하나라도 적힌 구성안만 보고(옛 구성안은 점검 안 함).
 * ① 뼈대에 재료가 있는 단계인데 그 단계 블록이 카드 전체에 하나도 없으면 한 줄(A는 카드 칸이 없어 뼈대가 비므로 자연히 빠짐)
 * ② 절 안 블록 단계 순서가 P → D → C → A를 거스르면 그 절마다 한 줄(단계 없는 블록은 건너뜀)
 * ③ 카드의 첫 절(절 표지가 있는 절 중 구성안 순서 첫째)이 아닌 절에 P 블록이 둘 이상이면 그 절마다 한 줄 — 다음 절은 그 절의 왜를 여는 블록 하나까지(report-draft-mg/process.md)
 */
export function pdcaIssues(c: Pick<Composition, "blocks" | "mg">, sk: PdcaSkeleton): string[] {
  const marked = new Set(c.blocks.map((b) => b.stage ?? "").filter(Boolean));
  if (!marked.size) return [];
  const out: string[] = [];
  const missing = PDCA_STAGES.filter((s) => sk[s].length && !marked.has(s));
  if (missing.length) out.push(`PDCA: 카드에 ${missing.map((s) => `${s} 재료 ${sk[s].length}줄`).join(" · ")}이 있는데 그 단계(stage)를 맡은 블록이 구성안에 없습니다 — 과제 하나가 「문제·계획 → 실행 → 점검·성과」 한 사이클로 읽히게 그 단계 블록을 두거나 블록의 단계를 고쳐 주세요.`);
  const parts = c.mg?.parts ?? [];
  const first = parts.find((p) => p.mark)?.key;
  for (const p of parts) {
    // 절을 닫는 「추진성과」 블록(절 마지막 블록, 라벨 공백 무시)은 순서 판정에서 뺌 — A(보완) 뒤에 와도 정상
    const own = c.blocks.filter((b) => b.at === p.key);
    const closing = own.length && own[own.length - 1].label?.replace(/\s/g, "") === CLOSE_LABEL;
    const stages = (closing ? own.slice(0, -1) : own).map((b) => b.stage).filter((s): s is PdcaStage => Boolean(s));
    const order = stages.map((s) => PDCA_STAGES.indexOf(s));
    if (order.some((o, i) => i > 0 && o < order[i - 1])) out.push(`PDCA: ${partName(p)}의 블록 단계 순서가 ${stages.join(" → ")}입니다 — 절 안은 P → D → C (→ A) 순서로 두고 실행 뒤에 계획(P)을 다시 두지 않습니다.`);
    const ps = stages.filter((s) => s === "P").length;
    if (p.key !== first && ps >= 2) out.push(`PDCA: ${partName(p)}에 문제·계획(P) 블록이 ${ps}개입니다 — 첫 절 밖의 절은 그 절의 왜를 여는 P 블록 하나까지만 두고 나머지는 실행(D)·점검(C)으로 고치거나 첫 절 P 행에 모아 주세요.`);
  }
  return out;
}
