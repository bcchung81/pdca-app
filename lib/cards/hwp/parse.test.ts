// TS 카드 파서가 parse_cards.py와 같은 카드 JSON을 내는지: kordoc 마크다운 3개 → 카드 59장을 biz-260916.json과 대조. 합본(묶음 여럿)·AX 머리 변형은 합성 마크다운으로.
// AX 붙임 번호 딱지(no·marker·markerSource)는 원본 PDF가 있어야 정해지므로 비교에서 뺍니다(현행화는 기존 카드 값을 이어 받음).

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import { parseCardGroups, parseCardMarkdown, parseNationalAgenda, pyRepr, splitBlocks, unmarkKordocInline } from "./parse.ts";
import { HAS_SEED_CARDS, NO_SEED_CARDS } from "../../testing/originals.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const DIR = resolve(import.meta.dirname, "../../../seed/cards/260916");
const seed = HAS_SEED_CARDS ? JSON.parse(readFileSync(join(DIR, "biz-260916.json"), "utf8")) : null;

function withoutPdfMarks(card: any) {
  const c = structuredClone(card);
  for (const a of c.axAttachments ?? []) Object.assign(a, { no: null, marker: null, markerSource: null });
  c.axAttachment = c.axAttachments?.[0] ?? null;
  c.parseWarnings = c.parseWarnings.filter((w: string) => !w.startsWith("PDF"));
  return c;
}

function firstDiff(a: any, b: any, path = ""): string | null {
  if (isDeepStrictEqual(a, b)) return null;
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = firstDiff(a[k], b[k], `${path}.${k}`);
      if (d) return d;
    }
  }
  return `${path}: 기대 ${JSON.stringify(a)?.slice(0, 200)} / 실제 ${JSON.stringify(b)?.slice(0, 200)}`;
}

test("HWPX 글의 kordoc 마크다운 표시(굵게·기울임·취소선·밑줄·역슬래시)를 걷음 — HWP는 표시 없이 나오므로 HWPX에만", () => {
  assert.equal(unmarkKordocInline("무선국 **안테나 설치** 형태 \\*각주\\* \\<산출근거\\> ~~취소~~ <u>밑줄</u> ***둘 다***"), "무선국 안테나 설치 형태 *각주* <산출근거> 취소 밑줄 둘 다");
  assert.equal(unmarkKordocInline("가\\\\ 0.26원 \\ 그대로"), "가\\ 0.26원 \\ 그대로", "구두점 앞이 아닌 역슬래시(원 표시)는 그대로");
});

test("파이썬 repr 따옴표 규칙", () => {
  assert.equal(pyRepr("`"), "'`'");
  assert.equal(pyRepr("it's"), `"it's"`);
  assert.equal(pyRepr(`a'b"c`), `'a\\'b"c'`);
  assert.equal(pyRepr("a\\b"), "'a\\\\b'");
});

test("kordoc 마크다운 → 카드 59장 = biz-260916.json(경고 문구까지)", { skip: NO_SEED_CARDS }, () => {
  let n = 0;
  for (let g = 1; g <= 3; g++) {
    const md = readFileSync(join(DIR, "kordoc", `biz${g}.md`), "utf8");
    const res = parseCardMarkdown(md, {
      sourceName: seed.source[g - 1],
      imageResolver: (src) => {
        const stem = src.replace(/\.[^.]+$/, "");
        for (const ext of [".jpg", ".png"]) if (existsSync(join(DIR, "images", `biz${g}`, stem + ext))) return `images/biz${g}/${stem}${ext}`;
        return null;
      },
    });
    const group = seed.groups[g - 1];
    assert.equal(firstDiff(group, res.group), null, `묶음 ${g}`);
    assert.equal(firstDiff(seed.ignoredBlocks[group.id], res.ignored), null, `무시한 블록 ${g}`);
    const expected = seed.cards.filter((c: any) => c.group === group.id);
    assert.equal(res.cards.length, expected.length, `카드 수 ${g}`);
    expected.forEach((e: any, i: number) => {
      assert.equal(firstDiff(withoutPdfMarks(e), withoutPdfMarks(res.cards[i])), null, e.id);
      n += 1;
    });
  }
  assert.equal(n, 59);
});

test("과제 한 장만 있는 파일: 묶음 표지·목차 없이도 카드를 읽고 경고를 남김", { skip: NO_SEED_CARDS }, () => {
  const md = readFileSync(join(DIR, "kordoc", "biz1.md"), "utf8");
  const lines = md.split("\n");
  // 첫 카드 표(과제명 행 바로 위의 <table>)부터 다음 카드 표 전까지
  const title = lines.findIndex((l) => l.includes("과제명<br>(과제번호)"));
  const start = lines.lastIndexOf("<table>", title);
  const next = lines.findIndex((l, i) => i > title && l.includes("과제명<br>(과제번호)"));
  assert.ok(start > 0 && next > start);
  const res = parseCardMarkdown(lines.slice(start, lines.lastIndexOf("<table>", next)).join("\n"), { sourceName: "one.hwpx", groupNo: 1 });
  assert.equal(res.cards.length, 1);
  const c = res.cards[0];
  assert.equal(c.taskNo, seed.cards[0].taskNo);
  assert.equal(c.targetBusiness, null);
  assert.ok(c.parseWarnings.some((w: string) => w.startsWith("목차에서 과제번호")));
});

// ── 묶음 여럿을 합친 파일(합본)·AX 붙임 머리 변형 — 합성 마크다운(기관 원문 아님)
const GT = (n: number, name: string) => `<table>\n<tr><th rowspan="2">(주요사업${n}) ${name}</th></tr>\n<tr></tr>\n</table>`;
const INDEX = (rows: Array<[string, string]>) =>
  ["<table>", "<tr><th>대상사업</th><th>실행과제</th><th>’26년도 추진과제</th><th>담당부서</th></tr>", ...rows.map(([no, t]) => `<tr><td>시험사업(1개)</td><td>1. 시험 실행과제</td><td>${no}. ${t}</td><td>시험본부</td></tr>`), "</table>"].join("\n");
const CARD = (no: string, t: string) => `<table>\n<tr><th>과제명<br>(과제번호)</th><th>${t} (과제번호 : ${no})</th><th>부서(팀)</th><th>시험본부(시험팀)</th></tr>\n</table>`;
const AX_HEAD = (label: string, t: string) => `| ${label} | ${t} |\n| --- | --- |`;
const AX_BODY = `<table>\n<tr><td>과제 목적</td><td>시험 목적</td></tr>\n<tr><td>주요 기능</td><td>▪ 시험 기능</td></tr>\n</table>`;

test("합본: 묶음 제목 표를 앞에 모으고 카드 묶음마다 「[주요사업N]」 머리 줄 — 카드마다 자기 묶음·자기 목차(같은 과제번호도 묶음별로)", () => {
  const md = [GT(1, "첫째 사업"), "【기존과제 1개】", INDEX([["1-가", "첫째 과제"]]), GT(2, "둘째 사업"), "【기존과제 2개】", INDEX([["1-가", "둘째 과제"], ["1-나", "목차에만 있는 과제"]]), "# [주요사업1]", "# 첫째 사업", CARD("1-가", "첫째 과제"), AX_HEAD("AX 연계과제 ❶", "첫째 AX"), AX_BODY, "# [주요사업2]", CARD("1-가", "둘째 과제"), AX_HEAD("AX 연계과제 ❶", "둘째 AX ❶"), AX_BODY, AX_HEAD("AX 연계과제 ❷", "둘째 AX ❷"), AX_BODY].join("\n\n");
  const gs = parseCardGroups(md, { sourceName: "x.hwp" });
  assert.deepEqual(gs.map((g) => [g.group.id, g.group.summary, g.indexRows.map((r) => r.taskNo)]), [["주요사업1", "기존과제 1개", ["1-가"]], ["주요사업2", "기존과제 2개", ["1-가", "1-나"]]]);
  const cards = gs.flatMap((g) => g.cards);
  assert.deepEqual(cards.map((c) => [c.id, c.group, c.indexTitle]), [["주요사업1/1-가", "주요사업1", "첫째 과제"], ["주요사업2/1-가", "주요사업2", "둘째 과제"]]);
  assert.deepEqual(cards.map((c) => c.axAttachments.map((a: any) => a.title)), [["첫째 AX"], ["둘째 AX ❶", "둘째 AX ❷"]], "번호 기호가 붙은 머리도 AX 붙임 머리");
  assert.ok(cards.every((c) => !c.parseWarnings.some((w: string) => w.startsWith("AX") || w.startsWith("목차에서"))), "머리·본문 수 맞음, 목차에서 찾음");
});

test("합본: 묶음 제목 표가 카드 묶음 앞마다 있으면 카드마다 자기 앞의 가장 가까운 제목 표의 묶음", () => {
  const md = [GT(1, "첫째 사업"), INDEX([["1-가", "첫째 과제"]]), CARD("1-가", "첫째 과제"), GT(3, "셋째 사업"), INDEX([["2-가", "셋째 과제"]]), CARD("2-가", "셋째 과제")].join("\n\n");
  const cards = parseCardGroups(md, { sourceName: "x.hwp" }).flatMap((g) => g.cards);
  assert.deepEqual(cards.map((c) => [c.id, c.indexTitle]), [["주요사업1/1-가", "첫째 과제"], ["주요사업3/2-가", "셋째 과제"]]);
});

test("묶음 하나짜리 파일: parseCardGroups = [parseCardMarkdown] 그대로(머리 줄이 같은 묶음이어도)", () => {
  const md = [GT(2, "둘째 사업"), INDEX([["1-가", "둘째 과제"]]), "# [주요사업2]", CARD("1-가", "둘째 과제"), AX_HEAD("AX연계과제", "AX")].join("\n\n");
  assert.deepEqual(parseCardGroups(md, { sourceName: "x.hwp" }), [parseCardMarkdown(md, { sourceName: "x.hwp" })]);
});

test("AX 붙임 머리: 「AX 연계과제」 + 번호 기호(띄어쓰기 무시)만 머리로 봄", () => {
  const type = (label: string) => splitBlocks(AX_HEAD(label, "제목"))[0].type;
  for (const label of ["AX연계과제", "AX 연계과제", "AX 연계 과제 ❶", "AX 연계과제 ⓫", "AX 연계과제 ②", "AX 연계과제(3)", "AX 연계과제 #4"]) assert.equal(type(label), "axHeader", label);
  for (const label of ["AX 연계과제 목록", "AX 과제", "비AX연계과제"]) assert.notEqual(type(label), "axHeader", label);
});

test("국정과제 칸: 번호 뒤의 글은 뒤에 번호가 더 있으면 다음 과제 제목, 없으면 앞 과제 제목의 끝 줄", () => {
  const titles = (lines: string[]) => parseNationalAgenda(lines).map((a) => [a.title, a.nos]);
  // 두 줄 제목 + 번호가 두 번(261103판 3/7-다): 둘째 과제의 첫 줄을 앞 과제에 붙이지 않음
  assert.deepEqual(titles(["재정운용의 투명성·", "책임성 강화", "#17", "세계에서 AI를 가장", "잘 쓰는 나라 구현", "#21"]), [
    ["재정운용의 투명성·책임성 강화", ["17"]],
    ["세계에서 AI를 가장 잘 쓰는 나라 구현", ["21"]],
  ]);
  // 번호가 둘째 제목 줄 사이에 낀 모양(3/1-가): 끝 줄은 앞 과제 제목으로
  assert.deepEqual(titles(["AI 가장 잘쓰는 나라 구현", "#21", "미래지향적 디지털·", "#108", "미디어 생태계 구축"]), [
    ["AI 가장 잘쓰는 나라 구현", ["21"]],
    ["미래지향적 디지털·미디어 생태계 구축", ["108"]],
  ]);
  // 번호 여럿이 이어진 과제(1/8-가)
  assert.deepEqual(titles(["AI고속도로 구축 등", "#20", "#21", "재난안전관리 고도화", "#73"]), [
    ["AI고속도로 구축 등", ["20", "21"]],
    ["재난안전관리 고도화", ["73"]],
  ]);
});

test("국정과제 칸 섞인 모양(리뷰 T2-R1): 번호 앞 제목 줄이 이음 기호로 끝나면 번호 뒤 줄은 앞 과제의 끝 줄 — 뒤에 과제가 더 있어도", () => {
  const titles = (lines: string[]) => parseNationalAgenda(lines).map((a) => [a.title, a.nos]);
  // 「번호가 제목 줄 사이에 낀 과제(3/1-가 모양)」 + 「두 줄 제목 과제(3/7-다 모양)」가 한 칸에
  assert.deepEqual(titles(["미래지향적 디지털·", "#108", "미디어 생태계 구축", "세계에서 AI를 가장", "잘 쓰는 나라 구현", "#21"]), [
    ["미래지향적 디지털·미디어 생태계 구축", ["108"]],
    ["세계에서 AI를 가장 잘 쓰는 나라 구현", ["21"]],
  ]);
  assert.deepEqual(titles(["과학기술 기반 연구개발 및", "#5", "혁신 생태계 조성", "세계에서 AI를 잘 쓰는 나라", "#21"]), [
    ["과학기술 기반 연구개발 및 혁신 생태계 조성", ["5"]],
    ["세계에서 AI를 잘 쓰는 나라", ["21"]],
  ]);
  // 이음 기호가 없으면 줄 모양만으로는 가를 수 없어 「뒤에 번호가 더 있으면 다음 과제」(3/7-다 실제 모양)를 따름
  assert.deepEqual(titles(["과학기술 기반", "#5", "혁신 생태계 조성", "세계에서 AI를 잘 쓰는 나라", "#21"]), [
    ["과학기술 기반", ["5"]],
    ["혁신 생태계 조성 세계에서 AI를 잘 쓰는 나라", ["21"]],
  ]);
});

// ── 카드 표의 이음 표(합성 표): 카드 표가 [Do]에서 끊기고 [Check]·추진성과가 뒤 표로 이어지면 붙이고, 카드에 이미 있는 구역의 참고 표는 붙이지 않음
const CARD_ROWS = (no: string, rows: string) => `<table>\n<tr><th>과제명<br>(과제번호)</th><th>시험 과제 (과제번호 : ${no})</th><th>부서(팀)</th><th>시험본부(시험팀)</th></tr>\n${rows}\n</table>`;
const ROW = (label: string, text: string) => `<tr><td>${label}</td><td colspan="3">${text}</td></tr>`;

test("카드 이음 표(리뷰 T2-R2): 카드 표에 없는 구역([Check])이 바로 뒤 표에 있으면 이어 붙이고, 이미 있는 구역의 참고 표는 붙이지 않음(구역 두 번 없음)", () => {
  const cont = `<table>\n${ROW("[Check]<br>성과점검", "∙ (장애 또는 리스크 요인) 이음 표 리스크")}\n</table>`;
  const joined = parseCardMarkdown([GT(1, "첫째 사업"), INDEX([["1-가", "시험 과제"]]), CARD_ROWS("1-가", ROW("[Do]<br>추진내용", "∙ 시험 추진")), "- 1 -", cont].join("\n\n"), { sourceName: "x.hwp" }).cards[0];
  assert.ok(joined.raw.includes("이음 표 리스크"), "이음 표를 카드 표에 붙임");
  assert.ok(!joined.parseWarnings.some((w: string) => /두 번|없는 구역: check\b/.test(w)), joined.parseWarnings.join(" / "));
  const ref = `<table>\n${ROW("[Check]<br>성과점검", "∙ 카드 밖 참고 표")}\n</table>`;
  const kept = parseCardMarkdown([GT(1, "첫째 사업"), INDEX([["1-가", "시험 과제"]]), CARD_ROWS("1-가", [ROW("[Do]<br>추진내용", "∙ 시험 추진"), ROW("[Check]<br>성과점검", "∙ 카드 안 리스크")].join("\n")), ref].join("\n\n"), { sourceName: "x.hwp" }).cards[0];
  assert.ok(!kept.raw.includes("카드 밖 참고 표"), "이미 있는 구역의 표는 이음 표가 아님");
  assert.ok(!kept.parseWarnings.some((w: string) => /두 번/.test(w)), kept.parseWarnings.join(" / "));
});
