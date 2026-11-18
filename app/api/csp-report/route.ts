// CSP 위반 보고 받기(lib/security/csp.ts의 Report-Only 정책 report-uri). 로그인 없이 받음(lib/auth/public-paths.ts) — DB·외부 호출 없이 한 줄 JSON 로그만.
// 본문은 8KB까지만 읽고(넘으면 버림) 정해진 칸만 남김(lib/security/csp-report.ts — 주소는 경로만). 응답은 형식이 틀려도 늘 204.
import { CSP_REPORT_MAX_BYTES, parseCspReport } from "../../../lib/security/csp-report.ts";

/** 본문을 상한+1바이트까지만 읽음(넘으면 그만 읽고 버림) */
async function readCapped(request: Request): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > CSP_REPORT_MAX_BYTES) {
      await reader.cancel();
      return "";
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function POST(request: Request) {
  try {
    const v = parseCspReport(await readCapped(request));
    if (v) console.warn(JSON.stringify({ t: new Date().toISOString(), kind: "csp_violation", ...v }));
  } catch {
    // 형식이 틀린 보고는 버림
  }
  return new Response(null, { status: 204 });
}
