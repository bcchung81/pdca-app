// 첨부 그림 설명(참고자료 4단계, docs/reference-materials.md §4.5): 이미지 첨부와 글 없는 스캔 PDF를 light 모델이 보고 글로 옮겨 저장한다. 순수 함수 —
// 모델 호출은 lib/ai/run.ts(callDescribe, API 전용), 읽기 통로는 lib/ai/read-attachment.ts. 지시문은 resources/prompts/describe-image.
// CLI(`--tools ""`)는 그림을 받지 못하므로 API 경로에서만 만든다. 만든 글은 첨부의 전체 글(parsed_text)로 저장돼 두 경로·숫자 대조·인용 대조가 같은 글을 본다.

import { z } from "zod";
import { type Descriptions, type PromptSpec, described } from "../prompts/template.ts";
import { isCreditBalanceError } from "./provider.ts";

/** 그림 설명을 만드는 법(프롬프트·모델 규칙) 판 — 첨부 파서 판(material-text.ts PARSER_VERSION)에 같이 적혀 바뀌면 다시 만듦 */
export const DESCRIBE_VERSION = "describe-1";

/** API가 받는 이미지 형식 */
export const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif"] as const;
const IMAGE_MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
/** API 이미지 한도(장당 5MB). 줄이는 도구가 앱에 없어 넘으면 사람이 줄여 다시 올림 */
export const DESCRIBE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** API PDF 한도(32MB) 안 — 쪽 수 한도(100쪽)는 API가 거절하면 그 사유를 알림 */
export const DESCRIBE_PDF_MAX_BYTES = 30 * 1024 * 1024;
/** kordoc이 읽은 글이 이보다 적은 PDF는 스캔한 그림 문서로 봄 */
export const SCANNED_TEXT_MIN_CHARS = 50;
/** 설명 글자 수: 이보다 짧으면 비어 있다고 보고 실패, 길면 지시를 안 따른 것으로 실패(자르지 않음) */
export const DESCRIBE_TEXT_MIN_CHARS = 10;
export const DESCRIBE_TEXT_MAX_CHARS = 8000;
/** 저장된 첨부 글이 그림 설명인지 알아보는 머리 표지 */
export const DESCRIBE_MARK = "[그림 설명";

export type DescribeKind = "image" | "pdf";

/** API에 보낼 파일 하나 */
export interface DescribeInput {
  kind: DescribeKind;
  mime: string;
  bytes: Uint8Array;
  name: string;
}

const extOf = (name: string) => (name.includes(".") ? (name.toLowerCase().split(".").pop() ?? "") : "");

export const isImageName = (name: string) => (IMAGE_EXTS as readonly string[]).includes(extOf(name));
export const imageMime = (name: string): string | null => IMAGE_MIME[extOf(name)] ?? null;

/**
 * 이 파일을 그림 설명으로 읽어야 하나. 이미지 파일이면 늘 image, PDF는 kordoc이 읽은 글(textChars)이 거의 없을 때만 pdf(스캔 문서), 그 밖은 null(글로 읽음).
 * textChars가 null이면 아직 kordoc으로 읽기 전(이미지만 판정)
 */
export function describeKindFor(name: string, textChars: number | null): DescribeKind | null {
  if (isImageName(name)) return "image";
  if (extOf(name) === "pdf" && textChars !== null && textChars < SCANNED_TEXT_MIN_CHARS) return "pdf";
  return null;
}

/** API 한도를 넘으면 사람이 읽을 문장, 아니면 null */
export function describeLimitError(kind: DescribeKind, bytes: number): string | null {
  if (kind === "image" && bytes > DESCRIBE_IMAGE_MAX_BYTES) return `이미지가 너무 큽니다(최대 ${DESCRIBE_IMAGE_MAX_BYTES / 1024 / 1024}MB) — 크기를 줄여 다시 올려 주세요`;
  if (kind === "pdf" && bytes > DESCRIBE_PDF_MAX_BYTES) return `스캔 PDF가 너무 큽니다(최대 ${DESCRIBE_PDF_MAX_BYTES / 1024 / 1024}MB) — 나눠서 올리거나 글자가 있는 파일로 올려 주세요`;
  return null;
}

/** 모델이 적은 설명 → 저장할 첨부 글(머리 표지로 「원본이 아니다」를 밝힘) */
export function describedText(description: string, kind: DescribeKind): string {
  const what = kind === "pdf" ? "스캔한 문서 쪽" : "그림";
  return `${DESCRIBE_MARK} — AI가 ${what}을 보고 적은 글입니다. 원본 글이 아니며 글자·수치를 잘못 읽었을 수 있습니다]\n${description}`;
}

export const isDescribedText = (text: string) => text.startsWith(DESCRIBE_MARK);

/** 모델 답 검사 — 앞뒤 공백을 뗀 글이 너무 짧거나 길면 실패(자르지 않음) */
export function cleanDescription(raw: string): { ok: true; text: string } | { ok: false; error: string } {
  const text = raw.trim();
  if (text.length < DESCRIBE_TEXT_MIN_CHARS) return { ok: false, error: "그림 설명이 비어 있습니다" };
  if (text.length > DESCRIBE_TEXT_MAX_CHARS) return { ok: false, error: `그림 설명이 너무 깁니다(${text.length}자 — 최대 ${DESCRIBE_TEXT_MAX_CHARS}자)` };
  return { ok: true, text };
}

/** 프롬프트 파일(resources/prompts/describe-image)에 있어야 하는 절 */
export const DESCRIBE_PROMPT_SPEC: PromptSpec = {
  system: ["system"],
  request: ["prompt"],
  schema: ["description"],
};

/** 그림 설명 답 스키마. desc(schema.md)를 주면 모델에 보내는 필드 설명을 붙이고, 없으면 구조만 */
export function describeResultSchema(desc?: Descriptions) {
  return z.object({ description: described(z.string(), desc, "description") });
}
export type DescribeResult = z.infer<ReturnType<typeof describeResultSchema>>;

/**
 * 그림 설명 호출 오류가 「나중에 다시 해 보면 될 일시적·환경 문제」인가 — 맞으면 보류(pending)로 저장해 다음 요청 때 다시 읽고, 아니면 실패(failed)로 굳힘.
 * 실패로 저장하면 같은 파서 판에서는 다시 안 읽으므로, 크레딧 부족·속도 제한·서버 오류·키 문제 때문에 파일이 영영 「AI가 못 읽음」이 되면 안 된다.
 * 다시 해도 같은 결과일 오류(첨부가 잘못됨 — 400, 413 등)만 실패
 */
export function isRetryableDescribeError(e: { status?: number; message: string; connection?: boolean }): boolean {
  if (e.connection) return true;
  if (e.status === undefined) return false;
  if (e.status === 429 || e.status >= 500 || e.status === 401 || e.status === 403) return true;
  return e.status === 400 && isCreditBalanceError(e.message);
}
