// 처리기 시험용 메모리 DB — 처리기가 쓰는 PostgREST 쿼리 모양(select·insert·upsert·update·delete + eq·in·maybeSingle)만 흉내 낸다.
// 시험에서만 import한다(운영 코드는 이 파일을 쓰지 않음). 표 이름 한정(tables.ts)은 실제 저장소와 같은 함수로 검사한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PrepStore, ReadTable, WriteTable } from "./run.ts";
import { assertPrepTable, type PrepMode } from "./tables.ts";


type Row = Record<string, unknown>;
type Result = { data: Row | Row[] | null; error: { message: string; code?: string } | null };

export class FakeDb {
  tables: Record<string, Row[]> = {};
  /** select 결과를 만든 직후 부르는 함수 — 「읽은 뒤 쓰기 전에 사람이 확정하는」 경합을 흉내 낼 때 */
  afterSelect: Record<string, () => void> = {};
  /** 표 이름 → 쓰기 요청 기록(어느 표를 어떻게 썼는지 검사용) */
  writes: Array<{ table: string; op: string }> = [];

  constructor(init: Record<string, Row[]> = {}) {
    for (const [k, v] of Object.entries(init)) this.tables[k] = v.map((r) => ({ ...r }));
  }

  rows(name: string): Row[] {
    return (this.tables[name] ??= []);
  }

  from(name: string) {
    return new FakeQuery(this, name);
  }
}

class FakeQuery implements PromiseLike<Result> {
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private filters: Array<(r: Row) => boolean> = [];
  private payload: Row | Row[] | undefined;
  private opts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private one = false;

  private db: FakeDb;
  private name: string;

  constructor(db: FakeDb, name: string) {
    this.db = db;
    this.name = name;
  }

  select() {
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.payload = rows;
    return this;
  }
  upsert(rows: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = "upsert";
    this.payload = rows;
    this.opts = opts;
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  maybeSingle() {
    this.one = true;
    return this;
  }

  private run(): Result {
    const table = this.db.rows(this.name);
    const match = (r: Row) => this.filters.every((f) => f(r));
    if (this.op !== "select") this.db.writes.push({ table: this.name, op: this.op });
    switch (this.op) {
      case "select": {
        const data = table.filter(match).map((r) => ({ ...r }));
        this.db.afterSelect[this.name]?.();
        return { data: this.one ? (data[0] ?? null) : data, error: null };
      }
      case "insert":
        for (const r of [this.payload as Row | Row[]].flat()) table.push({ ...r });
        return { data: null, error: null };
      case "upsert": {
        const cols = (this.opts.onConflict ?? "").split(",").map((c) => c.trim()).filter(Boolean);
        for (const r of [this.payload as Row | Row[]].flat()) {
          const i = table.findIndex((t) => cols.every((c) => t[c] === r[c]));
          if (i < 0) table.push({ ...r });
          else if (!this.opts.ignoreDuplicates) table[i] = { ...table[i], ...r };
        }
        return { data: null, error: null };
      }
      case "update":
        for (const r of table.filter(match)) Object.assign(r, this.payload);
        return { data: null, error: null };
      case "delete":
        this.db.tables[this.name] = table.filter((r) => !match(r));
        return { data: null, error: null };
    }
  }

  then<A = Result, B = never>(onfulfilled?: ((v: Result) => A | PromiseLike<A>) | null, onrejected?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected);
  }
}

/** 처리기 시험용 저장소: 표 접근은 실제 저장소와 같은 한정 규칙(assertPrepTable)을 따르고, 읽기는 select만 열어 줌 */
export function fakePrepStore(db: FakeDb): PrepStore {
  const unused = () => {
    throw new Error("이 시험에서는 대기열을 쓰지 않음");
  };
  return {
    claim: unused,
    finish: unused,
    reclaimStuck: unused,
    countQueued: unused,
    table(name: string, mode: PrepMode) {
      assertPrepTable(name, mode);
      const q = db.from(name);
      return mode === "write" ? (q as unknown as WriteTable) : ({ select: q.select.bind(q) } as unknown as ReadTable);
    },
    reader() {
      return { from: (name: string) => (assertPrepTable(name, "read"), { select: db.from(name).select.bind(db.from(name)) }) } as unknown as SupabaseClient;
    },
  } as unknown as PrepStore;
}
