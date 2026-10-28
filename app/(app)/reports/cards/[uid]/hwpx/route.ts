import type { NextRequest } from "next/server";
import { getCurrentUser, requireUser } from "../../../../../../lib/auth/dal.ts";
import { HWPX_MIME, hwpxFileName } from "../../../../../../lib/cards/hwp/export.ts";
import { isMgmtCard } from "../../../../../../lib/cards/mgmt-card.ts";
import { currentPeriod } from "../../../../../../lib/cards/view.ts";
import { draftToKcaHwpx } from "../../../../../../lib/hwpx/generate.ts";
import { snapshotToHwpx } from "../../../../../../lib/reports/dom-hwpx/convert.ts";
import { OVERFLOW_HEADER, judgeDomHwpx, overflowLimitMm, parseDomHwpxPost, spacingUndoFor, splitOverFor } from "../../../../../../lib/reports/dom-hwpx/policy.ts";
import { readSnapshotText } from "../../../../../../lib/reports/dom-hwpx/read-body.ts";
import { REPORT_PAGE_MM, sectionToHwpx } from "../../../../../../lib/reports/section-hwpx.ts";
import { sectionMarkdown } from "../../../../../../lib/reports/section-md.ts";
import { readSection } from "../../../../../../lib/reports/section.ts";
import { createClient } from "../../../../../../lib/supabase/server.ts";

/** 내려받기 머리(파일 이름은 GET·POST 같은 규칙 — hwpxFileName) */
function hwpxHeaders(name: string): Record<string, string> {
  return {
    "content-type": HWPX_MIME,
    "content-disposition": `attachment; filename="report-draft.hwpx"; filename*=UTF-8''${encodeURIComponent(name)}`,
    "cache-control": "private, no-store",
  };
}

/**
 * 보고서 과제별 초안 한글(HWPX) 내려받기 — 기존 양식(GET). 볼 수 있는 사람만(RLS)
 *  · 주요사업(기본·`?form=a`): 화면 초안 양식 그대로(2026-10-21 「A안」 — lib/reports/section-hwpx.ts: 216×303 맞쪽 용지, 상자·칸 도식·그림 자리)
 *  · 주요사업 `?form=gaejo`·경영관리: 최소안(2026-10-16) 개조식 원고(lib/reports/section-md.ts) → KCA 양식 변환
 * 화면 그대로(DOM 방식)는 아래 POST
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
    return new Response(Buffer.from(bytes), { headers: hwpxHeaders(name) });
  } catch (e) {
    console.error("report hwpx", e);
    return new Response("한글 파일을 만들지 못했습니다.", { status: 500 });
  }
}

/**
 * 한글 내려받기 — 화면 그대로(DOM 방식, 2026-10-28). 브라우저가 표지 없는 숨은 사본(html?for=hwpx)에서 뽑은 화면 배치 스냅숏을 받아
 * 범용 변환기(lib/reports/dom-hwpx/convert.ts)로 HWPX를 만듭니다. 판정은 lib/reports/dom-hwpx/policy.ts(순수):
 * 401 로그인 없음 · 413 본문 2MB 넘음 · 400 JSON·스냅숏·글꼴(본문·돋움) 막힘 · 404 카드·초안 없음 · 409 화면을 연 뒤 초안이 바뀜.
 * 읽기만 하므로 부서 화면 보기(?team=)에서도 됨(GET과 같음 — 쓰기 차단 함수는 부르지 않음). 카드·초안은 사용자 권한(RLS)으로 읽음.
 * 응답 머리 OVERFLOW_HEADER에 화면 기준 넘친 mm(주요사업 분량 쪽 기준 — 경영관리는 재지 않음)
 */
export async function POST(request: NextRequest, { params }: RouteContext<"/reports/cards/[uid]/hwpx">) {
  const { uid } = await params;
  const me = await getCurrentUser();
  const authed = Boolean(me?.active);
  const text = authed ? await readSnapshotText(request) : "";
  const pre = parseDomHwpxPost({ authed, tooLarge: text === null, text });
  if (!pre.ok) return new Response(pre.message, { status: pre.status });
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("id, task_no, title, data").eq("uid", uid).maybeSingle();
  const year = Number(currentPeriod().slice(0, 4));
  const { data: draft } = card ? await supabase.from("card_report_drafts").select("spec, updated_at").eq("card_id", card.id).eq("year", year).maybeSingle() : { data: null };
  const spec = readSection(draft?.spec);
  const mg = Boolean(card && isMgmtCard(card.data));
  const shape = { mg, module: spec?.module ?? 1 };
  const v = judgeDomHwpx({ body: pre.body, draftVersion: card && spec && draft?.updated_at ? String(draft.updated_at) : null, limitMm: overflowLimitMm(shape) });
  if (!v.ok) return new Response(v.message, { status: v.status });
  try {
    const title = spec?.card.title || card?.title || "";
    const { bytes } = await snapshotToHwpx(v.snap, { lines: false, title, page: REPORT_PAGE_MM, splitOverMm: splitOverFor(shape), spacingUndo: spacingUndoFor(v.snap.fontMark) });
    const headers = hwpxHeaders(hwpxFileName(card?.task_no ?? "", title));
    if (v.overflowMm > 0) headers[OVERFLOW_HEADER] = v.overflowMm.toFixed(1);
    return new Response(Buffer.from(bytes), { headers });
  } catch (e) {
    console.error("report hwpx dom", e);
    return new Response("한글 파일을 만들지 못했습니다.", { status: 500 });
  }
}
