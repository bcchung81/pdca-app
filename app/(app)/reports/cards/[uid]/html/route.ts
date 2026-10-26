import type { NextRequest } from "next/server";
import { requireUser } from "../../../../../../lib/auth/dal.ts";
import { currentPeriod } from "../../../../../../lib/cards/view.ts";
import { fmtDateTime } from "../../../../../../lib/format.ts";
import { sectionDocument } from "../../../../../../lib/reports/section-html.ts";
import { readSection } from "../../../../../../lib/reports/section.ts";
import { createClient } from "../../../../../../lib/supabase/server.ts";

/** 보고서 과제별 초안 HTML 한 파일 내려받기(글꼴 파일·외부 링크 없음). 볼 수 있는 사람만(RLS) */
export async function GET(_request: NextRequest, { params }: RouteContext<"/reports/cards/[uid]/html">) {
  const { uid } = await params;
  const me = await requireUser(`/reports/cards/${uid}`);
  if (!me) return new Response("로그인이 필요합니다.", { status: 401 });
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("id, task_no").eq("uid", uid).maybeSingle();
  if (!card) return new Response("카드를 찾을 수 없습니다.", { status: 404 });
  const year = Number(currentPeriod().slice(0, 4));
  const { data: draft } = await supabase.from("card_report_drafts").select("spec, unknown_numbers, model, updated_at").eq("card_id", card.id).eq("year", year).maybeSingle();
  const spec = readSection(draft?.spec);
  if (!spec) return new Response("초안이 없습니다.", { status: 404 });
  const html = sectionDocument(spec, draft?.unknown_numbers ?? [], { year, generatedAt: fmtDateTime(draft?.updated_at), model: draft?.model ?? "" });
  const name = `보고서초안_${card.task_no}.html`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename="report-draft.html"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "no-store",
    },
  });
}
