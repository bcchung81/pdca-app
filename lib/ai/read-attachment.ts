// 첨부 하나 읽기의 판단(참고자료 4단계, docs/reference-materials.md §4.5) — 순수 함수. kordoc·모델 호출은 deps로 받아 시험에서 바꿔 끼운다(실제 연결은 lib/ai/attachments.ts).
//  · 이미지 첨부(JPG·PNG·WebP·GIF): kordoc으로 읽지 않고 그림 설명으로 글을 만든다
//  · 그 밖: kordoc으로 글을 읽고, PDF인데 글이 거의 없으면(스캔 문서) PDF를 그림 설명으로 읽는다
//  · 그림 설명은 API 경로에서만 만든다(Claude Code CLI는 그림을 못 받음) — 못 만들면 pending(나중에 읽음), 모델·한도 문제는 failed
// 읽지 못해도 던지지 않고 결과로 돌려준다(올리기·요청을 막지 않고 「AI가 못 읽음」으로 표시).

import { createHash } from "node:crypto";
import { type DescribeInput, SCANNED_TEXT_MIN_CHARS, cleanDescription, describeKindFor, describeLimitError, describedText, imageMime } from "./describe.ts";
import type { DescribeInfo, ParseOutcome } from "./material-text.ts";

export type DescribeCallResult = { ok: true; description: string; model: string; usage: DescribeInfo["usage"] } | { ok: false; unavailable: boolean; error: string };

export interface ReadDeps {
  /** kordoc으로 글 읽기(마크다운) */
  kordoc(bytes: Uint8Array): Promise<{ ok: true; markdown: string } | { ok: false; code: string }>;
  /** 그림 설명 만들기(API 전용 — 못 만들면 unavailable) */
  describe(input: DescribeInput): Promise<DescribeCallResult>;
  isAttachable(name: string): boolean;
  /** 허용 형식 안내 글(「PDF·한글…」) */
  attachLabel: string;
}

export async function readAttachmentWith(bytes: Uint8Array, name: string, deps: ReadDeps): Promise<ParseOutcome> {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const failed = (error: string, describe?: DescribeInfo): ParseOutcome => ({ status: "failed", text: "", error, sha256, ...(describe ? { describe } : {}) });
  if (!deps.isAttachable(name)) return failed(`AI가 읽는 형식이 아닙니다(${deps.attachLabel}만)`);

  /** 그림 설명으로 읽기 */
  const describeIt = async (kind: "image" | "pdf"): Promise<ParseOutcome> => {
    const limit = describeLimitError(kind, bytes.byteLength);
    if (limit) return failed(limit);
    const mime = kind === "pdf" ? "application/pdf" : imageMime(name);
    if (!mime) return failed("이미지 형식을 알 수 없습니다");
    const t0 = Date.now();
    const r = await deps.describe({ kind, mime, bytes, name });
    if (!r.ok) return r.unavailable ? { status: "pending", text: "", error: r.error, sha256 } : failed(r.error);
    const info: DescribeInfo = { model: r.model, usage: r.usage, ms: Date.now() - t0 };
    const clean = cleanDescription(r.description);
    if (!clean.ok) return failed(clean.error, info);
    return { status: "parsed", text: describedText(clean.text, kind), error: null, sha256, describe: info };
  };

  if (describeKindFor(name, null) === "image") return describeIt("image");
  try {
    const res = await deps.kordoc(bytes);
    if (!res.ok) return failed(`읽지 못했습니다(${res.code}) — 다른 이름으로 저장해 다시 올려 주세요`);
    const text = res.markdown.trim();
    if (describeKindFor(name, text.length) === "pdf") return describeIt("pdf"); // 글이 거의 없는 PDF = 스캔 문서
    if (!text) return failed("글자를 읽지 못했습니다 — 글자가 있는 파일로 올려 주세요");
    return { status: "parsed", text, error: null, sha256 };
  } catch {
    return failed("읽지 못했습니다 — 파일이 손상되었거나 암호가 걸려 있는지 확인해 주세요");
  }
}

export { SCANNED_TEXT_MIN_CHARS };
