// 경평 초안 자간·정렬 맞춤(브라우저) — 한글 편집 관행: 칸 글이 1~2글자 넘쳐 한 줄을 더 쓰면 문단 자간을 줄여 한 줄 덜 쓰게(2025 분석 §F-c).
// 문단마다 자간 −0.06~+0.04em(0.01em 단위)을 재서 고름: 줄 수가 가장 적은 것 우선(원래 줄 수보다 늘어나는 자간은 버림 — 판면 높이가 늘면 안 됨),
// 같으면 가장 나쁜 줄(마지막 줄 제외)의 채움이 큰 것, 그래도 같으면 |자간|이 작은 것. −0.06em은 본문 한글 0.916em의 약 6.5%(lib/reports/fit.ts SQUEEZE와 같음).
// 줄 수는 실제 글꼴로 재므로 기관 PC 글꼴에서도 그 PC 기준으로 맞춤.
// 미리보기(components/reports/report-preview.tsx)와 내려받기 HTML(section-html.ts sectionDocument의 스크립트)이 같은 함수를 씀 —
// 문서에는 toString으로 넣으므로 바깥 이름·import를 쓰지 않는 한 함수로 둡니다.
// 줄 묶기는 조각의 세로 가운데 기준(줄 높이 절반 미만이면 같은 줄) — 확인 칩·태그·출처·마커·위첨자를 따로 한 줄로 세지 않음.
// 정렬은 3단(고른 자간에서 가장 나쁜 줄 채움 기준): 0.9 이상이면 양쪽 정렬+inter-word(띄어쓰기를 벌림), 0.8~0.9면 양쪽 정렬 기본(inter-character),
// 0.8 미만이면 왼쪽 정렬(「현 장 공 무 원」 — 평가 라운드 G·H, 4칸 도식·그림 옆·협업 가운데 칸). 줄 수는 정렬과 상관없으므로 판면 어림(lib/reports/fit.ts)은 그대로입니다.

export function fitTextLines(root: ParentNode): number {
  // 왼쪽 정렬로 놓고 잰 줄 수와, 마지막 줄을 뺀 줄의 채움 중 가장 작은 값
  const measure = (li: HTMLElement) => {
    li.classList.add("k-left");
    const cs = getComputedStyle(li);
    const box = li.getBoundingClientRect();
    const scale = li.offsetWidth ? box.width / li.offsetWidth : 1;
    const pl = parseFloat(cs.paddingLeft) * scale;
    const left = box.left + pl;
    const width = box.width - pl - parseFloat(cs.paddingRight) * scale;
    const lh = (parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5) * scale;
    const r = document.createRange();
    r.selectNodeContents(li);
    const qs = Array.from(r.getClientRects())
      .filter((q) => q.width > 0.5)
      .sort((a, b) => a.top - b.top);
    li.classList.remove("k-left");
    const rows: { cy: number; right: number }[] = [];
    for (const q of qs) {
      const cy = (q.top + q.bottom) / 2;
      const row = rows[rows.length - 1];
      if (row && Math.abs(cy - row.cy) < lh / 2) row.right = Math.max(row.right, q.right);
      else rows.push({ cy, right: q.right });
    }
    const fills = rows.slice(0, -1).map((x) => (x.right - left) / width);
    return { n: rows.length, least: fills.length ? Math.min(...fills) : 1 };
  };
  const setK = (li: HTMLElement, k: number) => {
    li.classList.toggle("k-fit-tight", k !== 0);
    if (k !== 0) li.style.setProperty("--k-fit", `${k * 0.01}em`);
    else li.style.removeProperty("--k-fit");
  };
  let fixed = 0;
  root.querySelectorAll(".k-frame li").forEach((node) => {
    const li = node as HTMLElement;
    if (li.querySelector("li, table, div")) return;
    li.classList.remove("k-left", "k-fit-tight");
    li.style.removeProperty("--k-fit");
    li.style.removeProperty("text-justify");
    const base = measure(li);
    if (base.n < 2) return;
    let best = { k: 0, n: base.n, least: base.least };
    // 이미 꽉 찬 문단은 줄을 줄이는 쪽(음수)만 봄
    const ks = base.least >= 0.98 ? [-1, -2, -3, -4, -5, -6] : [-1, 1, -2, 2, -3, 3, -4, 4, -5, -6];
    for (const k of ks) {
      setK(li, k);
      const m = measure(li);
      if (m.n > base.n) continue;
      if (m.n < best.n || (m.n === best.n && m.least > best.least + 0.005)) best = { k, n: m.n, least: m.least };
    }
    setK(li, best.k);
    if (best.n < base.n) fixed += 1;
    if (best.least >= 0.9) li.style.setProperty("text-justify", "inter-word");
    else if (best.least < 0.8) li.classList.add("k-left");
  });
  return fixed;
}
