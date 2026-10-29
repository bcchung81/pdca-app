// Jev(TypeSafe) 채점에 보낼 카드 — 실험 스크립트 공용(scripts/eval/judge-compare.ts·scripts/knowledge/select-build.ts).
// Jev 상태(lib/ai/typesafe.ts cardState)는 주요사업 카드의 act.findings만 읽으므로 경영관리 카드의 「지적 및 개선방안」 지적 칸을 같은 자리에 옮겨 줌(typesafe.ts를 안 고치려고).
// 지적 칸이 없는 카드(주요사업 카드 등)는 받은 값을 그대로 돌려줌.
// 2026-10-29: 경영관리 카드의 finding은 줄 목록(문자열 배열)이라 judge-compare에 있던 판(문자열만 받음)은 43장 모두 아무것도 옮기지 못했음 — 배열도 받게 고침

export function jevCard(data: unknown): unknown {
  const d = (data ?? {}) as { act?: { findings?: unknown }; findings?: { rows?: { finding?: unknown }[] } };
  const lines = (v: unknown): unknown[] => (Array.isArray(v) ? v : [v]);
  const mg = (Array.isArray(d.findings?.rows) ? d.findings!.rows! : []).flatMap((r) => lines(r?.finding)).filter((x): x is string => typeof x === "string" && !!x.trim());
  if (!mg.length) return data;
  const own = Array.isArray(d.act?.findings) ? (d.act!.findings as unknown[]) : [];
  return { ...d, act: { ...d.act, findings: [...own, ...mg] } };
}
