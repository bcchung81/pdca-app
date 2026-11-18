import { fmtDateTime } from "../../lib/format.ts";
import { createClient } from "../../lib/supabase/server.ts";
import { AiSwitch } from "./ai-switch";

/**
 * AI 일시 중지 스위치 자리(서버 부품): app_switches의 ai_paused 행과 바꾼 사람 이름을 읽어 AiSwitch에 넘김.
 * 「AI 사용량」 머리에 끼움 — 관리자는 canEdit, 성과관리팀은 상태만. 읽기 실패(마이그레이션 20261118140000 전)면 「상태 모름」
 */
export async function AiSwitchPanel({ canEdit }: { canEdit: boolean }) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("app_switches").select("is_on, reason, updated_by, updated_at").eq("name", "ai_paused").maybeSingle();
  if (error || !data) return <AiSwitch state={{ on: false, reason: null, updatedText: null, updatedBy: null, unreadable: true }} canEdit={false} />;
  let by: string | null = null;
  if (data.updated_by) {
    const { data: p } = await supabase.from("profiles").select("display_name, email").eq("id", data.updated_by).maybeSingle();
    by = p?.display_name || p?.email || null;
  }
  return <AiSwitch state={{ on: data.is_on === true, reason: data.reason ?? null, updatedText: data.updated_at ? fmtDateTime(data.updated_at) : null, updatedBy: by }} canEdit={canEdit} />;
}
