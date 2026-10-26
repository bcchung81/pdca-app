"use server";

import { createHash } from "node:crypto";
import { parse } from "kordoc";
import { revalidatePath } from "next/cache";
import { requireAtLeast } from "../../../../lib/auth/dal.ts";
import { PEER_DOC_ID, PEER_TITLE, peerCasesFromMarkdown, peerChunks, peerSummary } from "../../../../lib/knowledge/parsers/peer.ts";
import { clearChunkCache } from "../../../../lib/knowledge/chunk-cache.ts";
import { saveDocumentsAndChunks } from "../../../../lib/knowledge/save.ts";
import { createClient } from "../../../../lib/supabase/server.ts";

export type PeerUploadState =
  | { status: "idle" }
  | { status: "ok"; message: string; summary: ReturnType<typeof peerSummary>; problems: string[] }
  | { status: "error"; message: string; problems?: string[] };

const PEER_EXTS = ["xlsx", "xls", "hwp", "hwpx", "pdf", "docx"];
const PEER_MAX = 4 * 1024 * 1024;

/**
 * 붙임2 「유관기관 평가보고서 정리」 올리기 → 표를 읽어 사례 조각(peer_case)으로 바꿔 공통 지식에 적재(다시 올리면 통째로 바꿈).
 * 관리자만. 쓰기는 로그인 사용자 권한(RLS: 공통 지식 쓰기는 성과관리팀·관리자)으로 합니다.
 */
export async function uploadPeerCases(_prev: PeerUploadState, formData: FormData): Promise<PeerUploadState> {
  const me = await requireAtLeast("admin", "/admin/library");
  if (!me) return { status: "error", message: "관리자만 올릴 수 있습니다." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "붙임2 파일을 골라 주세요." };
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (!PEER_EXTS.includes(ext)) return { status: "error", message: "엑셀(xlsx·xls)·한글(hwp·hwpx)·PDF·워드 파일만 올릴 수 있습니다." };
  if (file.size > PEER_MAX) return { status: "error", message: "4MB 이하 파일만 올릴 수 있습니다(표만 남긴 파일로 다시 저장해 주세요)." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  let markdown = "";
  try {
    const res = await parse(Buffer.from(bytes), { images: false });
    if (!res.success) return { status: "error", message: `파일을 읽지 못했습니다(${res.code ?? "형식 오류"}).` };
    markdown = res.markdown;
  } catch {
    return { status: "error", message: "파일을 읽지 못했습니다. 손상되었거나 암호가 걸려 있는지 확인해 주세요." };
  }
  const { cases, problems } = peerCasesFromMarkdown(markdown);
  if (!cases.length) return { status: "error", message: "붙임2 표를 찾지 못했습니다.", problems };
  const chunks = peerChunks(cases);
  const summary = peerSummary(cases);
  const supabase = await createClient();
  const doc = {
    doc_id: PEER_DOC_ID,
    title: PEER_TITLE,
    file_name: file.name,
    issuer: "경영기획본부 성과관리팀",
    basis_year: 2025,
    tracks: ["주요사업"],
    scope: "산업진흥군 기관 주요사업별 등급·잘한 점·아쉬운 점 — 월간 점검 ★사례제안의 원천(KCA 행은 지적 요약)",
    status: "ingest",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    parser_version: "peer-1",
    chunk_count: chunks.length,
    unit_counts: { peer_case: chunks.length },
    checks: [
      { name: "사례 행", level: "error", ok: cases.length > 0, actual: cases.length },
      { name: "사례 후보(KCA·빈 잘한 점 제외)", level: "warn", ok: summary.candidates > 0, actual: summary.candidates },
      ...problems.map((p) => ({ name: "표 읽기", level: "warn", ok: false, note: p })),
    ],
    uploaded_by: me.id,
  };
  // 문서·조각 쓰기는 시드·일반 문서 업로드와 같은 공유 함수(lib/knowledge/save.ts): 업서트 + 이번에 없는 옛 사례 삭제(다시 올리면 통째로 바뀜).
  // 예전의 「전부 지우고 넣기」는 조각 표를 지울 때 대응표 행도 연쇄 삭제했지만, 붙임2 사례는 대응표 대상이 아니라 지금은 같은 결과
  try {
    await saveDocumentsAndChunks(supabase, [doc], chunks as unknown as Array<Record<string, unknown>>, { prune: true });
  } catch (e) {
    console.error("uploadPeerCases", (e as Error).message);
    return { status: "error", message: "붙임2를 적재하지 못했습니다. 다시 올려 주세요." };
  }
  revalidatePath("/admin/library");
  revalidatePath("/inspections");
  revalidatePath("/knowledge");
  return { status: "ok", message: `붙임2를 적재했습니다 — ${summary.orgs}개 기관 ${summary.rows}행(사례 후보 ${summary.candidates}행).`, summary, problems };
}

/** 붙임2 적재 지우기(사례제안은 다시 「기준 미확인 — 붙임2 미확보」로) */
export async function removePeerCases(): Promise<{ ok: boolean; message: string }> {
  const me = await requireAtLeast("admin", "/admin/library");
  if (!me) return { ok: false, message: "관리자만 지울 수 있습니다." };
  const supabase = await createClient();
  const del = await supabase.from("knowledge_chunks").delete().eq("doc_id", PEER_DOC_ID);
  if (del.error) return { ok: false, message: "지우지 못했습니다." };
  await supabase.from("knowledge_documents").delete().eq("doc_id", PEER_DOC_ID);
  clearChunkCache();
  revalidatePath("/admin/library");
  revalidatePath("/inspections");
  return { ok: true, message: "붙임2 적재를 지웠습니다." };
}
