// 계층부호 문단의 내어쓰기(2026-10-28) — 입출력 없는 순수 모듈. 네 갈래 한글 내려받기(화면 DOM 변환·기존 양식 A안·개조식·카드 원본 배치)가 같이 씀.
//
// 한글 관례(한컴이 저장한 문서 실측 — 관리계획 발췌·지적사항 시정조치 계획·도식 Pool·과제관리카드 원본):
//   부호(□·ㅇ·-·∙·※ …) + 빈칸으로 시작하는 문단은 둘째 줄이 글 첫 자 아래에서 시작하도록 「내어쓰기」를 둠 —
//   문단 모양 intent = −(앞 빈칸 + 부호 + 뒤 빈칸 폭), left는 부호 자리(예: □ 15pt intent −3580·left 0, 카드 ∙ 10pt intent −1019·left 300).
//   한글은 intent가 음수면 첫 줄을 left에서, 둘째 줄부터 left − intent에서 시작함.
//   글머리표(heading BULLET) 문단도 같음: intent 0이면 둘째 줄이 글머리표 아래로 감(맥 한컴 뷰어 2026-10-28 — autoIndent만으로는 내어 쓰지 않음).
//   autoIndent = 1에 음수 intent를 주면 내어쓰기가 「intent + 글머리표 폭」으로 더해져 글 첫 자보다 오른쪽으로 감(같은 날 뷰어 실험) —
//   그래서 내어쓰기를 직접 주는 글머리표는 autoIndent = 0, 첫 줄 글 자리는 글머리표 폭 + 본문과의 거리(textOffset)로 맞춤.
//
// 점검(hangCheck — 결정론): 부호로 시작하거나 글머리표인 문단 중 내어쓰기(음수 intent)가 없는 문단 수. 0이어야 함.

import type { HwpDoc, Para } from "../hwp/model.ts";

/** 계층부호(문단 첫 글자) — 뒤에 빈칸·탭이 오고 글이 이어지면 부호 문단 */
export const HANG_MARKS = "□■◇◆○◦ㅇ❍●◎-–·∙•※＊*▶▷►☞";

const esc = (s: string) => s.replace(/[\\\]^-]/g, "\\$&");
const LEAD = new RegExp(`^([ \\u3000]*)([${esc(HANG_MARKS)}])([ \\t\\u3000]+)(?=\\S)`, "u");

/** 부호 문단이면 앞머리(앞 빈칸 + 부호 + 뒤 빈칸·탭) 글자 수, 아니면 0 */
export function markerLead(text: string): number {
  const m = LEAD.exec(text);
  return m ? m[0].length : 0;
}

/** 문단 글(탭은 \t, 글자 겹침은 겹친 글자 — 카드 원본의 「∙ + 전각 빈칸」 글머리) */
export function paraText(p: Para): string {
  return p.items.map((it) => (it.kind === "text" || it.kind === "gen" ? it.text : it.kind === "tab" ? "\t" : it.kind === "compose" ? it.chars : "")).join("");
}

export interface HangCheck {
  /** 부호로 시작하거나 글머리표인 문단 수 */
  marked: number;
  /** 그중 내어쓰기(음수 intent)가 없는 문단 수 — 0이어야 함 */
  flat: number;
  /** 내어쓰기 없는 문단 글 앞부분(최대 5개 — 진단용) */
  samples: string[];
}

/** 문단 목록(본문·표 칸·글상자, 표 안 표까지)에서 부호·글머리표 문단의 내어쓰기를 셈 */
export function hangCheck(input: { doc: Pick<HwpDoc, "paraPrs">; paras: readonly Para[] }): HangCheck {
  const out: HangCheck = { marked: 0, flat: 0, samples: [] };
  const list = (paras: readonly Para[]) => {
    for (const p of paras) {
      const pp = input.doc.paraPrs[p.paraPr];
      const text = paraText(p);
      if (pp && (pp.headingType === "BULLET" || markerLead(text) > 0)) {
        out.marked += 1;
        if (pp.indent >= 0) {
          out.flat += 1;
          if (out.samples.length < 5) out.samples.push(text.trim().slice(0, 30));
        }
      }
      for (const it of p.items) {
        if (it.kind !== "obj") continue;
        if (it.obj.kind === "table") for (const c of it.obj.cells) list(c.paras);
        else if (it.obj.kind !== "pic" && it.obj.text) list(it.obj.text.paras);
      }
    }
  };
  list(input.paras);
  return out;
}
