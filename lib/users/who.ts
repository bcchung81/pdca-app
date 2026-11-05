// 「올린 사람」 이름 찾기: 사용자 권한으로 읽을 수 있는 프로필만 씀(RLS profiles_read — 부서 담당자는 자기 것만, 성과관리팀·관리자는 전부).
// 서비스 키로 읽지 않음(서비스 키는 Auth 관리 API 때만). 못 읽은 사람은 UNKNOWN_USER로 보임.

import type { SupabaseClient } from "@supabase/supabase-js";

/** 프로필을 못 읽은 올린 사람(부서 담당자에게는 같은 팀 동료·성과관리팀이 모두 이렇게 보임) */
export const UNKNOWN_USER = "다른 사용자";

type Person = { id: string; display_name: string | null; email: string | null };

/** 읽은 프로필 → 이름 찾기. id가 없으면(올린 사람 기록 없음) null, 못 읽은 id는 UNKNOWN_USER */
export function whoOf(people: Person[]): (id: string | null | undefined) => string | null {
  const name = new Map(people.map((p) => [p.id, p.display_name || p.email || UNKNOWN_USER]));
  return (id) => (id ? (name.get(id) ?? UNKNOWN_USER) : null);
}

/** ids의 이름을 사용자 권한으로 읽어 찾기 함수로 */
export async function loadWho(supabase: SupabaseClient, ids: Array<string | null | undefined>): Promise<(id: string | null | undefined) => string | null> {
  const want = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const { data } = want.length ? await supabase.from("profiles").select("id, display_name, email").in("id", want) : { data: [] };
  return whoOf((data ?? []) as Person[]);
}
