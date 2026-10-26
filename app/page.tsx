import { redirect } from "next/navigation";
import { homeFor } from "../lib/auth/access.ts";
import { getCurrentUser } from "../lib/auth/dal.ts";

// 첫 화면: 부서 담당자는 내 과제, 성과관리팀·관리자는 현황(로그인 확인은 proxy.ts와 각 화면이 함).
export default async function Home() {
  const user = await getCurrentUser();
  redirect(user?.active ? homeFor(user.role) : "/login");
}
