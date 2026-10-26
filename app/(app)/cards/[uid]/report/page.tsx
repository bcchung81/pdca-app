import { redirect } from "next/navigation";

/** 옛 주소: 과제별 초안은 경평 초안 › 과제별 초안으로 옮겼습니다(원장에는 두지 않음) */
export default async function CardReportRedirect({ params }: PageProps<"/cards/[uid]/report">) {
  const { uid } = await params;
  redirect(`/reports/cards/${uid}`);
}
