import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentUser } from "../auth/dal.ts";
import { monthLabel, shiftPeriod } from "../format.ts";
import { createClient } from "../supabase/server.ts";
import { type CardChange, diffCards } from "./diff.ts";
import { fixedSectionsOf } from "./fixed.ts";
import { conflictLabels, mergeDraft } from "./merge.ts";
import { getCardForEdit, signedImageUrls } from "./queries.ts";
import { renderCard } from "./render.ts";
import { currentPeriod } from "./view.ts";
import type { LooseJson } from "../loose-json.ts";

// 월별 작성본(card_versions): 부서 담당자가 이달 실적을 카드에 반영하고 직접 확정(원장 반영 — 2026-10-27, app/(app)/my/actions.ts confirmMyDraft).
// 성과관리팀은 원장 이력에서 보고 필요하면 원장을 고침. 「제출」(submitted)은 그 전에 낸 작성본에만 남음(성과관리팀이 비교하고 확정·돌려보내기).

export type VersionStatus = "draft" | "submitted" | "confirmed";

export interface VersionRow {
  id: number;
  cardId: string;
  period: string;
  version: number;
  status: VersionStatus;
  data: LooseJson;
  base: LooseJson;
  rev: number;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string | null;
  submittedAt: string | null;
  confirmedAt: string | null;
}

const COLS = "id, card_id, period, version, status, data, base, rev, note, created_by, created_at, updated_at, submitted_at, confirmed_at";
/** card_versions select(COLS) 한 행 (data·base = 카드 JSON — 칸이 많아 넓은 모양 그대로) */
interface VersionDbRow {
  id: number;
  card_id: string;
  period: string;
  version: number;
  status: VersionStatus;
  data: LooseJson;
  base: LooseJson;
  rev: number | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
  submitted_at: string | null;
  confirmed_at: string | null;
}
const toRow = (r: VersionDbRow): VersionRow => ({
  id: r.id,
  cardId: r.card_id,
  period: r.period,
  version: r.version,
  status: r.status,
  data: r.data,
  base: r.base,
  rev: r.rev ?? 0,
  note: r.note,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  submittedAt: r.submitted_at,
  confirmedAt: r.confirmed_at,
});

/** 그 달 최신 작성본 */
export async function latestVersion(supabase: SupabaseClient, cardId: string, period: string): Promise<VersionRow | null> {
  const { data } = await supabase.from("card_versions").select(COLS).eq("card_id", cardId).eq("period", period).order("version", { ascending: false }).limit(1).maybeSingle();
  return data ? toRow(data) : null;
}

/**
 * 열린 작성본(확정 전: 작성 중·제출) — 카드마다 하나. 달이 바뀌어도 확정 전 작성본을 이어서 고칩니다
 * (월마다 따로 만들면 먼저 확정한 달의 변경을 나중 달이 덮어씀).
 */
export async function openVersion(supabase: SupabaseClient, cardId: string): Promise<VersionRow | null> {
  const { data } = await supabase.from("card_versions").select(COLS).eq("card_id", cardId).in("status", ["draft", "submitted"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data ? toRow(data) : null;
}

/** 목록 칩: 작성 중·돌려받음·제출·확정 */
export function versionLabel(v: { status: VersionStatus; note: string | null } | null | undefined): string | null {
  if (!v) return null;
  if (v.status === "submitted") return "제출";
  if (v.status === "confirmed") return "확정";
  return v.note ? "돌려받음" : "작성 중";
}

/** 그 달(서울 기준) 시작·다음 달 시작 */
function monthRange(period: string): [string, string] {
  return [`${period}-01T00:00:00+09:00`, `${shiftPeriod(period, 1)}-01T00:00:00+09:00`];
}

/** 목록 칩용 과제별 작성본 상태: 열린 작성본(작성 중·돌려받음·제출, 달과 무관)이 먼저, 없으면 그 달에 확정한 것 */
export async function versionStates(supabase: SupabaseClient, period: string): Promise<Map<string, Pick<VersionRow, "id" | "status" | "note" | "version" | "submittedAt" | "createdBy">>> {
  const [from, to] = monthRange(period);
  const { data } = await supabase
    .from("card_versions")
    .select("id, card_id, status, note, version, submitted_at, created_by, created_at")
    .or(`status.in.(draft,submitted),and(status.eq.confirmed,confirmed_at.gte.${from},confirmed_at.lt.${to})`)
    .order("created_at", { ascending: true });
  const m = new Map<string, Pick<VersionRow, "id" | "status" | "note" | "version" | "submittedAt" | "createdBy">>();
  const rows = data ?? [];
  for (const r of [...rows.filter((x) => x.status === "confirmed"), ...rows.filter((x) => x.status !== "confirmed")])
    m.set(r.card_id, { id: r.id, status: r.status, note: r.note, version: r.version, submittedAt: r.submitted_at, createdBy: r.created_by });
  return m;
}


export interface DraftProps {
  period: string;
  label: string;
  status: "none" | VersionStatus;
  note: string | null;
  savedAt: string | null;
}

export interface ReviewProps {
  versionId: number;
  periodLabel: string;
  author: string;
  submittedAt: string | null;
  changes: CardChange[];
  /** 원장도 따로 바뀐 구역(확정하면 작성본 쪽으로 반영됨) */
  conflicts: string[];
}

/**
 * 카드 작업 공간에 필요한 값. 부서 담당자(또는 부서 화면 보기)는 열린 작성본을, 성과관리팀은 원장과 제출된 작성본의 병합 미리보기를 받습니다.
 * 주관 부서라 읽을 수 있는 다른 부서 카드는 읽기 전용(작성본 없음)으로 엽니다.
 */
export async function workspaceData(user: CurrentUser, uid: string, opts: { preview: boolean }) {
  const card = await getCardForEdit(uid);
  if (!card) return null;
  const supabase = await createClient();
  const period = currentPeriod();
  const staff = user.role !== "dept_user";
  const otherTeam = !staff && (user.team?.id ?? -1) !== card.teamId;
  let initial = card.data;
  let draft: DraftProps | undefined;
  let review: ReviewProps | undefined;
  let openVersionId: number | null = null;
  let openRev = 0;
  let notice: string | undefined = otherTeam ? "주관 부서로 읽는 다른 부서 과제입니다(읽기 전용). 작성은 그 부서 담당자가 합니다." : undefined;

  if ((!staff || opts.preview) && !otherTeam) {
    const open = await openVersion(supabase, card.id);
    if (open) {
      initial = card.fixedLockedAt ? withFixedFrom(open.data, card.data) : open.data;
      draft = { period: open.period, label: `${monthLabel(open.period)} 작성본`, status: open.status, note: open.note, savedAt: open.updatedAt ?? open.createdAt };
    } else {
      const [from, to] = monthRange(period);
      const { count } = await supabase.from("card_versions").select("id", { count: "exact", head: true }).eq("card_id", card.id).eq("status", "confirmed").gte("confirmed_at", from).lt("confirmed_at", to);
      draft = { period, label: `${monthLabel(period)} 작성본`, status: count ? "confirmed" : "none", note: null, savedAt: null };
    }
    openVersionId = open?.id ?? null;
    openRev = open?.rev ?? 0;
  } else if (staff && !opts.preview) {
    const open = await openVersion(supabase, card.id);
    if (open?.status === "draft") notice = `부서가 ${monthLabel(open.period)} 작성본을 작성 중입니다(확정 전${open.note ? " · 돌려보낸 뒤 고치는 중" : ""}). 원장에서 같은 구역을 고쳐도 부서가 확정하면 그 구역은 작성본 내용으로 바뀝니다(다른 구역은 그대로).`;
    if (open?.status === "submitted") {
      const { data: author } = open.createdBy ? await supabase.from("profiles").select("display_name, email").eq("id", open.createdBy).maybeSingle() : { data: null };
      const { merged, conflicts } = mergeDraft(card.data, open.base, card.fixedLockedAt ? withFixedFrom(open.data, card.data) : open.data);
      review = {
        versionId: open.id,
        periodLabel: `${monthLabel(open.period)} 작성본`,
        author: author?.display_name || author?.email || "부서 담당자",
        submittedAt: open.submittedAt,
        changes: diffCards(card.data, merged),
        conflicts: conflictLabels(conflicts),
      };
    }
  }
  // 작성본에만 있는 그림(한글 파일로 채운 현행화 그림)의 서명 주소도 함께
  if (initial !== card.data) {
    try {
      const more = await signedImageUrls(card.uid, renderCard(initial));
      for (const [src, url] of more) if (!(src in card.imageUrls)) card.imageUrls[src] = url;
    } catch {
      // 그리지 못하는 작성본이면 원장 그림만
    }
  }
  // 고정 영역이 확정된 카드: 부서 작성본에서는 그 영역을 잠가 보여 줌(성과관리팀 원장 편집은 그대로)
  const locked = card.fixedLockedAt && (!staff || opts.preview) ? [...fixedSectionsOf(card.data)] : undefined;
  // 편집기 기준 번호: 부서 작성본 편집이면 작성본 개정 번호, 그 밖엔 원장 개정 번호
  const draftEditing = Boolean(draft) && !opts.preview && !otherTeam;
  const rev = draftEditing ? openRev : card.dataRev;
  // 편집기를 새로 그릴 때: 작성본 단계가 바뀔 때(확정·남은 제출의 제출 취소·돌려받음). 작성 시작(없음→작성 중)은 입력 중이라 제외
  const stage = !draft ? "ledger" : draft.status === "submitted" ? "sub" : draft.status === "confirmed" ? "done" : "edit";
  const mountKey = `${card.uid}:${stage}${card.retired ? ":retired" : ""}`;
  if (card.retired) notice = `보관한(삭제한) 과제입니다${card.retiredReason ? ` — ${card.retiredReason}` : ""}. 읽기 전용이며 「과제 원장 → 보관함」에서 되살릴 수 있습니다.`;
  return { card, initial, draft, review: card.retired ? undefined : review, locked, otherTeam, openVersionId, rev, mountKey, notice, readOnly: card.retired || opts.preview || otherTeam || (!staff && draft?.status === "submitted") };
}

/** 고정 영역(주요사업 Act·Plan·계량지표, 경영관리 전년도 환류·지적 및 개선방안·계량지표)을 원장 값으로 맞춘 카드 JSON */
export function withFixedFrom(data: LooseJson, ledger: LooseJson): LooseJson {
  return { ...data, ...Object.fromEntries(fixedSectionsOf(ledger).map((k) => [k, ledger?.[k]])) };
}
