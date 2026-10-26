import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { fillFrom } from "../prompts/template.ts";
import { describePrompts } from "../prompts/sets.ts";
import {
  DESCRIBE_IMAGE_MAX_BYTES,
  DESCRIBE_MARK,
  DESCRIBE_PDF_MAX_BYTES,
  DESCRIBE_TEXT_MAX_CHARS,
  SCANNED_TEXT_MIN_CHARS,
  cleanDescription,
  describeKindFor,
  describeLimitError,
  describeResultSchema,
  describedText,
  imageMime,
  isDescribedText,
  isImageName,
  isRetryableDescribeError,
} from "./describe.ts";

test("이미지 형식: jpg·jpeg·png·webp·gif만(대소문자 무시), 점이 없으면 이미지가 아님, 형식별 mime", () => {
  for (const n of ["a.jpg", "A.JPEG", "b.png", "c.webp", "d.GIF"]) assert.ok(isImageName(n), n);
  for (const n of ["a.pdf", "a.hwpx", "jpg", "a.bmp", "사진.tiff"]) assert.ok(!isImageName(n), n);
  assert.equal(imageMime("a.JPG"), "image/jpeg");
  assert.equal(imageMime("a.jpeg"), "image/jpeg");
  assert.equal(imageMime("a.png"), "image/png");
  assert.equal(imageMime("a.pdf"), null);
});

test("그림 설명 대상 판정: 이미지는 늘, PDF는 kordoc 글이 거의 없을 때만(읽기 전 null이면 안 봄), 그 밖은 글로 읽음", () => {
  assert.equal(describeKindFor("현장.jpg", null), "image");
  assert.equal(describeKindFor("현장.png", 5000), "image", "이미지는 글 길이와 상관없음");
  assert.equal(describeKindFor("스캔.pdf", 0), "pdf");
  assert.equal(describeKindFor("스캔.PDF", SCANNED_TEXT_MIN_CHARS - 1), "pdf");
  assert.equal(describeKindFor("글자.pdf", SCANNED_TEXT_MIN_CHARS), null, "기준 이상이면 글로 읽은 PDF");
  assert.equal(describeKindFor("스캔.pdf", null), null, "kordoc으로 읽기 전에는 PDF를 판정하지 않음");
  assert.equal(describeKindFor("a.hwp", 0), null, "한글 파일은 그림 설명 대상이 아님");
});

test("API 한도: 이미지 5MB·PDF 30MB를 넘으면 사람이 읽을 문장, 안이면 null", () => {
  assert.equal(describeLimitError("image", DESCRIBE_IMAGE_MAX_BYTES), null);
  assert.match(describeLimitError("image", DESCRIBE_IMAGE_MAX_BYTES + 1)!, /이미지가 너무 큽니다.*5MB/);
  assert.equal(describeLimitError("pdf", DESCRIBE_PDF_MAX_BYTES), null);
  assert.match(describeLimitError("pdf", DESCRIBE_PDF_MAX_BYTES + 1)!, /스캔 PDF가 너무 큽니다.*30MB/);
});

test("설명 글 표지: 머리에 「원본이 아니다」를 밝히고 종류(그림·스캔한 문서 쪽)가 다르며, 저장된 글이 그림 설명인지 알아볼 수 있다", () => {
  const img = describedText("막대그래프: 2025 30,706건", "image");
  assert.ok(img.startsWith(DESCRIBE_MARK) && isDescribedText(img));
  assert.match(img, /AI가 그림을 보고 적은 글.*원본 글이 아니며.*잘못 읽었을 수/);
  assert.ok(img.endsWith("막대그래프: 2025 30,706건"), "설명은 표지 뒤에 그대로");
  assert.match(describedText("1쪽", "pdf"), /AI가 스캔한 문서 쪽을 보고/);
  assert.ok(!isDescribedText("일반 본문 글"));
});

test("설명 검사: 너무 짧으면 실패, 앞뒤 공백은 뗌, 최대 글자 수를 넘으면 자르지 않고 실패", () => {
  assert.deepEqual(cleanDescription("  현장 사진: 철탑 작업자 2명  "), { ok: true, text: "현장 사진: 철탑 작업자 2명" });
  assert.equal(cleanDescription("짧음").ok, false);
  assert.equal(cleanDescription("   \n  ").ok, false);
  assert.equal(cleanDescription("가".repeat(DESCRIBE_TEXT_MAX_CHARS)).ok, true);
  const long = cleanDescription("가".repeat(DESCRIBE_TEXT_MAX_CHARS + 1));
  assert.equal(long.ok, false);
  assert.match((long as { error: string }).error, /너무 깁니다/);
});

test("프롬프트: describe-image 시스템·요청·필드 설명이 모두 있고 요청 글의 자리표시가 채워지며 답 스키마에 설명이 붙는다", () => {
  const { prompts, schema } = describePrompts();
  assert.match(fillFrom(prompts, "system", "system"), /지어내지 않습니다/);
  const req = fillFrom(prompts, "request", "prompt", { name: "현장.jpg", kind: "이미지" });
  assert.match(req, /「현장\.jpg」\(이미지\)/);
  assert.ok(!/\{\{/.test(req), "자리표시가 남지 않음");
  assert.ok(!/\{\{/.test(fillFrom(prompts, "system", "system")));
  assert.equal(describeResultSchema().safeParse({ description: "x" }).success, true);
  const descOf = (sch: z.ZodType) => ((z.toJSONSchema(sch) as { properties?: Record<string, { description?: string }> }).properties ?? {}).description?.description;
  assert.match(descOf(schema) ?? "", /판독 불가/, "schema.md의 필드 설명이 모델용 스키마에 붙음");
  assert.equal(descOf(describeResultSchema()), undefined, "설명 없는 스키마(타입·검증용)에는 지시문이 없음");
});

test("다시 해 볼 오류(보류)와 굳힐 오류(실패): 크레딧 부족·속도 제한·서버 오류·연결·키 문제는 보류, 첨부가 잘못된 400·413 등은 실패", () => {
  const credit = "400 Your credit balance is too low to access the Anthropic API";
  assert.ok(isRetryableDescribeError({ status: 400, message: credit }), "크레딧 부족은 결제 문제라 나중에 다시");
  assert.ok(isRetryableDescribeError({ status: 429, message: "rate_limit" }));
  assert.ok(isRetryableDescribeError({ status: 500, message: "internal" }));
  assert.ok(isRetryableDescribeError({ status: 529, message: "overloaded" }));
  assert.ok(isRetryableDescribeError({ status: 401, message: "invalid x-api-key" }));
  assert.ok(isRetryableDescribeError({ status: 403, message: "forbidden" }));
  assert.ok(isRetryableDescribeError({ message: "ECONNRESET", connection: true }));
  assert.ok(!isRetryableDescribeError({ status: 400, message: "image exceeds 5 MB maximum" }), "첨부가 잘못된 400은 다시 해도 같음");
  assert.ok(!isRetryableDescribeError({ status: 413, message: "request_too_large" }));
  assert.ok(!isRetryableDescribeError({ message: "Error: 알 수 없는 오류" }), "상태 코드가 없고 연결 오류도 아니면 굳힘");
});
