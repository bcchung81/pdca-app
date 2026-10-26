// 카드마다 원본 배치(cards.layout)를 채웁니다. 카드 JSON(data)·원본 양식 조각은 건드리지 않습니다(운영 중 고친 글 보호).
// 그림은 비공개 버킷 card-originals/{uid}/hwp-{해시}.{확장자}에 올립니다(같은 그림이면 같은 이름).
//
//   pnpm db:layout --dry-run        # 만들 수 있는지·잇기 적중률만(접속 안 함)
//   pnpm db:layout                  # 배치가 비어 있는 카드만 채우기
//   pnpm db:layout --all            # 이미 있는 카드도 다시
//   pnpm db:layout --card 1-가       # 한 장만(과제번호)
//
// 잇기 표시는 적재 때의 카드 JSON(seed/cards/{판}/biz-{판}.json)으로 적습니다 — 원본 한글 파일과 글이 짝지어진 JSON.
// 그사이 원장이 고쳐졌어도 화면이 목록마다 다시 맞춰 그립니다(lib/cards/layout-render.ts).
// 필요한 환경변수(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { type CardLayout } from "../../lib/hwp/layout.ts";
import { readHwp5 } from "../../lib/hwp/hwp5.ts";
import { buildLayouts } from "../../lib/cards/layout-build.ts";
import { CARD_EDITION } from "../../lib/db/seed-files.ts";
import { cardSourceFiles } from "../../lib/cards/file-names.ts";


const ROOT = resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const only = args.includes("--card") ? args[args.indexOf("--card") + 1] : null;

/** 시드 카드 JSON에서 이 도구가 읽는 칸(나머지는 buildLayouts가 읽음) */
interface SeedCard {
  id: string;
  group: string;
  taskNo: string;
}

async function main() {
  const seed = JSON.parse(readFileSync(join(ROOT, "seed/cards", CARD_EDITION, `biz-${CARD_EDITION}.json`), "utf8")) as { cards: SeedCard[] };
  const srcDir = join(ROOT, "data/cards", CARD_EDITION);
  // 원본 파일 이름은 영문(cards-<판>-bizN.hwp — lib/cards/file-names.ts). 예전에는 카드 JSON의 source.file(기관 원본 한글 이름)로 짝지었음
  const sources = cardSourceFiles(CARD_EDITION);
  const files = readdirSync(srcDir).filter((f) => sources.some((s) => s.hwp === f));
  const results: { card: SeedCard; layout: CardLayout; images: { key: string; data: Uint8Array; mime: string }[]; rate: string }[] = [];
  for (const file of files) {
    const group = sources.find((s) => s.hwp === file)!.group;
    const cards = seed.cards.filter((c) => c.group === group);
    if (!cards.length) continue;
    const doc = readHwp5(readFileSync(join(srcDir, file)));
    const { built, skipped } = buildLayouts(doc, cards);
    for (const s of skipped) console.log(`  건너뜀 ${file}: ${s}`);
    for (const b of built) {
      const card = cards[b.index];
      if (only && card.taskNo !== only) continue;
      results.push({ card, layout: b.layout, images: b.images, rate: `${b.stats.bound}/${b.stats.targets}` });
    }
  }
  console.log(`배치 ${results.length}장 · 그림 ${results.reduce((s, r) => s + r.images.length, 0)}개`);
  for (const r of results) if (has("--verbose")) console.log(`  ${r.card.id} 잇기 ${r.rate}`);
  if (has("--dry-run")) return;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SECRET_KEY가 필요합니다(.env.local)");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: rows, error } = await db.from("cards").select("id, uid, layout");
  if (error || !rows) throw new Error(`cards select: ${error?.message ?? "응답 없음"}`);
  const byId = new Map(rows.map((r) => [r.id as string, r as { id: string; uid: string; layout: unknown }]));
  let done = 0;
  let kept = 0;
  for (const r of results) {
    const row = byId.get(r.card.id);
    if (!row) {
      console.log(`  원장에 없음: ${r.card.id}`);
      continue;
    }
    if (row.layout && !has("--all") && !only) {
      kept++;
      continue;
    }
    for (const im of r.images) {
      const { error: e } = await db.storage.from("card-originals").upload(`${row.uid}/${im.key}`, im.data, { upsert: true, contentType: im.mime });
      if (e) throw new Error(`그림 올리기 ${r.card.id} ${im.key}: ${e.message}`);
    }
    const { error: e } = await db.from("cards").update({ layout: r.layout }).eq("id", row.id);
    if (e) throw new Error(`cards.layout ${r.card.id}: ${e.message}`);
    done++;
  }
  console.log(`  채움 ${done}장${kept ? ` · 이미 있어 둠 ${kept}장(--all로 다시)` : ""}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
