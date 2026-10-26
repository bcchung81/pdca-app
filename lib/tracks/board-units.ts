// 과제 목록(원장·내 과제)의 평가단위 칩 — 트랙마다 다름: 주요사업은 사업 BZ-1~3(칩 이름 = 카드 묶음 주요사업N), 경영관리는 지표 MG-1~14(칩 이름 = 지표명 — 카드 묶음 id 경영관리N은 식별자라 화면에 안 씀).

import { BUSINESSES } from "../knowledge/dictionaries.ts";
import type { TrackId } from "./index.ts";
import { MGMT_INDICATORS } from "./mgmt-units.ts";

export interface BoardUnit {
  id: string;
  label: string;
  name: string;
}

const BIZ_UNITS: BoardUnit[] = BUSINESSES.filter((b) => b.cardGroup).map((b) => ({ id: b.id, label: b.cardGroup!, name: b.name2026 }));
const MGMT_UNITS: BoardUnit[] = MGMT_INDICATORS.map((i) => ({ id: i.id, label: i.name, name: i.name }));

export function boardUnits(track: TrackId): BoardUnit[] {
  return track === "경영관리" ? MGMT_UNITS : BIZ_UNITS;
}
