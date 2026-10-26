// 공통 규칙 문서를 운영 knowledge_chunks에 올림(scripts/knowledge/rules-digest.ts의 --write/--dry-run이 부름). 모양·열은 lib/knowledge/rules-digest-store.ts.
// 기본은 드라이런(DB는 읽기만). 쓰기는 `--write --yes`일 때만. 단위 하나라도 올릴 수 없으면(검산 실패·교차 검증 미완료·뜻 다름/키 잘못 남음·원문 변경) 아무것도 쓰지 않고 멈춤(종료 코드 1).
// 쓰는 길은 화면 업로드·시드와 같은 saveDocumentsAndChunks(문서 업서트 → 조각 업서트 → 이 문서의 옛 조각 삭제 → 조각 캐시 비움). 과제 매칭 작업은 안 만듦(rules_digest는 대응표 대상이 아님).
// 실행: node --conditions=react-server --env-file=.env.local scripts/knowledge/rules-digest.ts --out <폴더> [--units track-biz,BZ-1,BZ-2,BZ-3] (--dry-run | --write --yes) [--reviewed]
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadBundleChunks } from "../../lib/ai/context.ts";
import { sharedSizeReport } from "../../lib/knowledge/guard.ts";
import type { BundleChunk } from "../../lib/knowledge/bundle.ts";
import { type StoredDigest, digestChunkRow, digestDocumentRow } from "../../lib/knowledge/rules-digest-store.ts";
import { chunkHash, digestChunks, digestTarget } from "../../lib/knowledge/rules-digest.ts";
import { saveDocumentsAndChunks } from "../../lib/knowledge/save.ts";
import type { TrackId } from "../../lib/tracks/index.ts";
import { type UnitResult, storeBlockers, tallyOf } from "../eval/rules-check-core.ts";

const args = process.argv.slice(2);
const value = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const out = value("--out");
if (!out) throw new Error("--out <폴더>가 필요합니다.");
const write = args.includes("--write");
if (write && !args.includes("--yes")) throw new Error("--write는 --yes와 함께만 씁니다(운영 DB에 씀).");
const units = (value("--units") ?? "track-biz,BZ-1,BZ-2,BZ-3").split(",").filter(Boolean);
const root = resolve(out);

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const all = await loadBundleChunks(db, "all");

const problems: string[] = [];
const byTrack = new Map<TrackId, Array<{ digest: StoredDigest; summary: Record<string, unknown> }>>();
for (const id of units) {
  const target = digestTarget(id);
  const j = JSON.parse(readFileSync(join(root, "rules", `${id}.json`), "utf8"));
  const md = readFileSync(join(root, "rules", `${id}.md`), "utf8");
  const checkFile = join(root, "rules-check", `${id}.json`);
  const result: UnitResult | null = existsSync(checkFile) ? JSON.parse(readFileSync(checkFile, "utf8")) : null;
  const why = storeBlockers(j, result);
  // 지금 DB의 입력 조각이 규칙 문서를 만들 때와 같은지(교차 검증 결과의 staleKeys는 검증 시점 기준이라 여기서 다시 봄)
  const now = new Map(digestChunks(all, target).map((c) => [c.chunk_key, chunkHash(c)]));
  const changed = (j.inputs as Array<{ key: string; hash: string }>).filter((x) => now.get(x.key) !== x.hash).map((x) => x.key);
  if (changed.length) why.push(`지금 원문 조각 ${changed.length}개가 규칙 문서를 만들 때와 다름(${changed.slice(0, 3).join(", ")})`);
  if (why.length) {
    problems.push(`${id}: ${why.join(" / ")}`);
    continue;
  }
  const bizUnit = target.units.length === 1 && target.units[0] !== undefined && id !== target.track.id ? target.units[0] : null;
  const summary = { ...(result ? tallyOf(result).counts : {}), 문서단위지적: result ? tallyOf(result).gaps : 0, model: result?.model, checkedAt: result?.checkedAt };
  const digest: StoredDigest = { id, title: `공통 규칙 문서 — ${id === target.track.id ? `${target.track.id} 공통` : target.title}`, track: target.track.id, business: bizUnit, md, inputs: j.inputs, promptVersion: j.promptVersion, model: j.model, generatedAt: j.generatedAt };
  if (!byTrack.has(target.track.id)) byTrack.set(target.track.id, []);
  byTrack.get(target.track.id)!.push({ digest, summary });
}

if (problems.length) {
  console.log("올릴 수 없는 단위가 있어 아무것도 쓰지 않고 멈춥니다:");
  for (const p of problems) console.log(`  ✖ ${p}`);
  process.exit(1);
}

for (const [track, list] of byTrack) {
  const chunks = list.map((x, seq) => digestChunkRow(x.digest, seq, { checkSummary: x.summary, ...(args.includes("--reviewed") ? { reviewedAt: new Date().toISOString() } : {}) }));
  const doc = digestDocumentRow(track, chunks);
  const chars = chunks.reduce((n, c) => n + String(c.text).length, 0);
  console.log(`${write ? "쓰기" : "드라이런"} — 문서 ${doc.doc_id}: 조각 ${chunks.length}개, ${chars.toLocaleString("ko-KR")}자`);
  for (const c of chunks) console.log(`  ${String(c.chunk_key).padEnd(24)} business=${String(c.business)} ${String(c.text).length.toLocaleString("ko-KR")}자 sources ${(c.meta as { sources: unknown[] }).sources.length}개`);
  // 크기 보호: rules_digest는 layerOf가 null로 돌려 요청 앞 공유 층 크기를 늘리지 않음 — 그래도 올린 뒤 값이 같은지 확인
  const guard = sharedSizeReport(all as BundleChunk[], chunks as unknown as BundleChunk[]);
  console.log(`  크기 보호(${guard.length}단위): ${guard.some((g) => g.over) ? "✖ 넘음" : "통과"}, 올리기 전후 변화 ${guard.filter((g) => g.after !== g.before).length}단위`);
  if (guard.some((g) => g.over)) {
    console.log("  크기 보호에서 멈춥니다.");
    process.exit(1);
  }
  if (!write) continue;
  const report = await saveDocumentsAndChunks(db, [doc], chunks, { prune: true, log: (m) => console.log(`  ${m}`) });
  console.log(`  완료: 문서 ${report.documents}·조각 ${report.chunks}(옛 조각 삭제 ${report.pruned})`);
}
if (!write) console.log("\n드라이런이라 아무것도 쓰지 않았습니다. 쓰려면 --write --yes.");
