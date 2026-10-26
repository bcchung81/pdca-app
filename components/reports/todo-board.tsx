import Link from "next/link";
import { Empty, Panel, T } from "../ui/kit";
import { withReturn } from "../../lib/nav/return-to.ts";
import type { TodoBoard, TodoRow } from "../../lib/reports/todo-board.ts";

/** 처음 보여 주는 줄 수(나머지는 접어 둠) */
const SHOWN = 12;

const HEADS = ["평가단위", "부서", "계량 실적 미입력", "【확인】", "초안 없음", "없는 숫자", "자료 필요", "채울 것 견본", ""];

// 남은 일 숫자는 0보다 크면 진한 글자 — 갈색(warn)은 막힘(근거에 없는 숫자, lib/reports/warning-levels.ts의 block)만
const cell = (n: number, block = false) => (n ? <span className={`font-bold ${block ? "text-warn" : "text-ink"}`}>{n}</span> : <span className="text-muted">—</span>);

/** 평가단위 이름: 경영관리는 지표명만(묶음 id·평가단위 id는 식별자라 글자로 쓰지 않음), 주요사업은 카드 묶음 · 사업명 */
const unitLabel = (r: TodoRow, mg: boolean) => (mg ? r.unitName : `${r.cardGroup ?? "공통지표"} · ${r.unitName}`);

function Table({ rows, mg, linkFor, from }: { rows: TodoRow[]; mg: boolean; linkFor: boolean; from: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={`${T.table} min-w-[1120px]`}>
        <colgroup>
          <col className="w-[220px]" />
          <col className="w-[130px]" />
          <col className="w-[116px]" />
          <col className="w-[70px]" />
          <col className="w-[76px]" />
          <col className="w-[84px]" />
          <col className="w-[84px]" />
          <col />
          <col className="w-[76px]" />
        </colgroup>
        <thead>
          <tr className={T.headRow}>
            {HEADS.map((h, i) => (
              <th key={i} scope="col" className={T.th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            // 성과관리팀: 부서 줄 → 그 부서 담당자에게 보이는 경평 초안 허브(읽기 전용), 카드 밖 부분 줄 → 그 지표의 카드 밖 부분 화면
            const href = !linkFor ? null : r.teamId === null ? withReturn(`/reports/business/${r.unitId}/parts`, from) : withReturn(`/my/report?team=${r.teamId}`, from);
            const samples = r.samples.join(" · ");
            return (
              <tr key={`${r.unitId}|${r.teamId}`} className={T.row}>
                <td className={`${T.td} truncate font-semibold text-ink`} title={unitLabel(r, mg)}>
                  {unitLabel(r, mg)}
                </td>
                <td className={`${T.td} truncate ${r.teamId === null ? "text-muted-2" : ""}`} title={r.teamName}>
                  {r.teamName}
                </td>
                <td className={`${T.td} font-mono text-ui`} title={r.kpiTotal ? `계량 성과지표 ${r.kpiTotal}행 중 올해 실적을 안 넣은 ${r.kpiMissing}행` : "카드에 계량 성과지표가 없음"}>
                  {r.kpiTotal ? (
                    <>
                      {cell(r.kpiMissing)}
                      <span className="text-xs text-muted-2"> /{r.kpiTotal}</span>
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className={`${T.td} font-mono text-ui`} title="초안 글에 남은 【확인: …】 자리표시(과제마다 같은 이름은 한 번)">
                  {cell(r.needs)}
                </td>
                <td className={`${T.td} font-mono text-ui`} title="목차에 든 과제 중 과제별 초안이 없거나 구성안뿐인 수">
                  {cell(r.noDraft)}
                </td>
                <td className={`${T.td} font-mono text-ui`} title="초안에 있는데 카드·첨부·실사 답변 어디에도 없는 숫자">
                  {cell(r.unknown, true)}
                </td>
                <td className={`${T.td} font-mono text-ui`} title="구성안 재료표에서 근거가 없어 못 채운 「자료 필요」 수(부서 경평 초안의 「자료 요청」에서 목록을 봄)">
                  {cell(r.requests)}
                </td>
                <td className={`${T.td} truncate text-xs text-muted-2`} title={samples}>
                  {samples || "—"}
                </td>
                <td className={T.td}>
                  {href && (
                    <Link href={href} className={T.btn} title={r.teamId === null ? "카드 밖 부분 화면으로" : "이 부서 담당자에게 보이는 경평 초안(읽기 전용)"}>
                      열기
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 경평 초안 「채울 것」 모음 패널(lib/reports/todo-board.ts) — 성과관리팀 보고서 현황(전체 부서, 줄마다 열기 링크)과
 * 부서 경평 초안(자기 부서 줄만, 링크 없음)이 같은 부품을 씀. 할 일이 0인 줄은 접어 둠(건수만 알림)
 */
export function TodoBoardPanel({ board, title, mg, staff, from }: { board: TodoBoard; title: string; mg: boolean; staff: boolean; from: string }) {
  const todo = board.rows.filter((r) => r.todo > 0);
  const done = board.rows.length - todo.length;
  const { totals: t } = board;
  return (
    <Panel
      title={title}
      aside={
        <span className="truncate" title="계량 실적 미입력 행 · 【확인】 자리표시 · 초안 없는 과제 · 근거에 없는 숫자의 합(자료 필요는 별도 — 합에 안 넣음)">
          계량 실적 {t.kpiMissing} · 확인 {t.needs} · 초안 없음 {t.noDraft} · 없는 숫자 {t.unknown} · 자료 필요 {t.requests}
        </span>
      }
    >
      {todo.length === 0 ? (
        <Empty title="채울 것이 없습니다.">계량 실적·【확인】 자리표시·초안 없는 과제·근거에 없는 숫자가 모두 없습니다.</Empty>
      ) : (
        <>
          <Table rows={todo.slice(0, SHOWN)} mg={mg} linkFor={staff} from={from} />
          {todo.length > SHOWN && (
            <details className="border-t border-line">
              <summary className="cursor-pointer px-5 py-3 text-sm font-bold text-navy">나머지 {todo.length - SHOWN}줄</summary>
              <Table rows={todo.slice(SHOWN)} mg={mg} linkFor={staff} from={from} />
            </details>
          )}
          {done > 0 && <p className="border-t border-line px-5 py-2.5 text-xs text-muted-2">채울 것이 없는 {staff ? "부서 줄" : "줄"} {done}개는 접어 두었습니다.</p>}
        </>
      )}
    </Panel>
  );
}
