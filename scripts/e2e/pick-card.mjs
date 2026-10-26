// e2e 시험 카드 고르기: 시험 부서의 카드 중 운영 기록(작성본·점검·수정 이력·자료·보고서 초안)이 하나도 없는 첫 카드.
// 사람이 이미 고친 카드는 건드리지 않습니다. 없으면 null(시험을 멈춤).
export async function pickTestCard(admin, teamName, columns = "id, uid") {
  const { data: team } = await admin.from("teams").select("id").eq("name", teamName).single();
  const { data: cards } = await admin.from("cards").select(columns).eq("team_id", team.id).eq("status", "active").order("id");
  const busy = async (table, id) => (await admin.from(table).select("*", { count: "exact", head: true }).eq("card_id", id)).count ?? 0;
  for (const c of cards ?? []) {
    const n = (await busy("card_versions", c.id)) + (await busy("inspections", c.id)) + (await busy("card_edits", c.id)) + (await busy("card_materials", c.id)) + (await busy("card_report_drafts", c.id));
    if (n === 0) return c;
  }
  return null;
}
