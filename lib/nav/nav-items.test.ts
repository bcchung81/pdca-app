import assert from "node:assert/strict";
import { test } from "node:test";
import { navSectionsFor } from "../../components/shell/nav-items.ts";

test("navSectionsFor: 관리 섹션은 성과관리팀·관리자에게만(부서 담당자는 없음)", () => {
  assert.equal(navSectionsFor("dept_user").some((s) => s.id === "admin"), false);
  for (const role of ["pmo", "admin"] as const) {
    const admin = navSectionsFor(role).find((s) => s.id === "admin");
    assert.ok(admin, role);
    assert.equal(admin.title, "관리");
    assert.equal(admin.items[0].tabs?.[0].href, "/admin/usage");
  }
});

test("navSectionsFor: 관리 탭 순서 — 접속 기록은 관리자만, 나머지는 성과관리팀 이상", () => {
  const tabs = (role: "pmo" | "admin") => navSectionsFor(role).find((s) => s.id === "admin")?.items[0].tabs?.map((t) => t.href);
  assert.deepEqual(tabs("admin"), ["/admin/usage", "/admin/access-log", "/admin/access-events", "/admin/library"]);
  assert.deepEqual(tabs("pmo"), ["/admin/usage", "/admin/access-events", "/admin/library"]);
});
