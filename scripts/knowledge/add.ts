// 일반 문서 한 개를 공통 지식에 올립니다(참고자료 5단계 「적재 통일」) — 화면 업로드(관리 › 공통 자료·틀)와 같은 코어(lib/knowledge/upload.ts·save.ts)를 씁니다.
// 큰 PDF처럼 서버(함수)에서 읽는 시간을 못 잰 파일은 이 명령으로 올립니다. 전용 파서가 있는 문서 8개는 이 명령이 아니라 pnpm knowledge:ingest → pnpm db:seed --knowledge-only.
//
//   pnpm knowledge:add <파일> --title "제목" --scope institution [--year 2026] [--edition "2026.9."] [--issuer "성과관리팀"] [--dry-run]
//     범위(--scope): institution(기관 공통 ①) · common-kpi(공통지표 ②) · bonus(가점 ②) · BZ-1|BZ-2|BZ-3(사업 공통 ③) · mg-institution(경영관리 공통 ①)·MG-1~MG-14(경영관리 지표 공통 ③) · report-method(경평 초안 작성 방법론 — 경평 초안에만) · search-only(검색 전용 — AI 근거에 안 넣음)
//     --dry-run: 읽기·조각·검산·크기 보호까지만 보고 DB와 저장소에는 아무것도 쓰지 않음(DB는 읽기만 — 지금 조각 크기를 알아야 해서)
//
// 필요한 환경변수(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY. 운영 DB를 가리키면 운영에 씁니다(--dry-run 아니면).
// 끝나면 새 문서의 과제 매칭 작업을 등록만 합니다(처리는 pnpm prep run --ai).
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { loadBundleChunks } from "../../lib/ai/context.ts";
import { attachDocImages } from "../../lib/knowledge/extract-images.ts";
import { SHARED_CHARS_LIMIT } from "../../lib/knowledge/guard.ts";
import { changedMatchingDocs, deleteDocument, documentShas, registerMatching, removeDocumentFiles, saveDocumentsAndChunks, uploadDocumentImages } from "../../lib/knowledge/save.ts";
import { UPLOAD_SCOPES, type UploadScope, ingestUploadedFile, isUploadScope, safeStorageName } from "../../lib/knowledge/upload.ts";
import { createAdminClient } from "../../lib/supabase/admin.ts";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const value = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

function usage(message: string): never {
  console.error(message);
  console.error('사용법: pnpm knowledge:add <파일> --title "제목" --scope <범위> [--year 2026] [--edition "…"] [--issuer "…"] [--dry-run]');
  console.error(`범위: ${UPLOAD_SCOPES.map((s) => `${s.value}(${s.label})`).join(" · ")}`);
  process.exit(1);
}

const file = argv.find((a, i) => !a.startsWith("--") && (i === 0 || !["--title", "--scope", "--year", "--edition", "--issuer"].includes(argv[i - 1])));
if (!file) usage("파일 경로가 없습니다.");
const title = value("--title");
if (!title?.trim()) usage("--title이 필요합니다.");
const scope = value("--scope");
if (!isUploadScope(scope)) usage(`--scope가 올바르지 않습니다: ${scope ?? "(없음)"}`);
const year = Number(value("--year") ?? new Date().getFullYear());
const dry = flag("--dry-run");

const db = createAdminClient();
const host = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
  } catch {
    return "(알 수 없음)";
  }
})();

const bytes = new Uint8Array(readFileSync(file));
const docId = `up-${randomBytes(4).toString("hex")}`;
const storageName = safeStorageName(file);
const storagePath = `knowledge/${docId}/${storageName}`;
console.log(`DB ${host} · 파일 ${basename(file)}(${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB) · 범위 ${UPLOAD_SCOPES.find((s) => s.value === scope)!.label} · 문서 ${docId}${dry ? " · --dry-run(쓰지 않음)" : ""}`);

const [existing, shas] = await Promise.all([loadBundleChunks(db, "all", { fresh: true }), documentShas(db)]);
const t0 = Date.now();
const out = await ingestUploadedFile({
  docId,
  fileName: basename(file),
  storagePath,
  bytes,
  title: title!.trim(),
  edition: value("--edition"),
  issuer: value("--issuer"),
  basisYear: year,
  scope: scope as UploadScope,
  existing,
  existingShas: shas,
});
console.log(`읽기·조각·검산 ${(((Date.now() - t0) / 1000) | 0)}초`);

for (const c of out.checks) console.log(`  ${c.ok ? "통과" : c.level === "error" ? "실패" : "경고"} ${c.name}${c.actual !== undefined ? ` — ${String(c.actual)}` : ""}`);
if (out.stats) console.log(`  조각 ${out.stats.sections}개 · 글 ${out.stats.chars.toLocaleString("ko-KR")}자 · ${out.stats.byPage ? "쪽 경계" : `제목 깊이 ${out.stats.splitDepth}`}`);
if (out.guard.length) {
  console.log(`  요청 앞 공통 지식 크기(한도 ${SHARED_CHARS_LIMIT.toLocaleString("ko-KR")}자):`);
  for (const g of out.guard) console.log(`    ${g.unit} ${g.before.toLocaleString("ko-KR")} → ${g.after.toLocaleString("ko-KR")}자 · 여유 ${g.room.toLocaleString("ko-KR")}자${g.over ? " ✖ 넘음" : ""}`);
}
for (const w of out.warnings) console.log(`  ※ ${w}`);
if (!out.ok) {
  console.error(`멈춤: ${out.message}`);
  process.exit(1);
}
// 그림: 원본에서 꺼내 조각 쪽 범위에 짝지음(글은 안 바뀜) — --dry-run도 여기까지는 읽기만 함
const withImages = await attachDocImages(bytes, basename(file), out.chunks!);
const chunks = withImages.chunks;
console.log(`  그림 ${withImages.images.length}장(${(withImages.images.reduce((n, i) => n + i.bytes, 0) / 1e6).toFixed(1)}MB) → 조각 ${chunks.filter((c, i) => c !== out.chunks![i]).length}개에 붙임`);
for (const w of withImages.warnings) console.log(`  ※ ${w}`);
if (dry) {
  console.log("--dry-run이라 여기서 끝냅니다. 올리려면 --dry-run을 빼고 다시 실행하세요.");
  process.exit(0);
}

// 쓰기: 원본 → 저장소, 문서·조각 → DB, 그다음 매칭 작업 등록. 실패하면 되돌림(문서 행 삭제 = 조각·대응표 연쇄 삭제, 저장소 파일 삭제)
try {
  const up = await db.storage.from("knowledge").upload(`${docId}/${storageName}`, Buffer.from(bytes), { upsert: true });
  if (up.error) throw new Error(`저장소 올리기: ${up.error.message}`);
  await uploadDocumentImages(db, docId, withImages.images);
  await saveDocumentsAndChunks(db, [out.document!], chunks as unknown as Array<Record<string, unknown>>, { log: (m) => console.log(`  ${m}`) });
} catch (e) {
  console.error(`쓰기 실패: ${(e as Error).message} — 되돌립니다.`);
  await deleteDocument(db, docId).catch(() => {});
  const cleaned = await removeDocumentFiles(db, docId);
  if (!cleaned) console.error(`저장소 파일(${docId}/)을 못 지웠습니다 — 대시보드에서 확인하세요.`);
  process.exit(1);
}
const r = await registerMatching(db, changedMatchingDocs(shas, [out.document!], chunks), chunks);
if (r.message) console.log(`과제 매칭 작업 등록 실패(${r.message}) — 나중에 pnpm prep enqueue --match --doc ${docId}로 등록하세요.`);
else console.log(`과제 매칭 작업 ${r.queued}건 등록(이미 대기 중 ${r.skipped}건${r.merged ? ` — 그 작업에 이 문서를 합침 ${r.merged}건` : ""}). 처리: pnpm prep run --ai (카드 1장 약 ${Math.max(1, Math.round((out.stats!.chars * 0.95) / 1000))}천 토큰 이상)`);
console.log(`완료: 문서 ${docId} — 공통 지식 검색(/knowledge?doc=${docId})에서 확인하세요.`);
