import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardCopyReady } from "../../../../../components/cards/card-copy-ready";
import { requireUser } from "../../../../../lib/auth/dal.ts";
import { cardCopyBody } from "../../../../../lib/cards/hwpx-copy.ts";
import { CARD_VERSION_META } from "../../../../../lib/cards/hwpx-copy-marks.ts";
import { loadCardHwpxSource } from "../../../../../lib/cards/hwpx-source.ts";
import { CARD_LAYOUT_CSS } from "../../../../../lib/cards/layout-render.ts";
import { rewriteCardImages } from "../../../../../lib/cards/original-html.ts";
import { signedImageUrls } from "../../../../../lib/cards/queries.ts";
import { renderCard } from "../../../../../lib/cards/render.ts";
import { layoutImageKeys } from "../../../../../lib/hwp/layout.ts";
import { createClient } from "../../../../../lib/supabase/server.ts";
import "../../../../../lib/cards/card.css";

export const metadata: Metadata = { title: "한글 변환용 카드 사본 · 경평AI비서", robots: { index: false } };

/**
 * 과제관리카드 「한글(화면 그대로)」의 표지 없는 숨은 사본(2026-10-28). 카드 화면(card-editor.tsx)과 같은 CSS(앱 전역 + card.css + CARD_LAYOUT_CSS)·
 * 같은 원본 배치 그리기를 편집 칸·잠금·검토 표지·도구·머리띠 없이 그리고(lib/cards/hwpx-copy.ts cardCopyBody — 맨 위 묶음 제목 표 포함),
 * 글자 간격 맞춤(fit.ts)이 끝나면 <html data-hwfit>를 담(card-copy-ready.tsx). 카드 화면의 「한글(화면 그대로)」이 화면 밖 iframe으로 열어 뜸.
 * 내용은 한글 내려받기(GET /cards/<uid>/hwpx)와 같은 기준(부서 담당자는 그 팀 카드의 열린 작성본, 그 밖은 원장 — hwpxBasis)이고 판을 meta로 실음.
 * 앱 틀((app)/layout.tsx — 머리띠·메뉴)을 쓰지 않게 (copy) 묶음에 둠. 읽기 권한은 RLS(볼 수 없는 카드·원본 배치가 없는 카드는 404)
 */
export default async function CardHwpxCopy({ params }: PageProps<"/cards/[uid]/hwpx-copy">) {
  const { uid } = await params;
  const me = await requireUser(`/cards/${uid}`);
  const supabase = await createClient();
  const src = await loadCardHwpxSource(supabase, me, uid);
  if (!src?.layout) notFound();
  let refsHtml = "";
  try {
    refsHtml = renderCard(src.data);
  } catch {
    // 원본 양식으로 그리지 못하는 카드 JSON이면 원본 배치 그림만
  }
  const urls = await signedImageUrls(src.uid, refsHtml, layoutImageKeys(src.layout));
  const body = cardCopyBody(src.data, src.layout, (key) => urls.get(`hwp:${key}`) ?? null);
  if (!body) notFound();
  return (
    <>
      <meta name={CARD_VERSION_META} content={src.version} />
      <style>{CARD_LAYOUT_CSS}</style>
      <div className="w-max bg-white" dangerouslySetInnerHTML={{ __html: rewriteCardImages(body, urls) }} />
      <CardCopyReady />
    </>
  );
}
