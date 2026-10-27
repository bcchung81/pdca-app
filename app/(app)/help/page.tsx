import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Panel, Screen, T, Tag } from "../../../components/ui/kit";
import { ReportFontStatus } from "../../../components/reports/report-font-status";
import { ROLE_LABEL, requireUser } from "../../../lib/auth/dal.ts";

export const metadata: Metadata = { title: "도움말 · 경평AI비서" };

type Mark = "쓰기" | "보기" | "—";
// 메뉴 › 탭(한 메뉴에 묶은 화면은 화면 위 탭으로 옮겨 다님). 성과관리팀·관리자에게 부서 담당자 화면은 「부서 화면 보기」
const SCREENS: Array<{ name: string; href: string; dept: Mark; pmo: Mark; admin: Mark; note: string }> = [
  { name: "내 과제 › 과제", href: "/my", dept: "쓰기", pmo: "보기", admin: "보기", note: "담당자: 자기에게 지정된 과제만 보이고 이달 작성본을 고쳐 「확정(원장 반영)」 · 성과관리팀·관리자: 모든 과제가 보이며(읽기 전용) 부서를 고르면 그 부서 과제만" },
  { name: "내 과제 › 점검 결과", href: "/my/inspections", dept: "쓰기", pmo: "보기", admin: "보기", note: "받은 월간 점검표(총평·7대 축·질의 패턴·정합성 — 경영관리는 끝에 자가진단 체크리스트 대조) 읽고 「확인했습니다」" },
  { name: "과제 옆 창 › AI 작성지원", href: "/my", dept: "쓰기", pmo: "쓰기", admin: "쓰기", note: "카드는 왼쪽에 두고 오른편에서 대화처럼: 요청 종류(개선 제안 — 지적사항 환류·전략연계·점검 기준 · 실적 발굴 · 실적 반영 · 보완 점검 — 최근 점검표의 보완 요구가 카드에 반영됐는지 스스로 점검, 반영 제안과 「카드에 반영」)와 「질문」(자유 질문, 앞의 답을 이어서 묻기). 칸 하나 다듬기는 글을 끌어 고른 뒤 「AI 수정 요청」. 실적 자료 파일(PDF·한글·워드·엑셀)은 창에 끌어 놓거나 📎로 첨부 — 카드 전용 자료로 남아 경평 초안에서도 고름(파일당 50MB). 기록은 이 탭에 남고 .md 내려받기, 「넓게 보기」" },
  {
    name: "경평 초안(부서)",
    href: "/my/report",
    dept: "쓰기",
    pmo: "보기",
    admin: "보기",
    note: "부서의 경평 초안은 이 한 곳입니다: 맨 위 「입력할 것」(계량 실적 미입력·【확인】 자리표시·초안 없는 과제·근거에 없는 숫자를 자기 부서 몫만 모음) 아래 접힌 「자료 요청」(구성안 재료표에서 근거가 없어 못 채운 「자료 필요」를 과제별로 모음 — 「요청 글 복사」로 메일·메신저에 붙임) → 추가자료·계량 실적 입력 → 카드마다 「초안」(/reports/cards/<카드>)에서 과제별 초안 쓰기 → 목차에 든 과제 모두 초안이 있어야 「확정」 → 검토 화면(/reports/<보고서>)에서 성과관리팀 코멘트를 읽고 「해결로 표시」",
  },
  { name: "경평 초안 › 과제별 초안(카드마다)", href: "/reports/cards", dept: "쓰기", pmo: "쓰기", admin: "쓰기", note: "카드 1장 → 2025년도 최종본 양식의 초안 HTML(주요사업 평가내용2 소항목 · 경영관리 평가내용 → 대주제 → 절). 「구성안 만들기」로 재료표·이야기 틀(주 틀 + 필요하면 보조 틀 — 앱이 틀 후보를 붙임)·블록 목록을 먼저 보고 고친 뒤 「승인하고 집필」 — 구성안은 이 과제의 최근 월간 점검표에서 미흡으로 짚힌 항목을 논점에 반영. 한 해 동안 고친 카드(원장)와 고른 첨부 자료(카드 전용 자료·보고서 추가자료)가 근거, 근거에 없는 숫자는 붉은 점선, BP 표시, HTML·한글(HWPX) 내려받기(한글은 도식을 표·목록으로 펼친 개조식 원고 — 그림은 자리표시, 한글에서 다듬기) · 구성안·집필은 각각 몇 분 걸림(진행 줄에 보통 시간) · 부서는 자기 부서 카드를 「경평 초안」에서 들어가 씀, 사업별 목록(이 화면)은 성과관리팀 이상" },
  { name: "경평 초안 › 글꼴 안내", href: "/help#report-fonts", dept: "보기", pmo: "보기", admin: "보기", note: "화면·한글 파일이 같은 글꼴로 그려지도록 KoPub 2.0 등 설치 안내와 이 PC의 설치 상태(과제별 초안 더보기 메뉴에서도 열림)" },
  { name: "머리띠 트랙 전환(경영관리 | 주요사업)", href: "/cards", dept: "보기", pmo: "보기", admin: "보기", note: "로고 옆 스위치로 보는 트랙을 고름(두 트랙의 과제가 다 보이는 사람에게만 나옴). 과제 원장·내 과제·현황·부서 화면 보기가 고른 트랙을 따르고, 경영관리도 월간 점검(지침 13 — 정합성 항목이 다르고 「자가진단 체크리스트 대조」 블록이 더해짐)·카드 AI 작성지원(지침 08)·경평 초안(구성안부터, 평가내용 → 대주제 → 절)을 쓸 수 있고, 경평 초안의 목차·쪽 배정·사업 조판도 지원. 경영관리 카드의 고정 영역은 전년도 환류·지적 및 개선방안·계량 성과지표(확정하면 부서 작성본에서 잠김)" },
  { name: "현황", href: "/dashboard", dept: "—", pmo: "보기", admin: "보기", note: "이달 할 일, 사업·부서별 진행(경영관리는 본부·실·단 → 부서(팀)·지표별 작성본·담당자 현황)" },
  { name: "과제 원장 › 원장", href: "/cards", dept: "—", pmo: "쓰기", admin: "쓰기", note: "원장 바로 편집(한글 원본 모양 그대로), 제출된 작성본 비교·확정, 고정 영역 확정, 목록 내려받기(CSV)" },
  { name: "과제 원장 › 현행화", href: "/cards/import", dept: "—", pmo: "쓰기", admin: "쓰기", note: "부서가 보낸 한글 파일(HWP·HWPX)을 원장과 블록별로 비교해 승인한 것만 반영(HWP는 원본 모양도 함께)" },
  { name: "과제 원장 › 보관함", href: "/cards/archive", dept: "—", pmo: "쓰기", admin: "쓰기", note: "삭제(보관)한 과제 되살리기 · 완전 삭제는 관리자만" },
  { name: "월간 점검", href: "/inspections", dept: "—", pmo: "쓰기", admin: "쓰기", note: "과제별 점검표(AI 초안·직접 판단) → 부서에 보내기, 결과 내려받기(CSV) · 머리띠에서 고른 트랙의 과제(주요사업 지침 14 · 경영관리 지침 13)" },
  { name: "월간 점검 › 취합 보고", href: "/inspections/summary", dept: "—", pmo: "보기", admin: "보기", note: "그 달 점검표를 모은 회의용 취합 결과보고서(집중보완·공통 미흡·사례제안 종합), .md 내려받기 · 고른 트랙의 과제만" },
  {
    name: "경평 초안 › 보고서 현황",
    href: "/reports",
    dept: "—",
    pmo: "쓰기",
    admin: "쓰기",
    note: "사업×부서 제출 관리판 — 맨 위 「채울 것 모아 보기」(평가단위×부서별로 계량 실적 미입력·【확인】 자리표시·초안 없는 과제·근거에 없는 숫자·「자료 필요」(구성안 재료표) 수를 할 일 많은 순으로(자료 필요는 정렬 합에 안 넣음), 「열기」는 그 부서 담당자에게 보이는 경평 초안 · 경영관리는 카드 밖 부분 줄 포함) · 부서·과제 수·과제별 초안 진행(n/m)·확인할 것(다시 만들기 권장·채울 자료·근거에 없는 숫자·판면 넘침)·계량 실적·추가자료·상태·제출일·미해결 코멘트·검토 메모, 「검토」로 들어가 과제·블록 단위 코멘트 · 돌려보내기(메모 필수)·승인 · 주관 부서 지정 · 보고서 준비",
  },
  { name: "경평 초안 › 목차·쪽 배정", href: "/reports/outline", dept: "—", pmo: "쓰기", admin: "쓰기", note: "머리띠에서 고른 트랙의 카드로 목차 만들기 — 주요사업은 대상사업 → 실행과제 → 과제(사업마다 15±1쪽), 경영관리는 지표마다 평가내용 → 과제(지표 총 쪽수는 작성분량, 그중 본문 예산을 2025 지표별 보고서 쪽 비율로 나눈 배정안 — 성과관리팀이 고침, 대응 카드 없는 평가내용은 참고 줄). 과제마다 0.5쪽 단위 쪽 배정, 목차 포함 여부(제외한 과제는 제출 조건에서 빠짐)" },
  { name: "경평 초안 › 사업 조판", href: "/reports/business", dept: "—", pmo: "보기", admin: "보기", note: "주요사업(경영관리는 지표) 하나의 과제별 초안을 목차·쪽 배정 순서로 쪽에 이어 붙여 보기(같은 문장·같은 짜임·초안 없음 검사) — 주요사업은 대상사업·실행과제가 바뀌면 새 쪽·예산 15±1쪽, 경영관리는 평가내용이 바뀌면 새 쪽·그 지표 본문 예산(작성분량 기준)과 비교하고, 카드 밖 부분(지적사항 조치실적 + 전년 대비는 새 쪽에서 이어 쓰고 본문은 그 뒤 새 쪽, 성과분석 및 환류는 본문 뒤 새 쪽)도 제자리 쪽에 끼워 지표 전체 쪽 수(작성분량 ±1쪽)와 「카드 밖 부분 N쪽 넘침」을 봄. 머리의 한글 아이콘은 표지·지적·전년 대비·과제별 초안·성과분석을 한 파일(HWPX)로 내려받음(장 사이 쪽 나눔은 한글에서)" },
  { name: "경평 초안 › 사업 조판 › 카드 밖 부분", href: "/reports/business", dept: "—", pmo: "쓰기", admin: "쓰기", note: "경영관리 지표 하나의 과제별 초안이 쓰지 않는 장 — 표지 · 지적사항 조치실적 · 전년 대비 주요 추진실적 · 성과분석 및 환류 — 을 보고 고침(사업 조판 머리의 클립보드 아이콘). 왼쪽은 미리보기 종이, 오른쪽은 부분 탭: 회색 글은 재료(카드 원장·2025 보고서·편람·부서 실적)에서 채운 칸이라 읽기만, 입력 칸(조치 및 개선실적·’26 주요실적·성과 분석 등)은 고쳐 「저장」. 「재료로 다시 채우기」는 행 목록·숫자만 새로 채우고 쓴 글은 남김, 부분마다 「확정」(표시용). 계량 행은 표에 넣을지·극성(높을수록/낮을수록 좋음)을 고르면 달성률을 코드가 셈. AI 문장 채우기는 아직 없음" },
  { name: "공통 지식 › 검색", href: "/knowledge", dept: "보기", pmo: "보기", admin: "보기", note: "AI가 근거로 쓰는 경영평가 문서 조각 검색" },
  { name: "공통 지식 › 지적·과제 연결", href: "/links", dept: "—", pmo: "쓰기", admin: "쓰기", note: "적재가 만든 연결 초안 확정(확신도 높은 것은 일괄 확정). 자동 연결은 참고 초안이라 지적 연결은 확정하지 않아도 AI가 관련 자료를 빠짐없이 보고, 과제 대응은 원문을 대조한 뒤 확정" },
  { name: "사용자 › 사용자·담당 과제", href: "/users", dept: "—", pmo: "쓰기", admin: "쓰기", note: "부서 담당자 계정 추가·이름·팀 변경·사용 중지(삭제)·복구, 과제 담당자 지정(1명↔여러 과제, 과제↔여러 명). 성과관리팀·관리자 계정과 역할 변경은 관리자만" },
  { name: "사용자 › 일괄 등록", href: "/users/import", dept: "—", pmo: "쓰기", admin: "쓰기", note: "엑셀에서 이름·이메일·팀명 셀을 복사해 붙여넣으면 팀명을 카드가 연결된 팀과 견줘 자동 확정·추천하고, 확인한 줄만 반영(팀 과제 자동 매칭). 성과관리팀은 기관 메일만" },
  { name: "관리 › AI 사용량", href: "/admin/usage", dept: "—", pmo: "—", admin: "보기", note: "달마다 호출·토큰·오류" },
  { name: "관리 › 공통 자료·틀", href: "/admin/library", dept: "—", pmo: "—", admin: "쓰기", note: "붙임2(유관기관 평가보고서 정리) 올리기 → 월간 점검 ★사례제안, 공통 지식 적재 검산, 기준 문서 사본" },
];

const MONTHLY = [
  { who: "부서 담당자", when: "매월 말", what: "「내 과제」에서 카드를 열어 이달 실적을 반영합니다(이달 작성본, 자동 저장). 글을 끌어 고르면 AI에 수정을 요청하거나 물을 수 있고, 「AI 작성지원」으로 개선 제안·실적 발굴·실적 반영·보완 점검을 받고(실적 자료 파일은 창에 끌어 놓아 첨부), 「질문」으로 앞의 답을 이어서 물어볼 수 있습니다. 한글 파일로 고쳤으면 더보기(…)의 「한글 파일로 작성본 채우기」. 인쇄했을 때 모양은 「쪽 보기」(한글과 같은 자리에서 쪽을 나눔, 읽기 전용). 다 되면 「확정(원장 반영)」을 눌러 원장에 반영합니다(성과관리팀 확인 단계 없음)." },
  { who: "성과관리팀", when: "다음 달 초", what: "부서가 원장에 반영한 내용을 「수정 이력」에서 확인하고, 고칠 점이 있으면 원장을 직접 고칩니다. 이미 제출 상태로 남아 있는 옛 작성본만 「과제 원장」에서 원장과 비교해 확정하거나 메모와 함께 돌려보냅니다(그사이 원장에서 같은 구역을 고쳤으면 「충돌」로 먼저 알려 줌)." },
  { who: "성과관리팀", when: "다음 달 초", what: "「월간 점검」에서 과제별 점검표(종합점검 지침 양식: AI 점검 총평 · 우수사례 벤치마킹 7대 축 · 평가위원 질의 패턴 8 · 정합성 5)를 AI 초안으로 만들거나 직접 판단해 확인한 뒤 부서에 보내고, 「취합 보고」로 그 달 결과를 모읍니다." },
  { who: "부서 담당자", when: "받은 뒤", what: "「내 과제 › 점검 결과」에서 읽고 「확인했습니다」를 누른 뒤, 미흡 항목의 보완방안(어느 칸에 무엇을)을 다음 작성본에 반영합니다." },
];

const KEYS = [
  ["목록 아이콘(오른쪽 위)", "상세 화면 오른쪽 위 목록 아이콘은 연 화면으로 돌아감"],
  ["⌘K / Ctrl+K", "어디서든 과제 찾기 → Enter로 카드 열기"],
  ["/", "과제 목록 검색 칸으로"],
  ["Esc", "코멘트 작성·도구줄 닫기, 옆 창·패널 닫기(닫기 전에 저장)"],
  ["클릭", "카드 글을 그 자리에서 고치기(고치는 동안은 같은 모양으로 흘려 보이고, 고치지 않고 나가면 원본 줄 배치로)"],
  ["Home / End", "고치는 줄의 처음·끝으로"],
  ["드래그", "고른 글에 AI 수정 요청 · 질문 · 삭제 · 좋음"],
  ["⌘↵ / Ctrl+Enter", "코멘트 보내기(5초 안에는 알림의 「되돌리기」)"],
  ["Enter", "카드 글줄 뒤에 새 줄"],
  ["Backspace(빈 줄)", "카드 글줄 지우기"],
];

/** 도움말: 역할별로 볼 수 있는 화면, 매월·12월 흐름, AI 원칙, 단축키 */
export default async function HelpPage() {
  const user = await requireUser("/help");
  const col = user.role === "dept_user" ? "dept" : user.role;
  const mark = (m: Mark) => (m === "쓰기" ? <Tag tone="navy">쓰기</Tag> : m === "보기" ? <Tag tone="link">보기</Tag> : <span className="text-muted">—</span>);

  return (
    <Screen header={<PageHeader title="도움말" />}>
      <Panel title="역할별 화면">
        <p className="border-b border-line px-5 py-3 text-ui text-muted-2">
          {ROLE_LABEL[user.role]}로 로그인했습니다. 윗 역할은 아랫 역할의 화면을 모두 볼 수 있습니다(관리자 &gt; 성과관리팀 &gt; 부서 담당자).
        </p>
        <div className="overflow-x-auto">
          <table className={`${T.table} min-w-[860px]`}>
            <colgroup>
              <col className="w-[160px]" />
              <col className="w-[100px]" />
              <col className="w-[100px]" />
              <col className="w-[100px]" />
              <col />
            </colgroup>
            <thead>
              <tr className={T.headRow}>
                <th scope="col" className={T.th}>
                  화면
                </th>
                {(["dept", "pmo", "admin"] as const).map((r) => (
                  <th key={r} scope="col" className={`${T.th} ${col === r ? "text-navy" : ""}`}>
                    {r === "dept" ? "부서 담당자" : ROLE_LABEL[r]}
                    {col === r ? " (나)" : ""}
                  </th>
                ))}
                <th scope="col" className={T.th}>
                  하는 일
                </th>
              </tr>
            </thead>
            <tbody>
              {SCREENS.map((s) => {
                const mine = s[col as "dept" | "pmo" | "admin"];
                return (
                  <tr key={`${s.name}|${s.href}`} className={T.row}>
                    <td className={`${T.td} truncate`}>
                      {mine !== "—" ? (
                        <Link href={s.href} className="font-semibold text-navy no-underline hover:underline">
                          {s.name}
                        </Link>
                      ) : (
                        <span className="text-muted-2">{s.name}</span>
                      )}
                    </td>
                    <td className={T.td}>{mark(s.dept)}</td>
                    <td className={T.td}>{mark(s.pmo)}</td>
                    <td className={T.td}>{mark(s.admin)}</td>
                    {/* T.td는 whitespace-nowrap이라 함께 쓰면 줄바꿈이 안 됨 — 같은 테두리·여백에 줄바꿈만 허용 */}
                    <td className="border-b border-row-line px-3 py-2 leading-5 text-muted-2">
                      {s.note}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <div id="report-fonts" className="scroll-mt-4">
        <Panel title="경평 초안 글꼴">
          <div className="flex flex-col gap-3 px-5 py-4 text-ui leading-6 text-ink">
            <p>경평 초안 화면과 한글(HWPX) 파일이 같은 글꼴로 그려져야 줄바꿈과 쪽 나뉨이 같습니다. 글꼴은 앱이 내려주지 않으므로 이 PC에 직접 설치해 주세요.</p>
            <ol className="flex list-decimal flex-col gap-1.5 pl-5">
              <li>
                <a href="https://www.kopus.org/biz-electronic-font2-2/" target="_blank" rel="noopener noreferrer" className="font-semibold text-link underline">
                  한국출판인회의 KoPub 2.0 내려받기(새 탭)
                </a>
                에서 사용 등록을 하고 「TTF(일반 문서용)」를 받습니다(무료).
              </li>
              <li>KoPub바탕·KoPub돋움 × Light·Medium·Bold, 6개를 모두 설치합니다. 윈도: 파일을 우클릭 → 「설치」 · 맥: 파일을 더블클릭 → 서체 관리자의 「서체 설치」.</li>
              <li>맑은 고딕(윈도 기본), HY헤드라인M·함초롬바탕(한컴오피스를 설치하면 함께 깔림)은 따로 설치합니다.</li>
              <li>설치한 뒤에는 브라우저를 완전히 껐다 켜야 인식됩니다.</li>
            </ol>
            <div className="flex flex-col gap-2 border-t border-row-line pt-3">
              <span className="text-xs font-semibold text-muted">이 PC 상태</span>
              <ReportFontStatus />
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <Panel title="매월 흐름(7~11월)">
          <ol className="flex flex-col">
            {MONTHLY.map((m, i) => (
              <li key={i} className="flex min-w-0 gap-3 border-b border-row-line px-5 py-3 last:border-b-0">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-navy font-serif text-xs font-bold text-navy">{i + 1}</span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-xs font-semibold text-muted">
                    {m.who} · {m.when}
                  </span>
                  <p className="text-ui leading-6 text-ink">{m.what}</p>
                </div>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel title="12월 경영실적보고서">
          <ol className="flex list-decimal flex-col gap-2 py-4 pr-5 pl-10 text-ui leading-6 text-ink">
            <li>6월 셋업: 성과관리팀이 고정 영역(주요사업 Act·Plan·계량지표, 경영관리 전년도 환류·지적 및 개선방안·계량지표)을 확정하고, 「목차·쪽 배정」에서 목차와 과제별 쪽수(0.5쪽 단위)를 정합니다 — 주요사업은 평가내용2(대상사업 → 실행과제 → 과제, 사업마다 15±1쪽), 경영관리는 지표마다 평가내용 → 과제(2025 보고서 쪽 수 기준 배정안에서 시작).</li>
            <li>성과관리팀이 「경평 초안」에서 그 해 보고서를 준비하고(사업×부서) 사업마다 주관 부서를 정합니다.</li>
            <li>부서는 「경평 초안」에서 추가자료(사진·수상·언론·공문)를 올리고 계량 실적 잠정치를 넣습니다. AI는 수치를 만들지 않습니다.</li>
            <li>과제별 초안: 「경평 초안 › 과제별 초안」(부서는 「경평 초안」 목록의 「초안」)에서 카드마다 따로 씁니다. 한 해 동안 고친 과제관리카드(원장)가 뼈대이고, 그 카드의 전용 자료와 보고서 추가자료 중 넣을 첨부를 골라 AI가 2025년도 최종본 양식의 평가내용2 소항목(라벨 사다리·도식·추진성과)으로 옮깁니다. 번호·마커·숫자 대조는 코드가 하고, 카드·첨부 자료에 없는 숫자는 붉은 점선으로 표시합니다.</li>
            <li>확정: 목차에 든 과제 모두 과제별 초안이 있어야 「확정」이 켜집니다(다시 만들기 권장·채울 자료·근거에 없는 숫자·판면 넘침은 확인할 것일 뿐 막지 않음). 성과관리팀은 「경평 초안 › 보고서 현황」에서 검토 화면을 열어 과제 머리나 미리보기 블록을 눌러 코멘트를 달고, 확정하면 승인 상태가 되어 내용이 잠기고 고치려면 「확정 취소」를 누릅니다. 성과관리팀은 고칠 점이 있으면 메모와 함께 「승인 풀기」로 돌려보냅니다. 부서는 검토 화면에서 코멘트를 읽고 「해결로 표시」합니다.</li>
            <li>주관 부서 사업 공통 부분(평가내용1·3·4·주요용어)은 다음 단계에서 다룹니다 — 지금은 과제별 초안(HTML)을 검토 화면에서 모아 봅니다.</li>
          </ol>
        </Panel>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <Panel title="AI 사용 원칙">
          <ul className="flex list-disc flex-col gap-1.5 py-4 pr-5 pl-9 text-ui leading-6 text-ink">
            <li>AI 결과는 제안입니다. 「카드에 반영」은 편집 권한이 있을 때만 켜지고, 반영한 뒤에도 사람이 확인합니다.</li>
            <li>코멘트(AI 수정 요청)는 AI가 카드를 바로 고치고 바뀐 곳을 노랗게 보여 줍니다. 코멘트마다 「되돌리기」가 있고, 기다리는 동안 직접 고친 곳은 덮지 않습니다(「충돌」로 알림).</li>
            <li>AI가 인용한 원문은 서버가 근거 자료와 대조해 「원문 확인 / 다름」으로 표시합니다.</li>
            <li>월간 점검 AI는 판단을 충족·미흡으로만 하고(등급 없음), 미흡마다 근거 원문(관리계획 발췌)·카드 근거·보완을 댑니다. 원문을 못 찾으면 「기준 미확인」입니다. 사례제안은 붙임2(유관기관 평가보고서 정리)가 들어오기 전까지 「기준 미확인 — 붙임2 미확보」입니다.</li>
            <li>자료 범위는 기능마다 고정입니다 — 카드 개선: 그 카드 + 카드 전용 자료 + 공통 지식 · 월간 점검: 확정 카드 + 공통 지식(카드 전용 자료 제외) · 경평 초안: 카드 + 카드 전용 자료 + 그 보고서 추가자료.</li>
            <li>「공통 지식 › 지적·과제 연결」의 자동 연결은 참고 초안입니다. 지적 연결은 확정하지 않아도 AI가 관련 자료를 빠짐없이 보므로 서둘러 확정하지 않아도 되고, 과제 대응은 원문과 대조한 뒤에 확정합니다.</li>
            <li>호출 기록은 토큰·오류만 남기고 본문은 저장하지 않습니다(1인 1분 5회).</li>
          </ul>
        </Panel>
        <Panel title="단축키">
          <dl className="grid grid-cols-[150px_1fr] gap-x-3 gap-y-2 px-5 py-4 text-ui">
            {KEYS.map(([k, v]) => (
              <div key={k} className="contents">
                <dt>
                  <kbd className="rounded border border-line-strong bg-field px-1.5 font-mono text-xs">{k}</kbd>
                </dt>
                <dd className="text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
    </Screen>
  );
}
