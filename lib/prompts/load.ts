// AI 프롬프트 파일 읽기(서버·스크립트·테스트) — resources/prompts/<기능>/system.md·request.md·schema.md.
// 풀이 규칙은 template.ts(순수). 운영(Vercel)에는 next.config.ts outputFileTracingIncludes로 함께 실립니다.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type PromptSet, type PromptSpec, expandIncludes, parseSections, requireSections, section } from "./template.ts";

export const PROMPT_ROOT = "resources/prompts";
export const PROMPT_FILES = ["system", "request", "schema"] as const;

const readText = (file: string) => readFileSync(join(process.cwd(), PROMPT_ROOT, file), "utf8");

/** 끼울 절 하나(_shared 등 다른 파일의 절) */
function includeSection(file: string, key: string): string {
  return section(parseSections(readText(file), file), key, file);
}

/** 한 기능 폴더를 읽어 절로 나누고 절 글의 끼움을 풀고, 필요한 절이 모두 있는지 봄.
 * 판 해시는 끼움을 푼 절 글로 — AI에 가는 글이 바뀔 때만 바뀜(편집자 메모는 빼고, 공통 조각을 고치면 바뀜) */
export function readPromptSet(feature: string, spec: PromptSpec): PromptSet {
  const [system, request, schema] = PROMPT_FILES.map((f) => {
    const where = `${feature}/${f}.md`;
    const sections = Object.fromEntries(Object.entries(parseSections(readText(where), where)).map(([k, v]) => [k, expandIncludes(v, includeSection, `${where} @${k}`)]));
    requireSections(sections, spec[f], where);
    return sections;
  });
  const version = `${feature}@${createHash("sha256").update(JSON.stringify([system, request, schema])).digest("hex").slice(0, 8)}`;
  return { feature, version, system, request, schema };
}

const cache = new Map<string, unknown>();

/** 운영은 처음 한 번 읽어 두고, 개발·테스트는 부를 때마다 다시 읽음(파일을 고치면 바로 반영) */
export function cachedPrompt<T>(key: string, load: () => T): T {
  if (process.env.NODE_ENV !== "production") return load();
  if (!cache.has(key)) cache.set(key, load());
  return cache.get(key) as T;
}
