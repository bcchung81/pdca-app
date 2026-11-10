// 캡처 계획의 페이지 안 작업(Playwright page를 받음): 대상 찾기·단계 실행·실명 가림·번호 표기·끌어 선택.
// 계획 모양과 안전 규칙(클릭 금지어)은 shot-plan.mjs, 이 파일은 실행만 합니다. 계약: data/manual/dept-user/shots-plan-contract.md
// DB에 쓰는 단계 seedInspection은 실행기(shots.mjs)가 맡고 여기로 오지 않습니다.
import { basename, resolve } from "node:path";
import { CLICK_ALLOW } from "./shot-plan.mjs";

/** 대상 → 보이는 요소 중 nth번째(기본 0) locator. 글자 일치는 부분 일치가 기본(exact: true면 정확히) */
export function resolveTarget(page, t) {
  const o = { exact: t.exact === true };
  let loc;
  if (t.role) loc = page.getByRole(t.role, { name: t.name, ...o });
  else if (t.text) loc = page.getByText(t.text, o);
  else if (t.label) loc = page.getByLabel(t.label, o);
  else if (t.title) loc = page.getByTitle(t.title, o);
  else if (t.placeholder) loc = page.getByPlaceholder(t.placeholder, o);
  else if (t.css) loc = page.locator(t.css);
  else throw new Error(`대상을 알 수 없음: ${JSON.stringify(t)}`);
  return loc.filter({ visible: true }).nth(t.nth ?? 0);
}

/**
 * 대상의 문서 좌표 사각형({x,y,w,h}) + hidden(화면 밖이거나 가려짐). 없으면 null(최대 timeout 밀리초 기다림).
 * hidden: 사각형이 뷰포트 안에 다 들어오지 않거나, 중심점에서 맨 위 요소가 대상(또는 그 자손·조상)이 아님 — 안쪽 패널이 스크롤돼 밀려난 경우도 잡힘
 */
async function docRect(page, t, timeout = 2000) {
  const loc = resolveTarget(page, t);
  try { await loc.waitFor({ state: "visible", timeout }); } catch { return null; }
  return loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const out = r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const hit = out ? null : document.elementFromPoint(cx, cy);
    // 모달 창이 열려 있으면 창 밖 요소의 중심은 창의 바탕막(::backdrop — 맞는 요소는 dialog)에 걸림: 창 상자 밖이면 가려진 것으로 보지 않음(바탕막은 반투명)
    const dlg = hit?.matches?.("dialog:modal") && !hit.contains(el) ? hit.getBoundingClientRect() : null;
    const onBackdrop = Boolean(dlg) && (cx < dlg.left || cx > dlg.right || cy < dlg.top || cy > dlg.bottom);
    const hidden = out || !hit || !(el.contains(hit) || hit.contains(el) || onBackdrop);
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, hidden };
  });
}

const union = (rs) => {
  const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
};

/** 단계 하나 실행. ctx.root = upload 파일 경로의 기준(저장소 루트) */
export async function runStep(page, step, ctx = {}) {
  const [k, v] = Object.entries(step)[0];
  if (k === "click") {
    // 금지어 예외 이름(「확정(원장 반영)」)은 정확히 그 이름의 단추만
    const loc = typeof v === "string" ? page.getByRole("button", { name: v, exact: CLICK_ALLOW.includes(v.trim()) }).filter({ visible: true }).first() : resolveTarget(page, v);
    await loc.click();
    await page.waitForTimeout(800);
  } else if (k === "eval") {
    // 글을 돌려주면 로그에 남김(예: 찾을 대상이 없을 때 'no-need')
    const r = await page.evaluate(v);
    if (typeof r === "string" && r) console.log(`[eval] ${r}`);
    await page.waitForTimeout(500);
  }
  else if (k === "wait") await page.waitForTimeout(v);
  else if (k === "reload") await page.reload({ waitUntil: "networkidle" });
  else if (k === "waitFor") await resolveTarget(page, v).waitFor({ state: "visible", timeout: 15000 });
  else if (k === "scrollTo") await resolveTarget(page, v).evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
  else if (k === "key") { await page.keyboard.press(v); await page.waitForTimeout(500); }
  else if (k === "dragSelect") await dragSelect(page, v);
  else if (k === "type") { await page.keyboard.type(v); await page.waitForTimeout(400); }
  else if (k === "upload") await upload(page, v, ctx);
  else throw new Error(`알 수 없는 단계: ${k}`);
}

/**
 * 파일 올리기: 대상 요소 자신·안·바깥(가까운 조상부터)에서 첫 input[type=file]을 찾아 파일을 넣음(숨은 입력도 됨).
 * 끝은 done 대상이 보일 때까지, 없으면 파일 이름 글이 보일 때까지(최대 60초 — 서버가 올린 파일을 한 번 읽음). file은 root 기준 상대 경로
 */
export async function upload(page, spec, { root = process.cwd() } = {}) {
  const file = resolve(root, spec.file);
  const loc = resolveTarget(page, spec.target);
  await loc.waitFor({ state: "visible", timeout: 15000 });
  const found = await loc.evaluate((el) => {
    for (const e of document.querySelectorAll("[data-shot-upload]")) e.removeAttribute("data-shot-upload");
    let input = el.matches("input[type=file]") ? el : el.querySelector("input[type=file]");
    for (let a = el.parentElement; !input && a; a = a.parentElement) input = a.querySelector("input[type=file]");
    input?.setAttribute("data-shot-upload", "");
    return Boolean(input);
  });
  if (!found) throw new Error(`파일 입력을 못 찾음: ${JSON.stringify(spec.target)}`);
  await page.locator("[data-shot-upload]").setInputFiles(file);
  const done = spec.done ? resolveTarget(page, spec.done) : page.getByText(basename(file)).filter({ visible: true }).first();
  await done.waitFor({ state: "visible", timeout: 60000 });
  await page.waitForTimeout(500);
}

/** 마우스로 글(또는 요소)을 실제로 끌어 선택: down → move → up. spec = { text } | 대상 */
export async function dragSelect(page, spec) {
  let from, to;
  if (spec.text) {
    // 보이는 글 노드에서 그 글 부분만 Range로 잡아 첫 줄 왼쪽 끝 ~ 마지막 줄 오른쪽 끝 좌표를 얻음
    const pts = await page.evaluate((text) => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const i = n.data.indexOf(text);
        const p = n.parentElement;
        if (i < 0 || !p || /^(SCRIPT|STYLE)$/.test(p.tagName) || !p.getClientRects().length) continue;
        p.scrollIntoView({ block: "center", inline: "center" });
        const r = document.createRange();
        r.setStart(n, i); r.setEnd(n, i + text.length);
        const rs = [...r.getClientRects()].filter((q) => q.width > 0);
        if (!rs.length) continue;
        const a = rs[0], b = rs[rs.length - 1];
        return { from: [a.left + 1, a.top + a.height / 2], to: [b.right - 1, b.top + b.height / 2] };
      }
      return null;
    }, spec.text);
    if (!pts) throw new Error(`끌어 선택할 글을 못 찾음: ${spec.text}`);
    ({ from, to } = pts);
  } else {
    const loc = resolveTarget(page, spec);
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    if (!b) throw new Error(`끌어 선택할 요소가 안 보임: ${JSON.stringify(spec)}`);
    from = [b.x + 2, b.y + 2]; to = [b.x + b.width - 2, b.y + b.height - 2];
  }
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, { steps: 6 });
  await page.mouse.move(to[0], to[1], { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}

/**
 * 화면 글자의 실명을 가명으로(앱·DB는 안 바꿈): 글 노드와 title·aria-label·placeholder·alt·입력값.
 * pairs = [[원래, 가명], …] — 긴 것부터 한 번에 바꿔서 서로 겹쳐도 연쇄 치환이 안 됨. 바꾼 곳 수를 돌려줌
 */
export async function applyMasks(page, pairs) {
  if (!pairs.length) return 0;
  return page.evaluate((prs) => {
    const map = new Map(prs);
    const keys = [...map.keys()].filter(Boolean).sort((a, b) => b.length - a.length);
    if (!keys.length) return 0;
    const re = new RegExp(keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
    let n = 0;
    const sub = (s) => s.replace(re, (m) => { n += 1; return map.get(m); });
    // 글 노드를 문서 순서로 모아, 같은 블록 조상 안에서 이어진 것끼리 한 묶음으로(한 줄 글이 단어마다 다른 요소로 쪼개져 있어도 찾도록)
    const isBlock = (el) => { const d = getComputedStyle(el).display; return d !== "inline" && d !== "inline-block"; };
    const blockOf = (node) => { let e = node.parentElement; while (e && e !== document.body && !isBlock(e)) e = e.parentElement; return e; };
    const runs = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      if (/^(SCRIPT|STYLE)$/.test(t.parentElement?.tagName ?? "")) continue;
      const b = blockOf(t), last = runs[runs.length - 1];
      if (last && last.block === b) last.nodes.push(t); else runs.push({ block: b, nodes: [t] });
    }
    for (const { nodes } of runs) {
      const starts = [], ends = [];
      let joined = "";
      for (const t of nodes) { starts.push(joined.length); joined += t.data; ends.push(joined.length); }
      const hits = [];
      for (const m of joined.matchAll(re)) hits.push([m.index, m.index + m[0].length, map.get(m[0])]);
      // 뒤에서부터 적용: 원래 길이로 잰 시작 오프셋은 앞쪽 노드가 안 흔들림
      for (let h = hits.length - 1; h >= 0; h--) {
        const [s, e, rep] = hits[h];
        n += 1;
        let first = true;
        for (let i = 0; i < nodes.length; i++) {
          const a = starts[i], b = ends[i];
          if (b <= s || a >= e) continue;
          const d = nodes[i].data;
          const head = first ? d.slice(0, s - a) + rep : "";
          const tail = e < b ? d.slice(e - a) : "";
          nodes[i].data = head + tail;
          first = false;
        }
      }
    }
    for (const el of document.querySelectorAll("[title],[aria-label],[placeholder],[alt]")) {
      for (const a of ["title", "aria-label", "placeholder", "alt"]) {
        const v = el.getAttribute(a);
        if (v) { const s = sub(v); if (s !== v) el.setAttribute(a, s); }
      }
    }
    for (const el of document.querySelectorAll("input,textarea")) {
      if (el.value) { const s = sub(el.value); if (s !== el.value) { el.value = s; if (el.hasAttribute("value")) el.setAttribute("value", s); } }
    }
    return n;
  }, pairs);
}

/**
 * 번호 표기: 붉은 상자(3px 실선·모서리 4px) + 붉은 바탕 흰 숫자 원형 배지(26px). 문서 좌표 절대 위치라 전체 페이지 캡처에서도 맞음.
 * 대상을 못 찾으면 [표기 실패]를 찍고 계속 — 실패 건수를 돌려줌. name은 로그용 화면 이름.
 * 전체 페이지 캡처가 아니면(full=false) 대상이 화면 밖이거나 가려진 것도 [표기 의심]으로 찍고 실패에 셈(상자는 그대로 그림). targets는 요소마다 따로 검사
 */
export async function drawMarks(page, marks, name = "", { full = false } = {}) {
  const items = [];
  let failed = 0;
  for (const m of marks) {
    const ts = m.targets ?? [m.target];
    const rs = [];
    for (const t of ts) { const r = await docRect(page, t); if (r) rs.push(r); }
    // 합친 대상 중 하나라도 없으면 실패로 셈(엉뚱한 크기의 상자를 그리지 않음)
    if (rs.length !== ts.length) { console.log(`[표기 실패] ${name} n=${m.n} 대상 없음`); failed += 1; continue; }
    if (!full && rs.some((r) => r.hidden)) { console.log(`[표기 의심] ${name} n=${m.n} 대상이 화면 밖이거나 가려짐`); failed += 1; }
    items.push({ n: m.n, rect: union(rs), pad: m.pad ?? 4, badge: m.badge ?? "tl" });
  }
  if (items.length) {
    await page.evaluate((list) => {
      const D = 26, RED = "#d32f2f";
      const W = Math.max(document.documentElement.scrollWidth, innerWidth), H = Math.max(document.documentElement.scrollHeight, innerHeight);
      const root = document.createElement("div");
      root.setAttribute("data-shot-marks", "");
      root.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483647";
      // 모달 창(최상위 층)이 열려 있으면 z-index로는 그 위에 못 올라가므로 표기도 최상위 층(popover)에 — 나중에 연 것이 위
      const modal = Boolean(document.querySelector("dialog:modal"));
      if (modal) {
        root.popover = "manual";
        root.style.cssText += ";inset:auto;margin:0;padding:0;border:0;background:transparent;overflow:visible";
      }
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      for (const { n, rect, pad, badge } of list) {
        const x = clamp(rect.x - pad, 0, W), y = clamp(rect.y - pad, 0, H);
        const w = clamp(rect.x + rect.w + pad, 0, W) - x, h = clamp(rect.y + rect.h + pad, 0, H) - y;
        const box = document.createElement("div");
        box.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;box-sizing:border-box;border:3px solid ${RED};border-radius:4px;pointer-events:none`;
        // 배지 중심을 상자 모서리에 두고 문서 가장자리 안으로 밀어 넣음
        const cx = badge.endsWith("r") ? x + w : x, cy = badge.startsWith("b") ? y + h : y;
        const b = document.createElement("div");
        b.textContent = String(n);
        b.style.cssText = `position:absolute;left:${clamp(cx - D / 2, 2, W - D - 2)}px;top:${clamp(cy - D / 2, 2, H - D - 2)}px;width:${D}px;height:${D}px;border-radius:50%;background:${RED};color:#fff;font:700 14px/${D}px sans-serif;text-align:center;pointer-events:none`;
        root.append(box, b);
      }
      document.documentElement.append(root);
      if (modal) root.showPopover();
    }, items);
  }
  return failed;
}
