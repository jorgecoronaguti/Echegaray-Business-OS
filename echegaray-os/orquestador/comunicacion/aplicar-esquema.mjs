// PR-4 · Aplica los esquemas necesarios (Work Fabric `orq` + Communication
// Service `comunicacion`) a un Postgres EFÍMERO y DESCARTABLE para los tests y la
// demo del flujo vertical. NUNCA se corre contra la base productiva.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const AQUI = dirname(fileURLToPath(import.meta.url))
const MIGR_ORQ = join(AQUI, '..', '..', 'supabase', 'migrations')
// El esquema `comunicacion` vive desde el 22/08/2026 en la cadena única de supabase/migrations
// (antes estaba en communication-service/db/migrations/0001_comunicacion.sql).

// Orden mínimo suficiente para el flujo vertical de PR-4:
//   fundacion (schema orq, tenants/projects/repos/principals, events, emit_event)
//   ledger    (tasks, enqueue_task, claim_task, transition_task, fail_task, reap)
//   comunicacion (schema comunicacion del comm-service)
//   asistente    (identidades, recordatorios, entregas, aclaraciones, ejecuciones)
const ARCHIVOS = [
  join(MIGR_ORQ, '20260711120000_orq_fundacion_work_fabric.sql'),
  join(MIGR_ORQ, '20260711121000_orq_ledger.sql'),
  join(MIGR_ORQ, '20260729180000_orq_comunicacion_lane.sql'), // PR-4.1: lane de comunicación
  join(MIGR_ORQ, '20260730125500_comunicacion_fundacion.sql'),
  // Sin esto el test vertical del asistente correría contra tablas inexistentes y "pasaría"
  // por no llegar nunca a tocarlas.
  join(MIGR_ORQ, '20260715170000_google_tokens_oauth.sql'), // quién autorizó su Google
  join(MIGR_ORQ, '20260731140000_asistente_conversacional.sql'),
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
