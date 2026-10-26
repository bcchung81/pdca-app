// 현행화에서 「원장에 없는 과제」를 새 카드로 등록할 때의 식별 칸 판정(순수) — 묶음(group)·평가단위(eval_unit_id)·과제번호·카드 id.
// 주요사업: 묶음 「주요사업N」 → 평가단위 BZ-N, 과제번호 「1-가」. 경영관리: 묶음 「경영관리N」 → 평가단위 MG-N, 과제번호 「N-M」(예: 14-1).

import { businessByCardGroup } from "../../knowledge/dictionaries.ts";
import { MGMT_INDICATORS } from "../../tracks/mgmt-units.ts";
import { MGMT_GROUP_RE, isMgmtCard } from "../mgmt-card.ts";
import type { LooseJson } from "../../loose-json.ts";

export type RegisterTarget = { ok: true; group: string; unit: string; taskNo: string; id: string; title: string } | { ok: false; message: string };

export function registerTarget(parsed: LooseJson, pickedGroup: string): RegisterTarget {
  const mgmt = isMgmtCard(parsed);
  const group = /^(주요사업|경영관리)\d+$/.test(parsed?.group ?? "") ? String(parsed.group) : pickedGroup;
  const unit = MGMT_GROUP_RE.test(group) ? MGMT_INDICATORS.find((m) => m.group === group)?.id : businessByCardGroup(group);
  if (!unit) return { ok: false, message: mgmt ? "경영관리 지표를 알 수 없습니다." : "주요사업을 골라 주세요." };
  const taskNo = String(parsed?.taskNo ?? "").trim();
  const shape = MGMT_GROUP_RE.test(group) ? /^\d+-\d+$/ : /^\d+-[가-힣]$/;
  if (!shape.test(taskNo)) return { ok: false, message: `파일에서 과제번호(예: ${MGMT_GROUP_RE.test(group) ? "14-1" : "1-가"})를 읽지 못해 등록할 수 없습니다. 카드의 「(과제번호 : …)」를 확인해 주세요.` };
  // 경영관리는 과제번호의 앞 숫자가 지표 번호라 묶음과 어긋나면 잘못 읽은 것(예: 묶음 경영관리14에 3-1)
  if (MGMT_GROUP_RE.test(group) && taskNo.split("-")[0] !== group.replace("경영관리", "")) return { ok: false, message: `과제번호(${taskNo})가 묶음(${group})과 맞지 않습니다.` };
  const title = String(parsed?.title ?? "").trim();
  if (!title) return { ok: false, message: "파일에서 과제명을 읽지 못했습니다." };
  return { ok: true, group, unit, taskNo, id: `${group}/${taskNo}`, title };
}
