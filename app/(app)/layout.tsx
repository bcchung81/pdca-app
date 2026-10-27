import { cookies } from "next/headers";
import { Suspense } from "react";
import Link from "next/link";
import { NAV_COOKIE, type NavMode, navSectionsFor } from "../../components/shell/nav-items";
import { BrandLogo } from "../../components/shell/brand-mark";
import { NavProvider } from "../../components/shell/nav-context";
import { type FindItem, QuickFind } from "../../components/shell/quick-find";
import { SideNav } from "../../components/shell/side-nav";
import { TrackSwitch } from "../../components/shell/track-switch";
import { homeFor } from "../../lib/auth/access.ts";
import { ROLE_LABEL, getCurrentUser } from "../../lib/auth/dal.ts";
import { compareTaskNo, compareUnitId } from "../../lib/cards/view.ts";
import { navBadges } from "../../lib/nav-badges.ts";
import { getTrack } from "../../lib/tracks/current.ts";
import { createClient } from "../../lib/supabase/server.ts";
import { signOut } from "../login/actions";
import "../../lib/cards/card.css";
import "../../components/cards/card-marks.css";

// 로그인한 화면들의 틀: 머리띠 + 접는 메뉴. 권한 확인은 각 화면(requireUser)과 DB(RLS)가 합니다.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  const saved = (await cookies()).get(NAV_COOKIE)?.value;
  const navMode: NavMode = saved === "collapsed" || saved === "open" ? saved : "auto";
  if (!user?.active) return <>{children}</>;
  const who = user.displayName || user.email;
  // 과제 빠른 찾기 목록(볼 수 있는 카드만 — RLS)
  const supabase = await createClient();
  const track = await getTrack();
  const [{ data: cards }, badges] = await Promise.all([
    supabase.from("cards").select("uid, task_no, title, team:teams(name), unit:eval_units(card_group, track)").eq("status", "active"),
    navBadges(user, track),
  ]);
  const first = <X,>(v: X | X[] | null): X | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const findItems: FindItem[] = (cards ?? [])
    .map((c) => ({ uid: c.uid, taskNo: c.task_no, title: c.title, group: first(c.unit)?.card_group ?? "", team: first(c.team)?.name ?? "" }))
    .sort((a, b) => compareUnitId(a.group, b.group) || compareTaskNo(a.taskNo, b.taskNo));
  // 트랙 전환은 이 사용자에게 두 트랙의 과제가 다 보일 때만(한 트랙뿐이면 숨김 — 경영관리 확장 분석 §4.7)
  const tracks = new Set((cards ?? []).map((c) => first(c.unit)?.track));
  const place = [user.team?.hq, ROLE_LABEL[user.role]].filter(Boolean).join(" · ");
  const sections = navSectionsFor(user.role);

  return (
    // 앱 틀은 한 화면(h-screen) 안에서 각 화면이 스스로 스크롤함 — 문서 전체는 스크롤하지 않음. relative + overflow-hidden은 위치 기준이
    // 없는 absolute 요소(sr-only 등)가 문서를 늘려 내용 없는 스크롤이 생기는 것을 막음(2026-10-26, /my/report 표 머리 sr-only가 최대 5,000px)
    <div className="relative flex h-screen min-h-0 flex-col overflow-hidden bg-desk text-ink">
      {/* 키보드 사용자용: 초점이 오면 머리띠 위 왼쪽 위에 보임 */}
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-skip rounded-md border border-navy bg-paper px-3 py-2 text-ui font-semibold text-navy">
        본문으로 건너뛰기
      </a>
      <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-line-strong pr-6 pl-5">
        <div className="flex min-w-0 items-center gap-3.5">
          {/* 로고(심볼 + 글자) = 홈(역할별 첫 화면 — 부서 담당자는 내 과제, 성과관리팀·관리자는 현황) */}
          <Link href={homeFor(user.role)} title="홈으로" aria-label="경평AI비서 — 홈으로" className="flex shrink-0 items-center no-underline hover:opacity-80">
            <BrandLogo />
          </Link>
          {tracks.has("경영관리") && tracks.has("주요사업") && <TrackSwitch track={track} />}
        </div>
        <div className="flex min-w-0 shrink items-center gap-2.5">
          <QuickFind items={findItems} base={user.role === "dept_user" ? "/my" : "/cards"} />
          <Link href="/help" className="shrink-0 text-xs whitespace-nowrap text-link no-underline hover:underline">
            도움말
          </Link>
          <div className="flex size-[30px] shrink-0 items-center justify-center rounded-full border border-navy font-serif text-sm font-semibold text-navy" aria-hidden="true">
            {who.slice(0, 1)}
          </div>
          <span className="max-w-[420px] min-w-0 truncate text-ui whitespace-nowrap" title={`${user.email} · ${place}`}>
            <b className="font-bold text-navy">{who}</b>
            <span className="text-muted"> · {place}</span>
          </span>
          <form action={signOut}>
            <button type="submit" className="ml-1 shrink-0 text-xs whitespace-nowrap text-link underline">
              로그아웃
            </button>
          </form>
        </div>
      </header>
      <div className="flex min-h-0 grow">
        {/* 전체 보기 주소(?full=1 포함)면 메뉴를 숨기므로 주소 쿼리를 읽음 — 미리 그리는 화면에서도 깨지지 않게 Suspense */}
        <Suspense fallback={null}>
          <SideNav roleLabel={ROLE_LABEL[user.role]} sections={sections} initialMode={navMode} badges={badges} />
        </Suspense>
        {/* 한 메뉴에 묶은 화면(과제 원장 → 원장·현행화·보관함 등)의 선택은 각 화면의 한 줄 머리 오른쪽(GroupSeg)에 그림 — 메뉴·배지는 NavProvider로 내려 줌 */}
        <NavProvider sections={sections} badges={badges}>
          <div id="content" tabIndex={-1} className="flex min-h-0 min-w-0 grow flex-col focus:outline-none">
            {children}
          </div>
        </NavProvider>
      </div>
    </div>
  );
}
