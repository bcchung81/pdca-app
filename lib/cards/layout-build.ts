// 한글 파일(HWP) → 카드마다 원본 배치(cards.layout) 만들기. 적재 스크립트(pnpm db:layout)와 현행화가 함께 씁니다.
//  · 카드 표(과제명으로 시작) + 뒤 붙임 표를 떼고(lib/hwp/layout.ts), 과제번호로 카드 JSON과 짝지어, 그 JSON으로 잇기 표시를 적음
//  · 배치 속 그림은 웹 형식(BMP → PNG·JPEG, image.ts)으로 바꾸고 내용 해시로 저장 이름을 정함(card-originals/{uid}/hwp-….ext)
// 입출력은 부르는 쪽이 합니다(바이트 → 결과). 판단이 끼면 안 되는 일이라 AI를 쓰지 않습니다.

import { createHash } from "node:crypto";
import { groupTitleNo } from "../hwp/group-mark.ts";
import { type CardLayout, extractCardLayouts } from "../hwp/layout.ts";
import type { HwpDoc, Para } from "../hwp/model.ts";
import { jpegOnWhite, toWebImage } from "./hwp/image.ts";
import { type AnchorStats, anchorLayout, paraText } from "./layout-bind.ts";
import type { LooseJson } from "../loose-json.ts";

export interface BuiltLayout {
  /** 짝지은 카드 JSON의 차례(cards 배열 안) */
  index: number;
  layout: CardLayout;
  stats: AnchorStats;
  /** 올릴 그림: 저장 이름(카드 폴더 안) · 바이트 · 형식 */
  images: { key: string; data: Uint8Array; mime: string }[];
}

/** 배치의 과제번호(카드 표 첫 칸들의 「과제번호 : 1-가」) */
export function layoutTaskNo(l: CardLayout): string | null {
  const first = l.blocks.find((b) => b.kind === "table");
  if (!first || first.kind !== "table") return null;
  const text = first.table.cells
    .slice(0, 8)
    .flatMap((c) => c.paras.map((p: Para) => paraText(p)))
    .join(" ");
  // 주요사업 「과제번호 : 1-가」, 경영관리 「과제번호 : 전략기획 1-1」(지표명 뒤의 N-M)
  const m = /과제\s*번호\s*[:：][^)）]*?(\d+-[^\s)）]+)/.exec(text);
  return m ? m[1].trim() : null;
}

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, "");

/** 배치의 묶음(맨 위 묶음 제목 표 「(주요사업N) …」 — layout.lead), 없으면 null */
function layoutGroup(l: CardLayout): string | null {
  if (l.lead?.kind !== "table") return null;
  const first = l.lead.table.cells.find((c) => c.row === 0 && c.col === 0) ?? l.lead.table.cells[0];
  const n = first ? groupTitleNo(first.paras.map(paraText).join("")) : null;
  return n ? `주요사업${n}` : null;
}

/**
 * 문서 하나의 카드 배치들을 카드 JSON들과 짝지음(과제번호 — 묶음 여럿을 합친 파일은 같은 묶음 안에서, 없으면 같은 차례). 잇기 적중률이 낮은 배치는 빼고 알림(stats)
 */
export function buildLayouts(doc: HwpDoc, cards: LooseJson[]): { built: BuiltLayout[]; skipped: string[] } {
  const layouts = extractCardLayouts(doc);
  const built: BuiltLayout[] = [];
  const skipped: string[] = [];
  const used = new Set<number>();
  layouts.forEach((l, li) => {
    const no = layoutTaskNo(l);
    const group = layoutGroup(l);
    const sameGroup = (c: LooseJson) => !group || !/^주요사업\d+$/.test(String(c.group ?? "")) || c.group === group;
    let idx = no ? cards.findIndex((c, k) => !used.has(k) && norm(c.taskNo) === norm(no) && sameGroup(c)) : -1;
    if (idx < 0 && layouts.length === cards.length && !used.has(li)) idx = li;
    if (idx < 0) {
      skipped.push(`${no ?? `${li + 1}번째 카드`}: 카드 JSON에서 같은 과제를 찾지 못함`);
      return;
    }
    used.add(idx);
    const { layout, stats } = anchorLayout(l, cards[idx]);
    // 맞춘 칸이 너무 적으면(양식이 크게 다름) 원본 배치를 쓰지 않음
    if (stats.targets && stats.bound / stats.targets < 0.9) {
      skipped.push(`${cards[idx].taskNo}: 원본 배치와 카드 글이 맞지 않음(${stats.bound}/${stats.targets})`);
      return;
    }
    const images: BuiltLayout["images"] = [];
    for (const b of layout.bins) {
      const src = doc.bins.get(b.src);
      if (!src?.data) continue;
      const web = toWebImage(src.data, `bin${b.src}.${src.ext}`);
      const key = imageKey(web.data, web.name.split(".").pop() ?? src.ext);
      b.key = key;
      if (!images.some((x) => x.key === key)) images.push({ key, data: web.data, mime: web.mime });
    }
    built.push({ index: idx, layout, stats, images });
  });
  return { built, skipped };
}


/** 배치 그림 저장 이름: 웹 그림 내용 해시 + 확장자 */
const imageKey = (data: Uint8Array, ext: string) => `hwp-${createHash("sha256").update(data).digest("hex").slice(0, 16)}.${ext}`;

/** 저장소 card-originals의 파일 한도(supabase/migrations/20260925090700_card_originals.sql)와, 넘는 그림을 바꿀 때 맞출 크기(여유를 둠) */
export const CARD_ORIGINALS_MAX = 10 * 1024 * 1024;
export const CARD_ORIGINALS_FIT = 9 * 1024 * 1024;

export interface FittedImage {
  from: string;
  /** 바꾼 저장 이름 — 바꾸지 못하면 null(그림은 그대로 두고 부르는 쪽이 멈춤) */
  to: string | null;
  before: number;
  after: number | null;
  quality: number | null;
}

/**
 * 적재 스크립트용: 저장소 한도를 넘는 배치 그림만 흰 바탕 JPEG(jpegOnWhite — 픽셀 크기 그대로)로 바꾸고, 저장 이름(내용 해시·.jpg)과
 * 배치가 가리키는 이름(bins[].key)을 함께 바꿈. 바꾼(또는 못 바꾼) 그림 목록을 돌려줌
 */
export function fitLayoutImages(b: BuiltLayout, max = CARD_ORIGINALS_MAX, fit = CARD_ORIGINALS_FIT): FittedImage[] {
  const out: FittedImage[] = [];
  b.images = b.images.map((im) => {
    if (im.data.byteLength <= max) return im;
    const j = jpegOnWhite(im.data, im.key, fit);
    if (!j) {
      out.push({ from: im.key, to: null, before: im.data.byteLength, after: null, quality: null });
      return im;
    }
    const key = imageKey(j.data, "jpg");
    for (const bin of b.layout.bins) if (bin.key === im.key) bin.key = key;
    out.push({ from: im.key, to: key, before: im.data.byteLength, after: j.data.byteLength, quality: j.quality });
    return { key, data: j.data, mime: j.mime };
  });
  return out;
}
