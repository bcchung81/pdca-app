import { requireUser } from "../../../../../lib/auth/dal.ts";
import { HWPX_MIME, cardToHwpx, hwpxFileName } from "../../../../../lib/cards/hwp/export.ts";
import { openVersion } from "../../../../../lib/cards/versions.ts";
import { createClient } from "../../../../../lib/supabase/server.ts";

/**
 * 과제관리카드 한글(HWPX) 내려받기 — 원본 배치가 있으면 원본 한글 파일 모양 그대로, 없으면 9.16 양식.
 * 부서 담당자는 이달 작성본(없으면 원장), 성과관리팀·관리자는 원장. 읽기 권한은 RLS가 판정합니다(볼 수 없는 카드는 404).
 */
export async function GET(_req: Request, ctx: RouteContext<"/cards/[uid]/hwpx">) {
  const { uid } = await ctx.params;
  const me = await requireUser(`/cards/${uid}`);
  if (!/^[0-9a-f-]{36}$/i.test(uid)) return new Response("잘못된 주소입니다.", { status: 400 });
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("id, uid, task_no, title, data, team_id, layout").eq("uid", uid).maybeSingle();
  if (!card) return new Response("카드를 찾을 수 없습니다.", { status: 404 });
  let data = card.data;
  if (me.role === "dept_user" && me.team?.id === card.team_id) {
    const open = await openVersion(supabase, card.id);
    if (open) data = open.data;
  }
  try {
    const bytes = await cardToHwpx(supabase, card.uid, data, card.layout);
    const name = hwpxFileName(card.task_no, String(data.title ?? card.title));
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": HWPX_MIME,
        "content-disposition": `attachment; filename="card.hwpx"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("card hwpx", e);
    return new Response("한글 파일을 만들지 못했습니다.", { status: 500 });
  }
}
