// 「한글(화면 그대로)」 그림 바이트 받기(pictures.ts) 테스트 — 합성 주소·합성 바이트만(기관 원문·실제 주소 없음).
// 지키는 것: 허용 주소 판정과 키 뽑기(이 프로젝트 저장소 서명 주소만 · 다른 호스트·프로토콜·버킷·경로 종류 거절 · 첫 경로가 다른 uid면 거절 ·
// `..`·빈 조각·역슬래시 거절 · 퍼센트 풂) · 형식 판정(PNG·JPEG·GIF·BMP 서명, 모르면 null) · CSS url(…) 읽기 · 스냅숏 그림 주소 모으기 ·
// resolvePictures: 저장소에는 허용된 키만(그 대상 폴더 안) 요청 · 수·바이트 상한 → 자리만(까닭) · 못 받음·모르는 형식 → 자리만 · 응답 머리 값(ASCII) ·
// 카드 라우트의 권한 경로(요청 사용자 권한 클라이언트의 storage·카드 uid 폴더·card-originals — 서비스 키 클라이언트를 쓰지 않음)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PICTURE_LIMITS, cssUrls, pictureFormat, picturesHeader, resolvePictures, snapshotPictureUrls, storageObjectPath, type PictureStorage } from "./pictures.ts";
import type { LayoutSnapshot, SnapBox, SnapStyle } from "./snapshot.ts";

const BASE = "https://proj.supabase.example";
const UID = "0a1b2c3d-0000-4000-8000-000000000001";
const OTHER = "0a1b2c3d-0000-4000-8000-000000000002";
const O = { base: BASE, bucket: "card-originals", folder: UID };
const signed = (path: string, base = BASE, bucket = "card-originals") => `${base}/storage/v1/object/sign/${bucket}/${path}?token=t.e.st`;

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const GIF = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0]);
const BMP = Uint8Array.from([0x42, 0x4d, ...new Array(30).fill(0)]);

test("허용 주소 → 저장소 키(`<uid>/<나머지>`, 퍼센트 풂) · 질의 글(토큰)은 버림", () => {
  assert.deepEqual(storageObjectPath(signed(`${UID}/hwp-abc.jpg`), O), { ok: true, path: `${UID}/hwp-abc.jpg` });
  assert.deepEqual(storageObjectPath(signed(`${UID}/biz1-%EA%B7%B8%EB%A6%BC.png`), O), { ok: true, path: `${UID}/biz1-그림.png` });
  // 대문자 uid도 같은 폴더로 보고 키는 요청 대상 uid로 씀
  assert.deepEqual(storageObjectPath(signed(`${UID.toUpperCase()}/a.png`), O), { ok: true, path: `${UID}/a.png` });
  // 저장소 주소에 끝 빗금이 있어도 같음
  assert.deepEqual(storageObjectPath(signed(`${UID}/a.png`), O), storageObjectPath(signed(`${UID}/a.png`), { ...O, base: `${BASE}/` }));
});

test("다른 uid 폴더 → other-folder(금기 4) · 키가 폴더뿐이거나 `..`·빈 조각·역슬래시 → bad-path", () => {
  assert.deepEqual(storageObjectPath(signed(`${OTHER}/hwp-abc.jpg`), O), { ok: false, reason: "other-folder" });
  assert.equal(storageObjectPath(signed(`${UID}`), O).ok, false);
  // URL 해석이 `..`·`%2E%2E`를 먼저 접어 다른 폴더 또는 폴더 없는 키가 됨 — 어느 쪽이든 거절
  assert.deepEqual(storageObjectPath(signed(`${UID}/../${OTHER}/a.png`), O), { ok: false, reason: "other-folder" });
  assert.deepEqual(storageObjectPath(signed(`${UID}/%2E%2E/${OTHER}/a.png`), O), { ok: false, reason: "other-folder" });
  assert.deepEqual(storageObjectPath(signed(`${UID}/%2E%2E/a.png`), O), { ok: false, reason: "bad-path" });
  assert.deepEqual(storageObjectPath(signed(`${UID}/a%2Fb.png`), O), { ok: false, reason: "bad-path" });
  assert.deepEqual(storageObjectPath(signed(`${UID}//a.png`), O), { ok: false, reason: "bad-path" });
  assert.deepEqual(storageObjectPath(signed(`${UID}/a%5Cb.png`), O), { ok: false, reason: "bad-path" });
  assert.deepEqual(storageObjectPath(signed(`${UID}/%E0%A4%A.png`), O), { ok: false, reason: "bad-path" });
});

test("다른 호스트·프로토콜·포트·사용자 정보·버킷·경로 종류 → not-allowed", () => {
  const no = { ok: false, reason: "not-allowed" };
  assert.deepEqual(storageObjectPath(signed(`${UID}/a.png`, "https://evil.example"), O), no);
  assert.deepEqual(storageObjectPath(signed(`${UID}/a.png`, "http://proj.supabase.example"), O), no);
  assert.deepEqual(storageObjectPath(signed(`${UID}/a.png`, "https://proj.supabase.example:8443"), O), no);
  assert.deepEqual(storageObjectPath(signed(`${UID}/a.png`, "https://u:p@proj.supabase.example"), O), no);
  assert.deepEqual(storageObjectPath(signed(`${UID}/a.png`, BASE, "card-materials"), O), no);
  assert.deepEqual(storageObjectPath(signed(`${UID}/a.png`, BASE, "card-originals-x"), O), no);
  assert.deepEqual(storageObjectPath(`${BASE}/storage/v1/object/public/card-originals/${UID}/a.png`, O), no);
  assert.deepEqual(storageObjectPath(`${BASE}/storage/v1/object/card-originals/${UID}/a.png`, O), no);
  assert.deepEqual(storageObjectPath(`${BASE}/rest/v1/cards`, O), no);
  assert.deepEqual(storageObjectPath(`data:image/png;base64,iVBORw0KGgo=`, O), no);
  assert.deepEqual(storageObjectPath("file:///etc/passwd", O), no);
  assert.deepEqual(storageObjectPath("/storage/v1/object/sign/card-originals/x/a.png", O), no);
  assert.deepEqual(storageObjectPath(signed(`${UID}/a.png`), { ...O, base: "잘못된 주소" }), no);
});

test("형식 판정: 바이트 서명으로 PNG·JPEG·GIF(87a·89a)·BMP · 모르는 것(SVG·빈 바이트·짧은 BMP 머리)은 null", () => {
  assert.equal(pictureFormat(PNG), "png");
  assert.equal(pictureFormat(JPG), "jpg");
  assert.equal(pictureFormat(GIF), "gif");
  assert.equal(pictureFormat(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61])), "gif");
  assert.equal(pictureFormat(BMP), "bmp");
  assert.equal(pictureFormat(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")), null);
  assert.equal(pictureFormat(new Uint8Array()), null);
  assert.equal(pictureFormat(Uint8Array.from([0x42, 0x4d, 0])), null);
  assert.equal(pictureFormat(PNG.slice(0, 7)), null);
});

test("CSS url(…) 읽기: 따옴표 둘·없음, 여러 층(그라데이션 사이), 이스케이프 풂", () => {
  assert.deepEqual(cssUrls(`url("https://a.example/x.png")`), ["https://a.example/x.png"]);
  assert.deepEqual(cssUrls(`linear-gradient(red, blue), url('https://a.example/y.jpg'), url(https://a.example/z.gif)`), ["https://a.example/y.jpg", "https://a.example/z.gif"]);
  assert.deepEqual(cssUrls(`url("https://a.example/\\"q\\".png")`), [`https://a.example/"q".png`]);
  assert.deepEqual(cssUrls("none"), []);
});

/** 합성 스냅숏 상자 */
function style(o: Partial<SnapStyle> = {}): SnapStyle {
  const side = { w: 0, style: "none", color: "rgb(0, 0, 0)" };
  return { display: "block", position: "static", bg: "rgba(0, 0, 0, 0)", bgImage: "none", border: [side, side, side, side], pad: [0, 0, 0, 0], radius: "0px", shadow: "none", clipPath: "none", opacity: 1, fontFamily: "serif", fontSize: 10, fontWeight: 400, fontStyle: "normal", color: "rgb(0, 0, 0)", lineHeight: null, textAlign: "left", textAlignLast: "auto", textJustify: "", letterSpacing: 0, wordSpacing: 0, verticalAlign: "baseline", textIndent: 0, textDecoration: "none", whiteSpace: "normal", wordBreak: "normal", ...o };
}
const box = (children: SnapBox[], o: Partial<SnapBox> = {}): SnapBox => ({ kind: "box", tag: "div", rect: { x: 0, y: 0, w: 10, h: 10 }, style: style(), children, ...o });

test("스냅숏 그림 주소: <img> 주소 + 배경 url(상자·의사요소), 처음 나온 순서·겹침 없이 · 너무 긴 주소는 뺌", () => {
  const a = signed(`${UID}/a.png`);
  const b = signed(`${UID}/b.jpg`);
  const root = box([
    box([], { tag: "img", replaced: "img", src: { url: a } }),
    box([], { style: style({ bgImage: `url("${b}")` }) }),
    box([], { tag: "img", replaced: "img", src: { url: a } }),
    box([], { before: { text: "", rect: null, style: style({ bgImage: `url("${signed(`${UID}/c.png`)}")` }) } }),
    box([], { style: style({ bgImage: `url("https://x.example/${"z".repeat(5000)}")` }) }),
  ]);
  const snap: LayoutSnapshot = { version: 1, frame: { w: 10, h: 10 }, root };
  assert.deepEqual(snapshotPictureUrls(snap), [a, b, signed(`${UID}/c.png`)]);
});

/** 요청한 버킷·경로를 적는 가짜 저장소 */
function fakeStorage(files: Record<string, Uint8Array>) {
  const calls: string[] = [];
  const storage: PictureStorage = {
    from(bucket) {
      return {
        download: async (path) => {
          calls.push(`${bucket}:${path}`);
          const f = files[path];
          return { data: f ? new Blob([Uint8Array.from(f)]) : null };
        },
      };
    },
  };
  return { storage, calls };
}

test("resolvePictures: 저장소에는 허용된 키(요청 카드 폴더 안)만 요청 — 다른 uid·다른 호스트·다른 버킷 주소는 받지 않고 자리만(까닭)", async () => {
  const { storage, calls } = fakeStorage({ [`${UID}/a.png`]: PNG, [`${UID}/b.jpg`]: JPG, [`${OTHER}/x.png`]: PNG });
  const urls = [signed(`${UID}/a.png`), signed(`${OTHER}/x.png`), signed(`${UID}/b.jpg`, "https://evil.example"), signed(`${UID}/b.jpg`, BASE, "card-materials"), signed(`${UID}/b.jpg`)];
  const r = await resolvePictures(urls, { ...O, storage });
  assert.deepEqual(calls, [`card-originals:${UID}/a.png`, `card-originals:${UID}/b.jpg`]);
  assert.deepEqual([...r.pictures.keys()], [urls[0], urls[4]]);
  assert.deepEqual(
    [...r.pictures.values()].map((x) => x.ext),
    ["png", "jpg"],
  );
  assert.deepEqual(
    r.skipped.map((s) => s.reason),
    ["other-folder", "not-allowed", "not-allowed"],
  );
  assert.equal(r.bytes, PNG.byteLength + JPG.byteLength);
  assert.equal(picturesHeader(r), "placed=2; skipped=3; reasons=other-folder,not-allowed");
  assert.match(picturesHeader(r), /^[\x20-\x7e]*$/);
});

test("resolvePictures: 못 받음 → missing · 모르는 형식 → unknown-format · 저장소가 던져도 자리만", async () => {
  const { storage } = fakeStorage({ [`${UID}/s.svg`]: new TextEncoder().encode("<svg/>"), [`${UID}/g.gif`]: GIF, [`${UID}/m.bmp`]: BMP });
  const throwing: PictureStorage = {
    from: () => ({
      download: async () => {
        throw new Error("network");
      },
    }),
  };
  const r = await resolvePictures([signed(`${UID}/none.png`), signed(`${UID}/s.svg`), signed(`${UID}/g.gif`), signed(`${UID}/m.bmp`)], { ...O, storage });
  assert.deepEqual(
    r.skipped.map((s) => s.reason),
    ["missing", "unknown-format"],
  );
  assert.deepEqual(
    [...r.pictures.values()].map((x) => x.ext),
    ["gif", "bmp"],
  );
  const t = await resolvePictures([signed(`${UID}/a.png`)], { ...O, storage: throwing });
  assert.deepEqual(
    t.skipped.map((s) => s.reason),
    ["missing"],
  );
});

test("resolvePictures 상한: 수(허용된 주소 기준 — 넘는 것은 받지 않음) · 바이트 합(주소 순서로 더해 넘는 그림부터 뺌, 닿은 뒤로는 받지 않음) · 기본 상한 60개·30MB", async () => {
  assert.deepEqual(PICTURE_LIMITS, { count: 60, bytes: 30 * 1024 * 1024 });
  const files: Record<string, Uint8Array> = {};
  const urls: string[] = [];
  for (let i = 0; i < 10; i++) {
    files[`${UID}/p${i}.png`] = PNG;
    urls.push(signed(`${UID}/p${i}.png`));
  }
  const c = fakeStorage(files);
  const r = await resolvePictures([signed(`${OTHER}/x.png`), ...urls], { ...O, storage: c.storage, limits: { count: 3, bytes: 1e9 } });
  assert.equal(r.pictures.size, 3);
  assert.equal(c.calls.length, 3);
  assert.deepEqual(
    r.skipped.map((s) => s.reason),
    ["other-folder", ...new Array(7).fill("limit-count")],
  );
  const big = new Uint8Array(100);
  big.set(PNG);
  const bf: Record<string, Uint8Array> = {};
  const bu: string[] = [];
  for (let i = 0; i < 10; i++) {
    bf[`${UID}/b${i}.png`] = big;
    bu.push(signed(`${UID}/b${i}.png`));
  }
  const b = fakeStorage(bf);
  const rb = await resolvePictures(bu, { ...O, storage: b.storage, limits: { count: 60, bytes: 250 } });
  assert.deepEqual([...rb.pictures.keys()], bu.slice(0, 2));
  assert.equal(rb.bytes, 200);
  assert.ok(rb.skipped.every((s) => s.reason === "limit-bytes"));
  assert.equal(rb.skipped.length, 8);
  // 상한에 닿으면(받은 합 ≥ 상한) 다음 묶음(4개씩)부터는 받지 않음
  const e = fakeStorage(bf);
  const re = await resolvePictures(bu, { ...O, storage: e.storage, limits: { count: 60, bytes: 200 } });
  assert.equal(re.pictures.size, 2);
  assert.equal(e.calls.length, 4);
  assert.equal(re.skipped.length, 8);
});

test("카드 라우트 권한 경로: 요청 사용자 권한 클라이언트(createClient)의 storage · card-originals · 카드 uid 폴더 · 이 프로젝트 저장소 주소 — 서비스 키 클라이언트를 쓰지 않음", () => {
  const src = readFileSync(new URL("../../../app/(app)/cards/[uid]/hwpx/route.ts", import.meta.url), "utf8");
  assert.match(src, /from "\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/lib\/supabase\/server\.ts"/);
  assert.doesNotMatch(src, /supabase\/admin|SUPABASE_SECRET_KEY|createAdminClient/);
  assert.match(src, /const CARD_ORIGINALS = "card-originals";/);
  assert.match(src, /resolvePictures\(snapshotPictureUrls\(v\.snap\), \{ base: supabaseEnv\(\)\.url, bucket: CARD_ORIGINALS, folder: src\.uid, storage: supabase\.storage \}\)/);
  // 그림 주소를 직접 받아오지 않음(서명 주소를 따라가지 않음)
  assert.doesNotMatch(src, /\bfetch\(/);
  // 경평 초안 라우트는 그림을 받지 않음(동작 그대로)
  const rep = readFileSync(new URL("../../../app/(app)/reports/cards/[uid]/hwpx/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(rep, /resolvePictures|pictures:/);
});
