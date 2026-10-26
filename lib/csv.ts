// CSV 만들기(엑셀에서 한글이 깨지지 않게 UTF-8 BOM, 따옴표·쉼표·줄바꿈 처리). 순수 함수.

export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  // 수식으로 해석될 수 있는 첫 글자는 작은따옴표로 막음(CSV 수식 주입 방지)
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: unknown[][]): string {
  return `﻿${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/** 내려받기 응답(파일 이름은 한글 그대로 — RFC 5987) */
export function csvResponse(fileName: string, rows: unknown[][]): Response {
  return new Response(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="export.csv"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "cache-control": "no-store",
    },
  });
}
