// 과제관리카드 → 한글(HWPX), 원본 배치(cards.layout)로. 지금 카드 JSON을 원본 배치에 얹어(화면과 같은 맞춤 — layout-render.ts)
// 한글 원본의 표·칸 크기·테두리/배경·글자/문단 모양·그림·도형을 그대로 다시 씁니다(lib/hwp/hwpx-write.ts). 입출력 없는 순수 함수.
//  · 글이 원본과 같은 문단은 원본 줄 배치까지 그대로, 고친 문단은 같은 모양으로 한글이 다시 조판
//  · 목록 줄·월별 실적 상자·계량지표 행·경영관리 짝 칸 표(지적·환류) 행이 늘면 화면과 같이 앞 줄·행을 본뜸(줄면 뺌). 새 AX 붙임은 앞 붙임 표를 본떠 이어 씀(그림은 뺌)

import { type HwpxImage, hwpxFiles } from "../hwp/hwpx-write.ts";
import { type CardLayout, type LayoutBlock, layoutDoc } from "../hwp/layout.ts";
import type { PageDef, Para } from "../hwp/model.ts";
import { applyCardToLayout } from "./layout-render.ts";
import type { LooseJson } from "../loose-json.ts";

/** 배치의 쪽 정의. 쪽 정보가 없는 옛 배치: A4 세로, 본문 폭이 가운데 오게(위·아래 여백은 한글 기본값) */
export function pageOf(l: CardLayout): PageDef {
  if (l.page) return l.page;
  const width = 59528;
  const side = Math.max(0, Math.round((width - l.textWidth) / 2));
  return { width, height: 84186, left: side, right: side, top: 5668, bottom: 4252, header: 4252, footer: 4252, gutter: 0, landscape: false };
}

/** 덩이 → 문단(표 덩이는 그 표를 품은 문단으로) */
function blockPara(b: LayoutBlock): Para {
  if (b.kind === "para") return b.para;
  return {
    paraPr: b.host?.paraPr ?? 0,
    style: 0,
    items: [{ kind: "obj", pos: 0, charPr: b.host?.charPr ?? 0, obj: b.table }],
    lines: b.host?.lines ?? [],
    length: 9,
    pageBreak: Boolean(b.host?.pageBreak),
    ...(b.host?.endCharPr !== undefined ? { endCharPr: b.host.endCharPr } : {}),
  };
}

/**
 * 카드 JSON + 원본 배치 → HWPX 파일 묶음(경로 → 바이트). images는 배치 그림의 저장 이름(bins[].key) → 바이트.
 * 맨 위에 원본 문서의 묶음 제목 표(「(주요사업N) …」)를 두어, 내려받은 파일을 다시 올리면 같은 묶음의 카드로 읽힘.
 * 배치에 잇기 표시가 없으면 null(부르는 쪽이 원본 양식 변환으로)
 */
export function layoutHwpxFiles(card: LooseJson, layout: CardLayout, images: Map<string, HwpxImage>): Map<string, Uint8Array> | null {
  const applied = applyCardToLayout(card, layout, { cloneNewAx: true });
  if (!applied) return null;
  const L = applied.layout;
  // 띄운 표와 같은 문단의 글자처럼 놓은 표(join)는 원본처럼 한 문단에(개체 한 개 = 8글자 자리) — 따로 쓰면 한글이 딱지를 띄운 표 뒤로 밀어 냄
  const paras: Para[] = [];
  for (const b of [...(L.lead ? [L.lead] : []), ...L.blocks]) {
    const prev = paras[paras.length - 1];
    if (b.kind === "table" && b.host?.join && prev && prev.items.length && prev.items.every((it) => it.kind === "obj" && it.obj.kind === "table" && !it.obj.pos.treatAsChar)) {
      const item = blockPara(b).items[0];
      paras[paras.length - 1] = { ...prev, items: [...prev.items, { ...item, pos: prev.items.length * 8 }], lines: b.host.lines ?? [], length: (prev.items.length + 1) * 8 + 1 };
    } else paras.push(blockPara(b));
  }
  // 카드 표 문단은 원본에서 새 쪽으로 시작하지만, 내려받은 파일에서는 묶음 제목 바로 뒤에 이어 둠
  if (paras[1] && L.lead) paras[1] = { ...paras[1], pageBreak: false };
  const byBin = new Map<number, HwpxImage>();
  for (const bin of L.bins) {
    const img = bin.key ? images.get(bin.key) : undefined;
    if (img) byBin.set(bin.id, img);
  }
  const title = [card.taskNo, card.title].filter(Boolean).join(" ");
  return hwpxFiles({ doc: layoutDoc(L), page: pageOf(L), paras, images: byBin, title, footer: L.footer, pageNum: L.pageNum });
}
