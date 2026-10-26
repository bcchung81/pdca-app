"use server";

import { requireUser } from "../../../../lib/auth/dal.ts";
import { PREVIEW_WRITE_MSG, previewWriteBlocked } from "../../../../lib/auth/preview.ts";
import { currentPeriod } from "../../../../lib/cards/view.ts";
import { reportLockedFor } from "../../../../lib/reports/queries.ts";
import { saveDraftRow } from "../../../../lib/reports/draft-store.ts";
import { readSection } from "../../../../lib/reports/section.ts";
import { createClient } from "../../../../lib/supabase/server.ts";
import { DRAFT_LOCKED_MSG, type DraftSources, type ReportDraftState, prepareDraft, refresh } from "./draft-prepare.ts";
import { writeDraft } from "./draft-write.ts";

export type { DraftSources, ReportDraftState } from "./draft-prepare.ts";

/** BP(우수사례) 표시 켜고 끄기 — 분석 문서 C-5: BP는 사람이 고름. 그 카드를 고칠 수 있는 사람(RLS) */
export async function setReportSectionBp(uid: string, bp: boolean): Promise<ReportDraftState> {
  const me = await requireUser("/reports/cards");
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("id, eval_unit_id, team_id").eq("uid", uid).maybeSingle();
  if (!card) return { ok: false, message: "카드를 찾을 수 없습니다." };
  const year = Number(currentPeriod().slice(0, 4));
  if (me.role === "dept_user" && (await reportLockedFor(supabase, card, year))) return { ok: false, message: DRAFT_LOCKED_MSG };
  const { data: draft } = await supabase.from("card_report_drafts").select("spec, updated_at").eq("card_id", card.id).eq("year", year).maybeSingle();
  const spec = readSection(draft?.spec);
  if (!spec || !draft) return { ok: false, message: "초안이 없습니다." };
  const next = { ...spec, task: { ...spec.task, bp: Boolean(bp) } };
  // 읽은 뒤 그 사이 바뀌었으면 덮지 않음(버전 확인 — lib/reports/draft-store.ts)
  const saved = await saveDraftRow(supabase, { cardId: card.id, year }, { spec: next }, draft.updated_at);
  if (!saved.ok) return { ok: false, message: saved.conflict ? saved.message : "바꾸지 못했습니다(권한을 확인해 주세요)." };
  refresh(uid);
  return { ok: true, message: bp ? "BP 표시를 켰습니다." : "BP 표시를 껐습니다." };
}

/**
 * 경평 초안 과제별 초안(카드 1장 → 평가내용2 소항목 spec) — 「AI로 바로 만들기」. 근거 = 원장 카드(한 해 동안 고친 결과) + 고른 첨부 자료
 * (그 카드의 전용 자료 · 그 카드가 속한 보고서의 추가자료). 번호·마커·숫자 대조는 코드가 정합니다.
 * 그 카드를 고칠 수 있는 사람만(부서는 자기 부서 카드) — 최종 판정은 RLS. 자료도 사용자 권한으로 저장소에서 읽음.
 * 호출 기록 ai_requests.feature = report_section.
 */
export async function runReportSectionDraft(uid: string, sources?: DraftSources): Promise<ReportDraftState> {
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const p = await prepareDraft(uid, sources);
  if (!p.ok) return p;
  if (p.mg) return { ok: false, message: "경영관리는 「구성안 만들기」로 시작합니다(이 카드가 맡을 평가내용·대주제·절을 먼저 정하고 승인한 뒤 집필)." };
  const r = await writeDraft(p);
  if (r.ok) refresh(uid);
  return r;
}

