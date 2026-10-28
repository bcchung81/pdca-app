import { getCurrentUser, requireUser } from "../../../../../lib/auth/dal.ts";
import { HWPX_MIME, cardToHwpx, hwpxFileName } from "../../../../../lib/cards/hwp/export.ts";
import { cardBodyWidthMm, cardPageMm } from "../../../../../lib/cards/hwpx-copy.ts";
import { isCardUid, loadCardHwpxSource } from "../../../../../lib/cards/hwpx-source.ts";
import { bodyMmOf, snapshotToHwpx } from "../../../../../lib/reports/dom-hwpx/convert.ts";
import { PICTURES_HEADER, picturesHeader, resolvePictures, snapshotPictureUrls } from "../../../../../lib/reports/dom-hwpx/pictures.ts";
import { judgeSnapshotPost, parseDomHwpxPost } from "../../../../../lib/reports/dom-hwpx/policy.ts";
import { readSnapshotText } from "../../../../../lib/reports/dom-hwpx/read-body.ts";
import { supabaseEnv } from "../../../../../lib/supabase/env.ts";
import { createClient } from "../../../../../lib/supabase/server.ts";

/** 카드 원본 그림 저장소 칸(비공개 — 키는 {cards.uid}/…) */
const CARD_ORIGINALS = "card-originals";

/** 내려받기 머리(파일 이름은 GET·POST 같은 규칙 — hwpxFileName) */
function hwpxHeaders(name: string): Record<string, string> {
  return {
    "content-type": HWPX_MIME,
    "content-disposition": `attachment; filename="card.hwpx"; filename*=UTF-8''${encodeURIComponent(name)}`,
    "cache-control": "private, no-store",
  };
}

/**
 * 과제관리카드 한글(HWPX) 내려받기 — 원본 배치가 있으면 원본 한글 파일 모양 그대로, 없으면 9.16 양식.
 * 부서 담당자는 이달 작성본(없으면 원장), 성과관리팀·관리자는 원장(lib/cards/hwpx-copy.ts hwpxBasis). 읽기 권한은 RLS가 판정합니다(볼 수 없는 카드는 404).
 * 내려받은 파일을 다시 올리면(현행화·작성본 채우기) 같은 카드로 읽힘(59장 왕복 시험). 화면 그대로(DOM 방식)는 아래 POST
 */
export async function GET(_req: Request, ctx: RouteContext<"/cards/[uid]/hwpx">) {
  const { uid } = await ctx.params;
  const me = await requireUser(`/cards/${uid}`);
  if (!isCardUid(uid)) return new Response("잘못된 주소입니다.", { status: 400 });
  const supabase = await createClient();
  const src = await loadCardHwpxSource(supabase, me, uid);
  if (!src) return new Response("카드를 찾을 수 없습니다.", { status: 404 });
  try {
    const bytes = await cardToHwpx(supabase, src.uid, src.data, src.layout);
    return new Response(Buffer.from(bytes), { headers: hwpxHeaders(hwpxFileName(src.taskNo, String(src.data.title ?? src.title))) });
  } catch (e) {
    console.error("card hwpx", e);
    return new Response("한글 파일을 만들지 못했습니다.", { status: 500 });
  }
}

/**
 * 한글 내려받기 — 화면 그대로(DOM 방식, 2026-10-28). 브라우저가 표지 없는 숨은 사본(/cards/<uid>/hwpx-copy)에서 뜬 화면 배치 스냅숏을 받아
 * 범용 변환기(lib/reports/dom-hwpx/convert.ts)로 카드 원본 배치의 쪽 정의(용지·여백)에 맞춰 HWPX를 만듭니다. 본문은 gzip(DOM_HWPX_GZIP_TYPE)도 받음.
 * 판정(경평 초안과 같은 순수 함수): 401 로그인 없음 · 413 본문 2MB(gzip이면 줄인 크기)·풀린 크기 넘음 · 400 JSON 모양 · 404 카드·원본 배치 없음 ·
 * 409 사본을 뜬 뒤 카드가 바뀜 · 400 스냅숏(본문 틀 폭 = 쪽 본문 폭). 카드 글꼴은 한글 원본 글꼴이라 경평 글꼴 정책은 걸지 않음.
 * 읽기만 하므로 부서 화면 보기(?team=)에서도 됨(GET과 같음). 카드는 사용자 권한(RLS)으로 읽음.
 * 이 파일은 화면 모양을 옮긴 것이라 다시 올리기(현행화·작성본 채우기)용이 아님 — 다시 올리기는 GET(원본 배치) 파일.
 * 그림(2026-10-28): 스냅숏에는 주소만 옴. 이 프로젝트 저장소의 card-originals 서명 주소 중 키의 첫 경로가 이 카드 uid인 것만
 * 서명 주소를 따라가지 않고 요청 사용자 권한(RLS) 클라이언트로 저장소에서 내려받음(lib/reports/dom-hwpx/pictures.ts). 허용 밖·상한 초과·모르는 형식은
 * 자리만 두고 경고 로그 + 응답 머리 PICTURES_HEADER(placed·skipped·reasons)
 */
export async function POST(request: Request, ctx: RouteContext<"/cards/[uid]/hwpx">) {
  const { uid } = await ctx.params;
  const me = await getCurrentUser();
  const authed = Boolean(me?.active);
  const text = authed ? await readSnapshotText(request) : "";
  const pre = parseDomHwpxPost({ authed, tooLarge: text === null, text });
  if (!pre.ok) return new Response(pre.message, { status: pre.status });
  const supabase = await createClient();
  const src = me ? await loadCardHwpxSource(supabase, me, uid) : null;
  const layout = src?.layout ?? null;
  const v = judgeSnapshotPost({
    body: pre.body,
    version: src && layout ? src.version : null,
    frameW: layout ? cardBodyWidthMm(layout) : 0,
    missing: "카드를 찾을 수 없거나 원본 배치가 없습니다.",
    changed: "화면 사본을 뜬 뒤 카드가 바뀌었습니다. 다시 내려받으세요.",
  });
  if (!v.ok || !src || !layout) return new Response(v.ok ? "카드를 찾을 수 없습니다." : v.message, { status: v.ok ? 404 : v.status });
  try {
    const title = String(src.data.title ?? src.title);
    const page = cardPageMm(layout);
    const pics = await resolvePictures(snapshotPictureUrls(v.snap), { base: supabaseEnv().url, bucket: CARD_ORIGINALS, folder: src.uid, storage: supabase.storage });
    // 서명 주소의 토큰(질의 글)은 로그에 남기지 않음
    if (pics.skipped.length) console.warn("card hwpx dom pictures", JSON.stringify({ uid: src.uid, skipped: pics.skipped.map((s) => ({ reason: s.reason, url: s.url.split("?")[0].slice(0, 200) })) }));
    // 카드는 여러 쪽 — 맨 위 표 중 쪽 본문의 1/4보다 높은 것은 쪽 경계에서 나눔(경평 경영관리와 같은 기준)
    const { bytes } = await snapshotToHwpx(v.snap, { lines: false, title: [src.taskNo, title].filter(Boolean).join(" "), page, splitOverMm: bodyMmOf(page).h / 4, pictures: pics.pictures });
    const headers: Record<string, string> = { ...hwpxHeaders(hwpxFileName(src.taskNo, `${title} 화면`)), [PICTURES_HEADER]: picturesHeader(pics) };
    return new Response(Buffer.from(bytes), { headers });
  } catch (e) {
    console.error("card hwpx dom", e);
    return new Response("한글 파일을 만들지 못했습니다.", { status: 500 });
  }
}
