// 「한글 내려받기(화면 그대로)」 판정 테스트 — 합성 스냅숏 고정 자료(fixtures/ — 합성 글만, 기관 자료·실명 없음).
// 지키는 것: 스냅숏 검사(판·틀 폭 170±0.5mm·노드 수·깊이·PNG 서명·IHDR 크기·모양) · 라우트 판정(401·413·400·404·409·200 — 순서 포함) ·
// 글꼴 정책(본문·돋움 없으면 막음, 라벨·제목만 없으면 경고) · 판면 넘침(주요사업 분량 쪽 올림 × 255mm, 경영관리 재지 않음) ·
// 흉내 자간 되돌리기 표(빠진 갈래의 별칭·--k-ls 값) · 쪽 본문 상수 = section-hwpx.ts REPORT_PAGE_MM · 맨 위 표 나눔 높이 ·
// 변환기 쪽 정의 인자(용지·여백이 그대로 한글 용지로)·여러 쪽 표 나눔(글자처럼 취급 안 함 + TABLE/CELL)·흉내 자간 되돌리기 · 고정 자료 둘 다 validateHwpx 통과

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { validateHwpx } from "kordoc";
import type { Table } from "../../hwp/model.ts";
import { REPORT_PAGE_MM } from "../section-hwpx.ts";
import { bodyMmOf, pageDefOf, snapshotHwpxInput, snapshotToHwpx } from "./convert.ts";
import { DOM_HWPX_MAX_BYTES, MULTI_PAGE_SPLIT_MM, REPORT_BODY_MM, SNAP_LIMITS, fontGate, judgeDomHwpx, judgeSnapshotPost, overflowLimitMm, overflowMm, parseDomHwpxPost, spacingUndoFor, splitOverFor, validateSnapshot } from "./policy.ts";
import type { LayoutSnapshot } from "./snapshot.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const fixture = (name: string): LayoutSnapshot => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const clone = <T>(x: T): T => structuredClone(x);
const MM = 7200 / 25.4;
const topTables = (snap: LayoutSnapshot, splitOverMm?: number) =>
  snapshotHwpxInput(snap, { lines: false, page: REPORT_PAGE_MM, splitOverMm }).input.paras.flatMap((p) => p.items.flatMap((it) => (it.kind === "obj" && it.obj.kind === "table" ? [it.obj as Table] : [])));

test("쪽 본문 상수 = section-hwpx.ts REPORT_PAGE_MM에서 나온 값(170×255mm) · 여러 쪽 나눔 높이 = 쪽 본문의 1/4", () => {
  assert.deepEqual(bodyMmOf(REPORT_PAGE_MM), { w: REPORT_BODY_MM.w, h: REPORT_BODY_MM.h });
  assert.equal(MULTI_PAGE_SPLIT_MM, 63.75);
});

test("validateSnapshot: 고정 자료 둘 통과 · 판·틀 폭(±0.5mm)·노드 수·깊이·모양·PNG 서명·IHDR 크기·픽셀 수가 어긋나면 거절", () => {
  const one = fixture("one-page.snapshot.json");
  assert.equal(validateSnapshot(one).ok, true);
  assert.equal(validateSnapshot(fixture("multi-page.snapshot.json")).ok, true);
  const bad = (f: (s: any) => void, re: RegExp) => {
    const s = clone(one) as any;
    f(s);
    const v = validateSnapshot(s);
    assert.equal(v.ok, false);
    if (!v.ok) assert.match(v.reason, re);
  };
  bad((s) => (s.version = 2), /판/);
  bad((s) => (s.frame.w = 170.6), /틀 폭/);
  assert.equal(validateSnapshot({ ...clone(one), frame: { w: 169.6, h: 260 } }).ok, true);
  bad((s) => (s.frame.h = 0), /높이/);
  bad((s) => (s.root.children[0].style.border = []), /상자 노드/);
  bad((s) => (s.root.children[0].kind = "frame"), /모르는 노드/);
  bad((s) => (s.root.children[3].image.png = btoa("GIF89a" + "x".repeat(40))), /PNG/);
  bad((s) => (s.root.children[3].image.w = 2), /PNG|크기/);
  bad((s) => (s.root.children[3].image = { png: s.root.children[3].image.png, w: 9000, h: 1 }), /범위 밖/);
  bad((s) => (s.fontMark = 3), /글꼴 표지/);
  // 노드 수·깊이 상한
  bad((s) => (s.root.children = Array.from({ length: SNAP_LIMITS.nodes + 1 }, () => ({ kind: "br" }))), /노드가/);
  bad((s) => {
    const tpl = s.root.children[4];
    let n = s.root;
    for (let i = 0; i < SNAP_LIMITS.depth + 1; i++) {
      const k = clone(tpl);
      k.children = [];
      n.children = [k];
      n = k;
    }
  }, /깊이/);
  assert.equal(validateSnapshot(null).ok, false);
  assert.equal(validateSnapshot("{}").ok, false);
});

test("라우트 판정: 401(로그인 없음 — 본문보다 먼저) · 413(2MB 넘음) · 400(JSON 아님·version·snapshot 없음) · 404(초안 없음) · 409(판 다름) · 400(스냅숏·글꼴) · 200", () => {
  const snap = fixture("one-page.snapshot.json");
  const text = JSON.stringify({ version: "v1", snapshot: snap });
  const p = (authed: boolean, tooLarge: boolean, t: string | null) => parseDomHwpxPost({ authed, tooLarge, text: t });
  const st = (r: { ok: boolean; status?: number }) => (r.ok ? 200 : r.status);
  assert.equal(st(p(false, true, null)), 401);
  assert.equal(st(p(true, true, null)), 413);
  assert.equal(st(p(true, false, "{")), 400);
  assert.equal(st(p(true, false, JSON.stringify({ snapshot: snap }))), 400);
  assert.equal(st(p(true, false, JSON.stringify({ version: "v1" }))), 400);
  const ok = p(true, false, text);
  assert.ok(ok.ok);
  if (!ok.ok) return;
  const j = (draftVersion: string | null, body = ok.body, limitMm: number | null = 255) => judgeDomHwpx({ body, draftVersion, limitMm });
  assert.equal(st(j(null)), 404);
  assert.equal(st(j("v2")), 409);
  assert.equal(st(j("v1", { version: "v1", snapshot: { ...clone(snap), version: 9 } })), 400);
  const noBody = j("v1", { version: "v1", snapshot: { ...clone(snap), fontMark: "dotum label head" } });
  assert.equal(st(noBody), 400);
  if (!noBody.ok) assert.match(noBody.message, /KoPub바탕/);
  const good = j("v1");
  assert.equal(st(good), 200);
  if (good.ok) {
    assert.equal(good.overflowMm, 5);
    assert.deepEqual(good.warned, ["label", "head"]);
  }
  const mg = j("v1", ok.body, null);
  if (mg.ok) assert.equal(mg.overflowMm, 0);
  assert.equal(DOM_HWPX_MAX_BYTES, 2 * 1024 * 1024);
});

test("글꼴 정책: 본문·돋움 없으면 막음 · 라벨·제목만 없으면 경고 · 다 있으면 둘 다 없음", () => {
  assert.deepEqual(fontGate("body dotum label head"), { blocked: [], warned: [] });
  assert.deepEqual(fontGate("body dotum"), { blocked: [], warned: ["label", "head"] });
  assert.deepEqual(fontGate("dotum head"), { blocked: ["body"], warned: ["label"] });
  assert.deepEqual(fontGate(""), { blocked: ["body", "dotum"], warned: ["label", "head"] });
  assert.deepEqual(fontGate(undefined).blocked, ["body", "dotum"]);
});

test("판면 넘침: 주요사업 = 분량 쪽 올림(1쪽 이상) × 255mm, 경영관리 = 재지 않음 · 넘친 mm는 소수 한 자리 · 맨 위 표 나눔은 여러 쪽만", () => {
  assert.equal(overflowLimitMm({ mg: false, module: 1 }), 255);
  assert.equal(overflowLimitMm({ mg: false, module: 0.5 }), 255);
  assert.equal(overflowLimitMm({ mg: false, module: 1.5 }), 510);
  assert.equal(overflowLimitMm({ mg: true, module: 1 }), null);
  assert.equal(overflowMm(260.34, 255), 5.3);
  assert.equal(overflowMm(254, 255), 0);
  assert.equal(overflowMm(900, null), 0);
  assert.equal(splitOverFor({ mg: false, module: 1 }), undefined);
  assert.equal(splitOverFor({ mg: false, module: 2 }), MULTI_PAGE_SPLIT_MM);
  assert.equal(splitOverFor({ mg: true, module: 1 }), MULTI_PAGE_SPLIT_MM);
});

test("흉내 자간 되돌리기 표: 빠진 갈래의 별칭과 --k-ls… 값(em, 낱말 간격 --k-ws 제외) · 다 있으면 빈 표", () => {
  assert.deepEqual(spacingUndoFor("body dotum label head"), []);
  assert.deepEqual(spacingUndoFor("body dotum"), [
    { family: "KcaLabel", em: [-0.04, -0.02] },
    { family: "KcaHead", em: [-0.02] },
  ]);
  assert.deepEqual(spacingUndoFor("dotum label head"), [{ family: "KcaBody", em: [-0.083] }]);
});

test("변환기 흉내 자간 되돌리기: 빠진 갈래(라벨·제목) 글은 자간 0, 있는 갈래(본문)는 화면 자간 그대로 · 표 없으면 그대로", () => {
  const snap = fixture("one-page.snapshot.json");
  const spacings = (undo: boolean) => {
    const { input } = snapshotHwpxInput(snap, { lines: false, page: REPORT_PAGE_MM, spacingUndo: undo ? spacingUndoFor(snap.fontMark) : undefined });
    const byFace = new Map<string, number>();
    for (const c of input.doc.charPrs) if (c.height > 100) byFace.set(c.face[0], c.spacing[0]);
    return byFace;
  };
  const off = spacings(false);
  const on = spacings(true);
  assert.equal(off.get("맑은 고딕"), -4);
  assert.equal(on.get("맑은 고딕"), 0);
  assert.equal(off.get("HY헤드라인M"), -2);
  assert.equal(on.get("HY헤드라인M"), 0);
  assert.equal(on.get("KoPub바탕체 Light"), -8);
});

test("쪽 정의 인자: 넘긴 용지·여백이 그대로 한글 용지 · 본문 폭이 다르면 근사 기록", () => {
  const snap = fixture("one-page.snapshot.json");
  const page = { width: 210, height: 297, inside: 20, outside: 20, top: 10, bottom: 10, header: 5, footer: 5, gutter: 0, gutterType: "LEFT_ONLY" as const };
  const { input, approx } = snapshotHwpxInput(snap, { lines: false, page });
  assert.deepEqual(input.page, pageDefOf(page));
  assert.equal(input.page.width, Math.round(210 * MM));
  assert.equal(input.page.gutterType, "LEFT_ONLY");
  assert.ok(!approx.some((a) => a.kind.startsWith("본문 틀 폭")));
  const r = snapshotHwpxInput({ ...snap, frame: { w: 170, h: 260 } }, { lines: false, page: { ...page, inside: 30 } });
  assert.ok(r.approx.some((a) => a.kind === "본문 틀 폭 170.0mm ≠ 한글 본문 160mm"));
  assert.equal(snapshotHwpxInput(snap, { lines: false, page: REPORT_PAGE_MM }).input.page.gutterType, "LEFT_RIGHT");
});

test("여러 쪽: 나눔 높이보다 높은 맨 위 표만 글자처럼 취급하지 않음(한글이 쪽에서 나눔) · 높은 행이 있으면 TABLE, 아니면 CELL · 표 안 표·낮은 표는 그대로", () => {
  const snap = fixture("multi-page.snapshot.json");
  // 기본(쪽 본문 255mm): 300mm 상자만
  const base = topTables(snap);
  assert.deepEqual(
    base.map((t) => [Math.round(t.pos.height / MM), t.pos.treatAsChar, t.pageBreak]),
    [
      [300, false, "TABLE"],
      [240, true, "CELL"],
      [30, true, "CELL"],
    ],
  );
  // 여러 쪽 초안(1/4쪽): 네 행 표도 나눔 — 행 60mm라 행 단위(CELL)
  const multi = topTables(snap, MULTI_PAGE_SPLIT_MM);
  assert.deepEqual(
    multi.map((t) => [t.pos.treatAsChar, t.pageBreak, t.rows]),
    [
      [false, "TABLE", 1],
      [false, "CELL", 4],
      [true, "CELL", 1],
    ],
  );
  // 나누는 표는 문단 기준 위치·위아래 배치·왼쪽 거리 0
  const t = multi[0];
  assert.equal(t.pos.vertRelTo, "PARA");
  assert.equal(t.pos.wrap, "TOP_AND_BOTTOM");
  assert.equal(t.pos.horzAlign, "LEFT");
  assert.equal(t.pos.horzOffset, 0);
  assert.equal(snapshotHwpxInput(snap, { lines: false, page: REPORT_PAGE_MM, splitOverMm: MULTI_PAGE_SPLIT_MM }).stats.split, 2);
});

test("고정 자료 둘 → HWPX validateHwpx 통과(여러 쪽은 나눔 표 포함)", async () => {
  for (const [name, splitOverMm] of [
    ["one-page.snapshot.json", undefined],
    ["multi-page.snapshot.json", MULTI_PAGE_SPLIT_MM],
  ] as const) {
    const snap = fixture(name);
    const { bytes } = await snapshotToHwpx(snap, { lines: false, page: REPORT_PAGE_MM, splitOverMm, spacingUndo: spacingUndoFor(snap.fontMark) });
    const v = await (validateHwpx as any)(Buffer.from(bytes));
    assert.ok(v.ok, `${name}: ${JSON.stringify(v.issues)}`);
  }
});

test("대상 판정(과제관리카드 — judgeSnapshotPost): 404(대상 없음, 문구는 부르는 쪽) · 409(판 다름) · 400(본문 틀 폭 ≠ frameW) · 글꼴 정책은 fonts일 때만", () => {
  const snap = fixture("one-page.snapshot.json");
  const body = { version: "c:1", snapshot: snap };
  const st = (r: { ok: boolean; status?: number }) => (r.ok ? 200 : r.status);
  const missing = judgeSnapshotPost({ body, version: null, frameW: 170, missing: "카드 없음" });
  assert.equal(st(missing), 404);
  if (!missing.ok) assert.equal(missing.message, "카드 없음");
  assert.equal(st(judgeSnapshotPost({ body, version: "c:2", frameW: 170 })), 409);
  // 카드 쪽 본문 폭이 다르면(틀 폭 170mm ≠ 165mm) 스냅숏 검사에서 막음
  assert.equal(st(judgeSnapshotPost({ body, version: "c:1", frameW: 165 })), 400);
  // 글꼴 표지가 없어도 카드는 막지 않음(한글 원본 글꼴) — 경평 초안(fonts)은 막음
  const noMark = { version: "c:1", snapshot: { ...clone(snap), fontMark: undefined } };
  const card = judgeSnapshotPost({ body: noMark, version: "c:1", frameW: 170 });
  assert.equal(st(card), 200);
  if (card.ok) assert.deepEqual(card.warned, []);
  assert.equal(st(judgeSnapshotPost({ body: noMark, version: "c:1", frameW: 170, fonts: true })), 400);
});

test("validateSnapshot <img> 주소(2026-10-28): 주소 글·보이는 부분 자리면 통과 · 주소가 글이 아니거나 4096자를 넘거나 자리 모양이 틀리면 거절 · 고정 자료(경평 초안)는 그대로 통과", () => {
  const base = fixture("one-page.snapshot.json");
  assert.equal(validateSnapshot(base).ok, true);
  const withSrc = (src: unknown) => {
    const s = clone(base);
    (s.root.children as unknown[]).push({ ...clone(s.root), tag: "img", replaced: "img", children: [], src });
    return s;
  };
  assert.equal(validateSnapshot(withSrc({ url: "https://a.example/x.png" })).ok, true);
  assert.equal(validateSnapshot(withSrc({ url: "https://a.example/x.png", clip: { x: 0, y: 0, w: 1, h: 1 } })).ok, true);
  for (const bad of [{ url: 3 }, "https://a.example/x.png", { url: `https://a.example/${"x".repeat(4100)}` }, { url: "https://a.example/x.png", clip: { x: 0 } }]) {
    const v = validateSnapshot(withSrc(bad));
    assert.equal(v.ok, false);
    if (!v.ok) assert.equal(v.reason, "그림 주소 모양이 잘못됨");
  }
});
