// 부서 화면 보기(읽기 전용) 쓰기 막기의 구조 시험(QA Q4-02, 2026-11-22). app/ 아래 "use server" 파일이 내보내는 서버 액션은
// 본문에서 previewWriteBlocked()를 부르거나(CLAUDE.md 「화면」 — 새 쓰기 액션도 맨 앞에서 부름) 아래 NOT_GUARDED에 이유와 함께 있어야 합니다.
// 새 액션에서 부르기를 잊으면 여기서 실패합니다. 목록에 있는 이름이 없어졌거나 이미 부르게 됐으면 그것도 실패(목록을 지금 코드에 맞춤).
// 실제로 막는지(Referer 판정)는 preview-url.test.ts가 봅니다.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import ts from "typescript";

const ROOT = resolve(import.meta.dirname, "../..");
const APP = join(ROOT, "app");

const LOGIN = "로그인 전·로그아웃 — 부서 화면 보기와 무관";
const READ = "읽기만(쓰지 않음)";
const ADMIN = "관리 화면(사용자·과제 대응표·공통 지식 관리) 전용 — 부서 화면 보기 주소(isPreviewUrl)에서 그리지 않음";

/** previewWriteBlocked()를 부르지 않는 서버 액션 `경로 이름` → 이유 */
const NOT_GUARDED: Record<string, string> = {
  "app/login/actions.ts sendMagicLink": LOGIN,
  "app/login/actions.ts signOut": LOGIN,
  "app/auth/confirm/actions.ts confirmLogin": LOGIN,
  "app/(app)/cards/actions.ts getCardSelectPreview": READ,
  "app/(app)/cards/actions.ts getCardConsultTitles": READ,
  "app/(app)/cards/actions.ts getCardHistory": READ,
  "app/(app)/cards/actions.ts getCardInspections": READ,
  "app/(app)/cards/import/actions.ts getDraftImportPlan": READ,
  "app/(app)/cards/materials-actions.ts listCardMaterials": READ,
  "app/(app)/reports/business/[unit]/parts/actions.ts loadUnitParts": READ,
  "app/(app)/reports/cards/actions.ts getReportSelectPreview": READ,
  "app/(app)/reports/cards/edit-actions.ts listDraftEdits": READ,
  "app/(app)/reports/cards/outline-actions.ts listOutlineExamples": READ,
  "app/(app)/reports/cards/outline-actions.ts previewReportOutline": READ,
  "app/(app)/reports/cards/outline-actions.ts outlineShapeChoices": READ,
  "app/(app)/reports/cards/outline-actions.ts getOutlineCatalog": READ,
  "app/(app)/users/actions.ts lookupExistingUsers": READ,
  "app/(app)/users/actions.ts updateUser": ADMIN,
  "app/(app)/users/actions.ts inviteUser": ADMIN,
  "app/(app)/users/actions.ts setUserActive": ADMIN,
  "app/(app)/users/actions.ts setUserAssignments": ADMIN,
  "app/(app)/users/actions.ts applyUserPaste": ADMIN,
  "app/(app)/links/actions.ts setLinkStatus": ADMIN,
  "app/(app)/links/actions.ts setTaskMapStatus": ADMIN,
  "app/(app)/links/actions.ts bulkConfirm": ADMIN,
  "app/(app)/admin/library/actions.ts uploadPeerCases": ADMIN,
  "app/(app)/admin/library/actions.ts removePeerCases": ADMIN,
  "app/(app)/admin/library/knowledge-actions.ts startKnowledgeUpload": ADMIN,
  "app/(app)/admin/library/knowledge-actions.ts finishKnowledgeUpload": ADMIN,
  "app/(app)/admin/library/knowledge-actions.ts removeKnowledgeDocument": ADMIN,
};

/** 본문 안에 previewWriteBlocked(…) 호출이 있는가(주석·문자열 속 이름은 치지 않음) */
function callsGuard(node: ts.Node): boolean {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "previewWriteBlocked") return true;
  return ts.forEachChild(node, callsGuard) ?? false;
}

const exported = (n: ts.Node) => ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

/** "use server" 파일 하나의 내보낸 서버 액션(이름·부르는지). 이 시험이 못 읽는 꼴로 내보내면 unreadable에 */
function serverActions(path: string, src: string) {
  const sf = ts.createSourceFile(path, src, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const first = sf.statements[0];
  if (!first || !ts.isExpressionStatement(first) || !ts.isStringLiteral(first.expression) || first.expression.text !== "use server") return null;
  const actions: Array<{ name: string; guarded: boolean }> = [];
  const unreadable: string[] = [];
  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && exported(s) && s.name && s.body) actions.push({ name: s.name.text, guarded: callsGuard(s.body) });
    else if (ts.isVariableStatement(s) && exported(s)) {
      for (const d of s.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) actions.push({ name: d.name.text, guarded: callsGuard(d.initializer) });
        else unreadable.push(`${path} ${d.name.getText(sf)}`);
      }
    } else if (ts.isExportAssignment(s) || (ts.isExportDeclaration(s) && !s.isTypeOnly)) unreadable.push(`${path} ${s.getText(sf).slice(0, 40)}`);
  }
  return { actions, unreadable };
}

function scanApp() {
  const found = new Map<string, boolean>();
  const unreadable: string[] = [];
  for (const rel of readdirSync(APP, { recursive: true, encoding: "utf8" })) {
    if (!/\.tsx?$/.test(rel) || /\.test\.tsx?$/.test(rel)) continue;
    const path = `app/${rel.split("\\").join("/")}`;
    const r = serverActions(path, readFileSync(join(ROOT, path), "utf8"));
    if (!r) continue;
    for (const a of r.actions) found.set(`${path} ${a.name}`, a.guarded);
    unreadable.push(...r.unreadable);
  }
  return { found, unreadable };
}

test("도우미: previewWriteBlocked() 호출만 셈 — 주석·문자열 속 이름은 치지 않고, \"use server\" 파일이 아니면 건너뜀", () => {
  const src = `"use server";
export async function a() { if (await previewWriteBlocked()) return 1; return 2; }
export async function b() { // previewWriteBlocked()
  return "previewWriteBlocked()"; }
export const c = async () => { const x = await previewWriteBlocked(); return x; };
export const d = 1;
export { a as e };
export type { T } from "./t";`;
  assert.deepEqual(serverActions("x.ts", src), {
    actions: [{ name: "a", guarded: true }, { name: "b", guarded: false }, { name: "c", guarded: true }],
    unreadable: ["x.ts d", "x.ts export { a as e };"],
  });
  assert.equal(serverActions("y.ts", 'import "server-only";\nexport async function a() {}'), null);
});

test("app/ 서버 액션은 모두 previewWriteBlocked()를 부르거나 NOT_GUARDED에 이유와 함께 있다 — 새 쓰기 액션은 맨 앞에서 부름", () => {
  const { found, unreadable } = scanApp();
  assert.ok([...found.values()].filter(Boolean).length > 0, "부르는 서버 액션을 하나도 못 찾음(찾는 방법이 깨짐)");
  assert.deepEqual(unreadable, [], "이 시험이 못 읽는 꼴로 내보낸 것 — export async function으로");
  const missing = [...found].filter(([k, guarded]) => !guarded && !(k in NOT_GUARDED)).map(([k]) => k);
  assert.deepEqual(missing, [], `previewWriteBlocked()를 안 부르는 서버 액션 ${missing.length}개(쓰기면 맨 앞에서 부르고, 아니면 NOT_GUARDED에 이유)`);
});

test("NOT_GUARDED 목록은 지금 코드와 맞다 — 없는 이름·이미 부르는 액션이 남지 않음", () => {
  const { found } = scanApp();
  assert.deepEqual(Object.keys(NOT_GUARDED).filter((k) => !found.has(k)), [], "목록에 남은 없는 서버 액션");
  assert.deepEqual(Object.keys(NOT_GUARDED).filter((k) => found.get(k) === true), [], "이미 previewWriteBlocked()를 부르는데 목록에 남은 것");
});
