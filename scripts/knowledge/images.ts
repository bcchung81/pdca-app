// 이미 올린 일반 문서(up-…)에 그림을 붙입니다 — 저장소(knowledge 버킷)의 원본 파일에서 그림을 다시 꺼내 조각 쪽 범위에 짝지음(조각 meta.images + 버킷 knowledge/<doc_id>/images/).
// 쓸 때: ① 그림 꺼내기를 넣기 전에 올린 문서 ② 올릴 때 큰 파일이라 그림을 건너뛴 문서 ③ kordoc을 올려 그림이 더 나오게 된 문서.
// 조각 글·쪽·검색·AI 근거는 안 바뀝니다(meta에 images 키만 더함). 되돌리기: 조각 meta에서 images 키 제거 + 버킷의 <doc_id>/images/ 삭제.
//
//   pnpm knowledge:images <문서 id> [--dry-run]
//
// 필요한 환경변수(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY. 운영 DB를 가리키면 운영에 씁니다(--dry-run 아니면).
import { extractDocImages } from "../../lib/knowledge/extract-images.ts";
import { GENERIC_CHUNK_IMAGE_MAX, referencedImages, withChunkImages } from "../../lib/knowledge/images.ts";
import { uploadDocumentImages } from "../../lib/knowledge/save.ts";
import { createAdminClient } from "../../lib/supabase/admin.ts";

const argv = process.argv.slice(2);
const dry = argv.includes("--dry-run");
const docId = argv.find((a) => !a.startsWith("--"));
if (!docId || !/^[\w-]+$/.test(docId)) {
  console.error("사용법: pnpm knowledge:images <문서 id> [--dry-run]");
  process.exit(1);
}

const db = createAdminClient();
const host = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
  } catch {
    return "(알 수 없음)";
  }
})();

const { data: doc, error: docError } = await db.from("knowledge_documents").select("doc_id, title, file_name, storage_path").eq("doc_id", docId).maybeSingle();
if (docError || !doc) {
  console.error(`문서를 찾지 못했습니다: ${docId}${docError ? ` (${docError.message})` : ""}`);
  process.exit(1);
}
const storagePath = String(doc.storage_path ?? "").replace(/^knowledge\//, "");
if (!storagePath) {
  console.error("이 문서는 저장소에 원본 파일이 없어(전용 파서 문서) 그림을 붙일 수 없습니다. 전용 파서 문서는 pnpm knowledge:parse --images → knowledge:ingest → db:seed --knowledge-only 순서입니다.");
  process.exit(1);
}
console.log(`DB ${host} · 문서 ${docId}「${doc.title}」 · 원본 ${storagePath}${dry ? " · --dry-run(쓰지 않음)" : ""}`);

const dl = await db.storage.from("knowledge").download(storagePath);
if (dl.error || !dl.data) {
  console.error(`원본을 내려받지 못했습니다: ${dl.error?.message ?? "없음"}`);
  process.exit(1);
}
const bytes = new Uint8Array(await dl.data.arrayBuffer());
const got = await extractDocImages(bytes, String(doc.file_name ?? storagePath));
console.log(`  꺼낸 그림 ${got.images.length}장(${(got.images.reduce((n, i) => n + i.bytes, 0) / 1e6).toFixed(1)}MB)${got.capped ? " · 한 쪽에 200개 넘는 쪽이 있어 일부 빠짐(kordoc 상한)" : ""}${got.failed ? " · 읽기 실패한 구간 있음" : ""}`);

const { data: rows, error: chunkError } = await db.from("knowledge_chunks").select("chunk_key, seq, title, pdf_page_start, pdf_page_end, meta").eq("doc_id", docId).order("seq");
if (chunkError || !rows) {
  console.error(`조각을 읽지 못했습니다: ${chunkError?.message}`);
  process.exit(1);
}
const attached = withChunkImages(rows, got.images, GENERIC_CHUNK_IMAGE_MAX);
const changed = attached.filter((c, i) => c !== rows[i]);
const uploads = referencedImages(attached, got.images);
for (const c of changed) console.log(`  조각 ${c.seq} ${String(c.title).slice(0, 30)} (${c.pdf_page_start}~${c.pdf_page_end}쪽) ← 그림 ${(c.meta as { images: string[] }).images.length}장`);
console.log(`조각 ${changed.length}/${rows.length}개에 그림 ${uploads.length}장을 붙입니다.`);
if (!changed.length) process.exit(0);
if (dry) {
  console.log("--dry-run이라 여기서 끝냅니다. 붙이려면 --dry-run을 빼고 다시 실행하세요.");
  process.exit(0);
}

await uploadDocumentImages(db, docId, uploads);
for (const c of changed) {
  const { error } = await db.from("knowledge_chunks").update({ meta: c.meta }).eq("chunk_key", c.chunk_key);
  if (error) {
    console.error(`조각 ${c.chunk_key} meta 갱신 실패: ${error.message} — 이미 갱신한 조각은 그대로 두고 멈춥니다(다시 실행하면 이어서 맞춰집니다).`);
    process.exit(1);
  }
}
console.log(`완료: 그림 ${uploads.length}장 업로드, 조각 ${changed.length}개 meta.images 갱신. /knowledge?doc=${docId} 에서 확인하세요.`);
