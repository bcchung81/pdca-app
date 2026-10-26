import type { NextRequest } from "next/server";
import { requireAtLeast } from "../../../../../../lib/auth/dal.ts";
import { HWPX_MIME, hwpxFileName } from "../../../../../../lib/cards/hwp/export.ts";
import { currentPeriod } from "../../../../../../lib/cards/view.ts";
import { draftToKcaHwpx } from "../../../../../../lib/hwpx/generate.ts";
import { loadMgUnitLayout } from "../../../../../../lib/reports/unit-layout-queries.ts";
import { unitReportMarkdown } from "../../../../../../lib/reports/unit-report-md.ts";
import { createClient } from "../../../../../../lib/supabase/server.ts";
import { loadUnitParts } from "../parts/actions";

/**
 * 경영관리 지표 한 파일 한글(HWPX) 내려받기(R5d, 설계 §3.8) — 표지 → Ⅰ 지적사항 조치실적 → Ⅱ 전년 대비 → Ⅲ 세부평가내용별 과제별 초안(목차 순) → Ⅳ 성과분석 및 환류.
 * 한글에서 다듬는 출발 원고(도식은 표·목록, 장 사이 쪽 나눔은 한글에서). 성과관리팀·관리자만(카드 밖 부분 화면과 같음 — 읽기는 RLS).
 * 비고 「p.N」은 사업 조판과 같은 계산(?start= 지표 시작 쪽, 없으면 2025 기본)
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/reports/business/[unit]/hwpx">) {
  const { unit } = await params;
  const me = await requireAtLeast("pmo", `/reports/business/${encodeURIComponent(unit)}`);
  if (!me) return new Response("성과관리팀·관리자만 내려받을 수 있습니다.", { status: 403 });
  const supabase = await createClient();
  const { data: u } = await supabase.from("eval_units").select("id, name, track").eq("id", unit).maybeSingle();
  if (!u) return new Response("평가단위를 찾을 수 없습니다.", { status: 404 });
  if (u.track !== "경영관리") return new Response("경영관리 지표만 지표 한 파일로 내려받을 수 있습니다.", { status: 400 });
  const year = Number(currentPeriod().slice(0, 4));
  const parts = await loadUnitParts(unit);
  if (!parts.ok) return new Response(parts.message, { status: 400 });
  const start = Number(request.nextUrl.searchParams.get("start"));
  try {
    const { items, remarks } = await loadMgUnitLayout(supabase, unit, year, parts.view, start > 0 ? start : null);
    if (!items.some((it) => it.spec)) return new Response("과제별 초안이 아직 없습니다.", { status: 404 });
    const { md, warnings } = unitReportMarkdown(parts.view, items, { remarks });
    if (warnings.length) console.warn("unit report hwpx", warnings);
    const { bytes } = await draftToKcaHwpx(md);
    // 평가단위 id(MG-N)는 식별자라 파일 이름에 쓰지 않고 지침 08의 지표 번호 표기(지표N)로
    const name = hwpxFileName(`지표${unit.replace(/^MG-/, "")}`, `${u.name} ${year}년도 경영실적보고서`);
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": HWPX_MIME,
        "content-disposition": `attachment; filename="unit-report.hwpx"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("unit report hwpx", e);
    return new Response("한글 파일을 만들지 못했습니다.", { status: 500 });
  }
}
