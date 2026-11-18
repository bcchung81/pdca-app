"use server";

import { requireUser } from "../../../../lib/auth/dal.ts";
import { PREVIEW_WRITE_MSG, previewWriteBlocked } from "../../../../lib/auth/preview.ts";
import { currentPeriod } from "../../../../lib/cards/view.ts";
import { reportLockedFor } from "../../../../lib/reports/queries.ts";
import { saveDraftRow } from "../../../../lib/reports/draft-store.ts";
import { type DraftVersionItem, type DraftVersionListRow, DRAFT_VERSION_KEEP, RESTORE_SELECT, VERSION_LIST_COLS, restoreBlockReason, restoreRow, versionItems } from "../../../../lib/reports/draft-versions.ts";
import { createClient } from "../../../../lib/supabase/server.ts";
import { refresh } from "./draft-prepare.ts";

// 경평 초안 「판 기록」(2026-11-18 사용자 결정 3~6): 저장 직전 판(초안 + 구성안 — DB 트리거가 card_report_draft_versions에 남김) 목록과 고른 판으로 되돌리기.
// 되돌리기는 판 내용을 saveDraftRow(updated_at 조건)로 쓰는 저장이라 트리거가 되돌리기 직전 판을 또 남김 — 되돌리기도 되돌릴 수 있음.
// 권한·잠금: 읽기는 카드를 볼 수 있는 사람(RLS), 되돌리기는 초안 쓰기와 같은 판정(부서는 자기 부서 과제 — prepareDraft와 같음) + 보고서가 제출·승인이면 누구도(결정 5).
// prepareDraft를 그대로 부르지 않는 까닭: 근거 묶음(공통 지식·전년 절·첨부 글)을 다 읽는데 되돌리기는 판에 저장된 경고·없는 숫자를 그대로 되쓰므로 필요 없음.

const thisYear = () => Number(currentPeriod().slice(0, 4));

/** 되돌리기 판정에 쓰는 카드·권한(초안 화면 page.tsx canWrite·prepareDraft와 같은 판정 — 잠금만 성과관리팀도 받음) */
async function restoreScope(uid: string, year: number) {
  const me = await requireUser("/reports/cards");
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("id, eval_unit_id, team_id, status").eq("uid", uid).maybeSingle();
  if (!card) return null;
  const staff = me.role !== "dept_user";
  const canWrite = staff || card.team_id === me.team?.id;
  const locked = await reportLockedFor(supabase, card, year);
  return { me, supabase, card, reason: (preview: boolean) => restoreBlockReason({ preview, active: card.status === "active", locked, canWrite }) };
}

export type DraftVersionList =
  | {
      ok: true;
      year: number;
      /** 지금 초안 행의 updated_at(되돌리기의 동시 편집 확인값 — 행이 없으면 null) */
      version: string | null;
      items: DraftVersionItem[];
      /** 되돌리기를 막는 까닭(없으면 null — 판마다 「이 판으로 되돌리기」 단추) */
      blocked: string | null;
      keep: number;
    }
  | { ok: false; message: string };

/** 이 과제·연도의 판 목록(최근 것부터, 본문 없이). 읽기 전용 보기(?team=)에서도 읽음 — 그때는 되돌리기 단추 대신 까닭 */
export async function listDraftVersions(uid: string, year?: number): Promise<DraftVersionList> {
  const y = Number.isInteger(year) ? Number(year) : thisYear();
  const s = await restoreScope(uid, y);
  if (!s) return { ok: false, message: "카드를 찾을 수 없습니다." };
  const [{ data: cur }, { data, error }] = await Promise.all([
    s.supabase.from("card_report_drafts").select("updated_at").eq("card_id", s.card.id).eq("year", y).maybeSingle(),
    s.supabase.from("card_report_draft_versions").select(VERSION_LIST_COLS).eq("card_id", s.card.id).eq("year", y).order("id", { ascending: false }).limit(DRAFT_VERSION_KEEP),
  ]);
  if (error) {
    console.error("listDraftVersions", error.message);
    return { ok: false, message: "판 기록을 읽지 못했습니다." };
  }
  const rows = (data ?? []) as DraftVersionListRow[];
  const ids = [...new Set(rows.map((r) => r.replaced_by).filter((x): x is string => Boolean(x)))];
  // 이름은 읽을 수 있는 프로필만(부서 담당자는 자기 것만 — RLS profiles_read). 못 읽으면 「다른 사용자」(수정 이력 listDraftEdits와 같음)
  const { data: people } = ids.length ? await s.supabase.from("profiles").select("id, display_name, email").in("id", ids) : { data: [] as Array<{ id: string; display_name: string | null; email: string | null }> };
  const nameOf = new Map((people ?? []).map((x: { id: string; display_name: string | null; email: string | null }) => [x.id, x.display_name || x.email || "—"]));
  return {
    ok: true,
    year: y,
    version: cur?.updated_at ? String(cur.updated_at) : null,
    items: versionItems(rows, nameOf, s.me.id),
    blocked: y !== thisYear() ? "올해 초안만 되돌립니다." : s.reason(await previewWriteBlocked()),
    keep: DRAFT_VERSION_KEEP,
  };
}

export type RestoreDraftResult = { ok: true; version: string; message: string } | { ok: false; message: string; conflict?: boolean };

/**
 * 고른 판으로 되돌리기: 판의 초안(spec·경고·없는 숫자·모델·원장 개정 번호)과 구성안 칸 전부를 초안 행에 씀(version = 화면이 본 updated_at — 그사이 바뀌었으면 거절).
 * 판 spec은 지금 읽기 검사(readSection·specIssue)를 지나야 씀. 보고서가 제출·승인이면 누구도 못 함(결정 5). 되돌리기 직전 판은 트리거가 남김(「되돌리기」 표시)
 */
export async function restoreDraftVersion(uid: string, year: number, versionId: number, version: string): Promise<RestoreDraftResult> {
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const y = Number(year);
  if (y !== thisYear()) return { ok: false, message: "올해 초안만 되돌립니다." };
  const s = await restoreScope(uid, y);
  if (!s) return { ok: false, message: "카드를 찾을 수 없습니다." };
  const blocked = s.reason(false);
  if (blocked) return { ok: false, message: blocked };
  if (!version) return { ok: false, conflict: true, message: "지금 초안의 판을 알 수 없습니다. 화면을 새로 고친 뒤 다시 골라 주세요." };
  const { data: v, error } = await s.supabase.from("card_report_draft_versions").select(RESTORE_SELECT).eq("id", Number(versionId)).eq("card_id", s.card.id).eq("year", y).maybeSingle();
  if (error) console.error("restoreDraftVersion read", error.message);
  if (!v) return { ok: false, message: "되돌릴 판을 찾지 못했습니다(30판이 넘어 정리됐을 수 있음). 판 기록을 새로 고쳐 주세요." };
  const r = restoreRow(v);
  if (!r.ok) return { ok: false, message: r.message };
  const saved = await saveDraftRow(s.supabase, { cardId: s.card.id, year: y }, r.row, version, "restore");
  if (!saved.ok) {
    if (!saved.conflict) console.error("restoreDraftVersion save", saved.message);
    return saved.conflict ? { ok: false, conflict: true, message: "그사이 초안이 바뀌었습니다. 화면을 새로 고친 뒤 다시 골라 주세요." } : { ok: false, message: "되돌리지 못했습니다(권한·잠금을 확인해 주세요)." };
  }
  refresh(uid);
  return { ok: true, version: saved.version, message: "고른 판으로 되돌렸습니다. 되돌리기 직전 판은 판 기록에 남았습니다." };
}
