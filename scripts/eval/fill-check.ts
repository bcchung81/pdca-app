// 시험판 점검 도우미(2026-10-28): 「어두운 채움」 점검 — 변환기가 칠한 칸·글자 배경(fills — 본문 틀 기준 mm)마다 화면 스크린숏의 같은 자리에서
// 가장 흔한 색(색을 16단계로 묶어 가장 많은 묶음의 평균 — 작은 칩의 흰 글처럼 글 픽셀이 많아도 바탕이 잡힘)을 재어 채움색과 밝기 차이가 FILL_DIFF_MAX를 넘는 것을 냄.
//  · 자리 = 채움 자리를 가장자리 FILL_INSET_MM만큼 들인 것에서, 그 안에 든 더 작은 채움 자리(안쪽 표 칸·글자 음영 — 위에 칠해짐)를 같은 만큼 넓혀 뺀 나머지
//    (보이는 부분만). 남는 픽셀이 FILL_MIN_PX보다 적으면 재지 않음(위에 칠한 것이 다 덮음)
//  · 글자 배경(칩·음영)은 가장 흔한 색 대신 글자색(ink)에서 가장 먼 픽셀 1/10의 평균(바탕) — 좁은 칩·한두 글자 음영은 획·번진 픽셀이 바탕보다 많음(카드 노란 음영).
//    채움이 틀려(어두운 채움) 화면 바탕이 밝으면 먼 픽셀이 그 밝은 바탕이라 잡힘
//  · 스크린숏은 본문 틀을 감싸는 정수 픽셀 자리로 찍히고, mm → px는 틀의 실제 CSS 폭(소수)·왼쪽 위 소수 자리로 셈 — 스크린숏 폭(정수로 올림)으로 나누면
//    긴 문서 아래쪽으로 갈수록 자리가 밀림(2026-10-28 경영관리 표본 mg1 아래쪽 막대·Q 표지가 이것으로 어긋남으로 잡혔음)
import type { Page } from "playwright-core";
import type { FillProbe } from "../../lib/reports/dom-hwpx/convert.ts";

/** 채움색과 화면 픽셀의 밝기(0~255) 차이 상한 — 넘으면 「채움 어긋남」 */
export const FILL_DIFF_MAX = 40;
/** 표본을 잴 때 자리 가장자리에서 들이는 거리(mm — 테두리 선·경계 번짐을 피함) */
export const FILL_INSET_MM = 0.5;
/** 잴 만한 최소 픽셀 수 */
export const FILL_MIN_PX = 6;

export interface FillBad {
  kind: string;
  at: string;
  fill: string;
  screen: string;
  diff: number;
}

/** 밝기(Rec.601, 0~255) */
const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
const lumaHex = (hex: string) => luma(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));

type Px = [number, number, number, number];
/** 브라우저에서: PNG(base64)를 그려 자리(px)마다 덮개 자리를 뺀 픽셀의 바탕색(가장 흔한 색 — 글자색이 있으면 글자색에서 가장 먼 1/10의 평균) — 남는 픽셀이 min보다 적으면 null */
function dominants(arg: { png: string; areas: { rect: Px; covers: Px[]; ink: [number, number, number] | null }[]; min: number }): Promise<([number, number, number] | null)[]> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d") as CanvasRenderingContext2D;
      ctx.drawImage(img, 0, 0);
      res(
        arg.areas.map(({ rect: [x, y, w, h], covers, ink }) => {
          const x0 = Math.max(0, Math.round(x));
          const y0 = Math.max(0, Math.round(y));
          const x1 = Math.min(img.width, Math.round(x + w));
          const y1 = Math.min(img.height, Math.round(y + h));
          // 2픽셀보다 좁은 자리는 번진 픽셀뿐이라 재지 않음(한 글자 음영을 들인 자리 등)
          if (x1 - x0 < 2 || y1 - y0 < 2) return null;
          const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
          const bins = new Map<number, [number, number, number, number]>();
          const far: [number, number, number, number][] = [];
          let n = 0;
          for (let py = y0; py < y1; py++)
            for (let px = x0; px < x1; px++) {
              const cx = px + 0.5;
              const cy = py + 0.5;
              if (covers.some(([a, b, cw, ch]) => cx >= a && cx < a + cw && cy >= b && cy < b + ch)) continue;
              const i = ((py - y0) * (x1 - x0) + (px - x0)) * 4;
              if (ink) far.push([Math.abs(d[i] - ink[0]) + Math.abs(d[i + 1] - ink[1]) + Math.abs(d[i + 2] - ink[2]), d[i], d[i + 1], d[i + 2]]);
              const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
              const bin = bins.get(key) ?? [0, 0, 0, 0];
              bin[0] += d[i];
              bin[1] += d[i + 1];
              bin[2] += d[i + 2];
              bin[3] += 1;
              bins.set(key, bin);
              n++;
            }
          if (n < arg.min) return null;
          if (ink) {
            const q = far.sort((a, b) => b[0] - a[0]).slice(0, Math.max(arg.min, Math.ceil(far.length / 10)));
            return [1, 2, 3].map((k) => Math.round(q.reduce((acc, p) => acc + p[k], 0) / q.length)) as [number, number, number];
          }
          const top = [...bins.values()].reduce((a, b) => (b[3] > a[3] ? b : a));
          return [0, 1, 2].map((k) => Math.round(top[k] / top[3])) as [number, number, number];
        }),
      );
    };
    img.src = `data:image/png;base64,${arg.png}`;
  });
}

/** 본문 틀(frameSelector)의 화면과 채움 자리 대조. frameWmm = 스냅숏 본문 틀 폭(mm) */
export async function checkFills(page: Page, frameSelector: string, frameWmm: number, fills: FillProbe[]): Promise<{ checked: number; bad: FillBad[] }> {
  const fr = (await page.evaluate((sel: string) => {
    const r = (document.querySelector(sel) as Element).getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height };
  }, frameSelector)) as { x: number; y: number; w: number; h: number };
  // 요소 스크린숏은 요소를 감싸는 정수 픽셀 자리(왼쪽 위 = 내림)로 찍힘. 전체 쪽 스크린숏(fullPage)은 창 크기를 바꿔 다시 배치할 수 있어 쓰지 않음
  const shot = await page.locator(frameSelector).first().screenshot();
  const k = fr.w / frameWmm;
  const ox = fr.x - Math.floor(fr.x);
  const oy = fr.y - Math.floor(fr.y);
  const px = (x: number, y: number, w: number, h: number): Px => [ox + x * k, oy + y * k, w * k, h * k];
  const I = FILL_INSET_MM;
  const inside = (a: FillProbe["rect"], b: FillProbe["rect"]) => a.x >= b.x - 0.05 && a.y >= b.y - 0.05 && a.x + a.w <= b.x + b.w + 0.05 && a.y + a.h <= b.y + b.h + 0.05 && a.w * a.h < b.w * b.h - 0.01;
  const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  const areas = fills.map((f) => ({
    rect: px(f.rect.x + I, f.rect.y + I, f.rect.w - 2 * I, f.rect.h - 2 * I),
    ink: f.ink ? rgb(f.ink) : null,
    covers: fills.filter((g) => g !== f && inside(g.rect, f.rect)).map((g) => px(g.rect.x - I, g.rect.y - I, g.rect.w + 2 * I, g.rect.h + 2 * I)),
  }));
  const med = (await page.evaluate(dominants, { png: shot.toString("base64"), areas, min: FILL_MIN_PX })) as ([number, number, number] | null)[];
  const bad = fills
    .map((f, i) => ({ f, m: med[i] }))
    .filter((x): x is { f: FillProbe; m: [number, number, number] } => !!x.m)
    .map(({ f, m }) => ({ kind: f.kind, at: `${f.rect.x.toFixed(1)},${f.rect.y.toFixed(1)} ${f.rect.w.toFixed(1)}×${f.rect.h.toFixed(1)}mm`, fill: f.color, screen: `rgb(${m.join(",")})`, diff: Math.round(Math.abs(lumaHex(f.color) - luma(...m))) }))
    .filter((x) => x.diff > FILL_DIFF_MAX);
  return { checked: med.filter(Boolean).length, bad };
}
