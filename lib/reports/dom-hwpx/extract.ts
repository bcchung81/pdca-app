// 화면 배치 스냅숏 추출기(브라우저 — 시험판 2026-10-28). 본문 틀 요소 하나를 받아 그 아래 요소의 상자 위치·계산된 스타일·::before/::after·
// 글 줄 조각(Range.getClientRects로 글자마다 잰 줄 자리)·대체 대상(SVG·그림 자리)을 LayoutSnapshot(snapshot.ts)으로 적습니다.
//  · DOM API만 씀: getBoundingClientRect·getComputedStyle·Range. 블록 종류·클래스 이름으로 가르지 않음(시작점인 본문 틀은 부르는 쪽이 찾아 넘김)
//  · 헤드리스 Chrome(page.evaluate)과 나중에 앱 미리보기가 같은 함수를 부르도록 바깥 이름·import를 쓰지 않는 한 함수로 둡니다(fit-dom.ts와 같은 방식).
//    import type은 실행 때 지워지므로 됩니다
//  · 길이는 화면 확대·축소를 걷은 mm(틀 offsetWidth와 화면 폭의 비율로 나눔), 글자 크기·자간·줄 높이는 pt
//  · 보이지 않는 요소는 뺌: display:none·visibility:hidden·opacity:0·화면 읽기 전용(clip이 걸린 절대 위치, 1px 이하로 자른 상자)·script·style 등
//  · SVG(글 요소가 없는 것 — 화살표·중괄호 등)는 브라우저가 그린 PNG를 함께 담음: 계산된 SVG 칠·선 스타일을 복제본에 적어 직렬화 → Image(data URL) → canvas.
//    밖의 <defs>를 가리키는 url(#…)·<use>는 그 요소를 복제본 <defs>에 옮겨 담고, 요소 자신의 CSS 변형(뒤집기·회전)은 canvas 변환으로 옮김.
//    그림을 기다려야 해서 함수는 Promise를 돌려줌. SVG 안 글은 글로 옮기려고 그리지 않음(그림 안 글은 웹 글꼴을 못 씀)
//  · <img>는 그림 주소(currentSrc)와 조상의 넘침 자르기(overflow가 visible이 아닌 조상의 안쪽 상자)로 보이는 부분만 담음 — 바이트는 싣지 않음
//    (서버가 허용한 주소만 저장소에서 받음 — pictures.ts). 배경 그림 주소는 계산된 background-image 값(url(…))에 그대로 있음

import type { LayoutSnapshot, Rect, SnapBox, SnapFrag, SnapImage, SnapNode, SnapPseudo, SnapReplaced, SnapSource, SnapStyle, SnapText } from "./snapshot.ts";

export async function extractLayout(frame: Element): Promise<LayoutSnapshot> {
  const MM = 25.4 / 96;
  const doc = frame.ownerDocument;
  const win = doc.defaultView as Window;
  const fr = frame.getBoundingClientRect();
  // 확대 비율: 화면 폭 ÷ CSS 폭(offsetWidth는 정수로 반올림돼 쓰지 않음)
  const cssW = parseFloat(win.getComputedStyle(frame).width);
  const scale = cssW > 0 && fr.width > 0 ? fr.width / cssW : 1;
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  /** 화면 px → mm(확대 걷음) */
  const mmOf = (px: number) => r3((px / scale) * MM);
  /** 계산값 CSS px 문자열 → mm */
  const cssMm = (v: string) => r3((parseFloat(v) || 0) * MM);
  /** 계산값 CSS px 문자열 → pt */
  const cssPt = (v: string) => r3((parseFloat(v) || 0) * 0.75);
  const rectOf = (r: { left: number; top: number; width: number; height: number }): Rect => ({ x: mmOf(r.left - fr.left), y: mmOf(r.top - fr.top), w: mmOf(r.width), h: mmOf(r.height) });

  const SKIP = new Set(["script", "style", "template", "noscript", "head", "title", "meta", "link"]);
  const REPLACED = new Set(["svg", "img", "canvas", "video", "iframe", "object", "embed", "input", "textarea", "select", "math"]);

  const styleOf = (cs: CSSStyleDeclaration): SnapStyle => {
    const side = (s: string) => ({ w: cssMm(cs.getPropertyValue(`border-${s}-width`)), style: cs.getPropertyValue(`border-${s}-style`), color: cs.getPropertyValue(`border-${s}-color`) });
    const lh = cs.lineHeight;
    return {
      display: cs.display,
      position: cs.position,
      bg: cs.backgroundColor,
      bgImage: cs.backgroundImage,
      bgSize: cs.backgroundSize,
      bgPosition: cs.backgroundPosition,
      bgRepeat: cs.backgroundRepeat,
      border: [side("top"), side("right"), side("bottom"), side("left")],
      pad: [cssMm(cs.paddingTop), cssMm(cs.paddingRight), cssMm(cs.paddingBottom), cssMm(cs.paddingLeft)],
      radius: cs.borderRadius,
      shadow: cs.boxShadow,
      clipPath: cs.clipPath,
      opacity: Number(cs.opacity),
      fontFamily: cs.fontFamily,
      fontSize: cssPt(cs.fontSize),
      fontWeight: Number(cs.fontWeight) || 400,
      fontStyle: cs.fontStyle,
      color: cs.color,
      lineHeight: lh === "normal" ? null : cssPt(lh),
      textAlign: cs.textAlign,
      textAlignLast: cs.textAlignLast,
      textJustify: cs.getPropertyValue("text-justify"),
      letterSpacing: cs.letterSpacing === "normal" ? 0 : cssPt(cs.letterSpacing),
      wordSpacing: cs.wordSpacing === "normal" ? 0 : cssPt(cs.wordSpacing),
      verticalAlign: cs.verticalAlign,
      textIndent: cssMm(cs.textIndent),
      textDecoration: cs.textDecorationLine,
      whiteSpace: cs.whiteSpace,
      wordBreak: cs.wordBreak,
    };
  };

  const hidden = (el: Element, cs: CSSStyleDeclaration): boolean => {
    if (SKIP.has(el.tagName.toLowerCase())) return true;
    if (cs.display === "none" || cs.display === "table-column" || cs.display === "table-column-group") return true;
    if (cs.visibility === "hidden" || cs.visibility === "collapse" || Number(cs.opacity) === 0) return true;
    const abs = cs.position === "absolute" || cs.position === "fixed";
    if (abs && cs.clip && cs.clip !== "auto") return true;
    if (cs.display !== "contents") {
      const r = el.getBoundingClientRect();
      if (r.width <= 1.5 * scale && r.height <= 1.5 * scale && cs.overflow !== "visible") return true;
    }
    return false;
  };

  /** content 계산값의 따옴표 글만 이어 붙임(counter·attr·url은 뺌) */
  const contentText = (c: string): string | null => {
    if (!c || c === "none" || c === "normal") return null;
    let out = "";
    for (const m of c.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)) {
      const s = m[1] ?? m[2] ?? "";
      out += s.replace(/\\([0-9a-fA-F]{1,6})\s?|\\(.)/g, (_x, hex: string | undefined, ch: string | undefined) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : (ch ?? "")));
    }
    return out;
  };

  const pseudo = (el: Element, which: "::before" | "::after"): SnapPseudo | undefined => {
    const cs = win.getComputedStyle(el, which);
    const text = contentText(cs.content);
    if (text === null || cs.display === "none") return undefined;
    let rect: Rect | null = null;
    if (cs.position === "absolute" || cs.position === "fixed") {
      // 담는 상자: 위치를 가진 요소면 그 요소의 안쪽 테두리(padding box) — 아니면 모름(null)
      const ocs = win.getComputedStyle(el);
      if (ocs.position !== "static") {
        const b = el.getBoundingClientRect();
        const bl = parseFloat(ocs.borderLeftWidth) || 0;
        const bt = parseFloat(ocs.borderTopWidth) || 0;
        const br = parseFloat(ocs.borderRightWidth) || 0;
        const bb = parseFloat(ocs.borderBottomWidth) || 0;
        const w = parseFloat(cs.width) || 0;
        const h = parseFloat(cs.height) || 0;
        const left = cs.left !== "auto" ? b.left + (bl + parseFloat(cs.left)) * scale : cs.right !== "auto" ? b.right - (br + parseFloat(cs.right) + w) * scale : b.left + bl * scale;
        const top = cs.top !== "auto" ? b.top + (bt + parseFloat(cs.top)) * scale : cs.bottom !== "auto" ? b.bottom - (bb + parseFloat(cs.bottom) + h) * scale : b.top + bt * scale;
        rect = rectOf({ left, top, width: w * scale, height: h * scale });
      }
    }
    return { text, style: styleOf(cs), rect };
  };

  // ── SVG → PNG
  const SVG_NS = "http://www.w3.org/2000/svg";
  /** 복제본에 적을 SVG 칠·선 계산값(스타일시트·currentColor는 그림으로 옮기면 사라짐) */
  const SVG_PROPS = ["fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "opacity", "color", "visibility", "display", "marker-start", "marker-mid", "marker-end", "stop-color", "stop-opacity", "clip-path", "mask", "shape-rendering", "vector-effect", "paint-order"];
  /** 그림 배율: 화면 CSS px 하나당 그림 픽셀(4 → 384dpi) */
  const PNG_SCALE = 4;
  const inlineSvgStyle = (src: Element, dst: Element) => {
    const s = [src, ...Array.from(src.querySelectorAll("*"))];
    const d = [dst, ...Array.from(dst.querySelectorAll("*"))];
    s.forEach((e, i) => {
      const c = win.getComputedStyle(e);
      d[i].setAttribute("style", SVG_PROPS.map((p) => `${p}:${c.getPropertyValue(p)}`).join(";"));
    });
  };
  /** 복제본 밖을 가리키는 url(#id)·<use href="#id"> → 문서에서 그 요소를 복제해 <defs>에 담음(담은 요소가 다시 가리키는 것까지) */
  const pullRefs = (clone: Element) => {
    const ids = (el: Element): string[] => {
      const out: string[] = [];
      for (const e of [el, ...Array.from(el.querySelectorAll("*"))]) {
        for (const m of (e.getAttribute("style") ?? "").matchAll(/url\(\s*["']?#([^"')\s]+)/g)) out.push(m[1]);
        const href = e.getAttribute("href") ?? e.getAttribute("xlink:href");
        if (href?.startsWith("#")) out.push(href.slice(1));
      }
      return out;
    };
    const has = (id: string) => Array.from(clone.querySelectorAll("*")).some((e) => e.id === id);
    let defs: Element | null = null;
    const todo = ids(clone);
    const seen = new Set<string>();
    while (todo.length) {
      const id = todo.shift() as string;
      if (seen.has(id) || has(id)) continue;
      seen.add(id);
      const src = doc.getElementById(id);
      if (!src || src.namespaceURI !== SVG_NS) continue;
      const c = src.cloneNode(true) as Element;
      inlineSvgStyle(src, c);
      if (!defs) {
        defs = doc.createElementNS(SVG_NS, "defs");
        clone.insertBefore(defs, clone.firstChild);
      }
      defs.appendChild(c);
      todo.push(...ids(c));
    }
  };
  /** SVG 요소 → PNG(화면에 그려진 상자 크기 그대로). 못 그리면 null */
  const rasterSvg = async (svg: Element): Promise<SnapImage | null> => {
    const b = svg.getBoundingClientRect();
    const bw = b.width / scale;
    const bh = b.height / scale;
    if (bw < 0.5 || bh < 0.5) return null;
    const cs = win.getComputedStyle(svg);
    // 변형 전 CSS 크기(변형이 없으면 상자 크기와 같음)
    const cw = parseFloat(cs.width) || bw;
    const ch = parseFloat(cs.height) || bh;
    const clone = svg.cloneNode(true) as Element;
    inlineSvgStyle(svg, clone);
    pullRefs(clone);
    clone.setAttribute("width", String(cw));
    clone.setAttribute("height", String(ch));
    const xml = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    const ok = await new Promise<boolean>((res) => {
      img.onload = () => res(true);
      img.onerror = () => res(false);
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    });
    if (!ok) return null;
    const canvas = doc.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bw * PNG_SCALE));
    canvas.height = Math.max(1, Math.round(bh * PNG_SCALE));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // 상자 가운데에 놓고 요소 자신의 2차원 변형(뒤집기·회전·기울임)만 걸음 — 변형된 사각형의 둘레 상자는 변형된 가운데를 중심으로 함
    ctx.setTransform(PNG_SCALE, 0, 0, PNG_SCALE, 0, 0);
    ctx.translate(bw / 2, bh / 2);
    const m = /^matrix\(([^)]*)\)$/.exec(cs.transform);
    if (m) {
      const [a, bb, c, d] = m[1].split(",").map(Number);
      ctx.transform(a, bb, c, d, 0, 0);
    }
    ctx.drawImage(img, -cw / 2, -ch / 2, cw, ch);
    try {
      const url = canvas.toDataURL("image/png");
      return { png: url.slice(url.indexOf(",") + 1), w: canvas.width, h: canvas.height };
    } catch {
      return null;
    }
  };
  const rasterJobs: { el: Element; out: SnapBox }[] = [];

  /** 그림 주소 길이 상한(pictures.ts PICTURE_URL_MAX와 같은 값 — 이 함수는 바깥 이름을 못 씀) */
  const URL_MAX = 4096;
  /** <img> → 그림 주소와 보이는 부분: 틀까지 조상 중 넘침을 자르는 것(overflow ≠ visible, 인라인 아님)의 안쪽 상자와 겹친 자리 */
  const sourceOf = (el: Element): SnapSource | null => {
    const url = (el as HTMLImageElement).currentSrc || el.getAttribute("src") || "";
    if (!url || url.length > URL_MAX) return null;
    const b = el.getBoundingClientRect();
    let l = b.left;
    let t = b.top;
    let r = b.right;
    let btm = b.bottom;
    for (let a = el.parentElement; a; a = a.parentElement) {
      const cs = win.getComputedStyle(a);
      if (cs.display !== "inline" && cs.display !== "contents" && (cs.overflowX !== "visible" || cs.overflowY !== "visible")) {
        const ab = a.getBoundingClientRect();
        const pl = ab.left + a.clientLeft * scale;
        const pt = ab.top + a.clientTop * scale;
        if (cs.overflowX !== "visible") {
          l = Math.max(l, pl);
          r = Math.min(r, pl + a.clientWidth * scale);
        }
        if (cs.overflowY !== "visible") {
          t = Math.max(t, pt);
          btm = Math.min(btm, pt + a.clientHeight * scale);
        }
      }
      if (a === frame) break;
    }
    const out: SnapSource = { url };
    const cut = l - b.left > 0.05 * scale || t - b.top > 0.05 * scale || b.right - r > 0.05 * scale || b.bottom - btm > 0.05 * scale;
    if (cut) out.clip = rectOf({ left: l, top: t, width: Math.max(0, r - l), height: Math.max(0, btm - t) });
    return out;
  };

  const range = doc.createRange();
  /** 글 마디: 공백을 화면처럼 접고(white-space에 따라), 글자마다 상자를 재어 줄 부분으로 나눔. 상자가 없는 글자(접혀 사라진 공백)·크기 0으로 그린 빈칸 아닌 글자는 뺌 */
  const textNode = (t: Text, ws: string): SnapText | null => {
    const raw = t.data;
    const keepSpace = ws === "pre" || ws === "pre-wrap" || ws === "break-spaces";
    const keepNl = keepSpace || ws === "pre-line";
    // 글자 단위(서로게이트 짝은 한 글자) → [시작, 끝) DOM 위치
    const units: { ch: string; s: number; e: number }[] = [];
    let i = 0;
    while (i < raw.length) {
      const cp = raw.codePointAt(i) as number;
      const len = cp > 0xffff ? 2 : 1;
      const ch = raw.slice(i, i + len);
      if (!keepSpace && /[ \t\n\r\f]/.test(ch)) {
        let j = i;
        let nl = false;
        while (j < raw.length && /[ \t\n\r\f]/.test(raw[j])) {
          if (raw[j] === "\n") nl = true;
          j++;
        }
        units.push({ ch: keepNl && nl ? "\n" : " ", s: i, e: j });
        i = j;
      } else {
        units.push({ ch, s: i, e: i + len });
        i += len;
      }
    }
    let text = "";
    const frags: SnapFrag[] = [];
    let cur: { at: number; l: number; t: number; r: number; b: number } | null = null;
    let prev: DOMRect | null = null;
    const close = () => {
      if (cur) frags.push({ at: cur.at, ...rectOf({ left: cur.l, top: cur.t, width: cur.r - cur.l, height: cur.b - cur.t }) });
      cur = null;
    };
    for (const u of units) {
      range.setStart(t, u.s);
      range.setEnd(t, u.e);
      const rs = Array.from(range.getClientRects());
      const q = rs.find((x) => x.width > 0 || x.height > 0) ?? null;
      if (!q) {
        // 폭 없이 그린 빈칸(글자 크기 0 — 원본 배치 카드의 줄 끝 빈칸 등): 자리는 없지만 낱말 경계라 글에 남김. 상자가 아예 없는 글자(접혀 사라진 공백)는 뺌
        if (u.ch === " " && rs.length) text += u.ch;
        continue;
      }
      const space = u.ch === " " || u.ch === "\n";
      // 새 줄: 공백이 아닌 글자가 앞 글자보다 왼쪽·아래로 감(왼쪽→오른쪽 글에서 줄 안 글자는 늘 오른쪽으로 감)
      if (!space && prev && q.left < prev.left - 0.5 * scale && q.top > prev.top + 0.5 * scale) close();
      if (!cur) cur = { at: text.length, l: q.left, t: q.top, r: q.right, b: q.bottom };
      else {
        cur.l = Math.min(cur.l, q.left);
        cur.t = Math.min(cur.t, q.top);
        cur.r = Math.max(cur.r, q.right);
        cur.b = Math.max(cur.b, q.bottom);
      }
      if (!space) prev = q;
      text += u.ch;
    }
    close();
    return text ? { kind: "text", text, frags } : null;
  };

  const box = (el: Element): SnapBox | null => {
    const cs = win.getComputedStyle(el);
    if (hidden(el, cs)) return null;
    const tag = el.tagName.toLowerCase();
    const out: SnapBox = { kind: "box", tag, rect: cs.display === "contents" ? { x: 0, y: 0, w: 0, h: 0 } : rectOf(el.getBoundingClientRect()), style: styleOf(cs), children: [] };
    if (REPLACED.has(tag)) {
      out.replaced = tag as SnapReplaced;
      // SVG 안 글 요소(<text>)는 자리와 글을 남김
      if (tag === "svg")
        for (const te of Array.from(el.querySelectorAll("text"))) {
          const s = (te.textContent ?? "").replace(/\s+/g, " ").trim();
          if (!s) continue;
          const rr = rectOf(te.getBoundingClientRect());
          out.children.push({ kind: "box", tag: "text", rect: rr, style: styleOf(win.getComputedStyle(te)), children: [{ kind: "text", text: s, frags: [{ at: 0, ...rr }] }] });
        }
      if (tag === "svg" && !out.children.length) rasterJobs.push({ el, out });
      if (tag === "img") {
        const src = sourceOf(el);
        if (src) out.src = src;
      }
      return out;
    }
    const before = pseudo(el, "::before");
    const after = pseudo(el, "::after");
    if (before) out.before = before;
    if (after) out.after = after;
    out.children = kids(el, cs.whiteSpace);
    return out;
  };

  const kids = (el: Element, ws: string): SnapNode[] => {
    const out: SnapNode[] = [];
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === 3) {
        const t = textNode(n as Text, ws);
        if (t) out.push(t);
      } else if (n.nodeType === 1) {
        const e = n as Element;
        if (e.tagName.toLowerCase() === "br") {
          out.push({ kind: "br" });
          continue;
        }
        const b = box(e);
        if (b) out.push(b);
      }
    }
    return out;
  };

  const root = box(frame) as SnapBox;
  await Promise.all(
    rasterJobs.map(async (j) => {
      const im = await rasterSvg(j.el);
      if (im) j.out.image = im;
    }),
  );
  return { version: 1, frame: { w: mmOf(fr.width), h: mmOf(fr.height) }, root };
}
