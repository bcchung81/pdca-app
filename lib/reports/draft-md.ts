// 경평 초안 원고(제목·문단·표 블록) → 개조식 초안 마크다운(md-profile). HWPX 변환(lib/hwpx)의 입력.
// 첫 줄 제목, 둘째 줄 발신 줄(< '26. 9. 25.(금), 본부 팀 >), 제목 1 → □ 절, 제목 2·일반 문단 줄 → ㅇ 요지.
// 문단 줄이 이미 □·ㅇ·-·※·＊·☞로 시작하면 그 계층 그대로. 표는 GFM 표(첫 행이 머리).

import type { ReportBlock } from "./model.ts";

const MARKED = /^(□|ㅇ|○|-|※|＊|☞)\s/;
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 발신 줄 날짜 '26. 9. 25.(금)(서울 기준) */
export function senderDate(d = new Date()): string {
  const k = new Date(d.getTime() + 9 * 3600_000);
  return `'${String(k.getUTCFullYear()).slice(2)}. ${k.getUTCMonth() + 1}. ${k.getUTCDate()}.(${DAYS[k.getUTCDay()]})`;
}

const cell = (s: string) => String(s ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();

export function reportDraftMarkdown(input: { title: string; hq?: string | null; team?: string | null; date?: Date; blocks: ReportBlock[] }): string {
  const out: string[] = [input.title.trim() || "경영실적보고서", `< ${senderDate(input.date)}, ${[input.hq, input.team].filter(Boolean).join(" ")} >`, ""];
  for (const b of input.blocks) {
    if (b.type === "heading") {
      const t = (b.text ?? "").trim();
      if (t) out.push(b.level === 2 ? `ㅇ ${t}` : `□ ${t}`, "");
    } else if (b.type === "table") {
      const rows = (b.rows ?? []).filter((r) => r.some((c) => String(c ?? "").trim()));
      if (!rows.length) continue;
      const cols = Math.max(...rows.map((r) => r.length));
      const line = (r: string[]) => `| ${Array.from({ length: cols }, (_, i) => cell(r[i] ?? "")).join(" | ")} |`;
      out.push(line(rows[0]), `| ${Array.from({ length: cols }, () => "---").join(" | ")} |`, ...rows.slice(1).map(line), "");
    } else {
      const lines = (b.text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      for (const l of lines) out.push(MARKED.test(l) ? l.replace(/^○\s/, "ㅇ ") : `ㅇ ${l}`);
      if (lines.length) out.push("");
    }
  }
  return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}
