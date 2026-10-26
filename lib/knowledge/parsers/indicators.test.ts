import assert from "node:assert/strict";
import { test } from "node:test";
import type { SourceBlock } from "../source.ts";
import { parseAx } from "./ax.ts";
import { parseCeoIndicators, parseGoals, parsePool } from "./indicators.ts";

const blocks = (...texts: string[]): SourceBlock[] => texts.map((text, i) => ({ id: `c${i}`, type: text.startsWith("<table") || text.startsWith("|") ? "table" : "text", text, page: 1 + Math.floor(i / 3), breadcrumb: [] }));

test("성과지표 Pool: 총괄표(점수·성과목표·계/비) + 지표 정의표(안쪽 산식 표)를 사업·번호로 합침", () => {
  const r = parsePool(
    blocks(
      "**①** 가 사업(2개 : 계량 1개, 비계량 1개)",
      '<table>\n<tr><th>성과목표</th><th>성과지표</th><th>전략·<br>정책</th><th>SMART</th><th>ESG</th><th>합계</th><th>전년<br>대비</th></tr>\n<tr><td rowspan="2">목표 A</td><td>① 처리 성과<br>계</td><td>28</td><td>42</td><td>18</td><td>88</td><td>유지</td></tr>\n<tr><td>② 개선 노력<br>비</td><td>27</td><td>39</td><td>17</td><td>83</td><td>신규</td></tr>\n</table>',
      "**①** 가 사업",
      '<table>\n<tr><th colspan="2">① 처리 성과<br>계량</th></tr>\n<tr><td>정의</td><td>처리 성과를 평가한다.</td></tr>\n<tr><td>측정산식<br>및<br>변수</td><td><table>\n<tr><th>①</th><th>산식</th><th>=</th><th>처리 건수 / 전체</th></tr>\n</table><br>② 처리 건수 : 완료 건수</td></tr>\n</table>',
      '<table>\n<tr><th colspan="2">② 개선 노력<br>비계량</th></tr>\n<tr><td>정의</td><td>노력을 평가한다.</td></tr>\n</table>',
    ),
  );
  assert.equal(r.chunks.length, 2);
  const [a, b] = r.chunks;
  assert.equal(a.chunk_key, "pool25-biz/BZ-1/01");
  assert.equal(a.measure, "계량");
  assert.equal(b.measure, "비계량");
  assert.equal(a.title, "성과지표 Pool · ① 처리 성과(계량)");
  assert.match(a.context_prefix, /가 사업 · 성과목표: 목표 A/);
  assert.ok(a.text.includes("측정산식 및 변수: ① | 산식 | = | 처리 건수 / 전체 |\n② 처리 건수 : 완료 건수"), a.text);
  assert.ok(a.text.includes("Pool 평가 점수: 전략·정책 28 · SMART 42 · ESG 18 · 합계 88 · 전년 대비 유지"));
  assert.ok(r.checks.some((c) => c.name.startsWith("Pool 1번 사업 지표 수") && c.ok === false), "합성 표는 실제 기대값(22)과 달라 검산은 실패로 보임");
});

test("중장기 목표지표: 전략과제 코드(행 병합)마다 한 조각, 연도별 목표 줄", () => {
  const r = parseGoals(
    blocks(
      '<table>\n<tr><th colspan="2">목표지표</th><th>단위</th><th>’26목표</th><th>’27목표</th><th>’28목표</th><th>’29목표</th><th>’30목표</th></tr>\n<tr><td rowspan="2">Ⅰ-1</td><td>1) 확보 성과</td><td>건</td><td>13</td><td>14</td><td>15</td><td>16</td><td>17</td></tr>\n<tr><td>2) 공급<br>성과</td><td>㎒</td><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td></tr>\n</table>',
      '<table>\n<tr><th rowspan="1">Ⅲ-2</th><th>1) 기금 성과</th><th>등급</th><th>탁월</th><th>탁월</th><th>탁월</th><th>탁월</th><th>탁월</th></tr>\n</table>',
    ),
  );
  assert.deepEqual(
    r.chunks.map((c) => [c.chunk_key, c.blocks.length]),
    [
      ["goal30-2605/Ⅰ-1", 2],
      ["goal30-2605/Ⅲ-2", 1],
    ],
  );
  assert.equal(r.chunks[0].blocks[1], "2) 공급 성과(㎒) — '26 1 · '27 2 · '28 3 · '29 4 · '30 5");
});

test("기관장 성과지표: 성과목표 줄(병합)마다 한 조각, 인쇄 줄넘김은 빈칸·하위 지표는 「/」", () => {
  const r = parseCeoIndicators(
    blocks(
      '<table>\n<tr><th>평가지표</th><th>측정방법</th><th>성과<br>목표치</th><th colspan="3">연도별</th></tr>\n<tr><td colspan="6">▪성과목표 1 : 인프라 조성</td></tr>\n<tr><td>ㅇ 성과지표 A : 품질<br>기여도 상향</td><td>목표부여<br>(편차)</td><td>68.6%</td><td>50%</td><td>56.7%</td><td>68.6%</td></tr>\n<tr><td>ㅇ 성과지표 C : 안전 확대<br>C-1 서비스 강화<br>(보조지표 : 이행)</td><td>비계량</td><td>-</td><td>-</td><td>-</td><td>-</td></tr>\n</table>',
    ),
  );
  assert.equal(r.chunks.length, 1);
  assert.equal(r.chunks[0].title, "기관장 성과지표 · 성과목표 1 인프라 조성");
  assert.equal(r.chunks[0].blocks[0], "성과지표 A : 품질 기여도 상향 — 측정 목표부여 (편차) · 성과목표치 68.6% · '24 50% · '25 56.7% · '26 68.6%");
  assert.match(r.chunks[0].blocks[1], /^성과지표 C : 안전 확대 \/ C-1 서비스 강화 \/ \(보조지표 : 이행\)/);
});

test("AX 검토 과제: 묶음 머리(파이프 표)·번호 과제·번호 없는 과제(「과제 목적」 표가 다시 나오면), 칸 이름의 <br>·굵게 걷음", () => {
  const r = parseAx(
    blocks(
      "| 붙임1 |  | 제안 과제 |\n| --- | --- | --- |",
      "**①** 가 과제",
      '<table>\n<tr><th>과제 목적</th><th>목적 A</th></tr>\n<tr><td>주요 기능</td><td>▪ 기능 1<br>▪ 기능 2<img src="x.png"></td></tr>\n</table>',
      "번호 없는 과제",
      "제목 둘째 줄",
      "| 과제 목적 | 목적 B |\n| --- | --- |\n| 핵심<br>포인트 | **포인트** |",
    ),
  );
  assert.deepEqual(
    r.chunks.map((c) => [c.chunk_key, c.title]),
    [
      ["ax26-2605/1-01", "AX 검토 과제 · 가 과제"],
      ["ax26-2605/1-02", "AX 검토 과제 · 번호 없는 과제 제목 둘째 줄"],
    ],
  );
  assert.equal(r.chunks[0].text, "과제목적: 목적 A\n\n주요기능: ▪ 기능 1\n▪ 기능 2[그림]");
  assert.equal(r.chunks[1].text, "과제목적: 목적 B\n\n핵심포인트: 포인트");
  assert.equal((r.chunks[1].meta as { unnumbered: boolean }).unnumbered, true);
});
