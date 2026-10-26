// 전체 보기(좌측 메뉴·화면 탭 없이 머리띠 아래 전부를 작성 영역으로 쓰는 화면) 판정(순수) — 메뉴(side-nav)·화면 탭(group-tabs)이 이 주소에서 숨음

/** /cards 아래 한 칸짜리 주소 중 카드가 아닌 화면 */
const CARD_SCREENS = new Set(["import", "archive", "export"]);

/**
 * 과제관리카드 전체 페이지(/cards/<uid> — 옆 창 「전체 페이지로 열기」)와 경평 초안 과제별 초안(/reports/cards/<uid> — 과제원장과 같은 짜임)은 늘.
 * full(예전 「전체 보기」 ?full=1)은 받아도 결과가 같음
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 메뉴·화면 탭이 ?full= 값을 넘기지만 이제 결과에는 쓰지 않음
export function isFullView(pathname: string, _full?: string | null): boolean {
  const card = /^\/cards\/([^/]+)\/?$/.exec(pathname);
  if (card) return !CARD_SCREENS.has(card[1]);
  return /^\/reports\/cards\/[^/]+\/?$/.test(pathname);
}
