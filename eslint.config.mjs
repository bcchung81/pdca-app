import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 저장소 밖 작업물: 에이전트 작업 공간(git worktree)·git 밖 기관 원본과 파생 결과(일회성 스크립트 포함)
    ".claude/**",
    "resources/knowledge/**",
  ]),
]);

export default eslintConfig;
