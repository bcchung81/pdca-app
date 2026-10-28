// KCA 양식 HWPX 변환: 초안 → kordoc 입력(to_kordoc_input) → kordoc 공문서 생성(R008) → 후처리(크기·발신 줄·＊·강조·패키지 R043)

import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { parse, validateHwpx } from "kordoc";
import { reportDraftMarkdown, senderDate } from "../reports/draft-md.ts";
import { readHwpx } from "../hwp/hwpx.ts";
import { draftToKcaHwpx, starLinesOf } from "./generate.ts";
import { hangCheck, paraText } from "./hang.ts";
import { MARK_CELL_EM } from "./kca-profile.ts";
import { toKordocInput } from "./kordoc-input.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const DRAFT = `AI 안테나 자동판독 전국 확산 결과
< '26. 9. 25.(금), 전파기반본부 검사기획팀 >

□ 추진 배경
ㅇ **(현황)** 무선국 검사관의 고소 작업 위험이 큼(연 3만 회)
- 옥탑·철탑 검사가 전체의 40%
□ 추진 결과
ㅇ 전국 2개 권역 확대 적용(검사 1,240국) ==판독 정확도 96.2%==
※ 9월 말 기준 잠정치
＊ 누적 3,910국

| 구분 | 8월 | 9월 |
| --- | --- | --- |
| 검사 건수 | 1,010건 | 1,240건 |
`;

test("kordoc 입력: 첫 줄 # 제목, 발신 줄 <right>, 계층 기호 → 목록 깊이, 표·※·＊ 그대로", () => {
  const out = toKordocInput(DRAFT).split("\n");
  assert.equal(out[0], "# AI 안테나 자동판독 전국 확산 결과");
  assert.equal(out[1], "<right>< '26. 9. 25.(금), 전파기반본부 검사기획팀 ></right>");
  assert.ok(out.includes("- 추진 배경"));
  assert.ok(out.includes("  - **(현황)** 무선국 검사관의 고소 작업 위험이 큼(연 3만 회)"));
  assert.ok(out.includes("    - 옥탑·철탑 검사가 전체의 40%"));
  assert.ok(out.includes("※ 9월 말 기준 잠정치") && out.includes("＊ 누적 3,910국"));
  assert.ok(out.includes("| 구분 | 8월 | 9월 |"));
  assert.deepEqual(starLinesOf(DRAFT), [false, true]);
});

async function inspect(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const header = await zip.file("Contents/header.xml")!.async("string");
  const section = await zip.file("Contents/section0.xml")!.async("string");
  const charPr = new Map<string, { pt: number; bold: boolean; shade: string }>();
  for (const m of header.matchAll(/<hh:charPr id="(\d+)" height="(\d+)"[^>]*?shadeColor="([^"]*)"[^>]*>([\s\S]*?)<\/hh:charPr>/g)) charPr.set(m[1], { pt: Number(m[2]) / 100, shade: m[3], bold: /<hh:bold\/>/.test(m[4]) });
  // 글이 든 run → [글, 글자 모양]
  const runs = [...section.matchAll(/<hp:run charPrIDRef="(\d+)"><hp:t>([\s\S]*?)<\/hp:t>/g)].map((m) => ({ text: m[2].replace(/<[^>]+>/g, " "), ...charPr.get(m[1])! }));
  return { zip, header, section, runs, names: Object.keys(zip.files) };
}

test("KCA 양식 HWPX: 계층 크기·제목 24pt·발신 줄 12pt·＊ 각주·노란 강조·정품 패키지(R043)", async () => {
  const { bytes, summary } = await draftToKcaHwpx(DRAFT);
  const { runs, section, names } = await inspect(bytes);
  const at = (t: string) => runs.find((r) => r.text.includes(t));
  assert.equal(at("AI 안테나 자동판독")?.pt, 24, "제목 24pt");
  assert.equal(at("전파기반본부")?.pt, 12, "발신 줄 12pt(R018)");
  assert.equal(at("추진 배경")?.pt, 15, "□ 15pt");
  assert.equal(at("추진 배경")?.bold, true, "□ 볼드(R024)");
  assert.equal(at("옥탑·철탑")?.pt, 15, "대시 15pt");
  assert.equal(at("(현황)")?.bold, true, "괄호 리드 볼드(R016)");
  assert.equal(at("무선국 검사관")?.bold, false, "ㅇ 본문은 볼드 아님");
  assert.equal(at("9월 말 기준")?.pt, 13, "※ 13pt");
  assert.ok(/<hp:t>＊/.test(section), "＊ 각주 기호 되돌림(R011)");
  assert.equal(summary.starsRestored, 1);
  const hl = at("판독 정확도 96.2%");
  assert.equal(hl?.shade, "#FFFF00", "강조 노란 음영(R040)");
  assert.equal(hl?.bold, true);
  assert.ok(!section.includes("=="), "강조 표지 남지 않음");
  assert.equal(at("1,240건")?.pt, 12, "표 12pt(R023)");
  // 패키지: mimetype 첫 엔트리 STORED(38바이트째 평문), 정본 멤버, 디렉터리 엔트리 없음
  assert.equal(Buffer.from(bytes.subarray(30, 38)).toString(), "mimetype");
  assert.equal(Buffer.from(bytes.subarray(38, 57)).toString(), "application/hwp+zip");
  for (const n of ["version.xml", "settings.xml", "META-INF/manifest.xml", "META-INF/container.rdf", "Contents/header.xml", "Contents/section0.xml"]) assert.ok(names.includes(n), n);
  assert.ok(!names.some((n) => n.endsWith("/")), "디렉터리 엔트리 없음");
  assert.equal(names[0], "mimetype");
  assert.equal(names[1], "version.xml");
  const v: any = await (validateHwpx as any)(Buffer.from(bytes));
  assert.equal(v.ok, true, JSON.stringify(v.issues));
  // 되읽기: kordoc이 다시 읽고 글·표가 남음
  const back: any = await parse(Buffer.from(bytes));
  assert.ok(back.success);
  for (const t of ["추진 배경", "판독 정확도 96.2%", "누적 3,910국", "1,240건"]) assert.ok(back.markdown.includes(t), t);
});

test("보고서 원고 블록 → 개조식 초안: 제목 1 □, 제목 2·문단 ㅇ, 기호 있는 줄은 그대로, 표는 GFM", () => {
  const md = reportDraftMarkdown({
    title: "방송미디어 산업 진흥",
    hq: "방송미디어본부",
    team: "방송진흥팀",
    date: new Date("2026-09-25T03:00:00Z"),
    blocks: [
      { id: "a", type: "heading", level: 1, text: "추진 성과" },
      { id: "b", type: "paragraph", text: "지역 방송 제작 지원 12건\n- 우수 사례 3건 선정\n※ 9월 기준" },
      { id: "c", type: "heading", level: 2, text: "세부 과제" },
      { id: "d", type: "table", rows: [["구분", "건수"], ["지원|선정", "12"]] },
    ],
  });
  const lines = md.split("\n");
  assert.equal(lines[0], "방송미디어 산업 진흥");
  assert.equal(lines[1], "< '26. 9. 25.(금), 방송미디어본부 방송진흥팀 >");
  assert.ok(lines.includes("□ 추진 성과") && lines.includes("ㅇ 지역 방송 제작 지원 12건") && lines.includes("- 우수 사례 3건 선정") && lines.includes("※ 9월 기준"));
  assert.ok(lines.includes("ㅇ 세부 과제"));
  assert.ok(lines.includes("| 구분 | 건수 |") && lines.includes("| --- | --- |") && lines.includes("| 지원\\|선정 | 12 |"));
  assert.equal(senderDate(new Date("2026-01-01T00:00:00Z")), "'26. 1. 1.(목)");
});

test("부호 문단 내어쓰기(2026-10-28): 본문 □·ㅇ·-·※는 kordoc 그대로(부호 + 탭 + 음수 intent + 내어쓰기 자동 탭) · 표 칸 「∙ … / ∙ …」도 같은 방식 · 점검 0", async () => {
  const long = "둘째 줄까지 이어지도록 길게 쓴 문장입니다. ".repeat(4).trim();
  const draft = `제목\n\n□ 추진 배경\nㅇ ${long}\n- ${long}\n※ ${long}\n\n| 지적사항 | 조치실적 |\n| --- | --- |\n| ∙ ${long} / ∙ 둘째 지적 | ∙ 조치 |\n`;
  const { bytes, summary } = await draftToKcaHwpx(draft);
  const v: any = await (validateHwpx as any)(Buffer.from(bytes));
  assert.equal(v.ok, true, JSON.stringify(v.issues));
  const doc = await readHwpx(bytes);
  const paras = doc.sections.flatMap((x) => x.paras);
  assert.deepEqual(hangCheck({ doc, paras }), { marked: 6, flat: 0, samples: [] });
  assert.equal(summary.hangs, 2, "표 칸 두 문단만 후처리가 내어 씀");
  const all = (ps: typeof paras): typeof paras => ps.flatMap((p) => [p, ...p.items.flatMap((it) => (it.kind === "obj" && it.obj.kind === "table" ? it.obj.cells.flatMap((c) => all(c.paras)) : []))]);
  for (const p of all(paras)) {
    const t = paraText(p);
    if (!/^[□ㅇ\-※∙]\t/.test(t)) continue;
    const pp = doc.paraPrs[p.paraPr];
    const em = doc.charPrs[(p.items[0] as { charPr: number }).charPr].height;
    // 부호 뒤 탭은 내어쓰기 자리까지 감(자동 탭) — 둘째 줄과 첫 줄 글이 같은 자리
    assert.equal(doc.tabDefs[pp.tabDef].autoLeft, true, t.slice(0, 8));
    // 내어쓰기 ≥ 부호 폭(전각 1em, 반각 「-」「∙」은 0.5em 이상) — 탭이 0보다 큰 폭을 가짐
    const glyph = /^[-∙]/.test(t) ? 0.5 * em : em;
    assert.ok(pp.indent < 0 && -pp.indent > glyph, `${t.slice(0, 8)} 내어쓰기 ${pp.indent} > 부호 폭 ${glyph}`);
    if (t.startsWith("∙")) assert.equal(pp.indent, -Math.round(em * MARK_CELL_EM.narrow), "표 칸 반각 부호 1.2em");
  }
});
