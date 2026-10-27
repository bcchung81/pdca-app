import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MaterialMatch } from "./material-match.ts";
import type { ReportStatus } from "./model.ts";
import { readSection } from "./section.ts";
import type { SubmitCard } from "./submission.ts";
import { DEFAULT_TRACK, type TrackId, trackOfUnit } from "../tracks/index.ts";


/** reports.inputs — 부서가 넣은 올해 계량 실적(`kpiKeyedRows` = 카드 id#지표 이름 → 값) */
export interface ReportInputs {
  kpi?: Record<string, string>;
}

/** reports select(COLS) 결과 한 행 — 조인(unit·team)은 객체로도 배열로도 올 수 있음 */
interface ReportDbRow {
  id: number;
  eval_unit_id: string;
  year: number;
  team_id: number;
  status: ReportStatus;
  inputs: ReportInputs | null;
  blocks: unknown;
  submitted_at: string | null;
  approved_at: string | null;
  updated_at: string;
  review_note: string | null;
  reviewed_at: string | null;
  unit: { name: string; card_group: string | null; lead_team_id: number | null } | Array<{ name: string; card_group: string | null; lead_team_id: number | null }> | null;
  team: { name: string; hq: string | null } | Array<{ name: string; hq: string | null }> | null;
}

export interface ReportRow {
  id: number;
  evalUnitId: string;
  unitName: string;
  cardGroup: string | null;
  leadTeamId: number | null;
  year: number;
  teamId: number;
  teamName: string;
  hq: string | null;
  status: ReportStatus;
  inputs: ReportInputs;
  /** 옛 블록 편집기가 저장한 JSON — 읽는 쪽이 `readBlocks`로 정리 */
  blocks: unknown;
  submittedAt: string | null;
  approvedAt: string | null;
  updatedAt: string;
  /** 성과관리팀 검토 메모(돌려보내기 사유 등) */
  reviewNote: string;
  reviewedAt: string | null;
}

const COLS = "id, eval_unit_id, year, team_id, status, inputs, blocks, submitted_at, approved_at, updated_at, review_note, reviewed_at, unit:eval_units(name, card_group, lead_team_id), team:teams(name, hq)";
const first = <X,>(v: X | X[] | null): X | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const toRow = (r: ReportDbRow): ReportRow => {
  const u = first(r.unit);
  const t = first(r.team);
  return {
    id: r.id,
    evalUnitId: r.eval_unit_id,
    unitName: u?.name ?? r.eval_unit_id,
    cardGroup: u?.card_group ?? null,
    leadTeamId: u?.lead_team_id ?? null,
    year: r.year,
    teamId: r.team_id,
    teamName: t?.name ?? "",
    hq: t?.hq ?? null,
    status: r.status,
    inputs: r.inputs ?? {},
    blocks: r.blocks ?? [],
    submittedAt: r.submitted_at,
    approvedAt: r.approved_at,
    updatedAt: r.updated_at,
    reviewNote: r.review_note ?? "",
    reviewedAt: r.reviewed_at ?? null,
  };
};

/** 그 해 보고서(로그인 사용자 권한). teamId를 주면 그 부서 것만 */
export async function listReports(supabase: SupabaseClient, year: number, teamId?: number): Promise<ReportRow[]> {
  let q = supabase.from("reports").select(COLS).eq("year", year);
  if (teamId) q = q.eq("team_id", teamId);
  const { data } = await q.order("eval_unit_id").order("team_id");
  return (data ?? []).map(toRow);
}

export async function getReport(supabase: SupabaseClient, id: number): Promise<ReportRow | null> {
  const { data } = await supabase.from("reports").select(COLS).eq("id", id).maybeSingle();
  return data ? toRow(data) : null;
}

export interface MaterialRow {
  id: string;
  reportId: number;
  fileName: string;
  mimeType: string | null;
  bytes: number | null;
  storagePath: string;
  createdAt: string;
  url: string | null;
  /** AI가 읽었는지(참고자료 설계 1단계) */
  parseStatus: "pending" | "parsed" | "failed";
  parseError: string | null;
  chars: number | null;
  /** 이 자료를 쓰기로 사람이 확정한 과제(참고자료 3단계 — 확정한 것만 숫자 근거) */
  matches: MaterialMatch[];
}

/** 보고서 추가자료 + 내려받기 주소(10분) + 사람이 확정한 과제 연결 */
export async function listMaterials(supabase: SupabaseClient, reportIds: number[]): Promise<MaterialRow[]> {
  if (!reportIds.length) return [];
  const { data } = await supabase
    .from("report_materials")
    .select("id, report_id, file_name, mime_type, bytes, storage_path, created_at, parse_status, parse_error, parsed_chars")
    .in("report_id", reportIds)
    .order("created_at");
  const rows = data ?? [];
  const { data: signed } = rows.length ? await supabase.storage.from("report-materials").createSignedUrls(rows.map((r) => r.storage_path), 600) : { data: [] };
  const { data: links } = rows.length ? await supabase.from("report_material_cards").select("material_id, card_id, method, basis").eq("status", "confirmed").in("material_id", rows.map((r) => r.id)) : { data: [] };
  const byMaterial = new Map<string, MaterialMatch[]>();
  for (const l of links ?? []) byMaterial.set(String(l.material_id), [...(byMaterial.get(String(l.material_id)) ?? []), { cardId: String(l.card_id), method: l.method, basis: l.basis ?? null }]);
  return rows.map((r, i) => ({
    id: r.id,
    reportId: r.report_id,
    fileName: r.file_name,
    mimeType: r.mime_type,
    bytes: r.bytes,
    storagePath: r.storage_path,
    createdAt: r.created_at,
    url: signed?.[i]?.signedUrl ?? null,
    parseStatus: (r.parse_status ?? "pending") as "pending" | "parsed" | "failed",
    parseError: r.parse_error ?? null,
    chars: r.parsed_chars ?? null,
    matches: byMaterial.get(String(r.id)) ?? [],
  }));
}

export interface CommentRow {
  id: number;
  reportId: number;
  anchor: string;
  kind: string;
  body: string;
  status: "open" | "resolved";
  authorId: string;
  author: string;
  createdAt: string;
}

export async function listComments(supabase: SupabaseClient, reportId: number): Promise<CommentRow[]> {
  const { data } = await supabase.from("report_comments").select("id, report_id, anchor, kind, body, status, author_id, created_at").eq("report_id", reportId).order("created_at");
  const ids = [...new Set((data ?? []).map((c) => c.author_id))];
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, display_name, email").in("id", ids) : { data: [] };
  const name = new Map((people ?? []).map((p) => [p.id, p.display_name || p.email || "—"]));
  return (data ?? []).map((c) => ({ id: c.id, reportId: c.report_id, anchor: c.anchor, kind: c.kind, body: c.body, status: c.status, authorId: c.author_id, author: name.get(c.author_id) ?? "다른 부서 사용자", createdAt: c.created_at }));
}

/** 보고서마다 미해결 코멘트 수 */
export async function openCommentCounts(supabase: SupabaseClient, reportIds: number[]): Promise<Map<number, number>> {
  const m = new Map<number, number>();
  if (!reportIds.length) return m;
  const { data } = await supabase.from("report_comments").select("report_id").in("report_id", reportIds).eq("status", "open");
  for (const r of data ?? []) m.set(r.report_id, (m.get(r.report_id) ?? 0) + 1);
  return m;
}

/** 보고서마다 추가자료 수 */
export async function materialCounts(supabase: SupabaseClient, reportIds: number[]): Promise<Map<number, number>> {
  const m = new Map<number, number>();
  if (!reportIds.length) return m;
  const { data } = await supabase.from("report_materials").select("report_id").in("report_id", reportIds);
  for (const r of data ?? []) m.set(r.report_id, (m.get(r.report_id) ?? 0) + 1);
  return m;
}

/** loadSubmitCards의 cards select 한 행 */
interface SubmitCardDbRow {
  id: string;
  uid: string;
  task_no: string;
  title: string;
  eval_unit_id: string;
  team_id: number;
  data_rev: number | null;
}
/** report_outline select 한 행 */
interface OutlineDbRow {
  card_id: string;
  included: boolean | null;
  sort: number | null;
  pages: number | null;
}
/** card_report_drafts select 한 행 */
interface DraftDbRow {
  card_id: string;
  spec: unknown;
  source_rev: number | null;
  unknown_numbers: unknown;
  outline: unknown;
}

/** 부서 보고서 키(사업 · 부서) — loadSubmitCards 결과 묶음 */
export const submitKey = (evalUnitId: string, teamId: number) => `${evalUnitId}|${teamId}`;

/**
 * 제출 조건 재료(로그인 사용자 권한 — 부서는 자기 부서 카드만 읽힘): 그 해 활성 카드 · 목차 포함 여부 · 과제별 초안(spec·원장 개정 번호·없는 숫자).
 * 사업 · 부서마다 과제번호 순. filter로 사업·부서를 좁힘(제출 검사는 둘 다)
 */
export async function loadSubmitCards(supabase: SupabaseClient, year: number, filter: { evalUnitId?: string; teamId?: number; track?: TrackId } = {}): Promise<Map<string, SubmitCard[]>> {
  // 트랙: 평가단위를 주면 그 단위의 트랙(경영관리 MG-N — 2026-10-09 R3), 아니면 머리띠에서 고른 트랙(없으면 주요사업)
  const track = filter.evalUnitId ? trackOfUnit(filter.evalUnitId) : (filter.track ?? DEFAULT_TRACK.id);
  let q = supabase.from("cards").select("id, uid, task_no, title, eval_unit_id, team_id, data_rev, unit:eval_units!inner(track)").eq("status", "active").eq("unit.track", track);
  if (filter.evalUnitId) q = q.eq("eval_unit_id", filter.evalUnitId);
  if (filter.teamId) q = q.eq("team_id", filter.teamId);
  const { data: cards } = await q.order("task_no");
  const cardRows: SubmitCardDbRow[] = cards ?? [];
  const ids = cardRows.map((c) => c.id);
  const [{ data: outline }, { data: drafts }] = ids.length
    ? await Promise.all([
        supabase.from("report_outline").select("card_id, included, sort, pages").eq("year", year).in("card_id", ids),
        supabase.from("card_report_drafts").select("card_id, spec, source_rev, unknown_numbers, outline").eq("year", year).in("card_id", ids),
      ])
    : [{ data: [] as OutlineDbRow[] }, { data: [] as DraftDbRow[] }];
  const inc = new Map(((outline ?? []) as OutlineDbRow[]).map((o) => [o.card_id, o]));
  const dr = new Map(((drafts ?? []) as DraftDbRow[]).map((d) => [d.card_id, d]));
  const out = new Map<string, SubmitCard[]>();
  const sorted = [...cardRows].sort((a, b) => (inc.get(a.id)?.sort ?? 1e9) - (inc.get(b.id)?.sort ?? 1e9) || String(a.task_no).localeCompare(String(b.task_no), "ko", { numeric: true }));
  for (const c of sorted) {
    const d = dr.get(c.id);
    const row: SubmitCard = {
      id: c.id,
      uid: c.uid,
      taskNo: c.task_no,
      title: c.title,
      included: inc.get(c.id)?.included !== false,
      pages: inc.has(c.id) ? Number(inc.get(c.id)?.pages) : null,
      dataRev: c.data_rev ?? null,
      draft: d ? { spec: d.spec ? readSection(d.spec) : null, sourceRev: d.source_rev ?? null, unknownNumbers: Array.isArray(d.unknown_numbers) ? d.unknown_numbers : [], outlineOnly: !d.spec && Boolean(d.outline), outline: d.outline ?? null } : null,
    };
    const k = submitKey(c.eval_unit_id, c.team_id);
    out.set(k, [...(out.get(k) ?? []), row]);
  }
  return out;
}

/** 이 카드의 부서 보고서가 제출·승인 중인가(부서 잠금 안내 — 최종 판정은 DB 트리거 guard_card_report_draft) */
export async function reportLockedFor(supabase: SupabaseClient, card: { eval_unit_id: string; team_id: number | null }, year: number): Promise<boolean> {
  if (!card.team_id) return false;
  const { data } = await supabase.from("reports").select("status").eq("eval_unit_id", card.eval_unit_id).eq("team_id", card.team_id).eq("year", year).maybeSingle();
  return data?.status === "submitted" || data?.status === "approved";
}
