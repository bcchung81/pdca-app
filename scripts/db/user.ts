// 사용자 계정 만들기와 역할·부서 지정(관리자 화면이 생기기 전 초기 설정용). 서비스 키로 실행합니다.
//
//   pnpm db:user admin@kca.kr --role admin
//   pnpm db:user someone@kca.kr --role dept_user --team 검사기획팀
//
// 메일 인증을 끝낸 계정으로 만들어 두므로, 그다음부터는 로그인 화면에서 매직링크로 들어오면 됩니다.

import { createClient } from "@supabase/supabase-js";

const ROLES = ["dept_user", "pmo", "admin"] as const;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const role = arg("role") ?? "dept_user";
  const teamName = arg("team");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("사용법: pnpm db:user <메일> [--role dept_user|pmo|admin] [--team 팀명]");
  if (!ROLES.includes(role as (typeof ROLES)[number])) throw new Error(`역할은 ${ROLES.join(", ")} 중 하나`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SECRET_KEY가 필요합니다(.env.local)");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // 이미 있는 계정인지(프로필 메일로 찾음)
  let { data: profile } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
  if (!profile) {
    const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw new Error(`계정 만들기 실패: ${error.message}`);
    profile = { id: data.user.id };
    console.log(`계정 만듦: ${email}`);
  } else console.log(`기존 계정: ${email}`);

  const patch: Record<string, unknown> = { role };
  if (teamName) {
    const { data: team } = await db.from("teams").select("id").eq("name", teamName).maybeSingle();
    if (!team) throw new Error(`부서를 찾을 수 없습니다: ${teamName}`);
    patch.team_id = team.id;
  }
  const { error } = await db.from("profiles").update(patch).eq("id", profile.id);
  if (error) throw new Error(`역할 지정 실패: ${error.message}`);
  console.log(`역할 ${role}${teamName ? ` · 부서 ${teamName}` : ""}`);
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exitCode = 1;
});
