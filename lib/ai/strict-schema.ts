// OpenAI 엄격 구조화 출력(strict) 스키마 변환(순수 — 평가 전용 Codex 경로 lib/ai/codex-cli.ts만 씀).
// 엄격 모드는 모든 객체에 additionalProperties:false와 「모든 속성이 required」를 요구하고 선택(optional) 속성을 받지 않음.
// 그래서 zod → JSON 스키마(draft-7)의 선택 속성을 「필수 + null 허용」으로 바꿔 보내고, 답의 null은 원래 스키마의 선택 속성일 때만 「속성 없음」으로 되돌림
// (되돌린 답은 원래 zod 스키마로 그대로 검사 — 프롬프트·스키마·후처리는 Claude 경로와 같음).

type Node = Record<string, unknown>;

/** 엄격 모드가 받는 키워드(이 밖의 것이 나오면 조용히 지우지 않고 멈춤 — 모델이 받는 제약이 Claude 경로와 달라지지 않게) */
const ALLOWED = new Set(["type", "properties", "required", "additionalProperties", "items", "enum", "const", "anyOf", "description", "pattern", "format", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minItems", "maxItems"]);

const isNode = (v: unknown): v is Node => typeof v === "object" && v !== null && !Array.isArray(v);

function strictNode(n: Node, path: string): Node {
  const out: Node = {};
  for (const [k, v] of Object.entries(n)) {
    if (k === "$schema") continue;
    if (!ALLOWED.has(k)) throw new Error(`엄격 스키마로 바꿀 수 없는 키워드: ${path || "/"} ${k}`);
    out[k] = v;
  }
  if (Array.isArray(n.anyOf)) out.anyOf = n.anyOf.map((x, i) => strictNode(x as Node, `${path}/anyOf/${i}`));
  if (isNode(n.items)) out.items = strictNode(n.items, `${path}/items`);
  if (n.type === "object") {
    if (!isNode(n.properties)) throw new Error(`엄격 스키마는 속성이 정해지지 않은 객체를 받지 않습니다: ${path || "/"}`);
    const required = new Set(Array.isArray(n.required) ? (n.required as string[]) : []);
    const props: Node = {};
    for (const [k, v] of Object.entries(n.properties)) {
      const child = strictNode(v as Node, `${path}/${k}`);
      props[k] = required.has(k) ? child : nullable(child);
    }
    out.properties = props;
    out.required = Object.keys(props);
    out.additionalProperties = false;
  }
  return out;
}

/** 선택 속성 → null도 받는 속성(설명은 바깥에 둠 — 모델이 읽는 설명이 그대로 보이게) */
function nullable(n: Node): Node {
  const { description, ...rest } = n;
  return { ...(description === undefined ? {} : { description }), anyOf: [rest, { type: "null" }] };
}

/** JSON 스키마(zod toJSONSchema draft-7) → 엄격 모드 스키마. 원본은 바꾸지 않음 */
export function toStrictSchema(schema: object): object {
  return strictNode(schema as Node, "");
}

/** 엄격 스키마로 받은 답 → 원래 스키마 모양: 원래 선택 속성의 null만 지움(필수 속성의 null·그 밖의 값은 그대로 — 원래 zod 검사가 판단) */
export function fromStrict(value: unknown, schema: object): unknown {
  const s = schema as Node;
  if (Array.isArray(value)) return isNode(s.items) ? value.map((v) => fromStrict(v, s.items as Node)) : value;
  if (!isNode(value) || !isNode(s.properties)) return value;
  const required = new Set(Array.isArray(s.required) ? (s.required as string[]) : []);
  const out: Node = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === null && !required.has(k)) continue;
    const child = (s.properties as Node)[k];
    out[k] = isNode(child) ? fromStrict(v, child) : v;
  }
  return out;
}
