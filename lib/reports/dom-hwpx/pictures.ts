// 「한글(화면 그대로)」 그림 바이트 받기(서버 — 2026-10-28). 스냅숏에는 그림 주소만 실려 오고(<img> currentSrc·배경 url — 바이트는 싣지 않음),
// 서버가 허용한 주소만 저장소에서 내려받아 변환기(convert.ts DomHwpxOptions.pictures)에 넘깁니다.
//  · SSRF 막기: 스냅숏의 주소를 그대로 받아오지 않음. 이 프로젝트 저장소 주소(base — NEXT_PUBLIC_SUPABASE_URL)의 서명 주소
//    `/storage/v1/object/sign/<bucket>/<folder>/<…>`만 받아 경로에서 저장소 키를 뽑고, 서명 주소(토큰)는 따라가지 않고
//    부르는 쪽이 넘긴 저장소(요청 사용자 권한 RLS 클라이언트의 storage)로 그 키를 내려받음
//  · 키의 첫 경로(folder)가 요청 대상(카드 uid)이 아니면 거절 — 금기 4(카드 전용 자료를 다른 카드에 넣지 않음)
//  · 상한(PICTURE_LIMITS): 서로 다른 그림 수·받은 바이트 합. 넘거나 거절·못 받음·모르는 형식이면 그 그림은 자리만(변환기) — 400이 아니라 응답 머리로 알림
//  · 형식은 바이트 서명으로 판정(PNG·JPEG·GIF·BMP) — 확장자·Content-Type을 믿지 않음
// 어느 저장소 칸(bucket)·폴더인지는 부르는 쪽(과제관리카드 라우트)이 정함 — 이 모듈은 카드를 모름. 입출력은 넘겨받은 storage로만
import type { HwpxImage } from "../../hwp/hwpx-write.ts";
import type { LayoutSnapshot, SnapNode } from "./snapshot.ts";

/** 한 번 변환에 받는 그림 상한: 서로 다른 그림 수·바이트 합 */
export const PICTURE_LIMITS = { count: 60, bytes: 30 * 1024 * 1024 } as const;
/** 스냅숏 그림 주소 길이 상한(글자) — 서명 주소는 수백 자 */
export const PICTURE_URL_MAX = 4096;
/** 응답 머리: `placed=<넣은 그림 수>; skipped=<자리만 둔 수>[; reasons=<까닭,…>]`(ASCII — 머리 값은 바이트 글) */
export const PICTURES_HEADER = "x-hwpx-pictures";

export type PictureFormat = "png" | "jpg" | "gif" | "bmp";
/** 자리만 둔 까닭: 허용 밖 주소·다른 대상 폴더·잘못된 경로·수 상한·바이트 상한·못 받음·모르는 형식 */
export type SkipReason = "not-allowed" | "other-folder" | "bad-path" | "limit-count" | "limit-bytes" | "missing" | "unknown-format";

/** 바이트 서명 → 그림 형식(모르면 null) */
export function pictureFormat(b: Uint8Array): PictureFormat | null {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (b.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  if (b.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return "jpg";
  if (b.length >= 6 && (at(0, 0x47, 0x49, 0x46, 0x38, 0x37, 0x61) || at(0, 0x47, 0x49, 0x46, 0x38, 0x39, 0x61))) return "gif";
  if (b.length >= 26 && at(0, 0x42, 0x4d)) return "bmp";
  return null;
}

/** CSS 계산값(background-image 등)의 url(…) 주소들(층 순서 — 첫 층이 맨 위). 따옴표 안 역슬래시 이스케이프를 풂 */
export function cssUrls(v: string): string[] {
  const out: string[] = [];
  for (const m of v.matchAll(/url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)"'\s]*))\s*\)/g)) {
    const s = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\\([0-9a-fA-F]{1,6})\s?|\\(.)/g, (_x, hex: string | undefined, ch: string | undefined) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : (ch ?? "")));
    if (s) out.push(s);
  }
  return out;
}

/** 스냅숏의 그림 주소(<img> 주소·배경 url — 의사요소 포함), 처음 나온 순서·겹침 없이 */
export function snapshotPictureUrls(snap: LayoutSnapshot): string[] {
  const seen = new Set<string>();
  const add = (u: string) => {
    if (u && u.length <= PICTURE_URL_MAX) seen.add(u);
  };
  const walk = (n: SnapNode) => {
    if (n.kind !== "box") return;
    if (n.src) add(n.src.url);
    for (const st of [n.style, n.before?.style, n.after?.style]) if (st && st.bgImage.includes("url(")) cssUrls(st.bgImage).forEach(add);
    n.children.forEach(walk);
  };
  walk(snap.root);
  return [...seen];
}

export type ObjectPath = { ok: true; path: string } | { ok: false; reason: "not-allowed" | "other-folder" | "bad-path" };

/**
 * 허용 주소 판정과 저장소 키 뽑기(입출력 없음): base(이 프로젝트 저장소 주소)와 출처(프로토콜·호스트·포트)가 같고,
 * 경로가 `<base 경로>/storage/v1/object/sign/<bucket>/<folder>/<나머지>`인 주소만. 키 = `<folder>/<나머지>`(경로 조각마다 퍼센트 풂).
 * 빈 조각·`.`·`..`·역슬래시·제어 글자가 있으면 잘못된 경로, 첫 조각이 folder가 아니면(대소문자 무시) 다른 대상
 */
export function storageObjectPath(url: string, o: { base: string; bucket: string; folder: string }): ObjectPath {
  let u: URL;
  let b: URL;
  try {
    u = new URL(url);
    b = new URL(o.base);
  } catch {
    return { ok: false, reason: "not-allowed" };
  }
  if (!/^https?:$/.test(u.protocol) || u.origin !== b.origin || u.username || u.password) return { ok: false, reason: "not-allowed" };
  const prefix = `${b.pathname.replace(/\/+$/, "")}/storage/v1/object/sign/${encodeURIComponent(o.bucket)}/`;
  if (!u.pathname.startsWith(prefix)) return { ok: false, reason: "not-allowed" };
  const raw = u.pathname.slice(prefix.length).split("/");
  let parts: string[];
  try {
    parts = raw.map((s) => decodeURIComponent(s));
  } catch {
    return { ok: false, reason: "bad-path" };
  }
  if (parts.length < 2 || parts.some((s) => !s || s === "." || s === ".." || /[\\\u0000-\u001f\u007f]/.test(s) || s.includes("/"))) return { ok: false, reason: "bad-path" };
  if (parts[0].toLowerCase() !== o.folder.toLowerCase()) return { ok: false, reason: "other-folder" };
  return { ok: true, path: [o.folder, ...parts.slice(1)].join("/") };
}

/** 내려받기에 쓰는 저장소(Supabase 클라이언트의 storage 모양 — 요청 사용자 권한 클라이언트를 넘김) */
export interface PictureStorage {
  from(bucket: string): { download(path: string): PromiseLike<{ data: Blob | null }> };
}

export interface PictureLoad {
  /** 주소 → 그림 바이트·확장자(변환기 DomHwpxOptions.pictures) */
  pictures: Map<string, HwpxImage>;
  /** 자리만 둔 주소와 까닭(주소 순서) */
  skipped: { url: string; reason: SkipReason }[];
  /** 받은 바이트 합 */
  bytes: number;
}

/**
 * 그림 주소들 → 허용한 것만 저장소에서 받아 바이트로. 주소 순서대로 판정하고(같은 입력이면 같은 결과) 4개씩 나눠 받음.
 * 수 상한은 허용된 주소에 대해 받기 전에, 바이트 상한은 받은 뒤 주소 순서로 더해 넘는 그림부터 뺌
 */
export async function resolvePictures(urls: readonly string[], o: { base: string; bucket: string; folder: string; storage: PictureStorage; limits?: { count: number; bytes: number } }): Promise<PictureLoad> {
  const limits = o.limits ?? PICTURE_LIMITS;
  const out: PictureLoad = { pictures: new Map(), skipped: [], bytes: 0 };
  const todo: { url: string; path: string }[] = [];
  for (const url of urls) {
    const p = storageObjectPath(url, o);
    if (!p.ok) out.skipped.push({ url, reason: p.reason });
    else if (todo.length >= limits.count) out.skipped.push({ url, reason: "limit-count" });
    else todo.push({ url, path: p.path });
  }
  const bucket = o.storage.from(o.bucket);
  for (let i = 0; i < todo.length; i += 4) {
    // 바이트 상한에 이미 닿았으면 남은 그림은 받지 않음
    if (out.bytes >= limits.bytes) {
      for (const t of todo.slice(i)) out.skipped.push({ url: t.url, reason: "limit-bytes" });
      break;
    }
    const got = await Promise.all(
      todo.slice(i, i + 4).map(async (t) => {
        try {
          const { data } = await bucket.download(t.path);
          return data ? new Uint8Array(await data.arrayBuffer()) : null;
        } catch {
          return null;
        }
      }),
    );
    got.forEach((data, k) => {
      const t = todo[i + k];
      const ext = data ? pictureFormat(data) : null;
      if (!data) out.skipped.push({ url: t.url, reason: "missing" });
      else if (!ext) out.skipped.push({ url: t.url, reason: "unknown-format" });
      else if (out.bytes + data.byteLength > limits.bytes) out.skipped.push({ url: t.url, reason: "limit-bytes" });
      else {
        out.bytes += data.byteLength;
        out.pictures.set(t.url, { data, ext });
      }
    });
  }
  return out;
}

/** 응답 머리 값(ASCII): placed·skipped 수와 까닭 */
export function picturesHeader(r: PictureLoad): string {
  const reasons = [...new Set(r.skipped.map((s) => s.reason))];
  return `placed=${r.pictures.size}; skipped=${r.skipped.length}${reasons.length ? `; reasons=${reasons.join(",")}` : ""}`;
}
