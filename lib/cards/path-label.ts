// 카드 칸 경로(render.ts의 data-p) → 사람이 읽는 자리 이름. 예: "plan.lines.2" → "[Plan] 3번째 줄".
// 코멘트 작성 카드·여백 메모·AI 제안·수정 이력에서 내부 경로 대신 보여 줍니다(순수 함수).

import type { LooseJson } from "../loose-json.ts";

const KPI_COL: Record<string, string> = { name: "지표명", nameRaw: "지표명", formula: "산식", prev: "’25년 실적", target: "’26년 목표", expected: "’26년 실적(예상)" };
const HEAD: Record<string, string> = {
  national: "국정과제 머리",
  esg: "ESG 머리",
  ai: "AI활용 머리",
  findings: "지적사항 머리",
  finding: "지적사항 머리",
  self: "자체평가 머리",
  quantitative: "정량 성과 머리",
  qualitative: "정성 성과 머리",
};
const nth = (i: number) => `${i + 1}번째 줄`;

/** 표 안 칸(…lines.N.table.rows.r.c.lines.k) 꼬리 이름 */
function tableTail(rest: string[]): string {
  const out: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "table" && rest[i + 1] === "rows") {
      out.push(`표 ${Number(rest[i + 2]) + 1}행 ${Number(rest[i + 3]) + 1}칸`);
      i += 3;
    } else if (rest[i] === "lines" && /^\d+$/.test(rest[i + 1] ?? "")) {
      if (i + 2 >= rest.length) out.push(nth(Number(rest[i + 1])));
      i += 1;
    }
  }
  return out.join(" · ");
}

export function pathLabel(path: string | null | undefined, card?: LooseJson): string {
  if (!path) return "카드 전체";
  if (path === "title") return "과제명";
  if (path === "deptText") return "부서(팀)";
  if (path === "@person") return "관리자/작성자";
  const t = path.split(".");
  const n = (k: number) => Number(t[k]);
  // "[Plan] 3번째 줄", "[Act] 경영평가 지적사항 · 3번째 줄", 표 안이면 "[Do] 표 1행 2칸 · 3번째 줄"
  const lineOr = (k: number, base: string) => `${base}${base.endsWith("]") ? " " : " · "}${t.length > k + 1 && t[k + 1] === "table" ? tableTail(t.slice(k)) : nth(n(k))}`;
  switch (t[0]) {
    case "overview":
      return `과제 개요 · ${n(2) + 1}번째 칸`;
    case "kpi":
      if (t[1] === "categoriesText") return "계량 성과지표 · 구분";
      if (t[1] === "headers") return `계량 성과지표 · 머리행(${KPI_COL[t[2]] ?? t[2]})`;
      if (t[1] === "rows") return `계량 성과지표 · ${n(2) + 1}행${t[3] ? ` ${KPI_COL[t[3]] ?? t[3]}` : ""}`;
      if (t[1] === "notes") return lineOr(2, "계량 성과지표 · 비고");
      break;
    case "strategy":
      if (t[1] === "headers") return `전략 연계성 · ${HEAD[t[2]] ?? "머리행"}`;
      if (t[1] === "nationalAgenda") return `전략 연계성 · 국정과제 ${n(2) + 1}${t[3] === "badges" ? " 표지" : ""}`;
      if (t[1] === "esgText") return "전략 연계성 · ESG";
      if (t[1] === "ai") return "전략 연계성 · AI활용";
      break;
    case "act":
      if (t[1] === "headers") return `[Act] ${HEAD[t[2]] ?? "머리행"}`;
      if (t[1] === "findings") return lineOr(2, "[Act] 경영평가 지적사항");
      if (t[1] === "selfAssessment") return lineOr(2, "[Act] 자체평가");
      break;
    case "plan":
    case "do":
    case "check": {
      const sec = t[0] === "plan" ? "[Plan]" : t[0] === "do" ? "[Do]" : "[Check]";
      if (t[1] === "monthly") {
        const m = card?.do?.monthly?.[n(2)];
        const box = `${sec} 월별 실적${m?.period ? `(${m.period})` : ` ${n(2) + 1}`}`;
        if (t[3] === "period") return `${box} · 기간`;
        return lineOr(4, box);
      }
      if (t[1] === "grid") return `${sec} 표 ${n(3) + 1}행 ${n(4) + 1}칸${t[6] !== undefined ? ` · ${nth(n(6))}` : ""}`;
      if (t[1] === "lines" || t[1] === "items") return lineOr(2, sec);
      break;
    }
    case "feedback":
    case "findings": {
      const sec = t[0] === "feedback" ? "전년도 환류" : "지적 및 개선방안";
      if (t[1] === "headers") return `${sec} · ${HEAD[t[2]] ?? "머리행"}`;
      if (t[1] === "rows") {
        const side = ({ self: "’25년 자체평가", plan: "’26년 개선방안", finding: "’25년 지적사항" } as Record<string, string>)[t[3]] ?? t[3];
        return lineOr(4, `${sec} · ${n(2) + 1}행 ${side}`);
      }
      break;
    }
    case "outcome":
      if (t[1] === "headers") return `추진성과 · ${HEAD[t[2]] ?? "머리행"}`;
      if (t[1] === "quantitative") return lineOr(2, "추진성과 · 정량 성과");
      if (t[1] === "qualitative") return lineOr(2, "추진성과 · 정성 성과");
      break;
    case "axAttachments": {
      const ax = `AX 붙임 ${n(1) + 1}`;
      if (t[2] === "title") return `${ax} · 제목`;
      const purpose = /^purpose~$/.test(t[2] ?? "");
      if (purpose) return `${ax} · 과제 목적 · ${nth(n(3))}`;
      if (t[2] === "sections") {
        const head = card?.axAttachments?.[n(1)]?.sections?.[n(3)]?.heading;
        const name = head ? String(head).replace(/\s+/g, " ").trim() : `항목 ${n(3) + 1}`;
        if (t[4] === "heading") return `${ax} · ${name}(항목 제목)`;
        return lineOr(5, `${ax} · ${name}`);
      }
      if (t[2] === "notes") return lineOr(3, `${ax} · 비고`);
      break;
    }
  }
  return path;
}

/** 경로가 든 카드 구역 이름(AI에 주는 카드 목록의 절 제목) */
export function sectionTitle(path: string, card?: LooseJson): string {
  const t = path.split(".");
  switch (t[0]) {
    case "title":
    case "deptText":
    case "@person":
      return "과제 기본정보";
    case "overview":
      return "과제 개요";
    case "kpi":
      return "계량 성과지표";
    case "strategy":
      return "전략 연계성";
    case "feedback":
      return "전년도 환류";
    case "findings":
      return "지적 및 개선방안";
    case "act":
      return "[Act] 전년도 환류";
    case "plan":
      return "[Plan] 조치 및 개선방향";
    case "do":
      return t[1] === "monthly" ? `[Do] 월별 실적 — ${card?.do?.monthly?.[Number(t[2])]?.period ?? Number(t[2]) + 1}` : "[Do] 추진내용";
    case "check":
      return "[Check] 성과점검";
    case "outcome":
      return "추진성과";
    case "axAttachments":
      return `AX 연계과제 붙임 ${Number(t[1]) + 1}`;
  }
  return t[0];
}
