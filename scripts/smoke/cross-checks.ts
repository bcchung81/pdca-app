// 카드 간 점검 읽기 전용 점검(수동 실행): 운영 카드·'25 지적을 읽기만 하고 C2 실적 중복 후보·C3 소관 카드 없는 '25 지적을 표로 출력합니다. 쓰기 없음.
// 실행: node --conditions=react-server --env-file=.env.local scripts/smoke/cross-checks.ts
// 확인할 것: 컨설팅이 지목한 예(체험훈련 4-1·12-1·12-2 / 판촉 부스 7-3·7-5 / ISO 42001 13-2·13-5 / 육아키트·가족초청 9-4·11-3 / 청년인턴 3-1·14-2)가 C2에 잡히는지,
//   '25 지적 복원 요구 카드(3-3·6-2·8-3·9-4·10-2·10-3·11-3·13-1·13-5·7-4 등)의 지표가 C3에 나오는지. 출력에는 과제번호·글만 찍음(실명·메일 없음).
import { createClient } from "@supabase/supabase-js";
import { crossCardDuplicates } from "../../lib/reports/cross-card.ts";
import { orphanFindings } from "../../lib/reports/finding-orphans.ts";
import { originalFindings, type UnitChunk } from "../../lib/reports/unit-parts-mg.ts";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const t0 = Date.now();
const { data: cards, error } = await db.from("cards").select("id, eval_unit_id, task_no, status, data, unit:eval_units!inner(track)").eq("status", "active").eq("unit.track", "경영관리");
if (error) throw new Error(`카드를 읽지 못함: ${error.message}`);
const { data: chunks, error: e2 } = await db.from("knowledge_chunks").select("chunk_key, title, text, unit_type, meta").eq("unit_type", "evaluator_comment").like("chunk_key", "plan-2607/eval25/MG-%").order("seq");
if (e2) throw new Error(`지적 원문을 읽지 못함: ${e2.message}`);
const rows = (cards ?? []).map((c) => ({ id: String(c.id), unitId: String(c.eval_unit_id), taskNo: String(c.task_no ?? ""), status: String(c.status), data: c.data }));
console.log(`카드 ${rows.length}장 · 지적 조각 ${chunks?.length ?? 0}개 · 읽기 ${Date.now() - t0}ms`);

const t1 = Date.now();
const dups = crossCardDuplicates(rows);
console.log(`\n[C2] 실적 중복 후보 ${dups.length}건 (계산 ${Date.now() - t1}ms)`);
for (const d of dups) {
  console.log(`- ${d.date} 닮음 ${d.score.toFixed(2)}`);
  for (const l of d.lines) console.log(`    ${l.taskNo}: ${l.text.slice(0, 90)}`);
}

const byUnit = new Map<string, UnitChunk[]>();
for (const ch of (chunks ?? []) as UnitChunk[]) {
  const u = /^plan-2607\/eval25\/(MG-\d+)\//.exec(ch.chunk_key)?.[1];
  if (u) byUnit.set(u, [...(byUnit.get(u) ?? []), ch]);
}
const orphans = [...byUnit].flatMap(([u, cs]) => orphanFindings(u, originalFindings(cs), rows.filter((r) => r.unitId === u)));
console.log(`\n[C3] 소관 카드 없는 '25 지적 ${orphans.length}건 / 전체 ${[...byUnit.values()].reduce((n, cs) => n + originalFindings(cs).length, 0)}건`);
for (const o of orphans) console.log(`- ${o.unit} 지적${o.finding.no} 가까운 카드 ${o.nearest ? `${o.nearest.taskNo}(${o.nearest.score.toFixed(2)})` : "없음"}: ${o.finding.text.slice(0, 90)}`);
