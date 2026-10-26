import type { Metadata } from "next";
import { NoAccess, PageHeader, Screen } from "../../../../components/ui/kit";
import { requireAtLeast } from "../../../../lib/auth/dal.ts";
import { allowedEmailDomains } from "../../../../lib/auth/redirect.ts";
import { createClient } from "../../../../lib/supabase/server.ts";
import { loadMatchTeams } from "../../../../lib/users/service.ts";
import { PasteImport } from "./paste-import";

export const metadata: Metadata = { title: "일괄 등록 · 경영평가 Sherpa" };
// 줄마다 계정을 만들고 담당 과제를 지정하므로 300줄이면 수 분이 걸릴 수 있음
export const maxDuration = 300;

/** 엑셀에서 복사한 이름·이메일·팀명을 엑셀처럼 생긴 표에 붙여넣어 부서 담당자 계정을 한꺼번에 등록 */
export default async function UsersImportPage() {
  const me = await requireAtLeast("pmo", "/users/import");
  if (!me) return <NoAccess title="일괄 등록" need="성과관리팀" />;
  const teams = await loadMatchTeams(await createClient());
  return (
    <Screen header={<PageHeader title="일괄 등록" />}>
      <PasteImport teams={teams} actorRole={me.role} allowedDomains={allowedEmailDomains()} />
    </Screen>
  );
}
