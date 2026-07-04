import 'dotenv/config'; // e2e roda fora do Nest: carrega .env (env já exportada prevalece — CI)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';

/**
 * R-TS1 — teste de integridade de schema (tech-stack Fase 10; ADR-0025).
 * Asserta que as constraints DB-enforced sobrevivem a qualquer migration:
 *  - índices parciais únicos: RB-003 (conta), RB-007a (operação), RB-009a (caixa/operador);
 *  - unicidade (command, key) da tabela de idempotência (ADR-0019/0026);
 *  - coluna `version` (lock otimista) em accounts/payments;
 *  - auditoria imutável: role de runtime (pdv_app) sem UPDATE/DELETE em audit_logs (RB-044).
 * Constraints vivem no migration.sql (não expressáveis no schema.prisma) — este teste é a
 * guarda contra constraint-drift do Prisma. Toda migration nova reasserta aqui.
 */
describe('Schema integrity (R-TS1, ADR-0025)', () => {
  let db: Client;

  beforeAll(async () => {
    db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
  });

  afterAll(async () => {
    await db.end();
  });

  async function indexDef(name: string): Promise<string> {
    const r = await db.query(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
      [name],
    );
    expect(r.rows, `índice ${name} deve existir`).toHaveLength(1);
    return r.rows[0].indexdef as string;
  }

  it('runtime conecta como pdv_app (role split — ADR-0025)', async () => {
    const r = await db.query('SELECT current_user');
    expect(r.rows[0].current_user).toBe('pdv_app');
  });

  it('RB-003: unique parcial uniq_open_account (tab_type, number) WHERE OPEN', async () => {
    const def = await indexDef('uniq_open_account');
    expect(def).toMatch(/UNIQUE INDEX/);
    expect(def).toMatch(/\(tab_type, number\)/);
    expect(def).toMatch(/WHERE \(status = 'OPEN'::"AccountStatus"\)/);
  });

  it('RB-007a: unique parcial uniq_open_business_session — ≤1 operação OPEN', async () => {
    const def = await indexDef('uniq_open_business_session');
    expect(def).toMatch(/UNIQUE INDEX/);
    expect(def).toMatch(/\(status\)/);
    expect(def).toMatch(/WHERE \(status = 'OPEN'::"OpenClosedStatus"\)/);
  });

  it('RB-009a: unique parcial uniq_open_register_per_operator — ≤1 caixa OPEN por operador (global)', async () => {
    const def = await indexDef('uniq_open_register_per_operator');
    expect(def).toMatch(/UNIQUE INDEX/);
    expect(def).toMatch(/\(operator_id\)/);
    expect(def).toMatch(/WHERE \(status = 'OPEN'::"OpenClosedStatus"\)/);
  });

  it('idempotency_keys: unicidade (command, key) no banco (ADR-0019/0025)', async () => {
    const r = await db.query(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'idempotency_keys' AND indexdef LIKE '%UNIQUE%'`,
    );
    const defs = r.rows.map((row) => row.indexdef as string);
    expect(
      defs.some((d) => d.includes('(command, key)')),
      'unique (command, key) deve existir em idempotency_keys',
    ).toBe(true);
  });

  it('lock otimista: coluna version INT NOT NULL DEFAULT 0 em accounts e payments', async () => {
    const r = await db.query(
      `SELECT table_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = 'version'
         AND table_name IN ('accounts', 'payments')
       ORDER BY table_name`,
    );
    expect(r.rows.map((row) => row.table_name)).toEqual(['accounts', 'payments']);
    for (const row of r.rows) {
      expect(row.data_type).toBe('integer');
      expect(row.is_nullable).toBe('NO');
      expect(row.column_default).toBe('0');
    }
  });

  it('RB-044: pdv_app sem UPDATE/DELETE em audit_logs (com SELECT/INSERT)', async () => {
    const r = await db.query(
      `SELECT
         has_table_privilege('pdv_app', 'audit_logs', 'UPDATE') AS can_update,
         has_table_privilege('pdv_app', 'audit_logs', 'DELETE') AS can_delete,
         has_table_privilege('pdv_app', 'audit_logs', 'INSERT') AS can_insert,
         has_table_privilege('pdv_app', 'audit_logs', 'SELECT') AS can_select`,
    );
    expect(r.rows[0]).toEqual({
      can_update: false,
      can_delete: false,
      can_insert: true,
      can_select: true,
    });
  });

  it('RB-044 (live): UPDATE em audit_logs falha com insufficient_privilege (42501)', async () => {
    await expect(
      db.query(`UPDATE audit_logs SET reason = 'x' WHERE false`),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('RB-044 (live): DELETE em audit_logs falha com insufficient_privilege (42501)', async () => {
    await expect(db.query(`DELETE FROM audit_logs WHERE false`)).rejects.toMatchObject({
      code: '42501',
    });
  });
});
