import "server-only";

import type { CurrentUser } from "../auth/dal.ts";
import type { CardLayout } from "../hwp/layout.ts";
import type { LooseJson } from "../loose-json.ts";
import type { createClient } from "../supabase/server.ts";
import { hwpxBasis } from "./hwpx-copy.ts";
import { openVersion } from "./versions.ts";

// 과제관리카드 한글 내려받기의 재료(서버): 카드 행·원본 배치와 내려받을 카드 JSON·판(hwpxBasis — 부서 담당자는 그 팀 카드의 열린 작성본, 그 밖은 원장).
// 원본 배치 내려받기(GET)·화면 그대로 사본(/cards/<uid>/hwpx-copy)·화면 그대로 변환(POST)이 같은 기준으로 읽음. 읽기 권한은 RLS(볼 수 없는 카드는 null)

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface CardHwpxSource {
  id: string;
  uid: string;
  taskNo: string;
  title: string;
  layout: CardLayout | null;
  data: LooseJson;
  version: string;
}

export const isCardUid = (uid: string) => /^[0-9a-f-]{36}$/i.test(uid);

export async function loadCardHwpxSource(supabase: Supabase, me: CurrentUser, uid: string): Promise<CardHwpxSource | null> {
  if (!isCardUid(uid)) return null;
  const { data: card } = await supabase.from("cards").select("id, uid, task_no, title, data, team_id, layout, updated_at").eq("uid", uid).maybeSingle();
  if (!card) return null;
  const dept = me.role === "dept_user" && me.team?.id === card.team_id;
  const open = dept ? await openVersion(supabase, card.id) : null;
  const basis = hwpxBasis(
    { role: me.role, teamId: me.team?.id ?? null },
    { teamId: card.team_id, data: card.data, updatedAt: String(card.updated_at) },
    open ? { id: open.id, data: open.data, updatedAt: open.updatedAt, createdAt: open.createdAt } : null,
  );
  return { id: card.id, uid: card.uid, taskNo: card.task_no, title: card.title, layout: (card.layout as CardLayout | null) ?? null, ...basis };
}
