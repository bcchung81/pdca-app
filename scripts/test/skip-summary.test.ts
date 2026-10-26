// 건너뛴 시험 보고기(scripts/test/skip-summary.ts) 시험 — 개선 계획 P2-1
import assert from "node:assert/strict";
import { test } from "node:test";
import skipSummary from "./skip-summary.ts";

async function run(events: Array<{ type: string; data: { name: string; file?: string; skip?: string | boolean } }>) {
  async function* src() {
    yield* events;
  }
  let out = "";
  for await (const s of skipSummary(src())) out += s;
  return out;
}

test("건너뛴 시험만 이름·이유로 모으고, 이유 없는 건너뛰기도 드러냄 — 없으면 아무것도 안 씀", async () => {
  const out = await run([
    { type: "test:pass", data: { name: "도는 시험", file: `${process.cwd()}/lib/a.test.ts` } },
    { type: "test:pass", data: { name: "원본 시험", file: `${process.cwd()}/lib/b.test.ts`, skip: "원본 없음" } },
    { type: "test:pass", data: { name: "이유 없음", file: `${process.cwd()}/lib/c.test.ts`, skip: true } },
    { type: "test:fail", data: { name: "실패", skip: "x" } },
  ]);
  assert.match(out, /건너뛴 시험 2개/);
  assert.match(out, /lib\/b\.test\.ts › 원본 시험\n\s+원본 없음/);
  assert.match(out, /lib\/c\.test\.ts › 이유 없음\n\s+이유 없음 — skip에 이유를 적어 주세요/);
  assert.doesNotMatch(out, /도는 시험|실패/);
  assert.equal(await run([{ type: "test:pass", data: { name: "x" } }]), "");
});
