// PR-4 · Aplica los esquemas necesarios (Work Fabric `orq` + Communication
// Service `comunicacion`) a un Postgres EFÍMERO y DESCARTABLE para los tests y la
// demo del flujo vertical. NUNCA se corre contra la base productiva.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const AQUI = dirname(fileURLToPath(import.meta.url))
const MIGR_ORQ = join(AQUI, '..', '..', 'supabase', 'migrations')
const MIGR_COMM = join(AQUI, '..', '..', '..', 'communication-service', 'db', 'migrations')

// Orden mínimo suficiente para el flujo vertical de PR-4:
//   fundacion (schema orq, tenants/projects/repos/principals, events, emit_event)
//   ledger    (tasks, enqueue_task, claim_task, transition_task, fail_task, reap)
//   comunicacion (schema comunicacion del comm-service)
const ARCHIVOS = [
  join(MIGR_ORQ, '20260711120000_orq_fundacion_work_fabric.sql'),
  join(MIGR_ORQ, '20260711121000_orq_ledger.sql'),
  join(MIGR_COMM, '0001_comunicacion.sql'),
]

// Roles de Supabase que las migraciones usan en sus GRANT. En un Postgres
// descartable "pelado" no existen: se crean vacíos (sólo para que el GRANT no
// falle). No otorgan acceso a nada externo — es un entorno de prueba aislado.
const ROLES_SUPABASE = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;`

/** Aplica los esquemas usando un client de pg ya conectado. */
export async function aplicarEsquemaPR4(client) {
  await client.query(ROLES_SUPABASE)
  for (const archivo of ARCHIVOS) {
    const sql = readFileSync(archivo, 'utf8')
    await client.query(sql)
  }
}

export const ARCHIVOS_ESQUEMA = ARCHIVOS
