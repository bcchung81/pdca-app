// 카드 목록·편집용 순수 함수(과제번호 정렬·이달 기간)

/** 과제번호 "1-가", "10-나"를 실행과제 번호 → 가나다 순으로 */
export function compareTaskNo(a: string, b: string): number {
  const [an, as = ""] = a.split("-");
  const [bn, bs = ""] = b.split("-");
  const d = Number(an) - Number(bn);
  if (d !== 0 && !Number.isNaN(d)) return d;
  return as.localeCompare(bs, "ko");
}

/** 평가단위 id·카드 묶음 이름("MG-2" < "MG-10", "경영관리2" < "경영관리10")을 번호 숫자 순으로 — 글자 순이면 경영관리 지표가 1,10,11…,2로 줄서 칩 순서(1~14)와 어긋남 */
export function compareUnitId(a: string, b: string): number {
  return a.localeCompare(b, "ko", { numeric: true });
}

/** 작성 기간(서울 기준 YYYY-MM) */
export function currentPeriod(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  return `${y}-${m}`;
}
