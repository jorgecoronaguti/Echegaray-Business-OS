// Configuración validada del Work Fabric (Fase 0). Fail-fast: si falta o es
// inválida una variable crítica, el proceso no arranca (no queremos un worker a
// medio configurar tomando tareas reales). Secretos SIEMPRE por entorno, nunca
// en git (manejo seguro de secretos, decisión ratificada).
//
// Reutiliza el parser de .env ya existente (scripts/lib/env-file.mjs) para
// hidratar variables faltantes en desarrollo local, sin pisar las reales.
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { loadEnvLocalInto } from '../../scripts/lib/env-file.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// orquestador/lib -> echegaray-os (app Next) -> app (raíz git real)
export const APP_DIR = path.resolve(HERE, '..', '..')
export const REPO_ROOT = path.resolve(APP_DIR, '..')

// En desarrollo local, completar desde .env.local lo que no esté en el entorno.
// En la VM (systemd) las variables llegan por EnvironmentFile: tienen prioridad.
loadEnvLocalInto(process.env, path.join(APP_DIR, '.env.local'))

const bool = (def) =>
  z.preprocess((v) => (v === undefined ? def : /^(1|true|yes|on)$/i.test(String(v))), z.boolean())

const ConfigSchema = z.object({
  // Conexión Postgres directa (portable, D2). Session pooler de Supabase en prod.
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgres')),
  DB_SSL: bool(true),

  // Ejes reservados (D4). Un solo valor hoy; el eje existe desde el día 1.
  TENANT: z.string().min(1).default('echegaray'),
  PROJECT: z.string().min(1).default('echegaray-os'),
  REPO: z.string().min(1).default('echegaray-os'),

  // Identidad del worker (para leases/heartbeat). Único por proceso.
  WORKER_ID: z.string().min(1).default(`${os.hostname()}:${process.pid}`),

  // Scheduler / leasing (Fase 1).
  CONCURRENCY: z.coerce.number().int().positive().max(64).default(1),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  LEASE_SECONDS: z.coerce.number().int().positive().default(900),
  HEARTBEAT_MS: z.coerce.number().int().positive().default(15000),
  MAX_ATTEMPTS: z.coerce.number().int().positive().max(20).default(3),
  BACKOFF_BASE_MS: z.coerce.number().int().positive().default(30000),

  // Workspaces (Fase 2): worktrees fuera del repo para no ensuciar el working tree.
  WORKSPACES_DIR: z.string().default(path.resolve(REPO_ROOT, '..', 'orq-workspaces')),

  // Motor de ejecución. 'noop' valida el ciclo sin IA (Fase 1). 'claude-cli' (Fase 2).
  ENGINE: z.enum(['noop', 'claude-cli']).default('noop'),
  ENGINE_TIMEOUT_MS: z.coerce.number().int().positive().default(1000 * 60 * 20),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  NODE_ENV: z.string().default('development'),
})

let cached = null

/** Carga y valida la configuración una sola vez. Lanza con detalle si algo falla. */
export function loadConfig() {
  if (cached) return cached
  const parsed = ConfigSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    DB_SSL: process.env.ORQ_DB_SSL,
    TENANT: process.env.ORQ_TENANT,
    PROJECT: process.env.ORQ_PROJECT,
    REPO: process.env.ORQ_REPO,
    WORKER_ID: process.env.ORQ_WORKER_ID,
    CONCURRENCY: process.env.ORQ_CONCURRENCY,
    POLL_INTERVAL_MS: process.env.ORQ_POLL_INTERVAL_MS,
    LEASE_SECONDS: process.env.ORQ_LEASE_SECONDS,
    HEARTBEAT_MS: process.env.ORQ_HEARTBEAT_MS,
    MAX_ATTEMPTS: process.env.ORQ_MAX_ATTEMPTS,
    BACKOFF_BASE_MS: process.env.ORQ_BACKOFF_BASE_MS,
    WORKSPACES_DIR: process.env.ORQ_WORKSPACES_DIR,
    ENGINE: process.env.ORQ_ENGINE,
    ENGINE_TIMEOUT_MS: process.env.ORQ_ENGINE_TIMEOUT_MS,
    LOG_LEVEL: process.env.ORQ_LOG_LEVEL,
    NODE_ENV: process.env.NODE_ENV,
  })
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    throw new Error(
      `Configuración del orquestador inválida:\n${issues.join('\n')}\n` +
        `Definí las variables ORQ_* / DATABASE_URL (ver .env.local.example y orquestador/README.md).`,
    )
  }
  cached = Object.freeze({ ...parsed.data, APP_DIR, REPO_ROOT })
  return cached
}
