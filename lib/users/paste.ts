// 엑셀·구글 시트·한셀에서 셀 영역을 복사하면 클립보드에 탭 구분 글(TSV)이 들어옵니다.
// 여러 줄·탭·따옴표가 든 셀은 큰따옴표로 감싸고 따옴표는 두 번 씁니다. 그 글을 이름·이메일·팀명 줄로 바꿉니다(입출력 없음).

import { PASTE_MAX_ROWS, type PasteRow } from "./types.ts";

/** 탭 구분 글 → 칸 배열. 줄바꿈은 \r\n·\n·\r 모두 받고, 따옴표로 감싼 칸의 줄바꿈·탭·"" 를 풉니다. */
export function parseTsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let atStart = true; // 칸의 첫 글자 자리(여기서만 여는 따옴표로 봄)
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && atStart) {
      inQuotes = true;
      atStart = false;
    } else if (ch === "\t") {
      row.push(cell);
      cell = "";
      atStart = true;
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      atStart = true;
    } else {
      cell += ch;
      atStart = false;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** 칸 정리: 줄바꿈·연속 공백은 한 칸 공백으로, 엑셀이 붙이는 NBSP·보이지 않는 공백 제거, 앞뒤 공백 제거 */
export function cleanCell(s: string): string {
  return s
    .replace(/[ ​‌‍﻿]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NAME_HEAD = /^(이름|성명|성함|담당자|담당자명|name)$/i;
const MAIL_HEAD = /^(이메일|이메일주소|메일|메일주소|e-?mail|email)$/i;
const TEAM_HEAD = /^(팀|팀명|팀이름|부서|부서명|소속|소속팀|team)$/i;

export interface ParsedPaste {
  rows: PasteRow[];
  /** 첫 줄을 머리글로 읽었나 */
  hadHeader: boolean;
  warnings: string[];
}

/**
 * 붙여넣은 글 → 이름·이메일·팀명 줄.
 *  · 첫 줄이 머리글(이름/이메일/팀명 등)이면 그 이름으로 열을 찾고, 열 순서는 상관없음
 *  · 머리글이 없으면 「@가 든 열」을 이메일로 보고, 나머지 열을 앞에서부터 이름·팀명으로 봄(이름, 이메일, 팀명 순이 기본)
 *  · 빈 줄은 버림. 팀명 열이 없어도 줄은 만들고 팀은 화면에서 고름
 */
export function parsePasteRows(text: string): ParsedPaste {
  return parsePasteTable(parseTsv(text));
}

/** 이미 칸으로 나뉜 표(격자 붙여넣기 이벤트가 주는 것)를 이름·이메일·팀명 줄로. 규칙은 parsePasteRows와 같음 */
export function parsePasteTable(raw: readonly (readonly string[])[]): ParsedPaste {
  const warnings: string[] = [];
  const table = raw.map((r) => r.map(cleanCell)).filter((r) => r.some((c) => c !== ""));
  if (table.length === 0) return { rows: [], hadHeader: false, warnings };

  const head = table[0].map((c) => c.replace(/\s/g, ""));
  const nameH = head.findIndex((c) => NAME_HEAD.test(c));
  const mailH = head.findIndex((c) => MAIL_HEAD.test(c));
  const teamH = head.findIndex((c) => TEAM_HEAD.test(c));
  const found = [nameH, mailH, teamH].filter((i) => i >= 0).length;
  const hadHeader = found >= 2 || (mailH >= 0 && !table[0].some((c) => c.includes("@")));

  let nameCol: number;
  let mailCol: number;
  let teamCol: number;
  let data: string[][];
  if (hadHeader) {
    nameCol = nameH;
    mailCol = mailH;
    teamCol = teamH;
    data = table.slice(1);
  } else {
    data = table;
    const width = Math.max(...data.map((r) => r.length));
    const atCount = Array.from({ length: width }, (_, c) => data.filter((r) => (r[c] ?? "").includes("@")).length);
    const best = Math.max(...atCount);
    mailCol = best > 0 ? atCount.indexOf(best) : 1;
    const others = Array.from({ length: width }, (_, c) => c).filter((c) => c !== mailCol);
    nameCol = others[0] ?? -1;
    teamCol = others[1] ?? -1;
    if (width > 3) warnings.push("이름·이메일·팀명 세 열만 읽었습니다. 나머지 열은 무시했습니다.");
  }

  let rows: PasteRow[] = data.map((r, i) => ({
    line: i + 1,
    name: nameCol >= 0 ? (r[nameCol] ?? "") : "",
    email: mailCol >= 0 ? (r[mailCol] ?? "") : "",
    teamText: teamCol >= 0 ? (r[teamCol] ?? "") : "",
  }));
  if (mailCol < 0) warnings.push("이메일 열을 찾지 못했습니다. 머리글을 「이름·이메일·팀명」으로 두거나 이메일이 든 열을 함께 복사해 주세요.");
  if (rows.length > PASTE_MAX_ROWS) {
    warnings.push(`한 번에 ${PASTE_MAX_ROWS}줄까지 처리합니다. 앞 ${PASTE_MAX_ROWS}줄만 읽었습니다.`);
    rows = rows.slice(0, PASTE_MAX_ROWS);
  }
  return { rows, hadHeader, warnings };
}
