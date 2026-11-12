import assert from "node:assert/strict";
import { test } from "node:test";
import { navSectionsFor } from "../../components/shell/nav-items.ts";

test("navSectionsFor: 관리 섹션은 성과관리팀·관리자에게만(부서 담당자는 없음)", () => {
  assert.equal(navSectionsFor("dept_user").some((s) => s.id === "admin"), false);
  for (const role of ["pmo", "admin"] as const) {
    const admin = navSectionsFor(role).find((s) => s.id === "admin");
    assert.ok(admin, role);
    assert.equal(admin.title, "관리");
    assert.deepEqual(admin.items[0].tabs?.map((t) => t.href), ["/admin/usage", "/admin/library"]);
  }
});
