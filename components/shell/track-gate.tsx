import Link from "next/link";
import { Empty, PageHeader, Screen } from "../ui/kit";

/**
 * 경영관리 트랙을 아직 지원하지 않는 화면(경평 초안)의 안내 — 머리띠에서 주요사업을 고르면 평소 화면이 나옴(경영관리 확장 설계 E).
 * 머리 제목(title)은 주요사업 화면과 같은 메뉴 이름이고, 세부 화면 이름(screen — 과제별 초안·목차·쪽 배정 등)은 안내 문구에만 씀
 */
export function TrackNotReady({ title, screen = title, track = "경영관리" }: { title: string; screen?: string; /** 아직 준비 중인 트랙(기본 경영관리 — 주요사업 지표 단위 부분처럼 반대인 화면은 「주요사업」) */ track?: "경영관리" | "주요사업" }) {
  return (
    <Screen header={<PageHeader title={title} />}>
      <Empty title={`${track} 트랙의 「${screen}」 화면은 아직 준비 중입니다.`}>
        {track === "경영관리" ? (
          <>
            지금은 과제 원장에서 경영관리 과제관리카드를 보고 고칠 수 있습니다. 이 화면은 머리띠에서 「주요사업」을 고르면 쓸 수 있습니다.
            <div className="mt-3">
              <Link href="/cards" className="text-link underline">
                과제 원장으로
              </Link>
            </div>
          </>
        ) : (
          <>
            지금은 경영관리 지표에서만 쓸 수 있습니다. 머리띠에서 「경영관리」를 고르고 사업 조판에서 지표를 고르세요.
            <div className="mt-3">
              <Link href="/reports/business" className="text-link underline">
                사업 조판으로
              </Link>
            </div>
          </>
        )}
      </Empty>
    </Screen>
  );
}
