import "server-only";

import type { HwpxImage } from "../../hwp/hwpx-write.ts";
import { type CardLayout, layoutImageKeys } from "../../hwp/layout.ts";
import { writeHwpxPackage } from "../../hwpx/postprocess.ts";
import { BUSINESSES } from "../../knowledge/dictionaries.ts";
import { layoutHwpxFiles } from "../layout-hwpx.ts";
import { cardImageRefs } from "../original-html.ts";
import { renderCard } from "../render.ts";
import type { createClient } from "../../supabase/server.ts";
import { buildCardHwpx } from "./form.ts";
import type { LooseJson } from "../../loose-json.ts";

// 과제관리카드 → 한글(HWPX). 원본 배치(cards.layout)가 있으면 원본 한글 파일의 표·칸·테두리/배경·글자/문단 모양·그림·도형을 그대로 다시 쓰고
// (lib/cards/layout-hwpx.ts), 없으면 9.16 원본 서식(form.ts)으로 kordoc이 만듭니다. 그림은 비공개 저장소에서 읽어 넣습니다.
// 내려받은 파일을 한글에서 고쳐 「현행화」(성과관리팀) 또는 「한글 파일로 작성본 채우기」(부서)로 다시 올릴 수 있습니다.

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** 파일 이름에 쓸 수 없는 글자를 빼고 길이를 줄임 */
export function hwpxFileName(taskNo: string, title: string): string {
  const clean = `${taskNo}_${title}`.replace(/[\\/:*?"<>|\n\r\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return `${clean || "과제관리카드"}.hwpx`;
}

export async function cardToHwpx(supabase: Supabase, uid: string, card: LooseJson, layout?: CardLayout | null): Promise<Uint8Array> {
  if (layout) {
    const images = new Map<string, HwpxImage>();
    await Promise.all(
      layoutImageKeys(layout).map(async (key) => {
        const { data } = await supabase.storage.from("card-originals").download(`${uid}/${key}`);
        if (data) images.set(key, { data: new Uint8Array(await data.arrayBuffer()), ext: key.split(".").pop() ?? "png" });
      }),
    );
    const files = layoutHwpxFiles(card, layout, images);
    if (files) return (await writeHwpxPackage(files)).bytes;
  }
  // 카드 JSON의 그림(src) → 저장소 이름({bizN|impN}-{파일}) → 바이트. 한글 파일 안 이름은 저장소 이름 그대로(겹치지 않게)
  const refs = cardImageRefs(renderCard(card));
  const bytes = new Map<string, Uint8Array>();
  await Promise.all(
    refs.map(async (r) => {
      const { data } = await supabase.storage.from("card-originals").download(`${uid}/${r.objectName}`);
      if (data) bytes.set(r.objectName, new Uint8Array(await data.arrayBuffer()));
    }),
  );
  const images: Record<string, Uint8Array> = {};
  const unit = BUSINESSES.find((b) => b.cardGroup === card.group);
  return buildCardHwpx(
    card,
    {
      group: card.group && unit ? { id: card.group, name: unit.name2026 } : null,
      imageKey: (img) => {
        const ref = refs.find((r) => r.src === `../${String(img.src ?? "").replace(/\\/g, "/")}`);
        if (ref && bytes.has(ref.objectName)) {
          images[ref.objectName] = bytes.get(ref.objectName)!;
          return ref.objectName;
        }
        return img.kordoc;
      },
    },
    images,
  );
}

export const HWPX_MIME = "application/hwp+zip";
