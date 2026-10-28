// 화면 배치 스냅숏 뜨기(브라우저 — 2026-10-28): 같은 출처의 숨은 iframe(화면 밖 left:-10000px, 폭 900px)에 표지 없는 사본 HTML을 열고,
// 글꼴 표지·글꼴 준비·화면 자간 맞춤이 끝나길 기다린 뒤 본문 틀을 추출기(extract.ts extractLayout)로 뜹니다. 뜬 뒤 iframe은 지웁니다.
//  · visibility:hidden은 쓰지 않음 — 추출기가 숨은 요소로 빼므로 화면 밖 자리로만 숨김
//  · 기다림: 로드 → 글꼴 표지 속성(markAttr)이 기대값(expectMark — 같은 PC의 앱 화면이 잰 값)과 같아질 때까지 → document.fonts.ready →
//    문서 변경(MutationObserver)이 quietMs 동안 없고 본문 틀 높이가 그대로일 때까지(완료 표지가 없어 안정 조건으로 봄). 전체 상한 settleMs
//  · 무엇을 열고 어느 요소를 뜰지(src·frameSelector)·표지 이름(markAttr·versionMeta)은 부르는 쪽이 정함 — 이 모듈은 화면 클래스 이름을 모름
//  · 준비 표지(markAttr)는 경평 초안이면 글꼴 표지(data-kfont — 스냅숏 fontMark로도 실음), 과제관리카드면 글자 맞춤 끝 표지(data-hwfit — fontAttr: null,
//    requireMark: 기한 안에 표지가 없으면 멈춤 — 맞추기 전 화면을 뜨지 않게). 2026-10-28 카드로 일반화
//  · 헤드리스 점검 스크립트도 toString으로 같은 함수를 부를 수 있게 바깥 이름·import를 쓰지 않는 한 함수로 둠(추출 함수는 인자로 받음)

import type { LayoutSnapshot } from "./snapshot.ts";

export interface CaptureOptions {
  /** 본문 틀 선택자(앱 쪽이 넘김) */
  frameSelector: string;
  /** 준비 표지 속성(<html …>) */
  markAttr: string;
  /** 기다릴 준비 표지 값(빈 글이면 속성을 기다리지 않음) */
  expectMark: string;
  /** 스냅숏 fontMark로 실을 <html> 속성 — 없으면 markAttr(경평 초안: 글꼴 표지가 곧 준비 표지), null이면 싣지 않음 */
  fontAttr?: string | null;
  /** 기한(settleMs) 안에 준비 표지가 기대값이 되지 않으면 멈춤(없으면 그대로 뜸) */
  requireMark?: boolean;
  /** 판 meta 이름 */
  versionMeta: string;
  /** iframe 폭(px) */
  width?: number;
  /** 로드 상한·안정 기다림 상한·조용한 시간·최소 기다림(ms) */
  loadMs?: number;
  settleMs?: number;
  quietMs?: number;
  minMs?: number;
}
export interface Captured {
  snap: LayoutSnapshot;
  /** 사본 HTML의 판(meta — 초안 판·카드 판) — 없으면 null */
  version: string | null;
}

export async function captureHidden(src: string, o: CaptureOptions, extract: (frame: Element) => Promise<LayoutSnapshot>): Promise<Captured> {
  const doc = document;
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const ifr = doc.createElement("iframe");
  ifr.setAttribute("aria-hidden", "true");
  ifr.tabIndex = -1;
  ifr.title = "한글 변환용 화면 사본";
  ifr.style.cssText = `position:fixed;left:-10000px;top:0;width:${o.width ?? 900}px;height:1200px;border:0;pointer-events:none`;
  try {
    const loaded = new Promise<void>((res, rej) => {
      ifr.onload = () => res();
      ifr.onerror = () => rej(new Error("화면 사본을 열지 못했습니다."));
      setTimeout(() => rej(new Error("화면 사본을 여는 데 시간이 너무 걸립니다.")), o.loadMs ?? 20000);
    });
    ifr.src = src;
    doc.body.appendChild(ifr);
    await loaded;
    const t0 = Date.now();
    const d = ifr.contentDocument;
    if (!d) throw new Error("화면 사본을 읽을 수 없습니다.");
    const frame = () => d.querySelector(o.frameSelector);
    if (!frame()) throw new Error("화면 사본에 본문이 없습니다(로그인이 끊겼거나 내용이 없음).");
    const deadline = t0 + (o.settleMs ?? 8000);
    if (o.expectMark) while ((d.documentElement.getAttribute(o.markAttr) ?? "") !== o.expectMark && Date.now() < deadline) await sleep(50);
    if (o.expectMark && o.requireMark && (d.documentElement.getAttribute(o.markAttr) ?? "") !== o.expectMark) throw new Error("화면 사본의 글자 맞춤이 끝나지 않았습니다. 잠시 뒤 다시 내려받으세요.");
    if (d.fonts) await d.fonts.ready;
    let last = Date.now();
    const mo = new MutationObserver(() => {
      last = Date.now();
    });
    mo.observe(d.documentElement, { subtree: true, attributes: true, childList: true, characterData: true });
    let h = frame()?.getBoundingClientRect().height ?? 0;
    try {
      while (Date.now() < deadline) {
        await sleep(50);
        const h2 = frame()?.getBoundingClientRect().height ?? 0;
        if (h2 !== h) {
          h = h2;
          last = Date.now();
        }
        if (Date.now() - last >= (o.quietMs ?? 400) && Date.now() - t0 >= (o.minMs ?? 600)) break;
      }
    } finally {
      mo.disconnect();
    }
    const el = frame();
    if (!el) throw new Error("화면 사본에 본문이 없습니다.");
    const snap = await extract(el);
    const fontAttr = o.fontAttr === undefined ? o.markAttr : o.fontAttr;
    if (fontAttr) snap.fontMark = d.documentElement.getAttribute(fontAttr) ?? "";
    const version = Array.from(d.getElementsByTagName("meta")).find((m) => m.getAttribute("name") === o.versionMeta)?.getAttribute("content") ?? null;
    return { snap, version };
  } finally {
    ifr.remove();
  }
}
