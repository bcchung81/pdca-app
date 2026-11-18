// CSP 위반 보고(report-uri 형식 {"csp-report": {...}})에서 정해진 칸만 뽑아 한 줄 로그로 남길 값을 만듦 — 입출력 없음(app/api/csp-report/route.ts가 씀).
// 주소는 경로만 남김(질의 문자열 ?team= 등·출처를 로그에 싣지 않음), 긴 값은 자름. 형식이 틀리면 null(로그 안 남김).

/** 본문 상한 — 넘으면 버림 */
export const CSP_REPORT_MAX_BYTES = 8 * 1024;

export type CspViolation = {
  directive: string | null;
  blocked: string | null;
  document: string | null;
  source: string | null;
  line: number | null;
  sample: string | null;
};

function str(v: unknown, max: number): string | null {
  return typeof v === "string" && v !== "" ? v.slice(0, max) : null;
}

/** http(s) 주소면 경로만, 아니면(inline·eval·about:blank 등) null */
export function pathOnly(v: unknown): string | null {
  if (typeof v !== "string" || v === "") return null;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? u.pathname.slice(0, 200) : null;
  } catch {
    return null;
  }
}

/** 보고 본문 글 → 뽑은 칸. 8KB 넘음·JSON 아님·csp-report 없음이면 null */
export function parseCspReport(body: string): CspViolation | null {
  if (body === "" || new TextEncoder().encode(body).length > CSP_REPORT_MAX_BYTES) return null;
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  const r = json && typeof json === "object" ? (json as Record<string, unknown>)["csp-report"] : null;
  if (!r || typeof r !== "object" || Array.isArray(r)) return null;
  const o = r as Record<string, unknown>;
  const line = o["line-number"];
  return {
    directive: str(o["effective-directive"], 100) ?? str(o["violated-directive"], 100),
    blocked: str(o["blocked-uri"], 200),
    document: pathOnly(o["document-uri"]),
    source: pathOnly(o["source-file"]),
    line: typeof line === "number" && Number.isFinite(line) ? line : null,
    sample: str(o["script-sample"], 80),
  };
}
