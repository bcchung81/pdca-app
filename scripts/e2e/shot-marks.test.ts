// 페이지 안 작업(shot-marks.mjs): 실명 가림(글 노드·요소 경계를 넘는 일치), 파일 올리기 단계, 모달 창 위 번호 표기. 정적 HTML + 헤드리스 Chrome, Chrome이 없으면 건너뜀. 시험 데이터는 모두 가상.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyMasks, drawMarks, runStep } from "./shot-marks.mjs";

const chromePath = "/Applications/Google Chrome.app";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let chromium: any = null;
try { ({ chromium } = await import("playwright-core")); } catch { /* 없으면 건너뜀 */ }
const skip = (!chromium || (process.platform === "darwin" && !existsSync(chromePath))) && "playwright-core나 Chrome이 없음";

async function run(html: string, pairs: string[][], read: string) {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage();
    await page.setContent(`<body>${html}</body>`);
    const n = await applyMasks(page, pairs);
    const out = await page.evaluate((sel: string) => document.querySelector(sel)!.textContent, read);
    return { n, out, html: await page.content() };
  } finally { await browser.close(); }
}

test("단어마다 쪼개진 span을 가로지르는 일치", { skip }, async () => {
  const r = await run(
    "<table><tr><td id=c><span>가</span> <span>나</span> <span>팀장</span> / <span>다라마</span> <span>차장</span></td></tr></table>",
    [["가 나 팀장", "송도윤 팀장"], ["가 나", "송도윤"], ["다라마 차장", "김가온 차장"], ["다라마", "김가온"]], "#c");
  assert.equal(r.out, "송도윤 팀장 / 김가온 차장");
  assert.equal(r.n, 2);
});

test("한 노드 안·여러 번·중첩 inline·블록 분리", { skip }, async () => {
  const one = await run("<p id=c>홍길동 과장, 홍길동 과장</p>", [["홍길동", "이가상"]], "#c");
  assert.equal(one.out, "이가상 과장, 이가상 과장");
  const nested = await run("<p id=c><span>홍<b>길</b></span>동 님</p>", [["홍길동", "이가상"]], "#c");
  assert.equal(nested.out, "이가상 님");
  const split = await run("<div id=c><p>끝은 홍길</p><p>동입니다</p></div>", [["홍길동", "이가상"]], "#c");
  assert.equal(split.out, "끝은 홍길동입니다");
  assert.equal(split.n, 0);
  const chain = await run("<p id=c>가나 다라</p>", [["가나", "다라"], ["다라", "마바"]], "#c");
  assert.equal(chain.out, "다라 마바");
});

test("속성·입력값, 쌍이 없으면 건드리지 않음, script 제외", { skip }, async () => {
  const r = await run("<p id=c title='홍길동'>x</p><input placeholder='홍길동' value='홍길동'><script id=s>var a='홍길동'</script>", [["홍길동", "이가상"]], "#c");
  assert.match(r.html, /title="이가상"/);
  assert.match(r.html, /placeholder="이가상"/);
  assert.match(r.html, /var a='홍길동'/);
  const none = await run("<p id=c>가 <b>나</b></p>", [], "#c");
  assert.equal(none.n, 0);
  assert.equal(none.out, "가 나");
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function withPage(html: string, f: (page: any) => Promise<void>) {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(`<body>${html}</body>`);
    await f(page);
  } finally { await browser.close(); }
}

test("upload: 단추의 조상에서 숨은 파일 입력을 찾아 넣고 done이 보일 때까지 기다림", { skip }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "shotup-"));
  writeFileSync(join(dir, "sample.pdf"), "%PDF-1.4 가상");
  await withPage(
    `<form><input type=file class=sr-only style="position:absolute;width:1px;height:1px;opacity:0" onchange="setTimeout(()=>{const s=document.createElement('span');s.textContent='카드 자료 1/1 '+this.files[0].name;document.body.append(s)},300)"><button type=button aria-label="파일 첨부">첨부</button></form>`,
    async (page) => {
      await runStep(page, { upload: { target: { role: "button", name: "파일 첨부" }, file: "sample.pdf", done: { text: "카드 자료" } } }, { root: dir });
      assert.match(await page.locator("body").innerText(), /카드 자료 1\/1 sample\.pdf/);
      // done이 없으면 파일 이름 글을 기다림
      await runStep(page, { upload: { target: { role: "button", name: "파일 첨부" }, file: "sample.pdf" } }, { root: dir });
    },
  );
});

test("upload: 파일 입력이 없으면 오류", { skip }, async () => {
  await withPage("<button>올릴 곳</button>", async (page) => {
    await assert.rejects(runStep(page, { upload: { target: { text: "올릴 곳" }, file: "x.pdf" } }, { root: tmpdir() }), /파일 입력을 못 찾음/);
  });
});

test("type 단계: 초점 칸에 글을 침", { skip }, async () => {
  await withPage("<input id=i>", async (page) => {
    await page.focus("#i");
    await runStep(page, { type: "가." });
    assert.equal(await page.inputValue("#i"), "가.");
  });
});

test("모달 창이 열려 있어도 번호 표기: 표기는 최상위 층(popover), 바탕막 뒤 요소는 가림으로 안 셈, 창 상자에 덮인 요소는 셈", { skip }, async () => {
  await withPage(
    `<div style="padding:8px"><span id=bar>작성 중</span> <button id=ok>확정(원장 반영)</button></div>
     <div id=under style="position:absolute;left:350px;top:280px;width:100px;height:40px">창 아래</div>
     <dialog id=d style="width:300px;height:200px"><h3>9월 작성본을 원장에 반영할까요?</h3><button>취소</button><button>확정</button></dialog>`,
    async (page) => {
      await page.evaluate(() => (document.getElementById("d") as HTMLDialogElement).showModal());
      const failed = await drawMarks(page, [
        { n: 1, target: { css: "#bar" } },
        { n: 2, target: { css: 'button:text-is("확정(원장 반영)")' } },
        { n: 3, target: { css: "dialog[open] h3" } },
        { n: 4, target: { css: 'dialog[open] button:text-is("확정")' } },
      ], "modal");
      assert.equal(failed, 0);
      assert.equal(await page.evaluate(() => document.querySelector("[data-shot-marks]")!.matches(":popover-open")), true);
      assert.equal(await drawMarks(page, [{ n: 5, target: { css: "#under" } }], "modal"), 1);
    },
  );
});
