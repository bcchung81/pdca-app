// 공통 지식 원본의 그림(순수, 2026-09-28): kordoc이 꺼낸 그림을 원본 쪽 번호로 조각에 짝지음 — 조각 글·검색·AI 근거는 그대로 두고
// 조각 meta.images에 그 쪽 범위의 그림 이름만 적음(공통 지식 상세 화면이 보여 줌). 파일은 비공개 버킷 knowledge/<doc_id>/images/<이름>.
// 예전에는 원본을 그림 없이 읽고(scripts/knowledge/parse.ts images: false) 적재에서 그림 자리 표시도 걷어, 상세 화면에 그림이 나올 수 없었음.
// 한계: kordoc은 PDF 한 문서에서 그림을 200개까지만 꺼냄(MAX_IMAGES_PER_DOC) — 첨부3·2025 보고서는 그 뒤 쪽 그림이 없음.

/** 그림 한 장(원본에서 꺼내 웹용으로 바꾼 것) */
export interface KnowledgeImage {
  /** 저장 이름(BMP는 PNG·JPEG로 바꿔 확장자가 달라짐) */
  file: string;
  /** kordoc 마크다운의 그림 이름(image_001.png 등) */
  ref: string;
  /** 원본 쪽(PDF 쪽·kordoc page) */
  page: number;
  mime: string;
  bytes: number;
}

/** 그림 자리 표시: 마크다운 ![…](이름)과 표 칸 안 HTML <img src="이름">(kordoc이 병합 칸 표를 HTML로 적을 때) */
const IMAGE_REF = /!\[[^\]]*\]\(([^)\s]+)\)|<img\b[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)/gi;

/** 글에 든 그림 이름(나온 순서) */
export function imageRefs(text: string): string[] {
  return [...text.matchAll(IMAGE_REF)].map((m) => m[1] ?? m[2]);
}

/** kordoc 조각(page·text) → 그림 이름마다 처음 나온 쪽 */
export function imagePages(chunks: Array<{ page?: number | null; text?: string | null }>): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of chunks) {
    if (!c.text || !c.page) continue;
    for (const ref of imageRefs(c.text)) if (!out.has(ref)) out.set(ref, c.page);
  }
  return out;
}

/** 이보다 작은 그림은 장식(글머리 기호·화살표·기관 로고 등)으로 보고 뺌 — 2025 보고서 쪽마다 붙은 작은 장식이 상한(12장)을 먼저 채우지 않게 */
export const IMAGE_MIN_BYTES = 4096;
/** 조각 하나에 붙이는 그림 상한(관리계획 절처럼 여러 쪽에 걸친 조각) */
export const CHUNK_IMAGE_MAX = 12;

/** 일반 문서(강의·슬라이드 PDF — 조각 하나가 수십 쪽)의 조각당 그림 상한. 전용 파서 문서의 상한(CHUNK_IMAGE_MAX)이면 슬라이드 그림이 잘림 */
export const GENERIC_CHUNK_IMAGE_MAX = 30;

/** 조각 쪽 범위(start~end, end가 없으면 start 한 쪽)에 든 그림 저장 이름 — 쪽·이름 순, 상한까지 */
export function chunkImages(images: KnowledgeImage[], start: number | null | undefined, end: number | null | undefined, max = CHUNK_IMAGE_MAX): string[] {
  if (!start) return [];
  const last = end && end >= start ? end : start;
  return images
    .filter((i) => i.page >= start && i.page <= last && i.bytes >= IMAGE_MIN_BYTES)
    .sort((a, b) => a.page - b.page || a.file.localeCompare(b.file))
    .slice(0, max)
    .map((i) => i.file);
}

/** 조각 행(쪽 범위·meta)에 그 쪽의 그림 이름을 meta.images로 붙임 — 글·쪽 범위는 그대로, 붙일 그림이 없는 조각은 같은 객체를 돌려줌(화면 업로드·knowledge:add·knowledge:images 공용) */
export function withChunkImages<T extends { pdf_page_start?: number | null; pdf_page_end?: number | null; meta?: unknown }>(chunks: T[], images: KnowledgeImage[], max = CHUNK_IMAGE_MAX): T[] {
  return chunks.map((c) => {
    const names = chunkImages(images, c.pdf_page_start, c.pdf_page_end, max);
    return names.length ? { ...c, meta: { ...((c.meta as object | null | undefined) ?? {}), images: names } } : c;
  });
}

/** 조각 meta.images가 가리키는 그림만(올릴 것 — 장식으로 걸러진 작은 그림은 안 올림) */
export function referencedImages<I extends { file: string }>(chunks: Array<{ meta?: unknown }>, images: I[]): I[] {
  const used = new Set(chunks.flatMap((c) => metaImages(c.meta)));
  return images.filter((i) => used.has(i.file));
}

/**
 * 버킷 <doc_id>/images/에 있지만 그 문서의 지금 조각(meta.images)이 가리키지 않는 그림 이름 — 판을 바꿔 다시 적재한 뒤 남은 옛 그림(개선 계획 P2-10).
 * 그림을 읽는 곳은 조각 meta.images뿐(공통 지식 화면 knowledgeImagePath)이라 여기에 없으면 아무도 안 씀
 */
export function orphanImages(stored: string[], chunks: Array<{ meta?: unknown }>): string[] {
  const used = new Set(chunks.flatMap((c) => metaImages(c.meta)));
  return stored.filter((f) => !used.has(f)).sort();
}

/** 버킷 knowledge 안 경로(키는 ASCII — doc_id·kordoc 이름) */
export const knowledgeImagePath = (docId: string, file: string) => `${docId}/images/${file}`;

/** 조각 meta에서 그림 이름 목록(없거나 모양이 다르면 빈 목록) */
export function metaImages(meta: unknown): string[] {
  const v = (meta as { images?: unknown } | null)?.images;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && /^[\w.-]+$/.test(x)) : [];
}
