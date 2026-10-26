import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface HarnessSourceInfo {
  id: string;
  note: string;
  origin: string;
  commit: string | null;
  commitDate: string | null;
  subject: string | null;
  files: Array<{ dest: string; bytes: number; sha256: string; modified?: string }>;
}

/** 저장소 안 기준 문서 고정 사본의 출처(SOURCE.json). 앱 경로 밖은 읽지 않습니다 */
export function harnessSources(): HarnessSourceInfo[] {
  return ["report-harness", "pdca"].flatMap((id) => {
    try {
      const j = JSON.parse(readFileSync(join(process.cwd(), "resources/harness", id, "SOURCE.json"), "utf8"));
      return [{ id, note: j.note ?? "", origin: j.repository ?? j.origin ?? "", commit: j.commit ?? null, commitDate: j.commit_date ?? null, subject: j.commit_subject ?? null, files: j.files ?? [] }];
    } catch {
      return [];
    }
  });
}
