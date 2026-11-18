import type { NextRequest } from "next/server";
import { requireUser } from "../../../../../../lib/auth/dal.ts";
import { currentPeriod } from "../../../../../../lib/cards/view.ts";
import { fmtDateTime } from "../../../../../../lib/format.ts";
import { REPORT_DOC_CSP_META } from "../../../../../../lib/reports/doc-csp.ts";
import { readDraftSpec, recountFailWarning } from "../../../../../../lib/reports/draft-recount.ts";
import { recountStored } from "../../../../../../lib/reports/draft-recount-queries.ts";
import { DRAFT_VERSION_META } from "../../../../../../lib/reports/dom-hwpx/policy.ts";
import { sectionDocument } from "../../../../../../lib/reports/section-html.ts";
import { logAccess } from "../../../../../../lib/ops/access-log.ts";
import { createClient } from "../../../../../../lib/supabase/server.ts";

/**
 * 보고서 과제별 초안 HTML 한 파일 내려받기(글꼴 파일·외부 링크 없음). 볼 수 있는 사람만(RLS)
 *  · `?for=hwpx`: 「한글 내려받기(화면 그대로)」가 숨은 iframe으로 여는 표지 없는 사본 — 검토 표지(카드에 없는 숫자 붉은 점선·되풀이 노란 바탕 등)를 빼고(표지 인자를 비우고 repeats: false),
 *    화면에 띄움(inline), 초안 판(updated_at)을 meta(DRAFT_VERSION_META)로 실음(내려받기 단추가 화면 판과 대조 — lib/reports/dom-hwpx/policy.ts)
 *    우리 출처에서 inline으로 열리므로 인라인 스크립트 하나만 허용하는 CSP meta를 맨 앞에 둠(lib/reports/doc-csp.ts — 머리글이 아닌 이유도 거기)
 *  · 그 밖(검토용 내려받기)의 붉은 점선은 저장된 unknown_numbers만 믿지 않고 저장 경로와 같은 근거로 다시 센 값과 합침(lib/reports/draft-recount*.ts — 과제별 초안 화면과 같음)
 *  · 실패하면 막힘(2026-11-17 3차): 초안이 모양 검사에 걸리거나 그리기가 던지면 500 대신 까닭을 적은 안내 문서(422), 다시 세지 못하면 문서 맨 위에 「없는 숫자 확인 불가」 띠
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
  const { spec, issue } = readDraftSpec(draft?.spec);
  if (issue) return brokenDoc(issue);
  if (!spec) return new Response("초안이 없습니다.", { status: 404 });
  const meta = { year, generatedAt: fmtDateTime(draft?.updated_at), model: draft?.model ?? "" };
  if (request.nextUrl.searchParams.get("for") === "hwpx") {
    const version = String(draft?.updated_at ?? "").replace(/[&"<>]/g, "");
    const doc = renderDoc(() => sectionDocument(spec, [], meta, { repeats: false }), card.id);
    if (doc === null) return brokenDoc("초안을 그리지 못함");
    const html = doc.replace("<head>", `<head>\n${REPORT_DOC_CSP_META}\n<meta name="${DRAFT_VERSION_META}" content="${version}">`);
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "content-disposition": "inline", "cache-control": "private, no-store" } });
  }
  // 다시 세기는 던지지 않음 — 근거 읽기·다시 세기가 실패하면 저장값만 칠하고 failed(막힘 띠)
  const recount = await recountStored(supabase, card, spec, year, { unknown: draft?.unknown_numbers, warnings: [] });
  const doc = renderDoc(() => sectionDocument(spec, recount.unknown, meta), card.id);
  if (doc === null) return brokenDoc("초안을 그리지 못함");
  const html = recount.failed ? doc.replace("<body>", `<body>\n${failBand(recountFailWarning(recount.failed))}`) : doc;
  const name = `보고서초안_${card.task_no}.html`;
  // 접속 기록은 이 내려받기(attachment)만 — ?for=hwpx 숨은 사본(inline, 한글 변환 재료)·안내 문서(422 inline)는 내려받기가 아님
  await logAccess(supabase, { action: "download", target: uid, detail: { kind: "report_html", name } });
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename="report-draft.html"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "no-store",
    },
  });
}

const escHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 문서 맨 위 막힘 띠(검토용 내려받기 — 붉은 점선이 빠졌을 수 있음을 알림) */
const failBand = (text: string) =>
  `<p role="alert" style="max-width:220mm;margin:0 auto 12px;padding:8px 12px;border:1.5px solid #c62828;border-radius:4px;background:#fdecea;color:#8e1c1c;font:13px/1.6 '맑은 고딕','Malgun Gothic',sans-serif">${escHtml(text)}</p>`;

/** 모양 검사를 지났는데도 그리기가 던지면(검사 빈틈) null — 500 대신 안내 문서로 */
function renderDoc(render: () => string, cardId: string): string | null {
  try {
    return render();
  } catch (e) {
    console.error("report draft html", cardId, e);
    return null;
  }
}

/** 그릴 수 없는 초안의 안내 문서(422 — 화면에 띄움) */
function brokenDoc(reason: string): Response {
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>초안을 그릴 수 없습니다</title></head><body style="margin:0;background:#e9eae9;padding:24px 16px">${failBand(recountFailWarning(reason))}<p style="max-width:220mm;margin:0 auto;font:13px/1.6 '맑은 고딕','Malgun Gothic',sans-serif;color:#333">저장된 초안이 앱 밖에서 바뀌었거나 손상돼 그리지 않았습니다. 과제별 초안 화면에서 다시 만들어 주세요.</p></body></html>`;
  return new Response(html, { status: 422, headers: { "content-type": "text/html; charset=utf-8", "content-disposition": "inline", "cache-control": "private, no-store" } });
}
