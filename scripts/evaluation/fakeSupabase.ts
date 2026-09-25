/*
  An in-memory stand-in for the Supabase client, used ONLY by the evaluation.

  The evaluation calls the real API route handlers and the real server
  modules (Layer 1, Layer 2, the skill cache, the V-Score replay). The one
  thing it replaces is the database, because the evaluation must not write
  test data into the live project. Every query those modules make goes
  through this object instead, against plain arrays.

  It implements only the parts of the query builder the evaluated code uses:
  select (with the one embed the match route needs), eq, in, is, order, limit,
  maybeSingle, single, update, upsert and insert. Anything else throws, so a
  query this file does not understand fails loudly instead of returning an
  empty result that would look like "no data".
*/

import { randomUUID } from 'crypto';

type Row = Record<string, unknown>;

/*
  Column defaults the real schema applies on insert and the evaluated code
  relies on. Without `voided_at: null` a new penalty row would have no
  voided_at at all, and the replay's `voided_at !== null` test would treat
  every penalty as reversed.
*/
const COLUMN_DEFAULTS: Record<string, Row> = {
  score_events: { voided_at: null },
  event_reviews: { remark_chips: [], notes: null },
};

let clock = Date.parse('2026-10-01T08:00:00Z');
function nextTimestamp(): string {
  clock += 1000;
  return new Date(clock).toISOString();
}
type Filter = (row: Row) => boolean;

export interface FakeDb {
  tables: Record<string, Row[]>;
  from(table: string): Query;
  /** Every query made, for the report ("how many cache reads"). */
  log: { table: string; op: string }[];
}

class Query implements PromiseLike<{ data: unknown; error: null }> {
  private filters: Filter[] = [];
  private op: 'select' | 'update' | 'upsert' | 'insert' = 'select';
  private payload: Row | Row[] | null = null;
  private onConflict: string[] = [];
  private ignoreDuplicates = false;
  private selectCols = '*';
  private mode: 'many' | 'maybeSingle' | 'single' = 'many';
  private returnRows = false;

  constructor(private db: FakeDb, private table: string) {}

  select(cols = '*') {
    if (this.op === 'select') this.selectCols = cols;
    else this.returnRows = true;
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push((row) => row[col] === value);
    return this;
  }
  in(col: string, values: readonly unknown[]) {
    const set = new Set(values);
    this.filters.push((row) => set.has(row[col]));
    return this;
  }
  is(col: string, value: null) {
    this.filters.push((row) => (row[col] ?? null) === value);
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  maybeSingle() {
    this.mode = 'maybeSingle';
    return this;
  }
  single() {
    this.mode = 'single';
    return this;
  }
  update(values: Row) {
    this.op = 'update';
    this.payload = values;
    return this;
  }
  upsert(values: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = 'upsert';
    this.payload = values;
    this.onConflict = (options?.onConflict ?? 'id').split(',').map((c) => c.trim());
    this.ignoreDuplicates = options?.ignoreDuplicates === true;
    return this;
  }
  insert(values: Row | Row[]) {
    this.op = 'insert';
    this.payload = values;
    return this;
  }

  private rows(): Row[] {
    return (this.db.tables[this.table] ??= []);
  }

  private embed(row: Row): Row {
    // The match route's APPLICANT_SELECT embeds the volunteer and their
    // profile. Resolved here from the two tables, exactly as PostgREST would.
    if (this.table === 'applications' && this.selectCols.includes('volunteer:volunteer_profiles')) {
      const volunteer = (this.db.tables.volunteer_profiles ?? []).find((v) => v.id === row.volunteer_id);
      const profile = (this.db.tables.profiles ?? []).find((p) => p.id === row.volunteer_id);
      return {
        ...row,
        volunteer: volunteer
          ? { ...volunteer, profile: profile ? { region: profile.region, district: profile.district } : null }
          : null,
      };
    }
    if (this.selectCols.includes('(')) {
      throw new Error(`fakeSupabase: unsupported embed on ${this.table}: ${this.selectCols}`);
    }
    return { ...row };
  }

  private execute(): { data: unknown; error: null } {
    this.db.log.push({ table: this.table, op: this.op });
    const matches = this.rows().filter((row) => this.filters.every((f) => f(row)));
    let result: Row[];

    if (this.op === 'select') {
      result = matches.map((row) => this.embed(row));
    } else if (this.op === 'update') {
      for (const row of matches) Object.assign(row, this.payload);
      result = matches.map((row) => ({ ...row }));
    } else {
      const incoming = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      result = [];
      for (const values of incoming) {
        const existing =
          this.op === 'upsert'
            ? this.rows().find((row) => this.onConflict.every((c) => row[c] === values[c]))
            : undefined;
        if (existing) {
          if (!this.ignoreDuplicates) Object.assign(existing, values);
          result.push({ ...existing });
        } else {
          // What the real columns' defaults do: a new row gets an id and a
          // created_at. The clock only moves forward, one second per row, so
          // filing order is unambiguous (the V-Score replay sorts on it).
          const row = { id: randomUUID(), created_at: nextTimestamp(), ...(COLUMN_DEFAULTS[this.table] ?? {}), ...values };
          this.rows().push(row);
          result.push({ ...row });
        }
      }
    }

    if (this.op !== 'select' && !this.returnRows) return { data: null, error: null };
    if (this.mode === 'many') return { data: result, error: null };
    if (this.mode === 'single' && result.length !== 1) {
      throw new Error(`fakeSupabase: single() on ${this.table} matched ${result.length} rows`);
    }
    return { data: result[0] ?? null, error: null };
  }

  then<T1 = { data: unknown; error: null }, T2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    return Promise.resolve()
      .then(() => this.execute())
      .then(onfulfilled, onrejected);
  }
}

export function createFakeDb(tables: Record<string, Row[]> = {}): FakeDb {
  const db: FakeDb = {
    tables,
    log: [],
    from(table: string) {
      return new Query(db, table);
    },
  };
  return db;
}
