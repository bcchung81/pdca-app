import {
  CHECKLIST_HEADERS,
  CHECKLIST_TITLE,
  CONSULT_TITLE,
  FORM_COL_WIDTHS,
  type InspectionResult,
  type Judgment,
  STAR_ITEMS,
  TABLE_KEYS,
  type TableKey,
  caseFootnote,
  checklistIntro,
  consultDateLine,
  formRows,
  formTablesOf,
  judgeStatus,
  overviewLines,
  rowLabel,
  tally,
} from "../../lib/inspections/model.ts";
import { Tag, type Tone } from "../ui/kit";

export const JUDGMENT_TONE: Record<Judgment, Tone> = { 충족: "link", 미흡: "warnSolid", "기준 미확인": "muted", "해당 없음": "muted" };

export const isStarRow = (table: TableKey, no: number) => STAR_ITEMS.some((s) => s.table === table && s.no === no);

/** 점검 수치 한 줄(점검결과 DB 속성과 같은 셈): 7대축 4/7 · 질의패턴 5/8 · 정합성 4/5 · 보완 7건 · 집중보완 */
export function TallyLine({ result, showStatus = false }: { result: InspectionResult; showStatus?: boolean }) {
  const t = tally(result);
  const tables = formTablesOf(result.form);
  const blank = TABLE_KEYS.reduce((n, k) => n + t.tables[k].blank, 0);
  const total = TABLE_KEYS.reduce((n, k) => n + t.tables[k].total, 0);
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-2">
      {TABLE_KEYS.map((k) => (
        <span key={k} className="whitespace-nowrap">
          {tables[k].short} <b className="font-mono text-ink">{t.tables[k].met}</b>/{t.tables[k].total}
        </span>
      ))}
      <span className={`whitespace-nowrap ${t.needs ? "font-semibold text-warn" : ""}`}>보완 {t.needs}건</span>
      {t.focus ? <Tag tone="warnSolid" title={`★핵심 미흡: ${t.stars.weak.join(", ")}`}>집중보완</Tag> : <span className="whitespace-nowrap">집중보완 아님</span>}
      {showStatus && (blank ? <Tag>{`판단 ${total - blank}/${total}`}</Tag> : <Tag tone={judgeStatus(result) === "보완요청" ? "warn" : judgeStatus(result) === "점검완료" ? "link" : "muted"}>{judgeStatus(result)}</Tag>)}
    </span>
  );
}

/**
 * 점검 결과 보기 — 성과관리팀 「과제관리카드 AI 컨설팅 결과(노션) 화면 예시」(= 지침 14·13 <출력구조>) 양식 그대로:
 * 제목·날짜 줄 → □ AI 점검 총평 표(구분 | 내용: 추진현황 · 개선방향 · ★ 사례제안, 아래 ※ 주석) → □ 7대 축 · □ 질의 패턴 · □ 정합성 표(구분·항목·정의·판단·미흡 시 보완방안)
 * → (경영관리 양식만) □ 자가진단 체크리스트 대조(표 위 한 줄 + 구분·점검사항 요지·결과·반영과제·비고 — 판정·집계에 안 들어감).
 * 구분·항목·정의는 양식 문구 그대로, 판단·보완방안만 이 과제의 결과(lib/inspections/model.ts formRows·overviewLines).
 * 양식 위에는 「보완할 것」 바로가기만(노션의 속성 칸에 해당).
 */
export function InspectionSheet({ result, idPrefix = "ins", date }: { result: InspectionResult; idPrefix?: string; date?: string | null }) {
  const weak = TABLE_KEYS.flatMap((k) => result[k].map((r, i) => ({ k, i, r })).filter((x) => x.r.judgment === "미흡"));
  const tables = formTablesOf(result.form);
  const dateLine = consultDateLine(date);
  // 글 열(항목·정의·보완방안) 폭 합 — 구분·판단 열은 고정 폭
  const text = FORM_COL_WIDTHS[1] + FORM_COL_WIDTHS[2] + FORM_COL_WIDTHS[4];
  return (
    <div className="flex min-w-0 flex-col gap-5">
      {weak.length > 0 && (
        <nav aria-label="보완할 것" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-warn/50 bg-warn-bg px-3 py-2 text-ui">
          <span className="text-xs font-bold text-warn">{`보완할 것 ${weak.length}건`}</span>
          {weak.map(({ k, i }) => (
            <a key={`${k}${i}`} href={`#${idPrefix}-${k}-${i + 1}`} className="text-link">
              {rowLabel(k, i + 1, result.form)}
            </a>
          ))}
        </nav>
      )}

      <article aria-label={CONSULT_TITLE} className="flex min-w-0 flex-col gap-5">
        <header className="flex flex-col items-center gap-1 text-center">
          <h3 className="font-serif text-lg font-bold break-keep text-ink">{CONSULT_TITLE}</h3>
          {dateLine && <p className="text-xs text-muted-2">{dateLine}</p>}
        </header>

        <section aria-label="AI 점검 총평" className="flex min-w-0 flex-col gap-2">
          <h4 className="text-sm font-bold text-navy">□ AI 점검 총평</h4>
          {/* 지침 <출력구조>: 구분 | 내용 표(colgroup 120/780), 개선방향은 ★ 줄마다, 표 아래 ※ 주석 */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] table-fixed border-collapse text-ui leading-5">
              <colgroup>
                <col style={{ width: "6.5rem" }} />
                <col />
              </colgroup>
              <thead>
                <tr className="bg-thead text-xs text-muted-2">
                  {["구분", "내용"].map((h) => (
                    <th key={h} scope="col" className="border border-line px-1.5 py-1.5 text-center font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {overviewLines(result).map((o) => (
                  <tr key={o.label} className="align-top">
                    <th scope="row" className={`border border-line px-2 py-2 text-center font-semibold break-keep ${o.mark === "★" ? "text-warn" : "text-ink"}`}>
                      {o.mark === "★" ? `★ ${o.label}` : o.label}
                    </th>
                    <td className="border border-line px-2 py-2 break-keep text-ink">
                      {o.lines.length ? o.lines.map((l, i) => <span key={i} className="block">{l}</span>) : <span className="text-muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">{caseFootnote(result.form)}</p>
        </section>

        {TABLE_KEYS.map((k) => (
          <section key={k} aria-label={tables[k].title} className="flex min-w-0 flex-col gap-2">
            <h4 className="text-sm font-bold text-navy">□ {tables[k].title}</h4>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] table-fixed border-collapse text-ui leading-5">
                {/* 구분·판단은 글자 폭만큼 고정(좁은 옆 창에서 머리가 두 줄로 깨지지 않게), 항목·정의·보완방안은 양식 비율(140:220:430) */}
                <colgroup>
                  <col style={{ width: "2.75rem" }} />
                  <col style={{ width: `${((FORM_COL_WIDTHS[1] / text) * 100).toFixed(1)}%` }} />
                  <col style={{ width: `${((FORM_COL_WIDTHS[2] / text) * 100).toFixed(1)}%` }} />
                  <col style={{ width: "4rem" }} />
                  <col />
                </colgroup>
                <thead>
                  <tr className="bg-thead text-xs text-muted-2">
                    {["구분", tables[k].itemHeader, "정의", "판단", "미흡 시 보완방안"].map((h) => (
                      <th key={h} scope="col" className="border border-line px-1.5 py-1.5 text-center font-semibold break-keep">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {formRows(result, k).map((row) => (
                    <tr key={row.no} id={`${idPrefix}-${k}-${row.no}`} className="align-top">
                      <td className="border border-line px-1.5 py-2 text-center font-mono text-xs text-muted-2">{row.no}</td>
                      <td className="border border-line px-2 py-2 font-semibold break-keep text-ink">{row.name}</td>
                      <td className="border border-line px-2 py-2 break-keep text-muted-2">{row.definition}</td>
                      <td className={`border border-line px-1 py-2 text-center text-xs font-semibold break-keep ${row.judgment === "미흡" ? "bg-warn-bg text-warn" : row.judgment === "충족" ? "text-link" : "text-muted"}`}>
                        {row.judgment || "미판단"}
                      </td>
                      <td className="border border-line px-2 py-2 break-keep whitespace-pre-wrap text-ink">{row.remedy || <span className="text-muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        {result.checklist && (
          <section aria-label={CHECKLIST_TITLE} className="flex min-w-0 flex-col gap-2">
            <h4 className="text-sm font-bold text-navy">□ {CHECKLIST_TITLE}</h4>
            <p className="text-xs leading-5 text-muted-2">{checklistIntro(result.checklist)}</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] table-fixed border-collapse text-ui leading-5">
                <colgroup>
                  <col style={{ width: "4.25rem" }} />
                  <col style={{ width: "34%" }} />
                  <col style={{ width: "4rem" }} />
                  <col style={{ width: "4.25rem" }} />
                  <col />
                </colgroup>
                <thead>
                  <tr className="bg-thead text-xs text-muted-2">
                    {CHECKLIST_HEADERS.map((h) => (
                      <th key={h} scope="col" className="border border-line px-1.5 py-1.5 text-center font-semibold break-keep">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.checklist.rows.map((row, i) => (
                    <tr key={i} className="align-top">
                      <td className="border border-line px-1.5 py-2 text-center font-mono text-xs break-keep text-muted-2">{row.label}</td>
                      <td className="border border-line px-2 py-2 break-keep text-ink">{row.point}</td>
                      <td className={`border border-line px-1 py-2 text-center text-xs font-semibold break-keep ${row.result === "아니오" ? "bg-warn-bg text-warn" : row.result === "예" ? "text-link" : "text-muted"}`}>{row.result ?? "미정"}</td>
                      <td className="border border-line px-1 py-2 text-center font-mono text-xs text-muted-2">{row.task || "—"}</td>
                      <td className="border border-line px-2 py-2 break-keep whitespace-pre-wrap text-ink">{row.note || <span className="text-muted">—</span>}</td>
                    </tr>
                  ))}
                  {result.checklist.rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="border border-line px-2 py-3 text-center text-muted">
                        대조한 항목이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </article>
    </div>
  );
}
