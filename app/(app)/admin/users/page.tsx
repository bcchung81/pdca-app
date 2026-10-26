import { redirect } from "next/navigation";

// 사용자·권한은 성과관리팀에도 열리면서 /users로 옮겼습니다(예전 주소는 그대로 이어 줌)
export default function LegacyUsersPage() {
  redirect("/users");
}
