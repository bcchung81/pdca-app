import type { NextRequest } from "next/server";
import { requireUser } from "../../../../../../lib/auth/dal.ts";
import { HWPX_MIME, hwpxFileName } from "../../../../../../lib/cards/hwp/export.ts";
import { isMgmtCard } from "../../../../../../lib/cards/mgmt-card.ts";
import { currentPeriod } from "../../../../../../lib/cards/view.ts";
import { draftToKcaHwpx } from "../../../../../../lib/hwpx/generate.ts";
import { sectionToHwpx } from "../../../../../../lib/reports/section-hwpx.ts";
import { sectionMarkdown } from "../../../../../../lib/reports/section-md.ts";
import { readSection } from "../../../../../../lib/reports/section.ts";
import { createClient } from "../../../../../../lib/supabase/server.ts";

/**
 * 보고서 과제별 초안 한글(HWPX) 내려받기. 볼 수 있는 사람만(RLS)
 *  · 주요사업(기본): 화면 초안 양식 그대로(2026-10-21 「A안」 — lib/reports/section-hwpx.ts: 216×303 맞쪽 용지, 상자·칸 도식·그림 자리)
 *  · 주요사업 `?form=gaejo`·경영관리: 최소안(2026-10-16) 개조식 원고(lib/reports/section-md.ts) → KCA 양식 변환
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/reports/cards/[uid]/hwpx">) {
  const { uid } = await params;
  const me = await requireUser(`/reports/cards/${uid}`);
  if (!me) return new Response("로그인이 필요합니다.", { status: 401 });
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("id, task_no, title, data").eq("uid", uid).maybeSingle();
  if (!card) return new Response("카드를 찾을 수 없습니다.", { status: 404 });
  const year = Number(currentPeriod().slice(0, 4));
  const { data: draft } = await supabase.from("card_report_drafts").select("spec").eq("card_id", card.id).eq("year", year).maybeSingle();
  const spec = readSection(draft?.spec);
  if (!spec) return new Response("초안이 없습니다.", { status: 404 });
  const gaejo = isMgmtCard(card.data) || request.nextUrl.searchParams.get("form") === "gaejo";
  try {
    let bytes: Uint8Array;
    if (gaejo) {
      const { md, warnings } = sectionMarkdown(spec);
      if (warnings.length) console.warn("report hwpx", warnings);
      bytes = (await draftToKcaHwpx(md)).bytes;
    } else {
      const r = await sectionToHwpx(spec);
      if (r.warnings.length) console.warn("report hwpx", r.warnings);
      bytes = r.bytes;
    }
    const title = spec.card.title || card.title;
    const name = hwpxFileName(card.task_no, gaejo && !isMgmtCard(card.data) ? `${title} 개조식` : title);
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": HWPX_MIME,
        "content-disposition": `attachment; filename="report-draft.hwpx"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("report hwpx", e);
    return new Response("한글 파일을 만들지 못했습니다.", { status: 500 });
  }
}
