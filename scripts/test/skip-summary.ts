// pnpm test 끝에 건너뛴 시험을 이름·이유와 함께 크게 알리는 보고기(2026-10-10 개선 계획 P2-1). 원본(data/·resources/knowledge/ — git 밖)이 없는 환경에서는
// 59장 왕복·공통 지식 기대값 같은 시험이 건너뛰어지는데, 끝줄 「pass N」만 보면 다 통과한 것처럼 보였음. 이유 없는 건너뛰기도 드러냄.

type Pass = { type: string; data: { name: string; file?: string; skip?: string | boolean } };

export default async function* skipSummary(source: AsyncIterable<Pass>): AsyncGenerator<string> {
  const skipped: Array<{ name: string; file: string; why: string }> = [];
  for await (const ev of source) {
    if (ev.type !== "test:pass" || ev.data.skip === undefined || ev.data.skip === false) continue;
    const file = (ev.data.file ?? "").replace(`${process.cwd()}/`, "");
    skipped.push({ name: ev.data.name, file, why: typeof ev.data.skip === "string" ? ev.data.skip : "이유 없음 — skip에 이유를 적어 주세요" });
  }
  if (!skipped.length) return;
  const lines = skipped.map((s) => `  - ${s.file} › ${s.name}\n      ${s.why}`);
  yield `\n■ 건너뛴 시험 ${skipped.length}개 — 통과가 아니라 실행 안 함(대부분 git 밖 원본이 없어서, docs/design/tests.md 「원본 필요 시험」)\n${lines.join("\n")}\n`;
}
