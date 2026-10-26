// 과제관리카드 원본 양식 조각(.kca-card)의 그림 경로 다루기.
// 조각은 변환 스크립트가 '../images/bizN/image_NNN.ext'로 그림을 가리킵니다. 운영에서는 비공개 저장소
// card-originals/{cards.uid}/{bizN}-{파일}에 두고, 화면에 낼 때 서명 URL로 바꿉니다.

const IMG_SRC = /(<img\b[^>]*?\ssrc=")([^"]*)(")/gi;
// 적재 그림(bizN)과 현행화로 들어온 그림(imp{묶음 번호}) — 저장소 이름은 {폴더}-{파일}
const SEED_IMAGE = /^\.\.\/images\/((?:biz|imp)\d+)\/(image_\d{3,}\.(?:jpg|jpeg|png|gif|bmp|webp))$/i;

export interface CardImageRef {
  /** 조각 안의 원래 src */
  src: string;
  /** seed/cards/260916/images 기준 경로 */
  seedPath: string;
  /** 저장소 안 파일 이름({bizN}-{파일}) */
  objectName: string;
}

export function cardImageRefs(html: string): CardImageRef[] {
  const out = new Map<string, CardImageRef>();
  for (const m of html.matchAll(IMG_SRC)) {
    const src = m[2];
    const seed = SEED_IMAGE.exec(src);
    if (seed && !out.has(src)) out.set(src, { src, seedPath: `${seed[1]}/${seed[2]}`, objectName: `${seed[1]}-${seed[2]}` });
  }
  return [...out.values()];
}

/**
 * src를 바꿉니다. urls에 있는 원래 src는 그 주소로, 이미 그 주소(서명 URL — 원본 배치 렌더러가 넣은 것)면 그대로,
 * 나머지 src는 비웁니다(모르는 외부 주소를 내보내지 않음).
 */
export function rewriteCardImages(html: string, urls: Map<string, string>): string {
  const known = new Set(urls.values());
  return html.replace(IMG_SRC, (_all, head: string, src: string, tail: string) => {
    const raw = src.replace(/&amp;/g, "&").replace(/&quot;/g, '"');
    const url = urls.get(src) ?? (known.has(raw) ? raw : undefined);
    return `${head}${url ? escapeAttr(url) : ""}${tail}`;
  });
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
