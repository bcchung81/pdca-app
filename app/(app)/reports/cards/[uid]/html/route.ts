import type { NextRequest } from "next/server";
import { requireUser } from "../../../../../../lib/auth/dal.ts";
import { currentPeriod } from "../../../../../../lib/cards/view.ts";
import { fmtDateTime } from "../../../../../../lib/format.ts";
import { REPORT_DOC_CSP_META } from "../../../../../../lib/reports/doc-csp.ts";
import { recountDraft } from "../../../../../../lib/reports/draft-recount.ts";
import { loadDraftKnown } from "../../../../../../lib/reports/draft-recount-queries.ts";
import { DRAFT_VERSION_META } from "../../../../../../lib/reports/dom-hwpx/policy.ts";
import { sectionDocument } from "../../../../../../lib/reports/section-html.ts";
import { readSection } from "../../../../../../lib/reports/section.ts";
import { createClient } from "../../../../../../lib/supabase/server.ts";

/**
 * 보고서 과제별 초안 HTML 한 파일 내려받기(글꼴 파일·외부 링크 없음). 볼 수 있는 사람만(RLS)
 *  · `?for=hwpx`: 「한글 내려받기(화면 그대로)」가 숨은 iframe으로 여는 표지 없는 사본 — 검토 표지(카드에 없는 숫자 붉은 점선·되풀이 노란 바탕 등)를 빼고(표지 인자를 비우고 repeats: false),
 *    화면에 띄움(inline), 초안 판(updated_at)을 meta(DRAFT_VERSION_META)로 실음(내려받기 단추가 화면 판과 대조 — lib/reports/dom-hwpx/policy.ts)
 *    우리 출처에서 inline으로 열리므로 인라인 스크립트 하나만 허용하는 CSP meta를 맨 앞에 둠(lib/reports/doc-csp.ts — 머리글이 아닌 이유도 거기)
 *  · 그 밖(검토용 내려받기)의 붉은 점선은 저장된 unknown_numbers만 믿지 않고 저장 경로와 같은 근거로 다시 센 값과 합침(lib/reports/draft-recount*.ts — 과제별 초안 화면과 같음)
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/reports/cards/[uid]/html">) {
  const { uid } = await params;
  const me = await requireUser(`/reports/cards/${uid}`);
  if (!me) return new Response("로그인이 필요합니다.", { status: 401 });
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("id, task_no, eval_unit_id, team_id, data").eq("uid", uid).maybeSingle();
  if (!card) return new Response("카드를 찾을 수 없습니다.", { status: 404 });
  const year = Number(currentPeriod().slice(0, 4));
  const { data: draft } = await supabase.from("card_report_drafts").select("spec, unknown_numbers, model, updated_at").eq("card_id", card.id).eq("year", year).maybeSingle();
  const spec = readSection(draft?.spec);
  if (!spec) return new Response("초안이 없습니다.", { status: 404 });
  const meta = { year, generatedAt: fmtDateTime(draft?.updated_at), model: draft?.model ?? "" };
  if (request.nextUrl.searchParams.get("for") === "hwpx") {
    const version = String(draft?.updated_at ?? "").replace(/[&"<>]/g, "");
    const html = sectionDocument(spec, [], meta, { repeats: false }).replace("<head>", `<head>\n${REPORT_DOC_CSP_META}\n<meta name="${DRAFT_VERSION_META}" content="${version}">`);
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "content-disposition": "inline", "cache-control": "private, no-store" } });
  }
  const known = await loadDraftKnown(supabase, card, spec, year);
  const { unknown } = recountDraft(spec, card.data, known, { unknown: draft?.unknown_numbers, warnings: [] });
  const html = sectionDocument(spec, unknown, meta);
  const name = `보고서초안_${card.task_no}.html`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename="report-draft.html"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "no-store",
    },
  });
}
