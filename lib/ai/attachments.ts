import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parse } from "kordoc";
import { isRetryableDescribeError } from "./describe.ts";
import { aiUsageColumns } from "./pricing.ts";
import { type ReadDeps, readAttachmentWith } from "./read-attachment.ts";
import { AttachmentError, type MaterialDoc, type MaterialRow, type ParseOutcome, materialState, parseColumns } from "./material-text.ts";
import { AiUnavailableError, aiErrorMessage, callDescribe } from "./run.ts";
import { ATTACH_LABEL, isAttachableName } from "./writer.ts";

// 첨부(카드 전용 자료·보고서 추가자료) 읽기. 한글(HWP·HWPX)·PDF·워드·엑셀을 kordoc으로 글(마크다운)로 바꾸고, 이미지와 글 없는 스캔 PDF는 그림 설명으로 글을 만듭니다(4단계).
// 참고자료 설계 1단계: 올릴 때 한 번 읽어 전체 글을 저장하고(finish*Upload), AI 요청 때는 저장본만 씀 — 자르지 않음.
// 글이 있는 PDF는 글만 씁니다(D2 — 원본 문서로 보내지 않음). 그래서 API·CLI 두 경로와 숫자 대조가 같은 글을 봅니다. 판단은 lib/ai/read-attachment.ts(순수).

export { ATTACH_LABEL, AttachmentError };
export const isAttachable = isAttachableName;

/** 실제 의존성: kordoc + 그림 설명(API 전용 — CLI로 돌면 unavailable → 보류) */
const realDeps: ReadDeps = {
  async kordoc(bytes) {
    const res = await parse(Buffer.from(bytes), { images: false });
    return res.success ? { ok: true, markdown: res.markdown } : { ok: false, code: res.code ?? "형식 오류" };
  },
  async describe(input) {
    try {
      const c = await callDescribe(input);
      return { ok: true, description: c.description, model: c.model, usage: c.usage };
    } catch (e) {
      if (e instanceof AiUnavailableError) return { ok: false, unavailable: true, error: e.message };
      // 크레딧 부족·속도 제한·서버·연결·키 문제는 일시적이라 보류(나중에 다시), 첨부 자체가 받아들여지지 않는 오류만 실패로 굳힘
      const retry = isRetryableDescribeError({ status: e instanceof Anthropic.APIError ? e.status : undefined, message: e instanceof Error ? e.message : "", connection: e instanceof Anthropic.APIConnectionError });
      return { ok: false, unavailable: retry, error: `그림 설명을 만들지 못했습니다 — ${aiErrorMessage(e)}${retry ? " (나중에 다시 읽습니다)" : ""}` };
    }
  },
  isAttachable,
  attachLabel: ATTACH_LABEL,
};

/** 파일 하나 읽기 — 던지지 않고 실패도 결과로(올리기·요청을 막지 않고 「AI가 못 읽음」으로 표시) */
export async function parseAttachment(bytes: Uint8Array, name: string): Promise<ParseOutcome> {
  return readAttachmentWith(bytes, name, realDeps);
}

/** 그림 설명을 만들었으면 그 호출(모델·토큰)을 ai_requests에 남김(본문은 저장 안 함, 기록 실패는 무시). 호출 기록이 있을 때만 */
export async function recordDescribe(supabase: SupabaseClient, o: ParseOutcome, ctx: { userId: string; cardId?: string | null }): Promise<void> {
  if (!o.describe) return;
  try {
    await supabase.from("ai_requests").insert({
      user_id: ctx.userId,
      card_id: ctx.cardId ?? null,
      feature: "material_describe",
      model: o.describe.model,
      status: o.status === "parsed" ? "ok" : "error",
      error: o.status === "parsed" ? null : (o.error ?? "").slice(0, 200),
      ...aiUsageColumns(o.describe.usage),
      ...(o.describe.ms === undefined ? {} : { duration_ms: o.describe.ms, finished_at: new Date().toISOString() }),
    });
  } catch {
    // 기록 실패는 올리기·요청을 막지 않음
  }
}

/** 저장소에 올린 파일을 사용자 권한으로 내려받아 읽기 */
export async function parseStored(supabase: SupabaseClient, bucket: string, path: string, name: string): Promise<ParseOutcome> {
  const { data: blob, error } = await supabase.storage.from(bucket).download(path);
  if (error || !blob) return { status: "failed", text: "", error: "저장소에서 파일을 읽지 못했습니다", sha256: "" };
  return parseAttachment(new Uint8Array(await blob.arrayBuffer()), name);
}

/**
 * 요청 때 첨부 글 모으기(행 순서대로). 저장본이 같은 판이면 그대로 쓰고, 아직 안 읽었거나 판이 다르면 읽어서 저장을 시도합니다
 * (읽을 수만 있고 쓸 수 없는 사람이면 권한이 막아 저장은 안 되지만 이번 요청에는 그대로 씀). 못 읽은 자료는 failed로 돌려줌.
 */
export async function loadMaterialTexts(
  supabase: SupabaseClient,
  table: "card_materials" | "report_materials",
  rows: MaterialRow[],
): Promise<{ docs: MaterialDoc[]; failed: Array<{ id: string; name: string; error: string }> }> {
  const kind = table === "card_materials" ? "card" : "report";
  const bucket = table === "card_materials" ? "card-materials" : "report-materials";
  const docs: MaterialDoc[] = [];
  const failed: Array<{ id: string; name: string; error: string }> = [];
  for (const r of rows) {
    const id = String(r.id);
    const state = materialState(r);
    if (state === "ready") {
      docs.push({ id, kind, name: r.file_name, text: r.parsed_text ?? "" });
      continue;
    }
    if (state === "failed") {
      failed.push({ id, name: r.file_name, error: r.parse_error ?? "읽지 못했습니다" });
      continue;
    }
    const o = await parseStored(supabase, bucket, r.storage_path, r.file_name);
    // 저장 실패(권한 없음 등)는 무시 — 다음 요청에서 다시 읽음. 보류(pending)도 저장해 사유를 보이되 같은 판이어도 요청 때 다시 읽어 봄
    if (o.sha256) await supabase.from(table).update(parseColumns(o)).eq("id", id);
    if (o.describe) {
      const { data: u } = await supabase.auth.getUser(); // 요청 때 처음 만든 그림 설명의 비용을 그 사용자 이름으로 남김
      if (u.user) await recordDescribe(supabase, o, { userId: u.user.id });
    }
    if (o.status === "parsed") docs.push({ id, kind, name: r.file_name, text: o.text });
    else failed.push({ id, name: r.file_name, error: o.error ?? "읽지 못했습니다" });
  }
  return { docs, failed };
}

/** 이 컴퓨터의 파일을 첨부처럼 읽기(연기 시험 스크립트 전용) — 못 읽으면 AttachmentError */
export async function readAttachment(bytes: Uint8Array, name: string, kind: MaterialDoc["kind"] = "card"): Promise<MaterialDoc> {
  const o = await parseAttachment(bytes, name);
  if (o.status !== "parsed") throw new AttachmentError(`「${name}」 — ${o.error}`);
  return { id: name, kind, name, text: o.text };
}
