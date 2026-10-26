// report-harness 규칙(rules.md) 읽기. 프롬프트에 넣을 규칙을 단계 태그로 고릅니다.
// 규칙 형식: "- R0NN [draft][export] 본문 (근거[…]: …)"

export type RuleTag = "research" | "analyze" | "draft" | "export";

export interface HarnessRule {
  id: string;
  tags: RuleTag[];
  text: string;
  /** "**[대체됨 → R0NN]**"·"[… 정정 → R0NN]"처럼 뒤 규칙으로 갈음된 경우 그 번호들 */
  redirects: string[];
  /** 값이 뒤 규칙으로 대체·정정됨(따를 값은 redirects 쪽) */
  superseded: boolean;
}

const RULE_LINE = /^- (R\d{3}) ((?:\[[a-z]+\])+) (.+)$/;
const LEAD_NOTE = /^\*\*\[([^\]]*→[^\]]*)\]\*\*/;

export function parseRules(markdown: string): HarnessRule[] {
  const rules: HarnessRule[] = [];
  for (const line of markdown.split("\n")) {
    const m = RULE_LINE.exec(line.trim());
    if (!m) continue;
    const tags = [...m[2].matchAll(/\[([a-z]+)\]/g)].map((t) => t[1] as RuleTag);
    const note = LEAD_NOTE.exec(m[3])?.[1] ?? "";
    rules.push({
      id: m[1],
      tags,
      text: m[3],
      redirects: [...note.matchAll(/R\d{3}/g)].map((r) => r[0]),
      superseded: /대체됨|정정/.test(note),
    });
  }
  return rules;
}

/** 번호로 고른 규칙(준 순서대로). 없는 번호·대체된 규칙이면 오류 — 사본을 새로 들여와 번호가 바뀌면 바로 드러나게 */
export function pickRules(rules: HarnessRule[], ids: readonly string[]): HarnessRule[] {
  return ids.map((id) => {
    const r = rules.find((x) => x.id === id);
    if (!r) throw new Error(`report-harness 규칙 ${id}이 사본에 없습니다`);
    if (r.superseded) throw new Error(`report-harness 규칙 ${id}은 대체됐습니다(→ ${r.redirects.join("·")})`);
    return r;
  });
}

/** 마크다운의 「## N. 제목」 절 가운데 번호로 고른 것(준 순서대로, 절 머리 포함). 없는 번호면 오류 */
export function pickSections(markdown: string, nums: readonly number[]): string {
  const parts = markdown.split(/^(?=## \d+\. )/m);
  return nums
    .map((n) => {
      const part = parts.find((x) => x.startsWith(`## ${n}. `));
      if (!part) throw new Error(`절 ## ${n}.이 없습니다`);
      return part.trimEnd();
    })
    .join("\n\n");
}

/** 마크다운의 「## 제목」 절 가운데 제목 글로 고른 것(준 순서대로, 절 머리 포함 — 제목 뒤 괄호 꼬리는 허용). 없는 제목이면 오류 */
export function pickHeadings(markdown: string, titles: readonly string[]): string {
  const parts = markdown.split(/^(?=## )/m);
  return titles
    .map((t) => {
      const part = parts.find((x) => {
        const head = x.split("\n", 1)[0].slice(3).trim();
        return head === t || head.startsWith(`${t} (`);
      });
      if (!part) throw new Error(`절 ## ${t}이 없습니다`);
      return part.trimEnd();
    })
    .join("\n\n");
}

/**
 * 경평 구성안(두 트랙)의 「골격 판정」 — KCA 도식 Pool 정의서(2024.11) 사본의 판정표만(도입 유무·전개 수·결과 단일/복수·강조 대상 → 2단~5단).
 * 하네스의 작업 절차(게이트·명세 파일)는 앱과 달라 뺌. 시스템 프롬프트 {{skeleton}}(resources/prompts/_shared/skeleton.md)
 */
export const OUTLINE_SKELETON = { file: "diagram-pool.md", headings: ["판정표"] } as const;

/** 단계 태그가 하나라도 맞는 규칙. 기본으로 대체된 규칙은 뺍니다 */
export function selectRules(rules: HarnessRule[], tags: RuleTag[], opts: { includeSuperseded?: boolean } = {}): HarnessRule[] {
  return rules.filter((r) => r.tags.some((t) => tags.includes(t)) && (opts.includeSuperseded || !r.superseded));
}
