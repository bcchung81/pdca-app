import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

/** 옛 주소: 과제별 초안 HTML 내려받기는 경평 초안 › 과제별 초안으로 옮겼습니다 */
export async function GET(_request: NextRequest, { params }: RouteContext<"/cards/[uid]/report/html">) {
  const { uid } = await params;
  redirect(`/reports/cards/${uid}/html`);
}
