// 화면 글자 크기·색이 다시 흩어지지 않게 막습니다(2026-10-13 정제 언어, 「12px 미만 금지」).
// 글자는 7단계만: text-xs 12 · text-ui 13 · text-sm 14 · text-base 16 · text-lg 18 · text-title 22 · text-figure 28(토큰은 app/globals.css @theme).
// 검사 대상은 앱 화면 코드(app/**/*.tsx, components/**/*.{ts,tsx})뿐 — 인쇄 판면(lib/cards/card.css·lib/hwp·lib/reports HTML)은 대상이 아님.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "../..");

/** 일부러 뺀 파일: 레이아웃 밖 오류 화면(인라인 스타일), 엑셀 모사 붙여넣기 표 */
const EXCLUDED = new Set(["app/global-error.tsx", "app/(app)/users/import/paste-import.tsx"]);

function screenFiles(): string[] {
  const out: string[] = [];
  for (const [dir, ok] of [
    ["app", (f: string) => f.endsWith(".tsx")],
    ["components", (f: string) => f.endsWith(".tsx") || f.endsWith(".ts")],
  ] as const) {
    for (const rel of readdirSync(join(ROOT, dir), { recursive: true, encoding: "utf8" })) {
      const path = `${dir}/${rel.split("\\").join("/")}`;
      if (ok(path) && !path.endsWith(".test.ts") && !EXCLUDED.has(path)) out.push(path);
    }
  }
  return out.sort();
}

/** 정규식에 걸린 줄을 「파일:줄  내용」으로 모음 */
function hits(re: RegExp): Array<{ file: string; line: number; text: string }> {
  const found: Array<{ file: string; line: number; text: string }> = [];
  for (const file of screenFiles()) {
    readFileSync(join(ROOT, file), "utf8")
      .split("\n")
      .forEach((text, i) => {
        if (re.test(text)) found.push({ file, line: i + 1, text: text.trim().slice(0, 160) });
      });
  }
  return found;
}

const list = (xs: Array<{ file: string; line: number; text: string }>) => xs.map((x) => `  ${x.file}:${x.line}  ${x.text}`).join("\n");

test("검사 대상 파일을 찾는다(경로가 바뀌면 이 시험이 빈 검사가 되지 않게)", () => {
  const files = screenFiles();
  assert.ok(files.length > 100, `화면 파일 ${files.length}개`);
  assert.ok(files.includes("components/ui/kit.tsx"));
  assert.ok(!files.some((f) => EXCLUDED.has(f)));
});

test("임의 글자 크기(text-[13px]·text-[0.8rem] 등)를 쓰지 않는다", () => {
  const found = hits(/text-\[\d+(?:\.\d+)?(?:px|rem)\]/);
  assert.equal(found.length, 0, `임의 글자 크기 ${found.length}곳 — 7단계(text-xs·ui·sm·base·lg·title·figure) 중 가까운 것으로:\n${list(found)}`);
});

test("단계 밖 Tailwind 글자 크기(text-xl·text-2xl~9xl)를 쓰지 않는다", () => {
  const found = hits(/(?<![\w-])text-[2-9]?xl(?![\w-])/);
  assert.equal(found.length, 0, `단계 밖 글자 크기 ${found.length}곳 — text-lg(18)·text-title(22)·text-figure(28) 중 가까운 것으로:\n${list(found)}`);
});

test("끈 단추를 흐리게 칠하지 않는다(disabled:opacity 금지 — 점선 줄 + 흐린 글자, kit T.off)", () => {
  const found = hits(/disabled:opacity-/);
  assert.equal(found.length, 0, `끈 상태 흐림 ${found.length}곳 — T.btn·T.btnPrimary·T.btnSm·T.iconBtn을 쓰거나 모양을 따로 두면 T.off를 더함:\n${list(found)}`);
});

test("브라우저 기본 확인 창(window.confirm)을 쓰지 않는다 — 확인은 ConfirmDialog·useAsk(components/ui/confirm-dialog.tsx) 하나로", () => {
  const found = hits(/window\.confirm\(/);
  assert.equal(found.length, 0, `window.confirm ${found.length}곳:\n${list(found)}`);
});

/** 하드코딩 색이 든 줄 수 허용치(2026-10-18 현재 값). 줄이면 이 표도 낮춰 둡니다 — 늘리지 않습니다 */
const COLOR_LINES_ALLOWED: Record<string, number> = {
  "app/(app)/reports/business/[unit]/page.tsx": 3,
  "app/(app)/reports/cards/[uid]/report-card-check.tsx": 1,
  "components/cards/review/review-ui.tsx": 4,
  "components/knowledge/chunk-images.tsx": 1,
  "components/reports/draft-review.tsx": 3,
  "components/reports/draft-workspace.tsx": 7,
  "components/reports/outline-block.tsx": 2,
  "components/reports/outline-notes.tsx": 1,
  "components/reports/outline-panel.tsx": 1,
  "components/reports/review-board.tsx": 1,
  "components/reports/shape-picker.tsx": 1,
  "components/reports/unit-parts-workspace.tsx": 1,
};

test("하드코딩 색(#rgb·#rrggbb·rgba()·hsla())이 든 줄이 늘지 않는다", () => {
  const found = hits(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|rgba?\(|hsla?\(/);
  const byFile = new Map<string, typeof found>();
  for (const h of found) byFile.set(h.file, [...(byFile.get(h.file) ?? []), h]);
  const over = [...byFile].filter(([file, xs]) => xs.length > (COLOR_LINES_ALLOWED[file] ?? 0));
  assert.deepEqual(
    over.map(([file, xs]) => `${file}: ${xs.length}줄(허용 ${COLOR_LINES_ALLOWED[file] ?? 0})`),
    [],
    `새 색은 app/globals.css 토큰으로(:root 변수 + @theme inline --color-*):\n${over.map(([, xs]) => list(xs)).join("\n")}`,
  );
});
