import type { NextRequest } from "next/server";
import { requireAtLeast } from "../../../../lib/auth/dal.ts";
import { listCards } from "../../../../lib/cards/queries.ts";
import { currentPeriod } from "../../../../lib/cards/view.ts";
import { csvResponse } from "../../../../lib/csv.ts";
import { fmtDate, isPeriod, monthLabel } from "../../../../lib/format.ts";
import { STATUS_LABEL, TABLE_KEYS, checklistCounts, formTablesOf, judgeStatus, linkText, readResult, remedyText, tally } from "../../../../lib/inspections/model.ts";
import { inspectionsForPeriod } from "../../../../lib/inspections/queries.ts";
import { createClient } from "../../../../lib/supabase/server.ts";
import { TRACK_SPECS } from "../../../../lib/tracks/index.ts";
import { getTrack } from "../../../../lib/tracks/current.ts";

/**
 * 월간 점검 결과 내려받기(CSV, ?period=YYYY-MM) — 성과관리팀·관리자.
 * 앞 열은 점검결과 DB 속성(충족 수·미흡 항목·개선방향·사례제안)과 같게, 뒤 열은 20항목의 판단·미흡 시 보완방안.
 * 지금 고른 트랙의 과제만(경영관리는 정합성 항목 이름이 다르고, 끝에 자가진단 체크리스트 대조·주요사업 연계 후보 열이 더해짐).
 */
export async function GET(request: NextRequest) {
  const me = await requireAtLeast("pmo", "/inspections");
  if (!me) return new Response("성과관리팀·관리자만 내려받을 수 있습니다.", { status: 403 });
  const raw = request.nextUrl.searchParams.get("period") ?? "";
  const period = isPeriod(raw) ? raw : currentPeriod();
  const supabase = await createClient();
  const track = await getTrack();
  const mgmt = track === "경영관리";
  const tables = formTablesOf(TRACK_SPECS[track].inspectionForm);
  const [rows, inspections] = await Promise.all([listCards({ track }), inspectionsForPeriod(supabase, period)]);
  const items = TABLE_KEYS.flatMap((k) => tables[k].rows.map((f) => ({ k, f, label: `${tables[k].short}${f.no} ${f.name}` })));
  const header = [
    "과제번호",
    "대상사업",
    "과제명",
    "부서명",
    "팀명",
    "점검월",
    "점검 상태",
    "판정 상태",
    "7대축 충족",
    "질의패턴 충족",
    "정합성 충족",
    "7대축 미흡",
    "질의패턴 미흡",
    "정합성 미흡",
    "보완 건수",
    "집중보완",
    "추진현황",
    "개선방향",
    "사례제안",
    "AI 초안",
    "수정일",
    ...items.flatMap((it) => [`${it.label} 판단`, `${it.label} 보완방안`]),
    ...(mgmt ? ["체크리스트 대조 건수(예·부분·아니오·해당 없음)", "체크리스트 대조(구분 | 점검사항 요지 | 결과 | 반영과제 | 비고)", "주요사업 연계 후보(항목: 연계 후보)"] : []),
  ];
  const body = rows.map((r) => {
    const ins = inspections.get(r.id);
    if (!ins) return [r.taskNo, r.business, r.title, r.department, r.team ?? "", period, STATUS_LABEL.none];
    const res = readResult(ins.result);
    const t = tally(res);
    return [
      r.taskNo,
      r.business,
      r.title,
      r.department,
      r.team ?? "",
      period,
      STATUS_LABEL[ins.status],
      judgeStatus(res),
      t.tables.axes.met,
      t.tables.patterns.met,
      t.tables.coherence.met,
      t.tables.axes.weak.join(", "),
      t.tables.patterns.weak.join(", "),
      t.tables.coherence.weak.join(", "),
      t.needs,
      t.focus ? "집중보완" : "",
      res.overview.status,
      res.overview.direction,
      res.overview.case,
      res.ai?.model ?? "",
      fmtDate(ins.updatedAt),
      ...items.flatMap((it) => {
        const row = res[it.k][it.f.no - 1];
        return [row.judgment ?? "", remedyText(it.k, row)];
      }),
      ...(mgmt
        ? (() => {
            const c = checklistCounts(res.checklist);
            const links = items.flatMap((it) => (res[it.k][it.f.no - 1].links ?? []).map((l) => `${it.label}: ${linkText(l)}`));
            return [`${c.yes}·${c.partial}·${c.no}·${c.na}`, (res.checklist?.rows ?? []).map((x) => [x.label, x.point, x.result ?? "미정", x.task, x.note].join(" | ")).join("\n"), links.join("\n")];
          })()
        : []),
    ];
  });
  return csvResponse(`월간점검_${monthLabel(period)}_${period}.csv`, [header, ...body]);
}
