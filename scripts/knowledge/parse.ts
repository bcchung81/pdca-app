// 공통 지식 원본 → kordoc 산출물(resources/knowledge/_parsed/<이름>.md·.chunks.json). pnpm knowledge:ingest의 입력을 만듭니다.
// 이미 있는 산출물은 그대로 둡니다(적재 결과를 바꾸지 않게) — 다시 만들려면 --force, 한 문서만이면 --doc <doc_id>.
// 실행: pnpm knowledge:parse [--doc pool25-biz] [--force]
// 그림: pnpm knowledge:parse --images [--doc att3-2604] — 산출물(.md·.chunks.json)은 건드리지 않고 그림만 _parsed/images/<doc_id>/ + <doc_id>.json(쪽 번호)으로 꺼냄.
//   적재(pnpm knowledge:ingest)가 조각 쪽 범위로 짝지어 meta.images에 적고, pnpm db:seed --knowledge-only가 버킷 knowledge/<doc_id>/images/에 올림(lib/knowledge/images.ts)
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { VERSION, blocksToChunks, parse } from "kordoc";
import { KNOWLEDGE_DOCUMENTS } from "../../lib/knowledge/documents.ts";
import { extractDocImages } from "../../lib/knowledge/extract-images.ts";
import type { KnowledgeImage } from "../../lib/knowledge/images.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const KNOWLEDGE = join(ROOT, "resources/knowledge");
const PARSED = join(KNOWLEDGE, "_parsed");
const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.includes("--doc") ? args[args.indexOf("--doc") + 1] : null;

mkdirSync(PARSED, { recursive: true });

// 그림만 꺼내기(--images)
if (args.includes("--images")) {
  const IMAGES = join(PARSED, "images");
  mkdirSync(IMAGES, { recursive: true });
  for (const spec of KNOWLEDGE_DOCUMENTS.filter((d) => d.status === "ingest" && (!only || d.doc_id === only))) {
    const src = join(KNOWLEDGE, spec.file_name);
    if (!existsSync(src)) {
      console.log(`  원본 없음 ${spec.doc_id}: ${spec.file_name}`);
      continue;
    }
    const buf = readFileSync(src);
    const dir = join(IMAGES, spec.doc_id);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    // PDF는 쪽 구간마다 따로 읽어 모든 쪽의 그림을 꺼냄(kordoc 상한 200개) — 규칙은 lib/knowledge/extract-images.ts
    const { images, capped, failed } = await extractDocImages(buf, spec.file_name);
    if (failed) {
      console.log(`  읽기 실패한 구간이 있음 ${spec.doc_id}`);
      process.exitCode = 1;
    }
    const list: KnowledgeImage[] = images.map(({ data, ...meta }) => {
      writeFileSync(join(dir, meta.file), data);
      return meta;
    });
    writeFileSync(join(IMAGES, `${spec.doc_id}.json`), JSON.stringify(list, null, 2) + "\n");
    const mb = list.reduce((n, i) => n + i.bytes, 0) / 1e6;
    console.log(`  그림 ${spec.doc_id}: ${list.length}개 · ${mb.toFixed(1)}MB${capped ? ` (한 쪽에 그림이 200개 넘는 쪽이 있어 일부 빠짐 — kordoc 상한)` : ""}`);
  }
  process.exit();
}

let made = 0;
for (const spec of KNOWLEDGE_DOCUMENTS.filter((d) => d.status === "ingest" && (!only || d.doc_id === only))) {
  const out = join(PARSED, `${spec.parsed_name}.chunks.json`);
  if (existsSync(out) && !force) {
    console.log(`  그대로 ${spec.doc_id}`);
    continue;
  }
  const src = join(KNOWLEDGE, spec.file_name);
  if (!existsSync(src)) {
    console.log(`  원본 없음 ${spec.doc_id}: ${spec.file_name}`);
    process.exitCode = 1;
    continue;
  }
  const res = await parse(readFileSync(src), { images: false });
  if (!res.success) {
    console.log(`  읽기 실패 ${spec.doc_id}: ${res.code ?? "형식 오류"}`);
    process.exitCode = 1;
    continue;
  }
  const chunks = blocksToChunks(res.blocks);
  writeFileSync(join(PARSED, `${spec.parsed_name}.md`), res.markdown);
  writeFileSync(out, JSON.stringify(chunks, null, 2) + "\n");
  made++;
  console.log(`  만듦 ${spec.doc_id}: 조각 ${chunks.length} · 글 ${res.markdown.length.toLocaleString("ko-KR")}자`);
}
console.log(`kordoc ${VERSION} · 새 산출물 ${made}개`);
