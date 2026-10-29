// 경평 초안 숫자 대조의 「계산값 인정」(순수, 입출력 없음) — 2025 보고서식 포장(「20% 확대(100건 → 120건)」, 「누적 300건(100건 + 200건)」, 달성률, 배수)의
// 숫자는 근거 글에 글자 그대로 없고 근거 숫자 두 개에서 계산된 값입니다. 한 글 단위(줄 — 수치 표는 blocks.ts blockNumberTexts가 한 행을 한 줄로 냄) 안에 아는 숫자 두 개(같은 단위)가 함께 있고
// 모르는 숫자가 그 둘의 합·차·증감률·비율·달성률·배수와 맞을 때만 인정합니다. 원값 없는 퍼센트·배수는 계속 「없는 숫자」입니다.
// 반올림 오차는 표기 자릿수까지만: 15% → 14.5~15.5, 15.6% → 15.55~15.65, 정수 표기 배수 ±0.5.
// 이 파일은 section.ts의 numberTokens(숫자 조각 뽑기)를 가져오지 않음(순환 방지) — 호출부가 줄 단위로 모르는 숫자 조각을 넘김.

/** 한글 규모 단위 → 곱수 */
const SCALE: Record<string, number> = { 조: 1e12, 억: 1e8, 만: 1e4, 천: 1e3 };
/** 값 뒤 단위(actuals.ts FIGURE_RE의 단위에서 규모·%·배를 뺀 것) — 같은 단위끼리만 계산함 */
const UNIT_RE = /^\s*(개소|개|국|종|회|시간|km|곳|건|명|점|원|대|식|초|분|주|일|MHz|GHz|kW|톤|호)/;

interface CalcNum {
  /** numberTokens 조각과 맞추는 열쇠(쉼표·공백 없음, 규모 단위 없음, %·배 포함) */
  key: string;
  /** 규모를 곱한 값 */
  value: number;
  /** 표기 소수 자릿수 */
  dp: number;
  /** 규모 곱수 */
  scale: number;
  kind: "val" | "pct" | "mult";
  unit: string;
}

/** 한 줄의 숫자 읽기: 연도 표기(’26·2026년)·월·년 붙은 수는 뺌 */
function parse(line: string): CalcNum[] {
  const out: CalcNum[] = [];
  const re = /(?<![’'\d.,])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?/g;
  for (const m of line.matchAll(re)) {
    const int = m[1].replace(/,/g, "");
    const frac = m[2] ?? "";
    const rest = line.slice(m.index + m[0].length);
    if (/^\s*[년월]/.test(rest)) continue;
    const pct = /^\s*(%|퍼센트)/.exec(rest);
    const mult = !pct && /^\s*배/.test(rest);
    const sc = !pct && !mult ? /^\s*([조억만천])/.exec(rest) : null;
    const scale = sc ? SCALE[sc[1]] : 1;
    const unit = pct || mult ? "" : (UNIT_RE.exec(sc ? rest.slice(sc[0].length) : rest)?.[1] ?? "");
    const base = Number(`${int}${frac ? `.${frac}` : ""}`);
    out.push({ key: `${int}${frac ? `.${frac}` : ""}${pct ? "%" : mult ? "배" : ""}`, value: pct || mult ? base : base * scale, dp: frac.length, scale, kind: pct ? "pct" : mult ? "mult" : "val", unit });
  }
  return out;
}

/** numberTokens 조각 → 같은 열쇠(쉼표·공백 없음, 퍼센트 → %) */
const keyOf = (tok: string) => tok.replace(/,/g, "").replace(/\s+/g, "").replace(/퍼센트/, "%");

/**
 * 한 줄에서 모르는 숫자 조각(unknown) 중 계산값으로 설명되는 것의 열쇠 모음.
 * isKnown: 숫자 조각(열쇠 모양)이 근거에 있는가 — 원값(피연산자)은 근거에 있는 값만 쓴다.
 */
export function calcExplained(line: string, unknown: string[], isKnown: (tok: string) => boolean): Set<string> {
  const explained = new Set<string>();
  if (!unknown.length) return explained;
  const nums = parse(line);
  const operands = nums.filter((n) => n.kind === "val" && isKnown(n.key));
  if (operands.length < 2) return explained;
  const targets = new Set(unknown.map(keyOf));
  const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol + 1e-9;
  for (const key of targets) {
    const occ = nums.filter((n) => n.key === key);
    if (!occ.length) continue;
    // 같은 조각이 여러 번 나오면 모두 설명돼야 인정
    const ok = occ.every((t) => {
      if (t.kind === "val" && isKnown(t.key)) return false;
      const tol = 0.5 * 10 ** -t.dp;
      for (let i = 0; i < operands.length; i++) {
        for (let j = 0; j < operands.length; j++) {
          const a = operands[i];
          const b = operands[j];
          if (i === j || a.unit !== b.unit || a === t || b === t || a.value === 0) continue;
          if (t.kind === "pct") {
            const rate = ((b.value - a.value) / a.value) * 100; // 증감률(b가 a 대비)
            const ratio = (b.value / a.value) * 100; // 비율·달성률(b ÷ a)
            if (near(Math.abs(rate), t.value, tol) || near(ratio, t.value, tol)) return true;
          } else if (t.kind === "mult") {
            if (near(b.value / a.value, t.value, tol)) return true;
          } else if (a.unit === t.unit && i < j) {
            // 합·차(값끼리 — 단위가 같아야 함). 오차는 표기 자릿수 × 규모
            const tt = tol * t.scale;
            if (near(a.value + b.value, t.value, tt) || near(Math.abs(a.value - b.value), t.value, tt)) return true;
          }
        }
      }
      return false;
    });
    if (ok) explained.add(key);
  }
  return explained;
}
