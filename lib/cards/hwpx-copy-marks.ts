// 과제관리카드 「한글(화면 그대로)」 숨은 사본의 표지 이름과 사본 안 준비 함수(2026-10-28) — 브라우저 묶음(내려받기 단추·사본 준비)이 불러오는 가벼운 모듈.
// 사본 본문·쪽 정의는 hwpx-copy.ts(원본 배치 그리기를 불러옴)

/** 본문 틀 표지 속성(사본 안 — 추출기는 이 요소부터 뜸) */
export const CARD_COPY_FRAME_ATTR = "data-hwpx-frame";
/** 준비 표지 속성(<html …>)과 값: 글꼴 준비·그림 읽기 뒤 글자 간격 맞춤까지 끝남 */
export const CARD_COPY_READY_ATTR = "data-hwfit";
export const CARD_COPY_READY = "1";
/** 사본이 그린 카드 판 meta 이름(원장 updated_at 또는 작성본 번호·updated_at — 변환 라우트가 같은 판인지 대조) */
export const CARD_VERSION_META = "kca-card-version";

/**
 * 숨은 사본 안에서(브라우저): 카드 화면(card-editor.tsx)과 같은 순서로 글자 간격을 맞춘 뒤(맞춤 → 글꼴 준비 → 다시 맞춤, 뒤늦게 받은 글꼴마다 다시 맞춤)
 * 그림을 다 읽고 준비 표지를 담. 뒤늦은 맞춤은 문서를 바꾸므로 사본 뜨기(capture.ts)가 조용해질 때까지 기다림.
 * 바깥 이름·import를 쓰지 않는 한 함수(점검 스크립트가 toString으로 페이지에 넣어 부름) — 맞춤 함수(fit.ts fitHwpText)·표지 이름은 인자로
 */
export async function settleCardCopy(doc: Document, fit: (root: HTMLElement) => number, o: { frameAttr: string; readyAttr: string; ready: string }): Promise<void> {
  const root = doc.querySelector<HTMLElement>(`[${o.frameAttr}]`);
  if (!root) return;
  fit(root);
  if (doc.fonts) {
    doc.fonts.addEventListener("loadingdone", () => fit(root));
    await doc.fonts.ready;
  }
  fit(root);
  await Promise.all(Array.from(root.querySelectorAll("img")).map((im) => im.decode().catch(() => undefined)));
  doc.documentElement.setAttribute(o.readyAttr, o.ready);
}

