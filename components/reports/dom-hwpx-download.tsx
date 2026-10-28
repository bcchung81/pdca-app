"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";
import { captureHidden } from "../../lib/reports/dom-hwpx/capture.ts";
import { extractLayout } from "../../lib/reports/dom-hwpx/extract.ts";
import { CARD_COPY_FRAME_ATTR, CARD_COPY_READY, CARD_COPY_READY_ATTR, CARD_VERSION_META } from "../../lib/cards/hwpx-copy-marks.ts";
import { DOM_HWPX_GZIP_TYPE, DOM_HWPX_MAX_BYTES, DRAFT_VERSION_META, FONT_GROUP_NAME, fontGate, overflowMm } from "../../lib/reports/dom-hwpx/policy.ts";
import type { LayoutSnapshot } from "../../lib/reports/dom-hwpx/snapshot.ts";
import { type AskStep, ConfirmDialog, useAsk } from "../ui/confirm-dialog";
import { reportFontsReady } from "./report-font-probe";

// 「한글 내려받기(화면 그대로)」(2026-10-28): 누르면 표지 없는 숨은 사본을 화면 밖 iframe에 열어 화면 배치 스냅숏을 뜨고(lib/reports/dom-hwpx/capture.ts·extract.ts)
// → (경평 초안이면) 글꼴·판면 넘침을 확인한 뒤 → 변환 라우트에 POST(서버가 변환) → 파일 저장.
//  · 경평 초안(DomHwpxItem — start): 사본 /reports/cards/<uid>/html?for=hwpx · 라우트 POST /reports/cards/<uid>/hwpx · 글꼴 표지 data-kfont · 글꼴 정책
//  · 과제관리카드(cardDomTarget — startTarget): 사본 /cards/<uid>/hwpx-copy · 라우트 POST /cards/<uid>/hwpx · 글자 맞춤 표지 data-hwfit · 본문 gzip(스냅숏이 수 MB)
// 판정은 lib/reports/dom-hwpx/policy.ts(서버와 같은 함수). 실패하면(글꼴 막힘·크기 초과·추출 실패·서버 오류) 까닭을 보이고 기존 양식 내려받기를 안내합니다.
// 변환기(convert.ts)는 서버에만 — 이 파일은 추출기·판정(가벼운 순수 함수)만 불러옴

/** 더보기 메뉴 항목의 화면 그대로 내려받기 재료(서버가 채움 — app/(app)/reports/cards/[uid]/derive.ts menuOf) */
export interface DomHwpxItem {
  uid: string;
  /** 화면에 그린 초안 판(card_report_drafts.updated_at) */
  version: string;
  /** 판면 넘침을 재는 한도(mm) — 없으면 재지 않음(경영관리) */
  limitMm: number | null;
  /** 실패할 때 안내하는 기존 양식 내려받기 */
  fallback: { href: string; label: string };
}

/** 경평 초안 본문 틀(앱 쪽 코드에만 — 추출기·변환기는 화면 클래스 이름을 모름) */
const FRAME_SELECTOR = ".k-frame";
/** 글꼴 표지 속성(lib/reports/report-fonts.ts markReportFonts) */
const MARK_ATTR = "data-kfont";

/** 화면 그대로 내려받기 대상(경평 초안·과제관리카드 공통) */
export interface DomHwpxTarget {
  /** 표지 없는 숨은 사본 주소 */
  copyHref: string;
  /** 변환 라우트(POST) */
  postHref: string;
  /** 사본 안 본문 틀 선택자 */
  frameSelector: string;
  /** 준비 표지 속성(<html …>)과 기다릴 값(열 때 구함 — 빈 글이면 기다리지 않음) */
  markAttr: string;
  expectMark: () => Promise<string>;
  /** 준비 표지가 기한 안에 없으면 멈춤 */
  requireMark: boolean;
  /** 스냅숏 fontMark로 실을 속성(null이면 싣지 않음) */
  fontAttr: string | null;
  /** 판 meta 이름 */
  versionMeta: string;
  /** 화면에 그린 판 — 사본 판과 대조(null이면 대조하지 않고 사본 판을 보냄 — 서버가 대조) */
  version: string | null;
  /** 경평 글꼴 정책(막힘·경고) */
  fonts: boolean;
  /** 판면 넘침을 재는 한도(mm) — 없으면 재지 않음 */
  limitMm: number | null;
  /** 본문을 gzip으로 줄여 보냄(브라우저가 CompressionStream을 지원할 때) */
  gzip: boolean;
  /** 실패할 때 안내하는 기존 내려받기 */
  fallback: { href: string; label: string };
  /** 사본을 열기 전에(편집 중인 글 저장 등) — false면 멈춤 */
  before?: () => Promise<boolean>;
}

/** 경평 초안 → 대상 */
function reportTarget(it: DomHwpxItem): DomHwpxTarget {
  return {
    copyHref: `/reports/cards/${it.uid}/html?for=hwpx`,
    postHref: `/reports/cards/${it.uid}/hwpx`,
    frameSelector: FRAME_SELECTOR,
    markAttr: MARK_ATTR,
    expectMark: reportFontsReady,
    requireMark: false,
    fontAttr: MARK_ATTR,
    versionMeta: DRAFT_VERSION_META,
    version: it.version,
    fonts: true,
    limitMm: it.limitMm,
    gzip: false,
    fallback: it.fallback,
  };
}

/** 과제관리카드 → 대상(원본 배치가 있는 카드만 — 사본이 원본 배치로 그림). before: 편집 중인 글을 먼저 저장 */
export function cardDomTarget(uid: string, before?: () => Promise<boolean>): DomHwpxTarget {
  return {
    copyHref: `/cards/${uid}/hwpx-copy`,
    postHref: `/cards/${uid}/hwpx`,
    frameSelector: `[${CARD_COPY_FRAME_ATTR}]`,
    markAttr: CARD_COPY_READY_ATTR,
    expectMark: async () => CARD_COPY_READY,
    requireMark: true,
    fontAttr: null,
    versionMeta: CARD_VERSION_META,
    version: null,
    fonts: false,
    limitMm: null,
    gzip: true,
    fallback: { href: `/cards/${uid}/hwpx`, label: "한글(원본 배치)" },
    before,
  };
}

/** 본문 → gzip(지원하지 않는 브라우저면 null) */
async function gzipOf(text: string): Promise<Blob | null> {
  if (typeof CompressionStream === "undefined") return null;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).blob();
}

interface Failure {
  title: string;
  body: string[];
  /** 글꼴 안내 링크를 보임 */
  fonts?: boolean;
  fallback: DomHwpxTarget["fallback"];
}

/** content-disposition의 filename*(UTF-8) → 파일 이름 */
function fileNameOf(cd: string | null): string {
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd ?? "");
  return m ? decodeURIComponent(m[1]) : "report-draft.hwpx";
}
/** 링크 내려받기(서버가 attachment로 줌 — 화면은 그대로) */
function download(href: string, name?: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name ?? "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** 화면 그대로 내려받기 — start(경평 초안 item)·startTarget(대상)을 부르고 ui(진행 알림·확인 창·실패 안내)를 한 번 그림 */
export function useDomHwpx(): { start: (it: DomHwpxItem) => void; startTarget: (t: DomHwpxTarget) => void; busy: boolean; ui: ReactNode } {
  const [busy, setBusy] = useState<string | null>(null);
  const [fail, setFail] = useState<Failure | null>(null);
  const { ask, dialog } = useAsk();

  const send = async (it: DomHwpxTarget, version: string, snap: LayoutSnapshot) => {
    const json = JSON.stringify({ version, snapshot: snap });
    const packed = it.gzip ? await gzipOf(json) : null;
    const body: Blob | string = packed ?? json;
    if ((packed ?? new Blob([json])).size > DOM_HWPX_MAX_BYTES) {
      setFail({ title: "화면 배치 자료가 너무 큽니다", body: [`화면 배치 자료가 ${DOM_HWPX_MAX_BYTES / 1024 / 1024}MB를 넘어 보낼 수 없습니다.`], fallback: it.fallback });
      return;
    }
    setBusy("한글 파일을 만드는 중…");
    try {
      const res = await fetch(it.postHref, { method: "POST", headers: { "content-type": packed ? DOM_HWPX_GZIP_TYPE : "application/json" }, body });
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("hwp")) {
        const why = res.ok ? "서버 응답이 한글 파일이 아닙니다(로그인이 끊겼을 수 있음)." : (await res.text()).slice(0, 300) || `서버 오류(${res.status})`;
        setFail({ title: "한글 파일을 만들지 못했습니다", body: [why], fallback: it.fallback });
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      download(url, fileNameOf(res.headers.get("content-disposition")));
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setFail({ title: "한글 파일을 만들지 못했습니다", body: [e instanceof Error ? e.message : String(e)], fallback: it.fallback });
    } finally {
      setBusy(null);
    }
  };

  const startTarget = (it: DomHwpxTarget) => {
    if (busy) return;
    setBusy("화면 배치를 읽는 중…");
    void (async () => {
      let snap: LayoutSnapshot;
      let version: string | null;
      try {
        if (it.before && !(await it.before())) {
          setBusy(null);
          setFail({ title: "고친 내용을 저장하지 못했습니다", body: ["화면에서 고친 내용이 아직 저장되지 않아 화면 그대로 내려받을 수 없습니다. 저장한 뒤 다시 내려받으세요."], fallback: it.fallback });
          return;
        }
        const expectMark = await it.expectMark();
        ({ snap, version } = await captureHidden(it.copyHref, { frameSelector: it.frameSelector, markAttr: it.markAttr, expectMark, requireMark: it.requireMark, fontAttr: it.fontAttr, versionMeta: it.versionMeta }, extractLayout));
      } catch (e) {
        setBusy(null);
        setFail({ title: "화면 배치를 읽지 못했습니다", body: [e instanceof Error ? e.message : String(e)], fallback: it.fallback });
        return;
      }
      setBusy(null);
      if (version === null || (it.version !== null && version !== it.version)) {
        setFail({ title: "내용이 바뀌었습니다", body: ["이 화면을 연 뒤 내용이 바뀌었습니다. 새로고침한 뒤 다시 내려받으세요."], fallback: it.fallback });
        return;
      }
      const sentVersion = version;
      const gate = it.fonts ? fontGate(snap.fontMark) : { blocked: [], warned: [] };
      if (gate.blocked.length) {
        setFail({
          title: "글꼴이 없어 화면 그대로 내려받을 수 없습니다",
          body: [`이 PC에 ${gate.blocked.map((k) => FONT_GROUP_NAME[k]).join("·")} 글꼴이 없어 화면이 대체 글꼴로 그려졌습니다. 화면 배치를 그대로 옮기면 한글에서 줄바꿈이 크게 달라집니다.`, "글꼴을 설치하고 브라우저를 다시 열거나, 기존 양식으로 내려받으세요."],
          fonts: true,
          fallback: it.fallback,
        });
        return;
      }
      const over = overflowMm(snap.frame.h, it.limitMm);
      const steps: AskStep[] = [];
      if (gate.warned.length)
        steps.push({
          title: "글꼴 일부가 없습니다 — 계속 내려받을까요?",
          body: [`이 PC에 ${gate.warned.map((k) => FONT_GROUP_NAME[k]).join("·")} 글꼴이 없어 그 글은 대체 글꼴로 그려졌습니다.`, "한글 파일에는 원래 글꼴 이름을 적고 화면의 흉내 자간은 되돌립니다. 그 글의 줄바꿈이 화면과 조금 다를 수 있습니다."],
          confirmLabel: "계속",
        });
      if (over > 0) steps.push({ title: "판면을 넘칩니다 — 계속 내려받을까요?", body: [`화면 기준 ${over.toFixed(1)}mm 넘침 — 한글에서 다음 쪽으로 넘어갈 수 있음.`], confirmLabel: "내려받기" });
      ask(steps, () => void send(it, sentVersion, snap));
    })();
  };
  const start = (it: DomHwpxItem) => startTarget(reportTarget(it));

  const ui = (
    <>
      {dialog}
      <ConfirmDialog
        label={fail?.title ?? "한글 내려받기 실패"}
        title={fail?.title ?? ""}
        open={fail !== null}
        onOpenChange={(v) => {
          if (!v) setFail(null);
        }}
        confirmLabel={fail ? `${fail.fallback.label} 내려받기` : "내려받기"}
        pending={false}
        onConfirm={() => {
          if (fail) download(fail.fallback.href);
          setFail(null);
        }}
      >
        {fail?.body.map((t, i) => (
          <p key={i} className="text-ui leading-6 text-ink">
            {t}
          </p>
        ))}
        <p className="text-ui leading-6 text-ink">
          {fail?.fonts && (
            <>
              <Link href="/help#report-fonts" className="text-link">
                글꼴 안내
              </Link>
              {" · "}
            </>
          )}
          기존 양식은 아래 단추로 내려받을 수 있습니다.
        </p>
      </ConfirmDialog>
      {busy && (
        <div role="status" aria-live="polite" className="pointer-events-none fixed right-0 bottom-6 left-0 z-menu flex justify-center px-4">
          <span className="rounded-bubble bg-navy px-4 py-2.5 text-ui text-white shadow-menu">{busy}</span>
        </div>
      )}
    </>
  );
  return { start, startTarget, busy: busy !== null, ui };
}
