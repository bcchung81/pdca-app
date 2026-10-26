// 적재 입력 파일 읽기(카드 seed + 공통 지식 적재 결과). seed 스크립트와 테스트가 같이 씁니다.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { cardFileStem } from "../cards/file-names.ts";
import type { FindingLink, TaskMapRow } from "../knowledge/link.ts";
import type { IngestedDocument } from "../knowledge/pipeline.ts";
import type { KnowledgeChunk } from "../knowledge/types.ts";
import type { RawCard, SeedInput } from "./seed-rows.ts";

export const CARD_EDITION = "260916";

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

/** root: 저장소 루트. 공통 지식 적재 결과가 없으면 카드만 돌려줍니다 */
export function readSeedInput(root: string): SeedInput & { knowledgeAvailable: boolean } {
  const cardDir = join(root, "seed/cards", CARD_EDITION);
  const cards = (JSON.parse(readFileSync(join(cardDir, `biz-${CARD_EDITION}.json`), "utf8")) as { cards: RawCard[] }).cards;
  const staticDir = join(cardDir, "static");
  const files = new Set(readdirSync(staticDir));
  const originalHtml = new Map<string, string>();
  for (const c of cards) {
    // 정적 조각 이름은 영문 줄기(biz1_1-ga.html — lib/cards/file-names.ts)
    const name = `${cardFileStem(c.group, c.taskNo)}.html`;
    if (files.has(name)) originalHtml.set(c.id, readFileSync(join(staticDir, name), "utf8"));
  }

  const out = join(root, "resources/knowledge/_chunks");
  const knowledgeAvailable = existsSync(join(out, "manifest.json"));
  if (!knowledgeAvailable) return { edition: CARD_EDITION, cards, originalHtml, knowledgeAvailable };

  const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8")) as { documents: IngestedDocument[] };
  const chunks = manifest.documents.flatMap((d) => readJsonl<KnowledgeChunk>(join(out, `${d.doc_id}.jsonl`)));
  return {
    edition: CARD_EDITION,
    cards,
    originalHtml,
    documents: manifest.documents,
    chunks,
    links: readJsonl<FindingLink>(join(out, "card-finding-links.jsonl")),
    taskMap: readJsonl<TaskMapRow>(join(out, "task-map.jsonl")),
    knowledgeAvailable,
  };
}
