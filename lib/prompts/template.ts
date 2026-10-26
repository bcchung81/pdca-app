// AI 프롬프트 파일(resources/prompts/<기능>/*.md) 풀이 규칙(순수) — 절 표지로 나누고 {{이름}}을 채웁니다.
// 파일 읽기는 서버 모듈(load.ts)이 하고, 여기는 글만 다룹니다. 편집 규칙은 resources/prompts/README.md.

import type { z } from "zod";

/** 절 표지: 한 줄 전체가 `<!-- @이름 -->` */
const SECTION_MARK = /^<!-- @([\w.-]+) -->$/;

/** 절 글 끝의 빈 줄을 걷음(줄 끝 빈칸은 둠) */
export const trimSection = (s: string) => s.replace(/\n\s*$/, "");

/** 파일 글 → 절 이름별 글. 첫 표지 위는 편집자 메모라 버림. 같은 이름이 두 번이면 오류 */
export function parseSections(text: string, file: string): Record<string, string> {
  const out: Record<string, string> = {};
  let key: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (key === null) return;
    if (key in out) throw new Error(`프롬프트 ${file}: 절 「${key}」이 두 번 있습니다.`);
    out[key] = trimSection(buf.join("\n"));
  };
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const m = SECTION_MARK.exec(line);
    if (m) {
      flush();
      key = m[1];
      buf = [];
    } else if (key !== null) buf.push(line);
  }
  flush();
  return out;
}

/** 필요한 절이 모두 있는지(없으면 오류) */
export function requireSections(sections: Record<string, string>, keys: readonly string[], file: string): void {
  const missing = keys.filter((k) => !(k in sections));
  if (missing.length) throw new Error(`프롬프트 ${file}: 절이 없습니다 — ${missing.join(", ")}`);
}

/** 절 하나 꺼내기(없으면 오류) */
export function section(sections: Record<string, string>, key: string, file: string): string {
  const s = sections[key];
  if (s === undefined) throw new Error(`프롬프트 ${file}: 절 「${key}」이 없습니다.`);
  return s;
}

/** 끼움: `{{> 파일#절}}` — 다른 프롬프트 파일(resources/prompts 기준 경로)의 절 글을 그 자리에 넣음. 끼운 글 안의 끼움도 풀고(3단계까지), 돌고 도는 끼움은 오류 */
const INCLUDE = /\{\{>\s*([\w./-]+\.md)#([\w.-]+)\s*\}\}/g;

export function expandIncludes(text: string, read: (file: string, key: string) => string, where: string, depth = 0, seen: string[] = []): string {
  return text.replace(INCLUDE, (_, file: string, key: string) => {
    const id = `${file}#${key}`;
    if (seen.includes(id) || depth >= 3) throw new Error(`프롬프트 ${where}: 끼움 {{> ${id}}}이 돌고 돕니다(또는 3단계를 넘음).`);
    return expandIncludes(read(file, key), read, id, depth + 1, [...seen, id]);
  });
}

/** {{이름}} 채우기 — 한 번에 바꿔 넣은 값은 다시 훑지 않음. 값이 없는 이름은 오류 */
export function fill(template: string, vars: Record<string, string | number>, where: string): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    if (!Object.hasOwn(vars, k)) throw new Error(`프롬프트 ${where}: {{${k}}}에 넣을 값이 없습니다.`);
    return String(vars[k]);
  });
}

/** 필드 설명 묶음(schema.md 절 이름 = 필드 경로) */
export type Descriptions = Record<string, string>;

/** 필드 설명 붙이기 — 묶음이 없으면(타입·검증용 스키마) 그대로 */
export function described<T extends z.ZodType>(schema: T, desc: Descriptions | undefined, key: string): T {
  return desc ? (schema.describe(section(desc, key, "schema.md")) as T) : schema;
}

/** 한 기능의 프롬프트 묶음(resources/prompts/<기능>/system.md·request.md·schema.md를 절로 나눈 것) */
export interface PromptSet {
  feature: string;
  /** <기능>@ + 세 파일 내용 해시 앞 8자 — 어떤 판으로 부른 것인지 추적 */
  version: string;
  system: Record<string, string>;
  request: Record<string, string>;
  schema: Descriptions;
}

/** 기능마다 파일에 있어야 하는 절(없으면 불러올 때 오류, 남는 절은 테스트가 짚음) */
export interface PromptSpec {
  system: readonly string[];
  request: readonly string[];
  schema: readonly string[];
}

/** 묶음의 절 하나를 채움 — 오류 메시지에 파일·절 이름 */
export function fillFrom(p: PromptSet, file: "system" | "request", key: string, vars: Record<string, string | number> = {}): string {
  return fill(section(p[file], key, `${p.feature}/${file}.md`), vars, `${p.feature}/${file}.md @${key}`);
}
