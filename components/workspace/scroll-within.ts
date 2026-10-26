// AI 패널 스크롤(과제원장 「AI 작성지원」·경평 초안 「AI 초안」 공용): 스크롤 상자 안에서만 옮깁니다.
// scrollIntoView는 바깥(전체 페이지·옆 창)까지 굴려 화면이 흔들리므로 쓰지 않습니다.

const PAD = 16;
const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * 상자(box) 안에서 요소(el)의 첫머리(start) 또는 끝(end)이 보이게 옮김.
 * 상자가 숨어 있으면(display:none — 다른 탭) false를 돌려줌: 부르는 쪽이 자리를 기억했다가 보일 때 다시 부름.
 */
export function scrollWithin(box: HTMLElement, el: Element, at: "start" | "end", smooth: boolean): boolean {
  if (!box.isConnected || !el.isConnected || box.clientHeight === 0) return false;
  const b = box.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const top = at === "start" ? box.scrollTop + r.top - b.top - PAD : box.scrollTop + r.bottom - b.bottom + PAD;
  box.scrollTo({ top: Math.max(0, top), behavior: smooth && !still() ? "smooth" : "auto" });
  return true;
}

const STOP_EVENTS = ["wheel", "touchstart", "pointerdown", "keydown"] as const;

/**
 * 그 자리로 옮긴 뒤, 내용 높이가 바뀌는 동안(새로 고침으로 구성안이 다시 그려지는 등) ms까지 그 자리를 지킴.
 * 사용자가 굴리거나 누르면 바로 그만둠. 상자가 숨어 있으면 아무것도 하지 않고 false.
 * 돌려준 stop으로 멈춤.
 */
export function holdScroll(box: HTMLElement, target: () => Element | null, at: "start" | "end", ms = 2500): { ok: boolean; stop: () => void } {
  const first = target();
  if (!first || !scrollWithin(box, first, at, true)) return { ok: false, stop: () => {} };
  let skip = true;
  const ro = new ResizeObserver(() => {
    // 관찰을 시작하면 한 번 바로 불림 — 그때는 방금 시작한 부드러운 스크롤을 끊지 않음
    if (skip) {
      skip = false;
      return;
    }
    const el = target();
    if (el) scrollWithin(box, el, at, false);
  });
  // stop은 아래 이벤트·시간 제한에서만 불림(그때는 timer가 이미 있음)
  const stop = () => {
    ro.disconnect();
    clearTimeout(timer);
    for (const ev of STOP_EVENTS) box.removeEventListener(ev, stop);
  };
  ro.observe(box.firstElementChild ?? box);
  for (const ev of STOP_EVENTS) box.addEventListener(ev, stop, { passive: true });
  const timer = setTimeout(stop, ms);
  return { ok: true, stop };
}
