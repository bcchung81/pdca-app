import "server-only";

import { parse } from "kordoc";
import { toWebImage } from "./image.ts";
import { type ParsedGroup, parseCardMarkdown } from "./parse.ts";
import { looksLikeMgmtFile, parseMgmtMarkdown } from "./parse-mgmt.ts";
import type { LooseJson } from "../../loose-json.ts";

// 과제관리카드 한글 파일(HWP·HWPX) → kordoc 마크다운 → 카드 JSON. 그림 바이트도 함께 돌려줍니다(현행화 때 저장소에 올림).
// 그림은 초기 변환(parse_cards.py)처럼 BMP를 PNG·JPEG 중 작은 쪽으로 바꿉니다(image.ts). 카드 JSON의 kordoc 이름은 비교용 자리표시로 그대로 둡니다.

export const CARD_FILE_EXTS = ["hwp", "hwpx"] as const;
export const CARD_FILE_MAX = 30 * 1024 * 1024;

export class CardFileError extends Error {}

export interface CardFile {
  fileType: string;
  group: ParsedGroup["group"];
  cards: LooseJson[];
  /** kordoc 그림 이름 → 바이트·형식·저장 이름(카드에 쓰인 것만, BMP는 PNG·JPEG로 바꾼 것) */
  images: Map<string, { data: Uint8Array; mime: string; file: string }>;
  ignored: number;
}

export function cardFileExt(name: string): string | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return (CARD_FILE_EXTS as readonly string[]).includes(ext) ? ext : null;
}

/** 카드 JSON 안의 그림 자리({image:{src,kordoc}})를 모두 찾아 f로 바꿈 */
export function mapImages(v: LooseJson, f: (img: { src: string | null; kordoc: string }) => { src: string | null; kordoc: string }): LooseJson {
  if (Array.isArray(v)) return v.map((x) => mapImages(x, f));
  if (v && typeof v === "object") {
    if ("image" in v && v.image && typeof v.image === "object" && Object.keys(v).length === 1) return { image: f(v.image) };
    const out: LooseJson = {};
    for (const [k, x] of Object.entries(v)) out[k] = mapImages(x, f);
    return out;
  }
  return v;
}

export function imageNames(card: LooseJson): string[] {
  const names = new Set<string>();
  mapImages(card, (img) => {
    if (img.kordoc) names.add(img.kordoc);
    return img;
  });
  return [...names];
}

export async function readCardFile(bytes: Uint8Array, fileName: string): Promise<CardFile> {
  if (!cardFileExt(fileName)) throw new CardFileError("과제관리카드는 한글 파일(HWP·HWPX)만 올릴 수 있습니다.");
  const res = await parse(Buffer.from(bytes));
  if (!res.success) throw new CardFileError(`한글 파일을 읽지 못했습니다(${res.code ?? "형식 오류"}${res.error ? `: ${res.error.slice(0, 80)}` : ""}).`);
  if (res.fileType !== "hwp" && res.fileType !== "hwpx") throw new CardFileError(`한글 파일이 아닙니다(${res.fileType}).`);
  // 경영관리 카드 파일(과제번호 「지표명 N-M」)은 칸이 달라 따로 읽음 — 한 파일에 지표 묶음 여럿이 들어 있어 묶음(group)은 카드마다 `경영관리N`
  let group: CardFile["group"];
  let cards: LooseJson[];
  let ignored: number;
  if (looksLikeMgmtFile(res.markdown)) {
    const r = parseMgmtMarkdown(res.markdown, { sourceName: fileName, fileType: res.fileType });
    group = { id: "경영관리", title: null, count: r.cards.length, summary: null, source: fileName, targetBusinesses: [] };
    cards = r.cards;
    ignored = r.skipped;
  } else {
    const r = parseCardMarkdown(res.markdown, { sourceName: fileName, fileType: res.fileType });
    group = r.group;
    cards = r.cards;
    ignored = r.ignored.length;
  }
  if (!cards.length) throw new CardFileError("파일에서 과제관리카드 표(「과제명 (과제번호)」 행)를 찾지 못했습니다. 카드 양식 그대로인지 확인해 주세요.");
  const used = new Set(cards.flatMap(imageNames));
  const images = new Map<string, { data: Uint8Array; mime: string; file: string }>();
  for (const im of res.images ?? [])
    if (used.has(im.filename)) {
      const web = toWebImage(im.data, im.filename, im.mimeType);
      images.set(im.filename, { data: web.data, mime: web.mime, file: web.name });
    }
  return { fileType: res.fileType, group, cards, images, ignored };
}
