// 경영관리 경평 초안의 「주요사업 초안 참고」 DB 읽기(2026-11-12 — supabase/migrations/20261112100000_mg_biz_refs.sql).
// 권한 판단은 DB 함수가 함(읽을 수 있는 활성 경영관리 카드로 부를 때만 결과). 여기서는 rpc를 부르고 행을 화면·서버 액션이 쓰는 모양으로 바꿈.
// 빈 입력이면 DB를 부르지 않고 [], 오류면 []와 console.error — 참고 자료 목록·낡음 표시가 없다고 화면이 깨지지 않게.
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { bizTaskId } from "../inspections/biz-links.ts";

export interface BizRefRow {
  cardId: string;
  uid: string;
  /** 「주요사업N N-가」(묶음·번호가 그 모양이 아니면 과제번호 그대로) */
  taskId: string;
  taskNo: string;
  title: string;
  team: string;
  /** 지문 md5(spec::text) */
  stamp: string;
  updatedAt: string;
  unknownCount: number;
  fileCount: number;
  /** 원장 + 초안 + 붙임 글 길이 어림 */
  chars: number;
}

export interface BizRefText {
  cardId: string;
  taskId: string;
  taskNo: string;
  title: string;
  team: string;
  data: unknown;
  spec: unknown;
  stamp: string;
  updatedAt: string;
  unknownNumbers: string[];
  files: Array<{ kind: "card" | "report"; id: string; name: string; text: string }>;
}

export interface BizStale {
  /** 경영관리 카드 id */
  cardId: string;
  bizCardId: string;
  taskNo: string;
  /** 지금 그 주요사업 초안의 갱신 시각 — 초안이 없어졌으면 null */
  updatedAt: string | null;
}

/** DB 함수 mg_biz_ref_texts의 p_biz_ids 상한(넘으면 DB가 0행) */
export const BIZ_TEXT_MAX = 30;
/** DB 함수 mg_biz_stale의 p_card_ids 상한(넘으면 DB가 0행) */
export const BIZ_STALE_MAX = 300;

interface RefDbRow {
  biz_card_id: string;
  uid: string;
  group_name: string | null;
  task_no: string;
  title: string;
  team_name: string | null;
  stamp: string;
  updated_at: string;
  unknown_count: number | null;
  file_count: number | null;
  chars: number | null;
}

interface TextDbRow {
  biz_card_id: string;
  group_name: string | null;
  task_no: string;
  title: string;
  team_name: string | null;
  data: unknown;
  spec: unknown;
  stamp: string;
  updated_at: string;
  unknown_numbers: unknown;
  files: unknown;
}

interface StaleDbRow {
  card_id: string;
  biz_card_id: string;
  task_no: string;
  updated_at: string | null;
}

/** 묶음(「주요사업N」)·과제번호 → 「주요사업N N-가」(lib/inspections/biz-links.ts bizTaskId와 같은 규칙), 안 맞으면 과제번호 그대로 */
export function taskIdOf(group: string | null | undefined, taskNo: string): string {
  return bizTaskId({ group: group ?? "", taskNo }) ?? taskNo;
}

export function toBizRefRow(r: RefDbRow): BizRefRow {
  return {
    cardId: r.biz_card_id,
    uid: r.uid,
    taskId: taskIdOf(r.group_name, r.task_no),
    taskNo: r.task_no,
    title: r.title,
    team: r.team_name ?? "",
    stamp: r.stamp,
    updatedAt: r.updated_at,
    unknownCount: Number(r.unknown_count ?? 0),
    fileCount: Number(r.file_count ?? 0),
    chars: Number(r.chars ?? 0),
  };
}

export function toBizRefText(r: TextDbRow): BizRefText {
  const files = Array.isArray(r.files) ? (r.files as Array<Record<string, unknown>>) : [];
  return {
    cardId: r.biz_card_id,
    taskId: taskIdOf(r.group_name, r.task_no),
    taskNo: r.task_no,
    title: r.title,
    team: r.team_name ?? "",
    data: r.data,
    spec: r.spec,
    stamp: r.stamp,
    updatedAt: r.updated_at,
    unknownNumbers: Array.isArray(r.unknown_numbers) ? r.unknown_numbers.map(String) : [],
    files: files
      .filter((f) => (f.kind === "card" || f.kind === "report") && typeof f.text === "string")
      .map((f) => ({ kind: f.kind as "card" | "report", id: String(f.id), name: String(f.name ?? ""), text: f.text as string })),
  };
}

export function toBizStale(r: StaleDbRow): BizStale {
  return { cardId: r.card_id, bizCardId: r.biz_card_id, taskNo: r.task_no, updatedAt: r.updated_at ?? null };
}

/** 경영관리 카드(mgCardId)에서 고를 수 있는 주요사업 초안 목록(본문 없음) */
export async function loadBizRefs(supabase: SupabaseClient, mgCardId: string, year: number): Promise<BizRefRow[]> {
  if (!mgCardId) return [];
  const { data, error } = await supabase.rpc("mg_biz_refs", { p_card_id: mgCardId, p_year: year });
  if (error) {
    console.error("mg_biz_refs", error.message);
    return [];
  }
  return ((data ?? []) as RefDbRow[]).map(toBizRefRow);
}

/** 고른 주요사업(BIZ_TEXT_MAX개까지)의 원장·초안·붙임 글. 같은 id는 한 번만 보냄 */
export async function loadBizRefTexts(supabase: SupabaseClient, mgCardId: string, year: number, bizIds: string[]): Promise<BizRefText[]> {
  const ids = [...new Set(bizIds.filter(Boolean))];
  if (!mgCardId || ids.length === 0) return [];
  if (ids.length > BIZ_TEXT_MAX) {
    console.error("mg_biz_ref_texts", `주요사업 초안은 한 번에 ${BIZ_TEXT_MAX}개까지 (${ids.length}개)`);
    return [];
  }
  const { data, error } = await supabase.rpc("mg_biz_ref_texts", { p_card_id: mgCardId, p_year: year, p_biz_ids: ids });
  if (error) {
    console.error("mg_biz_ref_texts", error.message);
    return [];
  }
  return ((data ?? []) as TextDbRow[]).map(toBizRefText);
}

/** 경영관리 카드들(BIZ_STALE_MAX장까지)의 초안이 참고한 주요사업 초안 중 바뀌었거나 없어진 것 */
export async function loadBizStale(supabase: SupabaseClient, mgCardIds: string[], year: number): Promise<BizStale[]> {
  const ids = [...new Set(mgCardIds.filter(Boolean))];
  if (ids.length === 0) return [];
  if (ids.length > BIZ_STALE_MAX) {
    console.error("mg_biz_stale", `경영관리 카드는 한 번에 ${BIZ_STALE_MAX}장까지 (${ids.length}장)`);
    return [];
  }
  const { data, error } = await supabase.rpc("mg_biz_stale", { p_card_ids: ids, p_year: year });
  if (error) {
    console.error("mg_biz_stale", error.message);
    return [];
  }
  return ((data ?? []) as StaleDbRow[]).map(toBizStale);
}
