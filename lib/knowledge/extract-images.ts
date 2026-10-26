// 문서 파일 → 웹용 그림 목록(공통 지식 조각 meta.images의 재료). 읽기(kordoc)뿐이고 DB·저장소는 안 만짐.
// 원래 scripts/knowledge/parse.ts --images 안에 있던 로직을 화면 업로드·pnpm knowledge:add·pnpm knowledge:images가 같이 쓰도록 옮김(동작 그대로).
// 규칙은 lib/knowledge/images.ts: 그림 이름은 PDF면 「p<쪽>-<순번>」(쪽은 원본 절대 쪽 — 조각 pdf_page와 같은 기준), 작은 장식은 짝지을 때 뺌.

import { blocksToChunks, parse } from "kordoc";
import { shrinkPhoto } from "../cards/hwp/image.ts";
import { GENERIC_CHUNK_IMAGE_MAX, type KnowledgeImage, imagePages, referencedImages, withChunkImages } from "./images.ts";

/** PDF 그림 꺼내기 쪽 구간(한 구간 안 그림이 kordoc 상한 200개를 넘지 않게) */
export const IMAGE_WINDOW = 40;
/** kordoc이 한 번 읽기에서 꺼내는 그림 상한(MAX_IMAGES_PER_DOC) */
const KORDOC_IMAGE_CAP = 200;

export type ExtractedImage = KnowledgeImage & { data: Uint8Array };

export interface ExtractResult {
  images: ExtractedImage[];
  /** 한 쪽에 그림이 200개 넘어 일부가 빠짐(kordoc 상한) */
  capped: boolean;
  /** 읽기에 실패한 구간이 있음(있는 만큼만 돌려줌) */
  failed: boolean;
}

/** PDF 쪽 수(그림 없이 한 번 읽어 kordoc metadata로) */
async function pageCount(buf: Buffer): Promise<number> {
  const r = await parse(buf, { images: false });
  return r.success ? (r.metadata?.pageCount ?? Math.max(0, ...blocksToChunks(r.blocks).map((c) => c.page ?? 0))) : 0;
}

/**
 * 파일에서 그림을 꺼냄. PDF는 쪽 구간(IMAGE_WINDOW쪽)마다 따로 읽어 모든 쪽의 그림을 꺼내고(구간마다 이름이 image_001부터 다시 시작해 저장 이름은 p<쪽>-<순번>),
 * 한 구간이 상한(200개)에 닿으면 반으로 나눠 다시 읽음. 그림이 글의 어느 쪽에 나오는지 모르는 그림은 짝지을 수 없어 뺌.
 */
export async function extractDocImages(bytes: Uint8Array, fileName: string): Promise<ExtractResult> {
  const buf = Buffer.from(bytes);
  const pdf = fileName.toLowerCase().endsWith(".pdf");
  const total = pdf ? await pageCount(buf) : 0;
  const windows: Array<[number, number] | null> = pdf ? Array.from({ length: Math.ceil(total / IMAGE_WINDOW) }, (_, i) => [i * IMAGE_WINDOW + 1, Math.min(total, (i + 1) * IMAGE_WINDOW)] as [number, number]) : [null];
  const images: ExtractedImage[] = [];
  let failed = false;
  let capped = false;
  while (windows.length) {
    const range = windows.shift()!;
    const res = await parse(buf, range ? { images: true, pages: `${range[0]}-${range[1]}` } : { images: true });
    if (!res.success) {
      failed = true;
      continue;
    }
    if ((res.images?.length ?? 0) >= KORDOC_IMAGE_CAP) {
      if (range && range[1] > range[0]) {
        const mid = Math.floor((range[0] + range[1]) / 2);
        windows.unshift([range[0], mid], [mid + 1, range[1]]);
        continue;
      }
      capped = true;
    }
    const pages = imagePages(blocksToChunks(res.blocks));
    const seq = new Map<number, number>();
    for (const img of res.images ?? []) {
      const page = pages.get(img.filename);
      if (!page) continue;
      const n = (seq.get(page) ?? 0) + 1;
      seq.set(page, n);
      const ext = img.filename.split(".").pop() ?? "png";
      // HWP의 무압축 BMP는 PNG·JPEG 중 작은 쪽으로, 사진을 담은 불투명 PNG는 JPEG로(lib/cards/hwp/image.ts shrinkPhoto)
      const web = shrinkPhoto(new Uint8Array(img.data), pdf ? `p${String(page).padStart(3, "0")}-${n}.${ext}` : img.filename, img.mimeType);
      images.push({ file: web.name, ref: img.filename, page, mime: web.mime, bytes: web.data.byteLength, data: web.data });
    }
  }
  return { images, capped, failed };
}

/** 업로드 때 그림을 꺼내는 파일 크기 상한 — 이보다 크면 서버(함수) 시간 한도가 걱정되어 글만 올리고 pnpm knowledge:images로 붙임 */
export const IMAGE_ON_UPLOAD_MAX_BYTES = 30 * 1024 * 1024;

export interface AttachedImages<C> {
  /** meta.images가 붙은 조각(붙일 그림이 없으면 그대로) */
  chunks: C[];
  /** 저장소에 올릴 그림(조각이 가리키는 것만) */
  images: ExtractedImage[];
  /** 사람이 읽을 안내(그림을 못 꺼냈거나 일부만 꺼낸 경우) */
  warnings: string[];
}

/**
 * 일반 문서 올리기용: 원본에서 그림을 꺼내 조각 쪽 범위에 짝지음(글·검색·AI 근거는 안 바뀜). 꺼내지 못해도 던지지 않고 글만 올리게 안내를 돌려줌.
 * 그림은 조각 쪽 범위가 있는 문서(PDF·한글)에서만 붙음.
 */
export async function attachDocImages<C extends { pdf_page_start?: number | null; pdf_page_end?: number | null; meta?: unknown }>(bytes: Uint8Array, fileName: string, chunks: C[]): Promise<AttachedImages<C>> {
  const none = (warning?: string): AttachedImages<C> => ({ chunks, images: [], warnings: warning ? [warning] : [] });
  if (bytes.byteLength > IMAGE_ON_UPLOAD_MAX_BYTES) return none(`큰 파일(${Math.round(bytes.byteLength / 1024 / 1024)}MB)이라 그림은 꺼내지 않았습니다 — 올린 뒤 pnpm knowledge:images <문서 id>로 붙일 수 있습니다.`);
  try {
    const got = await extractDocImages(bytes, fileName);
    const attached = withChunkImages(chunks, got.images, GENERIC_CHUNK_IMAGE_MAX);
    const images = referencedImages(attached, got.images);
    const warnings: string[] = [];
    if (got.failed) warnings.push("그림을 읽는 중 실패한 구간이 있어 일부 그림이 빠졌을 수 있습니다.");
    if (got.capped) warnings.push("한 쪽에 그림이 200개를 넘는 쪽이 있어 일부 그림이 빠졌습니다(kordoc 상한).");
    return { chunks: attached, images, warnings };
  } catch (e) {
    return none(`그림을 꺼내지 못해 글만 올렸습니다(${(e as Error).message}) — 나중에 pnpm knowledge:images <문서 id>로 붙일 수 있습니다.`);
  }
}
