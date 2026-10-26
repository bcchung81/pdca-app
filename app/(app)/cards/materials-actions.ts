"use server";

import { randomUUID } from "node:crypto";
import { parseStored, recordDescribe } from "../../../lib/ai/attachments.ts";
import { parseColumns } from "../../../lib/ai/material-text.ts";
import { requireUser } from "../../../lib/auth/dal.ts";
import { PREVIEW_WRITE_MSG, previewWriteBlocked } from "../../../lib/auth/preview.ts";
import { safeExt } from "../../../lib/reports/model.ts";
import { createClient } from "../../../lib/supabase/server.ts";

// 카드 전용 자료(card-materials/{cards.uid}/…): 그 카드 안에서만 씀. 권한은 RLS(can_read_card·can_write_card)가 판정합니다.

export interface CardMaterial {
  id: string;
  fileName: string;
  mimeType: string | null;
  bytes: number | null;
  createdAt: string;
  url: string | null;
  /** AI가 읽었는지(참고자료 설계 1단계 — pending은 아직 안 읽음, 요청 때 서버가 읽음) */
  parseStatus: "pending" | "parsed" | "failed";
  /** 못 읽은 사유(parseStatus가 failed일 때) */
  parseError: string | null;
  /** 읽은 글 수(parsed일 때) */
  chars: number | null;
}

const MAX_BYTES = 50 * 1024 * 1024;

async function cardFor(uid: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("cards").select("id, uid, team_id").eq("uid", uid).maybeSingle();
  return { supabase, card: data };
}

export async function listCardMaterials(uid: string): Promise<{ ok: boolean; items: CardMaterial[]; canEdit: boolean; message?: string }> {
  const me = await requireUser("/cards");
  const { supabase, card } = await cardFor(uid);
  if (!card) return { ok: false, items: [], canEdit: false, message: "카드를 찾을 수 없습니다." };
  const { data } = await supabase
    .from("card_materials")
    .select("id, file_name, mime_type, bytes, storage_path, created_at, parse_status, parse_error, parsed_chars")
    .eq("card_id", card.id)
    .order("created_at", { ascending: false });
  const rows = data ?? [];
  const { data: signed } = rows.length ? await supabase.storage.from("card-materials").createSignedUrls(rows.map((r) => r.storage_path), 600) : { data: [] };
  const canEdit = me.role !== "dept_user" || (me.team?.id ?? -1) === card.team_id;
  return {
    ok: true,
    canEdit,
    items: rows.map((r, i) => ({
      id: r.id,
      fileName: r.file_name,
      mimeType: r.mime_type,
      bytes: r.bytes,
      createdAt: r.created_at,
      url: signed?.[i]?.signedUrl ?? null,
      parseStatus: (r.parse_status ?? "pending") as "pending" | "parsed" | "failed",
      parseError: r.parse_error ?? null,
      chars: r.parsed_chars ?? null,
    })),
  };
}

export async function startCardMaterialUpload(uid: string, fileName: string, bytes: number): Promise<{ ok: true; path: string; token: string } | { ok: false; message: string }> {
  await requireUser("/cards");
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  if (!fileName || bytes <= 0) return { ok: false, message: "파일을 골라 주세요." };
  if (bytes > MAX_BYTES) return { ok: false, message: "파일은 50MB 이하만 올릴 수 있습니다." };
  const { supabase, card } = await cardFor(uid);
  if (!card) return { ok: false, message: "카드를 찾을 수 없습니다." };
  const path = `${card.uid}/${randomUUID()}${safeExt(fileName)}`;
  const { data, error } = await supabase.storage.from("card-materials").createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: "올릴 수 없습니다(자기 부서 카드에만 올립니다)." };
  return { ok: true, path: data.path, token: data.token };
}

/**
 * 올린 파일을 목록에 등록. id = 새 자료 번호. 등록할 때 kordoc으로 한 번 읽어 전체 글을 함께 저장합니다(참고자료 설계 1단계 — AI 요청 때는 저장본만 씀).
 * 못 읽는 파일도 등록은 되고 parseError로 「AI가 못 읽음」 사유를 돌려줌. 이미지·스캔 PDF는 그림 설명으로 글을 만듦(4단계, API 경로에서만 — CLI로 돌면 보류).
 * 저장소에서 못 내려받거나 그림 설명을 못 만들면 읽기를 미뤄 두고(pending) 요청 때 다시 읽음
 */
export async function finishCardMaterialUpload(uid: string, path: string, fileName: string, mime: string, bytes: number): Promise<{ ok: boolean; message?: string; id?: string; parseError?: string }> {
  const me = await requireUser("/cards");
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const { supabase, card } = await cardFor(uid);
  if (!card || !path.startsWith(`${card.uid}/`)) return { ok: false, message: "경로가 올바르지 않습니다." };
  const name = fileName.slice(0, 300);
  const parsed = await parseStored(supabase, "card-materials", path, name);
  const { data, error } = await supabase
    .from("card_materials")
    .insert({ card_id: card.id, storage_path: path, file_name: name, mime_type: mime.slice(0, 200) || null, bytes, uploaded_by: me.id, ...(parsed.sha256 ? parseColumns(parsed) : {}) })
    .select("id")
    .single();
  if (error || !data) {
    console.error("finishCardMaterialUpload", error?.message);
    return { ok: false, message: "목록에 등록하지 못했습니다." };
  }
  await recordDescribe(supabase, parsed, { userId: me.id, cardId: card.id }); // 그림 설명을 만들었으면 그 호출(토큰)을 남김
  // 실패와 보류(그림 설명은 API 경로에서만 — CLI로 돌면 나중에 읽음) 모두 사유를 돌려줘 「AI가 못 읽음」으로 보임
  return { ok: true, id: String(data.id), ...(parsed.status !== "parsed" && parsed.sha256 ? { parseError: parsed.error ?? "읽지 못했습니다" } : {}) };
}

export async function deleteCardMaterial(id: string): Promise<{ ok: boolean; message?: string }> {
  await requireUser("/cards");
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const supabase = await createClient();
  const { data: row } = await supabase.from("card_materials").select("id, card_id, storage_path").eq("id", id).maybeSingle();
  if (!row) return { ok: false, message: "자료를 찾을 수 없습니다." };
  const { data, error } = await supabase.from("card_materials").delete().eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, message: "지우지 못했습니다(자기 부서 카드만)." };
  await supabase.storage.from("card-materials").remove([row.storage_path]);
  return { ok: true };
}
