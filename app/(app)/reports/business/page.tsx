import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Empty, NoAccess, PageHeader, Panel, Screen } from "../../../../components/ui/kit";
import { requireAtLeast } from "../../../../lib/auth/dal.ts";
import { createClient } from "../../../../lib/supabase/server.ts";
import { compareUnitId } from "../../../../lib/cards/view.ts";
import { getTrack } from "../../../../lib/tracks/current.ts";

export const metadata: Metadata = { title: "사업 조판 · 경평 초안 · 경영AI비서" };

/** 경평 초안 「사업 조판」 탭 첫 진입: 머리띠에서 고른 트랙의 첫 평가단위(주요사업 BZ-1·경영관리 지표 MG-1 — 숫자 순)로 보냄 */
export default async function BusinessIndexPage() {
  const me = await requireAtLeast("pmo", "/reports/business");
  if (!me) return <NoAccess title="경평 초안 · 사업 조판" need="성과관리팀" />;
  const track = await getTrack();
  const supabase = await createClient();
  const { data: units } = await supabase.from("eval_units").select("id").eq("track", track).not("card_group", "is", null);
  const first = [...(units ?? [])].sort((a, b) => compareUnitId(a.id, b.id))[0]?.id;
  if (first) redirect(`/reports/business/${encodeURIComponent(first)}`);
  return (
    <Screen header={<PageHeader title="경평 초안" />}>
      <Panel>
        <Empty title={track === "경영관리" ? "과제관리카드가 있는 지표가 없습니다." : "과제관리카드가 있는 주요사업이 없습니다."} />
      </Panel>
    </Screen>
  );
}
