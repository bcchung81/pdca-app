// OpenAI 엄격 스키마 변환(평가 전용 Codex 경로): 경평 구성안·집필·고치기 스키마 전부가 엄격 규칙을 지키게 바뀌는지, 되돌린 답이 원래 zod 스키마를 통과하는지(네트워크 없음)
import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { reportDraftPrompts, reportDraftPromptsMg, reportOutlinePrompts, reportOutlinePromptsMg } from "../prompts/sets.ts";
import { sectionOutputSchema } from "../reports/section.ts";
import { fromStrict, toStrictSchema } from "./strict-schema.ts";

type Node = Record<string, unknown>;

/** run.ts cliSchema와 같은 변환(draft-7, $schema 뺌) */
const jsonOf = (s: z.ZodType) => {
  const j = z.toJSONSchema(s, { target: "draft-7" }) as Node;
  delete j.$schema;
  return j;
};

/** 엄격 규칙 위반 목록: 모든 객체는 속성이 정해지고 전부 required·additionalProperties false, $ref·oneOf·allOf·not·default·$schema 없음, 맨 위는 객체 */
function strictIssues(n: unknown, path = ""): string[] {
  if (Array.isArray(n)) return n.flatMap((x, i) => strictIssues(x, `${path}/${i}`));
  if (!n || typeof n !== "object") return [];
  const o = n as Node;
  const out: string[] = [];
  for (const k of ["$ref", "oneOf", "allOf", "not", "default", "$schema", "minLength", "maxLength"]) if (k in o) out.push(`${path} ${k}`);
  if (o.type === "object") {
    const props = Object.keys((o.properties as Node) ?? {});
    if (!o.properties) out.push(`${path} 속성 없음`);
    if (o.additionalProperties !== false) out.push(`${path} additionalProperties`);
    const req = new Set((o.required as string[]) ?? []);
    for (const p of props) if (!req.has(p)) out.push(`${path}/${p} required 아님`);
  }
  for (const [k, v] of Object.entries(o)) if (k === "properties") for (const [p, c] of Object.entries(v as Node)) out.push(...strictIssues(c, `${path}/${p}`));
  else if (k !== "enum" && k !== "required") out.push(...strictIssues(v, `${path}/${k}`));
  return out;
}

/** 엄격 스키마를 따르는 가장 작은 답(선택 속성은 null — 모델이 「안 씀」을 고른 경우) */
function sample(n: Node): unknown {
  if (Array.isArray(n.anyOf)) return null;
  if (Array.isArray(n.enum)) return n.enum[0];
  switch (n.type) {
    case "object":
      return Object.fromEntries(Object.entries(n.properties as Node).map(([k, v]) => [k, sample(v as Node)]));
    case "array":
      return [sample(n.items as Node)];
    case "string":
      return "가";
    case "number":
    case "integer":
      return 1;
    case "boolean":
      return true;
    default:
      return null;
  }
}

const SCHEMAS: Record<string, z.ZodType> = {
  "경평 구성안": reportOutlinePrompts().schema,
  "경평 집필·고치기(틀 고름)": reportDraftPrompts().schema,
  "경평 집필·고치기(승인된 구성안 틀)": sectionOutputSchema(reportDraftPrompts().prompts.schema, "단계 전개형"),
  "경영관리 구성안": reportOutlinePromptsMg().schema,
  "경영관리 집필": reportDraftPromptsMg().schema,
};

test("주요사업 구성안·집필 스키마는 그대로는 엄격 모드가 거절(선택 속성) — 변환이 필요한 까닭", () => {
  assert.ok(strictIssues(jsonOf(SCHEMAS["경평 구성안"])).some((x) => x.includes("required 아님")));
  assert.ok(strictIssues(jsonOf(SCHEMAS["경평 집필·고치기(틀 고름)"])).some((x) => x.includes("required 아님")));
});

for (const [name, schema] of Object.entries(SCHEMAS)) {
  test(`엄격 스키마 변환: ${name} — 규칙을 지키고 원래 스키마는 그대로`, () => {
    const orig = jsonOf(schema);
    const before = JSON.stringify(orig);
    const strict = toStrictSchema(orig);
    assert.deepEqual(strictIssues(strict), []);
    assert.equal((strict as Node).type, "object");
    assert.equal(JSON.stringify(orig), before, "원본을 바꾸지 않음");
  });

  test(`엄격 스키마 되돌리기: ${name} — 선택 속성 null을 지운 답이 원래 zod 스키마를 통과`, () => {
    const orig = jsonOf(schema);
    const strict = toStrictSchema(orig);
    const answer = sample(strict as Node);
    // 선택 속성이 있는 스키마(주요사업 구성안·집필 — 원래 그대로는 엄격 모드가 거절)는 null이 남은 답을 원래 스키마도 거절 → 되돌리기가 필요함
    if (strictIssues(orig).length) assert.equal(schema.safeParse(answer).success, false, "null이 남은 답은 원래 스키마가 거절");
    else assert.deepEqual(strict, orig, "선택 속성이 없으면 변환해도 같음");
    const back = fromStrict(answer, orig);
    const r = schema.safeParse(back);
    assert.ok(r.success, r.success ? "" : r.error.message);
  });
}

test("엄격 스키마: 선택 속성은 필수 + null 허용(설명은 바깥), 선택 속성의 값이 있으면 되돌려도 그대로", () => {
  const s = jsonOf(z.object({ a: z.string(), b: z.string().describe("설명").optional(), c: z.array(z.object({ d: z.enum(["x", "y"]).optional() })) }));
  const t = toStrictSchema(s) as Node;
  assert.deepEqual(t.required, ["a", "b", "c"]);
  assert.deepEqual((t.properties as Node).b, { description: "설명", anyOf: [{ type: "string" }, { type: "null" }] });
  assert.deepEqual(fromStrict({ a: "1", b: null, c: [{ d: null }, { d: "x" }] }, s), { a: "1", c: [{}, { d: "x" }] });
  assert.deepEqual(fromStrict({ a: "1", b: "2", c: [] }, s), { a: "1", b: "2", c: [] });
  // 필수 속성의 null은 지우지 않음(원래 zod 검사가 거절하게)
  assert.deepEqual(fromStrict({ a: null, c: [] }, s), { a: null, c: [] });
});

test("엄격 스키마: 받지 않는 모양(속성이 정해지지 않은 객체·모르는 키워드)은 조용히 바꾸지 않고 멈춤", () => {
  assert.throws(() => toStrictSchema(jsonOf(z.object({ m: z.record(z.string(), z.string()) }))), /속성이 정해지지 않은 객체|키워드/);
  assert.throws(() => toStrictSchema(jsonOf(z.object({ s: z.string().min(2) }))), /키워드: \/s minLength/);
});
