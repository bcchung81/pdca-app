// 화면에서 글자 간격 맞추기(브라우저 전용). 렌더러(html.ts)가 글자 조각에 남긴 한글 규칙(data-s 자간 %, data-r 장평 %, data-w 빈칸 종류,
// data-l 줄 끝 글자, data-b 진하게)을 보고, 지금 실제로 쓰인 글꼴의 글자 폭을 재서 CSS 글자 간격을 정합니다. 글꼴 폭 표를 코드에 두지 않습니다.
//  · 한글: 글자마다 폭이 (그 글자 폭 × 장평 × (1 + 자간)) — 폭이 다른 글자(영문·숫자·기호)가 섞인 조각은 같은 폭끼리 잘게 나눔
//  · 빈칸: 보통 빈칸 글자 크기의 1/2, 고정폭 빈칸 1/4, '글꼴에 어울리는 빈칸'이면 글꼴의 빈칸 폭 — 모두 × 장평 × (1 + 자간)
//  · 줄 끝 글자 뒤에는 간격을 붙이지 않음
//  · 진하게 한 글자도 보통 글꼴의 폭으로 배치(원본 PDF: 맑은 고딕 진하게의 영문·숫자 간격이 보통 글꼴 폭과 같고 진한 글꼴 폭과 다름) —
//    진한 글꼴로 그리되 간격은 보통 글꼴 폭 기준
//  · 줄에 글이 넘치면(한글이 이 줄에 담은 글은 한글 폭으로 이 줄에 들어감) 빈칸을 문단의 '최소 공백'(data-cond %)까지 줄이고
//    (줄 앞 빈칸은 제 폭 그대로 — CSS .hw-lead),
//    그래도 넘치면 글자마다 같은 양씩 간격을 줄임(원본 PDF에서 확인한 한글 동작)
//  · 배분 정렬 줄(data-dist)은 남는 폭을 빈칸 포함 글자 사이마다 같은 양씩(마지막 글자 뒤 제외)
// 한 번 잰 폭은 글꼴별로 기억합니다. 편집기는 HTML을 넣은 뒤 부르고, 글꼴을 다 받은 뒤 한 번 더 부릅니다.
// 이 함수는 가져오는 것 없이 혼자 돌아야 합니다(검증 스크립트가 함수 글을 그대로 페이지에 넣어 씀).

export function fitHwpText(root: HTMLElement): number {
  const w = root.ownerDocument.defaultView as (Window & { __hwpFit?: { ctx: CanvasRenderingContext2D; cache: Map<string, number> } }) | null;
  if (!w) return 0;
  if (!w.__hwpFit) {
    const canvas = root.ownerDocument.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    w.__hwpFit = { ctx, cache: new Map() };
  }
  const { ctx, cache } = w.__hwpFit;
  const measure = (font: string, ch: string) => {
    const key = `${font}\u0000${ch}`;
    let v = cache.get(key);
    if (v === undefined) {
      if (ctx.font !== font) ctx.font = font;
      v = ctx.measureText(ch).width;
      cache.set(key, v);
    }
    return v;
  };
  // 한글이 폭을 재는 글꼴: 진하게여도 보통 굵기
  const baseFont = (cs: CSSStyleDeclaration) => `${cs.fontStyle} 400 ${cs.fontSize} ${cs.fontFamily}`;
  let n = 0;
  // 문단 머리(번호 글): 글자는 CSS로 그리므로 첫 글자 간격을 두고, 끝 글자 뒤 간격만큼 본문과의 거리에서 뺌(한글은 머리 끝 글자 뒤 자간 없음)
  root.querySelectorAll<HTMLElement>(".hw-head[data-s],.hw-head[data-r],.hw-head[data-b]").forEach((h) => {
    const text = h.dataset.head ?? "";
    if (!text) return;
    const cs = w.getComputedStyle(h);
    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const k = (Number(h.dataset.r ?? 100) / 100) * (1 + Number(h.dataset.s ?? 0) / 100);
    const c0 = [...text][0];
    const ls = measure(baseFont(cs), c0) * k - measure(font, c0);
    h.style.letterSpacing = `${ls}px`;
    // 글 폭에 맞춘 머리(data-g)만: 끝 글자 뒤 간격을 본문과의 거리에서 뺌. 한 칸 고정 폭 머리는 폭이 그대로라 손대지 않음
    if (h.dataset.g !== undefined) h.style.marginRight = `${Number(h.dataset.g) - ls}px`;
  });
  const spans = root.querySelectorAll<HTMLElement>("span[data-s],span[data-r],span[data-w],span[data-l],span[data-b]");
  spans.forEach((span) => {
    // 이미 맞춘 조각(나눈 조각 포함)은 건너뜀
    if (span.dataset.fit) return;
    // 모양만 보이는 원본 글자(.hw-g)는 글을 data-c에 둠(CSS로 그림)
    const gen = span.dataset.c;
    const text = gen ?? (span.firstChild && span.childNodes.length === 1 && span.firstChild.nodeType === 3 ? (span.firstChild.nodeValue ?? "") : null);
    if (text === null || !text) return;
    const cs = w.getComputedStyle(span);
    const size = parseFloat(cs.fontSize) || 16;
    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const s = Number(span.dataset.s ?? 0) / 100;
    const r = Number(span.dataset.r ?? 100) / 100;
    const k = r * (1 + s);
    const last = span.dataset.l === "1";
    const wkind = span.dataset.w;
    const base = baseFont(cs);
    // 글자마다 간격: 한글 폭(보통 굵기 폭 × 장평 × (1 + 자간)) − 지금 그린 폭
    const spaceAdv = measure(font, " ");
    const spaceTarget = (wkind === "q" ? 0.25 * size : wkind === "f" ? measure(base, " ") : 0.5 * size) * k;
    const chars = [...text];
    const ls = chars.map((ch, i) => {
      if (ch === " " || ch === "\u00a0") return spaceTarget - spaceAdv;
      if (last && i === chars.length - 1) return 0;
      return measure(base, ch) * k - measure(font, ch);
    });
    const round = (v: number) => Math.round(v * 100) / 100;
    const groups: { text: string; ls: number }[] = [];
    chars.forEach((ch, i) => {
      const v = round(ls[i]);
      const g = groups[groups.length - 1];
      if (g && g.ls === v) g.text += ch;
      else groups.push({ text: ch, ls: v });
    });
    span.dataset.fit = "1";
    // 이 조각 빈칸의 제 폭(줄이 넘칠 때 최소 공백 계산용)
    if (chars.some((ch) => ch === " " || ch === "\u00a0")) span.dataset.sw = String(spaceTarget);
    // 단어 간격은 줄(.hw-l)에서 물려받음 — 줄이 넘칠 때 빈칸을 줄이는 값(아래)
    span.style.wordSpacing = "";
    if (groups.length === 1 || gen !== undefined) {
      span.style.letterSpacing = `${groups[0].ls}px`;
      n++;
      return;
    }
    // 폭이 다른 글자가 섞임: 같은 간격끼리 잘게 나눔(글은 그대로)
    const doc = root.ownerDocument;
    span.textContent = "";
    for (const g of groups) {
      const sub = doc.createElement("span");
      sub.dataset.fit = "1";
      sub.style.letterSpacing = `${g.ls}px`;
      sub.textContent = g.text;
      span.appendChild(sub);
    }
    span.style.letterSpacing = "0px";
    n++;
  });
  // 배분 정렬: 남는 폭을 빈칸 포함 글자 사이마다 같은 양씩(마지막 글자 뒤 제외 — 원본 PDF). 마지막 글자가 다른 글자와 한 조각이면 떼어 냄
  const distribute = (body: HTMLElement[], slack: number) => {
    const spans = body.filter((sp) => (sp.textContent ?? "").length);
    const count = spans.reduce((s, sp) => s + [...(sp.textContent ?? "")].length, 0);
    if (count < 2) return;
    const last = spans[spans.length - 1];
    const lc = [...(last.textContent ?? "")];
    if (lc.length > 1) {
      const doc = root.ownerDocument;
      const ls = last.style.letterSpacing;
      last.textContent = "";
      last.style.letterSpacing = "0px";
      const head = doc.createElement("span");
      const tail = doc.createElement("span");
      head.dataset.fit = tail.dataset.fit = "1";
      head.style.letterSpacing = tail.style.letterSpacing = ls;
      head.textContent = lc.slice(0, -1).join("");
      tail.textContent = lc[lc.length - 1];
      last.append(head, tail);
      spans.splice(spans.length - 1, 1, head, tail);
    }
    const d = slack / (count - 1);
    for (const sp of spans.slice(0, -1)) {
      sp.style.letterSpacing = `${parseFloat(sp.style.letterSpacing || "0") + d}px`;
      sp.dataset.dq = String(d);
    }
  };
  // 줄에 글이 넘치면: 빈칸을 최소 공백까지 줄이고, 남는 만큼 글자 간격을 고르게 줄임(배분 정렬 줄은 모자라면 나눔)
  root.querySelectorAll<HTMLElement>(".hw-l").forEach((line) => {
    line.style.wordSpacing = "";
    // 앞서 줄였던 글자 간격은 되돌림(다시 부를 때 겹쳐 줄지 않게)
    // 이 줄의 글자 조각(줄 안 개체 — 표·글상자 — 속 글은 그 줄들이 맡음)
    const own = [...line.querySelectorAll<HTMLElement>("span")].filter((sp) => sp.closest(".hw-l") === line && !sp.children.length);
    for (const sp of own) {
      if (sp.dataset.sq !== undefined) {
        sp.style.letterSpacing = `${parseFloat(sp.style.letterSpacing || "0") + Number(sp.dataset.sq)}px`;
        delete sp.dataset.sq;
      }
      // 배분 정렬로 더했던 간격도
      if (sp.dataset.dq !== undefined) {
        sp.style.letterSpacing = `${parseFloat(sp.style.letterSpacing || "0") - Number(sp.dataset.dq)}px`;
        delete sp.dataset.dq;
      }
    }
    // 흘려 보이는 줄(편집 중인 문단 — 줄 칸이 풀림)은 원본 줄 폭에 맞추지 않음
    if (w.getComputedStyle(line).display !== "inline-block") return;
    // 배분 정렬 줄: 브라우저 맞춤을 끄고 글 폭을 잰 뒤 아래에서 직접 나눔
    const dist = line.dataset.dist === "1";
    if (dist) {
      line.style.textAlign = "left";
      line.style.textAlignLast = "left";
    }
    const pad = parseFloat(w.getComputedStyle(line).paddingLeft) || 0;
    const avail = line.clientWidth - pad;
    const range = root.ownerDocument.createRange();
    range.selectNodeContents(line);
    // 줄 끝 빈칸 음영 상자(.hw-tsh — 배치 폭 없이 글 끝 뒤에 칠함)는 쓴 폭에 넣지 않음
    const skip = [...line.querySelectorAll<HTMLElement>(".hw-tsh")].map((e) => e.getBoundingClientRect());
    const same = (a: DOMRect, b: DOMRect) => Math.abs(a.left - b.left) < 0.01 && Math.abs(a.right - b.right) < 0.01 && Math.abs(a.top - b.top) < 0.01;
    const rects = [...range.getClientRects()].filter((r) => !skip.some((k) => same(r, k)));
    if (!rects.length) return;
    const lr = line.getBoundingClientRect();
    const scale = lr.width / (line.offsetWidth || lr.width || 1);
    const right = Math.max(...rects.map((r) => r.right));
    const used = (right - lr.left) / (scale || 1) - pad;
    let excess = used - avail;
    const body = own.filter((sp) => !sp.closest(".hw-lead") && !sp.closest(".hw-ts"));
    if (dist && excess < -0.5) {
      distribute(body, -excess);
      return;
    }
    if (excess <= 0.5) return;
    // 1) 빈칸(줄 앞·줄 끝 빈칸 제외)을 제 폭의 최소 공백 %까지
    let spaces = 0;
    let room = Infinity;
    for (const sp of body) {
      const k = (sp.textContent ?? "").split(" ").length - 1;
      if (!k) continue;
      spaces += k;
      const sw = Number((sp.dataset.sw ? sp : sp.parentElement?.dataset.sw ? sp.parentElement : sp)?.dataset.sw ?? NaN);
      if (Number.isFinite(sw)) room = Math.min(room, sw);
    }
    const keep = Number(line.dataset.cond ?? 0) / 100;
    if (spaces > 0) {
      const per = Math.min(excess / spaces, Number.isFinite(room) ? room * (1 - keep) : excess / spaces);
      line.style.wordSpacing = `${-per}px`;
      excess -= per * spaces;
    }
    if (excess <= 0.5) return;
    // 2) 남은 만큼 글자마다 같은 양씩(빈칸만 든 조각은 빼고)
    const glyphSpans = body.filter((sp) => /[^\s]/.test(sp.textContent ?? ""));
    const glyphs = glyphSpans.reduce((s, sp) => s + [...(sp.textContent ?? "")].filter((ch) => !/\s/.test(ch)).length, 0);
    if (!glyphs) return;
    const d = excess / glyphs;
    for (const sp of glyphSpans) {
      sp.style.letterSpacing = `${parseFloat(sp.style.letterSpacing || "0") - d}px`;
      sp.dataset.sq = String(d);
    }
  });
  // 줄 끝 빈칸 음영(.hw-tsh)은 줄 오른쪽 끝을 넘지 않음(원본 PDF: 칸 끝에서 멈춤)
  root.querySelectorAll<HTMLElement>(".hw-tsh").forEach((el) => {
    const line = el.closest<HTMLElement>(".hw-l");
    if (!line) return;
    const want = Number(el.dataset.w ?? parseFloat(el.style.width)) || 0;
    el.dataset.w = String(want);
    const lr = line.getBoundingClientRect();
    const scale = lr.width / (line.offsetWidth || lr.width || 1) || 1;
    const room = Math.max(0, (lr.right - el.getBoundingClientRect().left) / scale);
    const width = Math.min(want, room);
    el.style.width = `${width}px`;
    el.style.marginRight = `${-width}px`;
  });
  // 글자 음영(data-sh 색): 한글은 줄의 글자 높이 한 칸만 칠함 — 기준선 위 85%·아래 15%, 높이는 그 줄의 글자 높이(줄에서 가장 큰 글자:
  // 원본 PDF에서 10pt 글 끝에 12pt 빈칸이 있는 줄은 음영이 12pt 높이). CSS 배경색은 글꼴 상자(위아래 여유 포함) 전체를 칠하므로,
  // 조각 안 기준선 자리를 재서 그 칸에만 배경 층을 둠. 기준선은 줄 맨 앞 기준 표지(.hw-bl 아래 끝)와 줄 글자 높이(.hw-l 글자 크기),
  // 흘려 그린 문단은 조각 글자 크기와 글꼴 위 높이(fontBoundingBoxAscent)로
  root.querySelectorAll<HTMLElement>("span[data-sh]").forEach((span) => {
    const color = span.dataset.sh ?? "";
    const r = span.getBoundingClientRect();
    if (!color || !r.height) return;
    const cs = w.getComputedStyle(span);
    let size = parseFloat(cs.fontSize) || 0;
    if (!size) return;
    const line = span.closest<HTMLElement>(".hw-l");
    const bl = line && !line.closest(".hw-edit") ? line.querySelector<HTMLElement>(":scope > .hw-bl") : null;
    let base: number;
    if (bl && bl.getBoundingClientRect().height) {
      base = bl.getBoundingClientRect().bottom - r.top;
      size = parseFloat(w.getComputedStyle(line as HTMLElement).fontSize) || size;
    } else {
      if (ctx.font !== `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`) ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      base = ctx.measureText("가").fontBoundingBoxAscent;
    }
    // 첨자·세로 위치를 옮긴 조각은 그 조각의 기준선이 줄 기준선과 다름 → 글꼴 위 높이로
    if (cs.verticalAlign !== "baseline" && cs.verticalAlign !== "0px") {
      if (ctx.font !== `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`) ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      base = ctx.measureText("가").fontBoundingBoxAscent;
    }
    span.style.background = `linear-gradient(${color},${color}) 0 ${Math.round((base - 0.85 * size) * 100) / 100}px/100% ${Math.round(size * 100) / 100}px no-repeat`;
  });
  return n;
}
