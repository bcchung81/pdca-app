// 「한글(화면 그대로)」 변환 라우트의 요청 본문 읽기(서버 — 2026-10-28, 경평 초안·과제관리카드 공통).
// 상한(DOM_HWPX_MAX_BYTES)까지만 읽고 넘으면 null(413). gzip 본문(content-type DOM_HWPX_GZIP_TYPE)은 풀린 크기 상한(DOM_HWPX_MAX_INFLATED)까지만 풀고
// 넘으면 null(413), 풀지 못하면 빈 글(→ JSON이 아님 400)
import { gunzipSync } from "node:zlib";
import { DOM_HWPX_GZIP_TYPE, DOM_HWPX_MAX_BYTES, DOM_HWPX_MAX_INFLATED } from "./policy.ts";

/** 요청 본문을 상한까지만 읽음 — 넘으면 null */
async function readCapped(request: Request, max: number): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** 읽은 바이트 → 글: gzip이면 풀린 크기 상한까지만 풂(넘으면 null, 못 풀면 빈 글) */
export function decodeBody(bytes: Uint8Array, gzip: boolean, maxInflated: number = DOM_HWPX_MAX_INFLATED): string | null {
  if (!gzip) return new TextDecoder().decode(bytes);
  try {
    return new TextDecoder().decode(gunzipSync(bytes, { maxOutputLength: maxInflated }));
  } catch (e) {
    if (e instanceof RangeError || (e as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") return null;
    return "";
  }
}

/** 요청 본문 글 — 상한을 넘으면 null(413) */
export async function readSnapshotText(request: Request): Promise<string | null> {
  const bytes = await readCapped(request, DOM_HWPX_MAX_BYTES);
  if (bytes === null) return null;
  const gzip = (request.headers.get("content-type") ?? "").split(";")[0].trim() === DOM_HWPX_GZIP_TYPE;
  return decodeBody(bytes, gzip);
}
